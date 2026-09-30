// @vitest-environment node
/**
 * The host store's collection layer on both physical engines: namespaced
 * collections on the existing owner keys, secondary indexes, migrations,
 * per-collection and per-domain eviction that never touches dirty or authored
 * rows, inspection and cache clearing for Settings → Data, and the change feed.
 */
import { describe, it, expect } from 'vitest';
import {
  createHostStorePort, retireHostStorePrincipal, createHostStoreChangeFeed, observeHostStorePort,
  HOST_DATA_MP_ID, collectionName, storeNameValid,
} from '../src/host-store/index.js';
import { MIGRATION_LEASE_MS } from '../src/host-store/port.js';
import { DATABASES, identity, createChannelBus } from './helpers/host-databases.js';

const SELECTOR = { authorityOrigin: 'https://api.example.test', viewerId: '7' };
function openInput({ storeName = 'chats.rows', policy = 'cache', schemaVersion = 1, indexes, unique, limits = {}, who = identity(), schemaFingerprint } = {}) {
  return {
    identity: who, storeName, policy, schemaVersion,
    cacheFingerprint: policy === 'authored' ? null : 'fp-1',
    limits: { maxRows: 1000, maxAgeMs: policy === 'authored' ? null : 86400000, maxBytes: null, ...limits },
    ...(indexes ? { indexes } : {}),
    ...(unique ? { unique } : {}),
    ...(schemaFingerprint !== undefined ? { schemaFingerprint } : {}),
  };
}
async function setup(create) {
  let clock = 1000;
  const database = create();
  const port = createHostStorePort({ database, backend: database.kind === 'sqlite' ? 'electron_sqlite' : 'indexeddb', now: () => clock });
  async function open(options) {
    const opened = await port.open(openInput(options));
    let revision = opened.storeRevision;
    return {
      ...opened,
      async put(rows, extra = {}) {
        const result = await port.commit({ handle: opened.handle, expectedEpoch: opened.epoch, expectedStoreRevision: revision,
          changes: rows.map((value) => ({ op: 'put', key: String(value.id), value })), ...extra });
        if (result.ok) revision = result.storeRevision;
        clock += 10;
        return result;
      },
      async remove(keys) {
        const result = await port.commit({ handle: opened.handle, expectedEpoch: opened.epoch, expectedStoreRevision: revision,
          changes: keys.map((key) => ({ op: 'delete', key })) });
        if (result.ok) revision = result.storeRevision;
        return result;
      },
      async all() {
        const page = await port.read({ handle: opened.handle, expectedEpoch: opened.epoch, afterKey: null, limit: 100 });
        return page.rows.map((row) => row.value);
      },
      query: (input) => port.query({ handle: opened.handle, expectedEpoch: opened.epoch, limit: 100, ...input }),
      refresh(result) { revision = result.storeRevision; },
    };
  }
  const stores = async () => (await port.inspect({ op: 'stores', selector: SELECTOR })).stores;
  return { port, open, stores, database, tick: (ms) => { clock += ms; } };
}

describe.each(DATABASES)('host store collections on %s', (_name, create) => {
  it('names host collections <domain>.<collection> beside MP stores on the same owner', async () => {
    const { port, open, stores } = await setup(create);
    expect(collectionName('chats', 'rows')).toBe('chats.rows');
    expect(['mp.x', 'Chats.rows', 'a.b.c', 'chats.'].map(storeNameValid)).toEqual([false, false, false, false]);
    await expect(port.open(openInput({ storeName: 'mp.scheduling' }))).rejects.toMatchObject({ reason: 'unserializable' });
    const rows = await open({ storeName: 'chats.rows' });
    const drafts = await open({ storeName: 'drafts', policy: 'authored', who: identity({ mpId: 'forms', tenantId: 'team-4' }) });
    await rows.put([{ id: 1, title: 'Row' }]);
    await drafts.put([{ id: 1, body: 'Draft', _dirty: true }]);
    expect(await rows.all()).toEqual([{ id: 1, title: 'Row' }]);
    expect(await drafts.all()).toEqual([{ id: 1, body: 'Draft', _dirty: true }]);
    const listed = await stores();
    expect(listed.map((row) => [row.label, row.domain, row.policy, row.rowCount, row.dirtyCount])).toEqual([
      ['chats.rows', 'chats', 'cache', 1, 0],
      ['mp.forms.drafts', 'mp.forms', 'authored', 1, 1],
    ]);
    expect(HOST_DATA_MP_ID).toBe('platform-data');
  });

  it('isolates principals and accounts', async () => {
    const { port, open } = await setup(create);
    const mine = await open();
    const team = await open({ who: identity({ accountType: 'Team', accountId: '44', tenantId: 'team-44' }) });
    const other = await open({ who: identity({ viewerId: '8', accountId: '8', tenantId: 'user-8' }) });
    await mine.put([{ id: 1, who: 'mine' }]);
    await team.put([{ id: 1, who: 'team' }]);
    await other.put([{ id: 1, who: 'other' }]);
    expect(await mine.all()).toEqual([{ id: 1, who: 'mine' }]);
    expect(await team.all()).toEqual([{ id: 1, who: 'team' }]);
    const seen = (await port.inspect({ op: 'stores', selector: SELECTOR })).stores;
    expect(seen.map((row) => [row.accountType, row.accountId])).toEqual([['Team', '44'], ['User', '7']]);
    const theirs = (await port.inspect({ op: 'stores', selector: { ...SELECTOR, viewerId: '8' } })).stores;
    await expect(port.inspect({ op: 'rows', selector: SELECTOR, store: theirs[0].id })).resolves.toMatchObject({ ok: false, reason: 'retired' });
  });

  it('queries secondary indexes in value order and keeps them in step with writes', async () => {
    const { open } = await setup(create);
    const messages = await open({ storeName: 'chats.messages', indexes: { bySequence: ['chat_id', 'seq'], byChat: 'chat_id' } });
    await messages.put([
      { id: 'a', chat_id: 7, seq: 10 }, { id: 'b', chat_id: 7, seq: 2 }, { id: 'c', chat_id: 12, seq: 1 },
      { id: 'd', chat_id: 7, seq: 30 }, { id: 'e', chat_id: 1, seq: 5 },
    ]);
    const ids = (result) => result.rows.map((row) => row.key);
    expect(ids(await messages.query({ index: 'byChat', equals: [7] }))).toEqual(['a', 'b', 'd']);
    expect(ids(await messages.query({ index: 'bySequence', prefix: [7] }))).toEqual(['b', 'a', 'd']);
    expect(ids(await messages.query({ index: 'bySequence', prefix: [7], lower: 5, upper: 30 }))).toEqual(['a', 'd']);
    expect(ids(await messages.query({ index: 'bySequence', prefix: [7], upper: 10 }))).toEqual(['b', 'a']);
    expect(ids(await messages.query({ index: 'byChat', lower: 7 }))).toEqual(['a', 'b', 'd', 'c']);
    const first = await messages.query({ index: 'bySequence', prefix: [7], limit: 2 });
    expect(ids(first)).toEqual(['b', 'a']);
    expect(ids(await messages.query({ index: 'bySequence', prefix: [7], limit: 2, afterKey: first.nextKey }))).toEqual(['d']);
    await messages.put([{ id: 'a', chat_id: 12, seq: 3 }]);
    await messages.remove(['d']);
    expect(ids(await messages.query({ index: 'byChat', equals: [7] }))).toEqual(['b']);
    expect(ids(await messages.query({ index: 'bySequence', prefix: [12] }))).toEqual(['c', 'a']);
    await expect(messages.query({ index: 'missing', equals: [1] })).resolves.toMatchObject({ ok: false });
  });

  it('starts a cache empty at a new schema version and migrates authored rows copy-on-write', async () => {
    const { port, open, tick } = await setup(create);
    const cache = await open({ storeName: 'chats.rows' });
    await cache.put([{ id: 1, v: 1 }]);
    const upgraded = await open({ storeName: 'chats.rows', schemaVersion: 2 });
    expect(await upgraded.all()).toEqual([]);
    await expect(port.open(openInput({ storeName: 'chats.rows', schemaVersion: 1 }))).rejects.toMatchObject({ reason: 'unavailable' });

    const v1 = await open({ storeName: 'outbox', policy: 'authored' });
    await v1.put([{ id: 1, text: 'one', _dirty: true }, { id: 2, text: 'two', _dirty: true }]);
    const v2 = await open({ storeName: 'outbox', policy: 'authored', schemaVersion: 2, indexes: { byBody: 'body' } });
    expect(v2.migration).toEqual({ from: 1, to: 2 });
    // Reads see the old generation; writes wait for the migration.
    expect((await v2.all()).map((row) => row.text)).toEqual(['one', 'two']);
    await expect(v2.put([{ id: 3, body: 'x' }])).resolves.toMatchObject({ ok: false, reason: 'unavailable' });
    const step = (phase, extra = {}) => port.migration({ handle: v2.handle, expectedEpoch: v2.epoch, phase, ...extra });
    await step('begin');
    await step('write', { changes: [{ op: 'put', key: '1', value: { id: 1, body: 'one', _dirty: true } }] });
    // An interrupted migration leaves version 1 authoritative; once its lease
    // runs out the next opener restarts from the top.
    const again = await open({ storeName: 'outbox', policy: 'authored', schemaVersion: 2, indexes: { byBody: 'body' } });
    const restart = (phase, extra = {}) => port.migration({ handle: again.handle, expectedEpoch: again.epoch, phase, ...extra });
    expect((await again.all()).map((row) => row.text)).toEqual(['one', 'two']);
    await expect(restart('begin')).resolves.toMatchObject({ ok: false, reason: 'busy' });
    tick(MIGRATION_LEASE_MS + 1);
    await expect(restart('begin')).resolves.toMatchObject({ ok: true });
    await restart('write', { changes: (await again.all()).map((row) => ({ op: 'put', key: String(row.id), value: { id: row.id, body: row.text, _dirty: true } })) });
    await expect(restart('complete')).resolves.toMatchObject({ ok: true });
    expect(await again.all()).toEqual([{ id: 1, body: 'one', _dirty: true }, { id: 2, body: 'two', _dirty: true }]);
    expect((await again.query({ index: 'byBody', equals: ['two'] })).rows.map((row) => row.key)).toEqual(['2']);
    const listed = (await port.inspect({ op: 'stores', selector: SELECTOR })).stores.find((row) => row.label === 'mp.platform-data.outbox' || row.label === 'outbox');
    expect(listed).toMatchObject({ schemaVersion: 2, rowCount: 2, dirtyCount: 2, migrating: false });
    // The superseded handle is retired rather than writing the old shape.
    await expect(v2.put([{ id: 9, body: 'late' }])).resolves.toMatchObject({ ok: false });
  });

  it('rebuilds a store whose declared schema changed, carrying authored and unsent rows through the caller', async () => {
    const { port, open } = await setup(create);
    const migrate = async (opened, transform) => {
      const step = (phase, extra = {}) => port.migration({ handle: opened.handle, expectedEpoch: opened.epoch, phase, ...extra });
      await step('begin');
      const changes = (await opened.all()).map((row) => transform(row)).filter(Boolean)
        .map((value) => ({ op: 'put', key: String(value.id), value }));
      if (changes.length) await step('write', { changes });
      return step('complete');
    };
    // Authored: a new fingerprint, or a new index, migrates instead of refusing.
    const drafts = await open({ storeName: 'drafts', policy: 'authored', schemaFingerprint: 'schema-a' });
    await drafts.put([{ id: 1, title: 'Kept', _dirty: true }]);
    const reshaped = await open({ storeName: 'drafts', policy: 'authored', schemaFingerprint: 'schema-b', indexes: { byTitle: 'title' } });
    expect(reshaped.migration).toEqual({ from: 1, to: 1, fromFingerprint: 'schema-a' });
    await expect(migrate(reshaped, (row) => row)).resolves.toMatchObject({ ok: true });
    const settled = await open({ storeName: 'drafts', policy: 'authored', schemaFingerprint: 'schema-b', indexes: { byTitle: 'title' } });
    expect(settled.migration).toBeFalsy();
    expect((await settled.query({ index: 'byTitle', equals: ['Kept'] })).rows.map((row) => row.key)).toEqual(['1']);
    // A cache with nothing unsent starts empty; one with an unsent row migrates it.
    const clean = await open({ storeName: 'shifts', schemaFingerprint: 'schema-a' });
    await clean.put([{ id: 1 }]);
    const cleanNext = await open({ storeName: 'shifts', schemaFingerprint: 'schema-b' });
    expect(cleanNext.migration).toBeFalsy();
    expect(await cleanNext.all()).toEqual([]);
    const cached = await open({ storeName: 'orders', schemaFingerprint: 'schema-a' });
    await cached.put([{ id: 1, v: 'server' }, { id: 2, v: 'unsent', _dirty: true }]);
    const cachedNext = await open({ storeName: 'orders', schemaFingerprint: 'schema-b' });
    expect(cachedNext.migration).toEqual({ from: 1, to: 1, fromFingerprint: 'schema-a' });
    await migrate(cachedNext, (row) => (row._dirty ? row : null));
    const after = await open({ storeName: 'orders', schemaFingerprint: 'schema-b' });
    expect(after.migration).toBeFalsy();
    expect(await after.all()).toEqual([{ id: 2, v: 'unsent', _dirty: true }]);
  });

  it('adopts a schema fingerprint on a store opened before it had one, with no rebuild', async () => {
    const { open } = await setup(create);
    const before = await open({ storeName: 'drafts', policy: 'authored' });
    await before.put([{ id: 1, _dirty: true }]);
    const adopted = await open({ storeName: 'drafts', policy: 'authored', schemaFingerprint: 'schema-a' });
    expect(adopted.migration).toBeFalsy();
    expect(await adopted.all()).toEqual([{ id: 1, _dirty: true }]);
    const changed = await open({ storeName: 'drafts', policy: 'authored', schemaFingerprint: 'schema-b' });
    expect(changed.migration).toEqual({ from: 1, to: 1, fromFingerprint: 'schema-a' });
  });

  it('lets one of two openers rebuild a store at a time, and loses no authored row when they interleave', async () => {
    let clock = 1000;
    const database = create();
    const kind = database.kind === 'sqlite' ? 'electron_sqlite' : 'indexeddb';
    // Two tabs (or windows): two ports over one database.
    const tabA = createHostStorePort({ database, backend: kind, now: () => clock });
    const tabB = createHostStorePort({ database, backend: kind, now: () => clock });
    const input = (schemaFingerprint) => openInput({ storeName: 'drafts', policy: 'authored', schemaFingerprint });
    const seeded = await tabA.open(input('schema-a'));
    const drafts = Array.from({ length: 250 }, (_, index) => ({ id: index + 1, title: `Draft ${index + 1}`, _dirty: true }));
    let revision = seeded.storeRevision;
    for (let start = 0; start < drafts.length; start += 100) {
      // eslint-disable-next-line no-await-in-loop
      const result = await tabA.commit({ handle: seeded.handle, expectedEpoch: seeded.epoch, expectedStoreRevision: revision,
        changes: drafts.slice(start, start + 100).map((value) => ({ op: 'put', key: String(value.id), value })) });
      revision = result.storeRevision;
    }
    const a = await tabA.open(input('schema-b'));
    const b = await tabB.open(input('schema-b'));
    expect([a.migration, b.migration]).toEqual([{ from: 1, to: 1, fromFingerprint: 'schema-a' }, { from: 1, to: 1, fromFingerprint: 'schema-a' }]);
    const stepA = (phase, extra = {}) => tabA.migration({ handle: a.handle, expectedEpoch: a.epoch, phase, ...extra });
    const stepB = (phase, extra = {}) => tabB.migration({ handle: b.handle, expectedEpoch: b.epoch, phase, ...extra });
    const pageOf = async (port, handle, afterKey) => port.read({ handle: handle.handle, expectedEpoch: handle.epoch, afterKey, limit: 100 });
    await expect(stepA('begin')).resolves.toMatchObject({ ok: true });
    // B finds A's live lease and does not take the store over.
    await expect(stepB('begin')).resolves.toMatchObject({ ok: false, reason: 'busy' });
    let afterKey = null;
    do {
      // eslint-disable-next-line no-await-in-loop
      const page = await pageOf(tabA, a, afterKey);
      // B keeps trying between A's pages; A's writes renew the lease.
      // eslint-disable-next-line no-await-in-loop
      await expect(stepB('begin')).resolves.toMatchObject({ ok: false, reason: 'busy' });
      // eslint-disable-next-line no-await-in-loop
      await expect(stepB('write', { changes: [{ op: 'put', key: '1', value: { id: 1, title: 'B' } }] })).resolves.toMatchObject({ ok: false, reason: 'conflict' });
      clock += MIGRATION_LEASE_MS - 1;
      // eslint-disable-next-line no-await-in-loop
      await stepA('write', { changes: page.rows.map((row) => ({ op: 'put', key: row.key, value: row.value })) });
      afterKey = page.nextKey;
    } while (afterKey !== null);
    await expect(stepB('complete')).resolves.toMatchObject({ ok: false, reason: 'conflict' });
    await expect(stepA('complete')).resolves.toMatchObject({ ok: true });
    // B reopens after A: the store is rebuilt, every draft is there.
    const reopened = await tabB.open(input('schema-b'));
    expect(reopened.migration).toBeFalsy();
    const kept = [];
    afterKey = null;
    do {
      // eslint-disable-next-line no-await-in-loop
      const page = await pageOf(tabB, reopened, afterKey);
      kept.push(...page.rows);
      afterKey = page.nextKey;
    } while (afterKey !== null);
    expect(kept).toHaveLength(250);
  });

  it('restarts a rebuild whose opener stopped renewing its lease, and refuses that opener afterwards', async () => {
    let clock = 1000;
    const database = create();
    const kind = database.kind === 'sqlite' ? 'electron_sqlite' : 'indexeddb';
    const tabA = createHostStorePort({ database, backend: kind, now: () => clock });
    const tabB = createHostStorePort({ database, backend: kind, now: () => clock });
    const input = (schemaFingerprint) => openInput({ storeName: 'drafts', policy: 'authored', schemaFingerprint });
    const seeded = await tabA.open(input('schema-a'));
    await tabA.commit({ handle: seeded.handle, expectedEpoch: seeded.epoch, expectedStoreRevision: seeded.storeRevision,
      changes: [1, 2, 3].map((id) => ({ op: 'put', key: String(id), value: { id, _dirty: true } })) });
    const a = await tabA.open(input('schema-b'));
    const b = await tabB.open(input('schema-b'));
    const stepA = (phase, extra = {}) => tabA.migration({ handle: a.handle, expectedEpoch: a.epoch, phase, ...extra });
    const stepB = (phase, extra = {}) => tabB.migration({ handle: b.handle, expectedEpoch: b.epoch, phase, ...extra });
    await stepA('begin');
    await stepA('write', { changes: [{ op: 'put', key: '1', value: { id: 1, _dirty: true } }] });
    clock += MIGRATION_LEASE_MS + 1;
    await expect(stepB('begin')).resolves.toMatchObject({ ok: true });
    const page = await tabB.read({ handle: b.handle, expectedEpoch: b.epoch, afterKey: null, limit: 100 });
    await stepB('write', { changes: page.rows.map((row) => ({ op: 'put', key: row.key, value: row.value })) });
    // A wakes up late: none of its steps land in B's generation.
    await expect(stepA('write', { changes: [{ op: 'put', key: '9', value: { id: 9 } }] })).resolves.toMatchObject({ ok: false, reason: 'conflict' });
    await expect(stepA('complete')).resolves.toMatchObject({ ok: false, reason: 'conflict' });
    await expect(stepA('abort')).resolves.toMatchObject({ ok: false, reason: 'conflict' });
    await expect(stepB('complete')).resolves.toMatchObject({ ok: true });
    const after = await tabB.open(input('schema-b'));
    const rows = await tabB.read({ handle: after.handle, expectedEpoch: after.epoch, afterKey: null, limit: 100 });
    expect(rows.rows.map((row) => row.key)).toEqual(['1', '2', '3']);
  });

  it('tells the caller when a cache\'s grant changed, apart from a change of its schema', async () => {
    const { port } = await setup(create);
    const cacheInput = (cacheFingerprint, schemaFingerprint) => ({ ...openInput({ storeName: 'orders', schemaFingerprint }), cacheFingerprint });
    const seed = async (input) => {
      const opened = await port.open(input);
      await port.commit({ handle: opened.handle, expectedEpoch: opened.epoch, expectedStoreRevision: opened.storeRevision,
        changes: [{ op: 'put', key: '1', value: { id: 1, _dirty: true } }] });
      return opened;
    };
    const finish = async (opened) => {
      const step = (phase) => port.migration({ handle: opened.handle, expectedEpoch: opened.epoch, phase });
      await step('begin');
      return step('complete');
    };
    await seed(cacheInput('grant-a', 'schema-a'));
    // The grant alone changed.
    const grant = await port.open(cacheInput('grant-b', 'schema-a'));
    expect(grant.migration).toEqual({ from: 1, to: 1, fromFingerprint: 'schema-a', cacheFingerprintChanged: true, fromCacheFingerprint: 'grant-a' });
    await finish(grant);
    await seed(cacheInput('grant-b', 'schema-a'));
    // The schema alone changed: no grant signal.
    const schema = await port.open(cacheInput('grant-b', 'schema-b'));
    expect(schema.migration).toEqual({ from: 1, to: 1, fromFingerprint: 'schema-a' });
    await finish(schema);
    await seed(cacheInput('grant-b', 'schema-b'));
    // Both changed: the grant signal is there.
    const both = await port.open(cacheInput('grant-c', 'schema-c'));
    expect(both.migration).toMatchObject({ cacheFingerprintChanged: true, fromCacheFingerprint: 'grant-b', fromFingerprint: 'schema-b' });
  });

  it('takes a fingerprinted store back to an older version: a cache starts empty, authored rows go through the caller', async () => {
    const { port, open } = await setup(create);
    const cache = await open({ storeName: 'shifts', schemaVersion: 2, schemaFingerprint: 'v2' });
    await cache.put([{ id: 1 }]);
    const older = await open({ storeName: 'shifts', schemaVersion: 1, schemaFingerprint: 'v1' });
    expect(older.migration).toBeFalsy();
    expect(await older.all()).toEqual([]);
    const drafts = await open({ storeName: 'drafts', policy: 'authored', schemaVersion: 2, schemaFingerprint: 'v2' });
    await drafts.put([{ id: 1, _dirty: true }]);
    const rolledBack = await open({ storeName: 'drafts', policy: 'authored', schemaVersion: 1, schemaFingerprint: 'v1' });
    expect(rolledBack.migration).toEqual({ from: 2, to: 1, fromFingerprint: 'v2' });
    // An opener that does not fingerprint its schema is still refused.
    await expect(port.open(openInput({ storeName: 'drafts', policy: 'authored', schemaVersion: 1 }))).rejects.toMatchObject({ reason: 'unavailable' });
  });

  it('evicts least recently written cache rows but never dirty rows, and refuses eviction on authored stores', async () => {
    const { port, open } = await setup(create);
    await expect(port.open(openInput({ storeName: 'outbox', policy: 'authored', limits: { evict: 'lru' } }))).rejects.toMatchObject({ reason: 'unserializable' });
    const rows = await open({ limits: { maxRows: 3, evict: 'lru' } });
    await rows.put([{ id: 1 }]);
    await rows.put([{ id: 2, _dirty: true }]);
    await rows.put([{ id: 3 }]);
    const result = await rows.put([{ id: 4 }, { id: 5 }]);
    expect(result.ok).toBe(true);
    expect(result.evicted.map((row) => row.key).sort()).toEqual(['1', '3']);
    expect((await rows.all()).map((row) => row.id)).toEqual([2, 4, 5]);
    // Only dirty rows left to give: the write is refused instead.
    const dirty = await open({ storeName: 'chats.drafts', limits: { maxRows: 1, evict: 'lru' } });
    await dirty.put([{ id: 1, _dirty: true }]);
    await expect(dirty.put([{ id: 2 }])).resolves.toMatchObject({ ok: false, reason: 'row-capacity' });
  });

  it('shares a byte budget across a domain and evicts the oldest rows across its collections', async () => {
    const { open, stores } = await setup(create);
    const limits = { evict: 'lru', domainMaxBytes: 400 };
    const threads = await open({ storeName: 'chats.threads', limits });
    const messages = await open({ storeName: 'chats.messages', limits });
    const outbox = await open({ storeName: 'outbox', policy: 'authored' });
    await outbox.put([{ id: 1, body: 'x'.repeat(300), _dirty: true }]);
    await threads.put([{ id: 't1', body: 'x'.repeat(100) }]);
    await messages.put([{ id: 'm1', body: 'x'.repeat(100) }]);
    await messages.put([{ id: 'm2', _dirty: true, body: 'x'.repeat(100) }]);
    const result = await threads.put([{ id: 't2', body: 'x'.repeat(100) }]);
    expect(result.evicted).toEqual([{ label: 'chats.threads', key: 't1' }]);
    const more = await threads.put([{ id: 't3', body: 'x'.repeat(100) }]);
    expect(more.evicted).toEqual([{ label: 'chats.messages', key: 'm1' }]);
    const listed = Object.fromEntries((await stores()).map((row) => [row.label, row]));
    expect(listed['chats.messages'].rowCount).toBe(1);
    expect(listed['chats.messages'].dirtyCount).toBe(1);
    expect(listed.outbox.rowCount).toBe(1);
    expect(listed['chats.threads'].rowCount).toBe(2);
  });

  it('lists stores, rows and pending rows, and clears a cache without touching dirty or authored rows', async () => {
    const { port, open, stores } = await setup(create);
    const rows = await open();
    await rows.put([{ id: 1, n: 1 }, { id: 2, n: 2, _dirty: true }], { syncedAt: 5000 });
    const outbox = await open({ storeName: 'outbox', policy: 'authored' });
    await outbox.put([{ id: 'q1', body: 'queued', _dirty: true }]);
    const listed = await stores();
    const cache = listed.find((row) => row.label === 'chats.rows');
    expect(cache).toMatchObject({ rowCount: 2, dirtyCount: 1, syncedAt: 5000, evict: 'none' });
    expect(cache.bytes).toBeGreaterThan(0);
    const page = await port.inspect({ op: 'rows', selector: SELECTOR, store: cache.id, limit: 1 });
    expect(page.rows.map((row) => row.value)).toEqual([{ id: 1, n: 1 }]);
    expect((await port.inspect({ op: 'rows', selector: SELECTOR, store: cache.id, afterKey: page.nextKey })).rows.map((row) => row.key)).toEqual(['2']);
    expect((await port.inspect({ op: 'pending', selector: SELECTOR, store: cache.id })).rows.map((row) => row.key)).toEqual(['2']);
    await expect(port.purge({ selector: SELECTOR, store: cache.id })).resolves.toEqual({ ok: true, removed: ['1'] });
    expect(await rows.all()).toEqual([{ id: 2, n: 2, _dirty: true }]);
    const draftStore = listed.find((row) => row.policy === 'authored');
    await expect(port.purge({ selector: SELECTOR, store: draftStore.id })).resolves.toEqual({ ok: true, removed: [] });
    expect((await stores()).find((row) => row.policy === 'authored').rowCount).toBe(1);
    await outbox.put([{ id: 'q2', body: 'second', _dirty: true }]);
    await expect(port.purge({ selector: SELECTOR, store: draftStore.id, keys: ['q2'] })).resolves.toEqual({ ok: true, removed: [] });
    await expect(port.purge({ selector: SELECTOR, store: draftStore.id, keys: ['q2'], force: true })).resolves.toEqual({ ok: true, removed: ['q2'] });
    await expect(port.purge({ selector: SELECTOR, store: draftStore.id, force: true })).resolves.toEqual({ ok: true, removed: ['q1'] });
    expect((await stores()).find((row) => row.policy === 'authored').rowCount).toBe(0);
  });

  it('leaves rows past the age limit out of reads, and gives them to a writer that asks', async () => {
    const { port, open, tick } = await setup(create);
    const rows = await open({ indexes: { byN: 'n' } });
    await rows.put([{ id: 1, n: 1 }, { id: 2, n: 2, _dirty: true }]);
    tick(86400000 + 1);
    expect(await rows.all()).toEqual([{ id: 2, n: 2, _dirty: true }]);
    const aged = await port.read({ handle: rows.handle, expectedEpoch: rows.epoch, afterKey: null, limit: 10, includeAged: true });
    expect(aged.rows.map((row) => row.key)).toEqual(['1', '2']);
    const keyed = await port.read({ handle: rows.handle, expectedEpoch: rows.epoch, keys: ['1'], includeAged: true });
    expect(keyed.rows.map((row) => row.key)).toEqual(['1']);
    expect((await rows.query({ index: 'byN', includeAged: true })).rows.map((row) => row.key)).toEqual(['1', '2']);
    expect((await rows.query({ index: 'byN' })).rows.map((row) => row.key)).toEqual(['2']);
    await expect(port.read({ handle: rows.handle, expectedEpoch: rows.epoch, afterKey: null, limit: 10, includeAged: 'yes' })).resolves.toMatchObject({ ok: false, reason: 'unserializable' });
  });

  it('keeps a unique index unique: a second row with the same value is refused, a swap in one commit is not', async () => {
    const { open, stores } = await setup(create);
    const codes = await open({ storeName: 'drafts', policy: 'authored', indexes: { byCode: 'code' }, unique: ['byCode'] });
    await expect(codes.put([{ id: 'a', code: 'X1', _dirty: true }, { id: 'b', code: 'X2', _dirty: true }])).resolves.toMatchObject({ ok: true });
    await expect(codes.put([{ id: 'c', code: 'X1', _dirty: true }])).resolves.toMatchObject({ ok: false, reason: 'constraint' });
    // A row keeps its own value, and two rows can trade theirs in one commit.
    await expect(codes.put([{ id: 'a', code: 'X1', note: 'edited', _dirty: true }])).resolves.toMatchObject({ ok: true });
    await expect(codes.put([{ id: 'a', code: 'X2', _dirty: true }, { id: 'b', code: 'X1', _dirty: true }])).resolves.toMatchObject({ ok: true });
    // Rows without the value are not held to it.
    await expect(codes.put([{ id: 'd', _dirty: true }, { id: 'e', _dirty: true }])).resolves.toMatchObject({ ok: true });
    expect((await stores()).find((row) => row.label === 'drafts')).toMatchObject({ indexes: ['byCode'], unique: ['byCode'] });
  });

  it('refuses a value a unique index cannot hold, rather than let it through unchecked', async () => {
    const { port, open } = await setup(create);
    const codes = await open({ storeName: 'drafts', policy: 'authored', indexes: { byCode: 'code' }, unique: ['byCode'] });
    const long = 'x'.repeat(257);
    const refused = { ok: false, reason: 'unserializable' };
    await expect(codes.put([{ id: 'a', code: long, _dirty: true }])).resolves.toMatchObject(refused);
    await expect(codes.put([{ id: 'a', code: 'a\u0000b', _dirty: true }])).resolves.toMatchObject(refused);
    await expect(codes.put([{ id: 'a', code: { nested: 1 }, _dirty: true }])).resolves.toMatchObject(refused);
    await expect(codes.put([{ id: 'a', code: 'x'.repeat(256), _dirty: true }])).resolves.toMatchObject({ ok: true });
    expect((await codes.all()).map((row) => row.id)).toEqual(['a']);
    // A rebuild is held to it too.
    const next = await port.open(openInput({ storeName: 'drafts', policy: 'authored', schemaVersion: 2, indexes: { byCode: 'code' }, unique: ['byCode'] }));
    const step = (phase, extra = {}) => port.migration({ handle: next.handle, expectedEpoch: next.epoch, phase, ...extra });
    await expect(step('begin')).resolves.toMatchObject({ ok: true });
    await expect(step('write', { changes: [{ op: 'put', key: 'a', value: { id: 'a', code: long, _dirty: true } }] })).resolves.toMatchObject({ ok: false, reason: 'unserializable' });
  });

  it('refuses a rebuild write that would break a unique index the new shape adds', async () => {
    const { port, open } = await setup(create);
    const drafts = await open({ storeName: 'drafts', policy: 'authored', indexes: { byCode: 'code' } });
    await drafts.put([{ id: 'a', code: 'X1', _dirty: true }, { id: 'b', code: 'X1', _dirty: true }]);
    const next = await port.open(openInput({ storeName: 'drafts', policy: 'authored', indexes: { byCode: 'code' }, unique: ['byCode'] }));
    expect(next.migration).toBeTruthy();
    const step = (phase, extra = {}) => port.migration({ handle: next.handle, expectedEpoch: next.epoch, phase, ...extra });
    await expect(step('begin')).resolves.toMatchObject({ ok: true });
    await expect(step('write', { changes: [{ op: 'put', key: 'a', value: { id: 'a', code: 'X1', _dirty: true } }] })).resolves.toMatchObject({ ok: true });
    await expect(step('write', { changes: [{ op: 'put', key: 'b', value: { id: 'b', code: 'X1', _dirty: true } }] })).resolves.toMatchObject({ ok: false, reason: 'constraint' });
    await expect(step('complete')).resolves.toMatchObject({ ok: true });
    const rebuilt = await port.read({ handle: next.handle, expectedEpoch: next.epoch, afterKey: null, limit: 10 });
    expect(rebuilt.rows.map((row) => row.key)).toEqual(['a']);
  });

  it('opens for an expected epoch only while that epoch holds, creating nothing after a retirement', async () => {
    const { port, stores } = await setup(create);
    const first = await port.open(openInput({ storeName: 'drafts', policy: 'authored' }));
    await expect(port.open(openInput({ storeName: 'drafts__unfit', policy: 'authored' }))).resolves.toMatchObject({ epoch: first.epoch });
    const fenced = { ...openInput({ storeName: 'late__unfit', policy: 'authored' }), expectedEpoch: first.epoch };
    await expect(port.open(fenced)).resolves.toMatchObject({ epoch: first.epoch });
    await retireHostStorePrincipal(SELECTOR);
    await expect(port.open({ ...fenced, storeName: 'later__unfit' })).rejects.toMatchObject({ reason: 'retired' });
    expect(await stores()).toEqual([]);
    await expect(port.open({ ...fenced, expectedEpoch: 'x' })).rejects.toMatchObject({ reason: 'unserializable' });
  });

  it('keeps a rebuilt cache within its byte budget, keeping the old rows when the new ones would not fit', async () => {
    const { port, open } = await setup(create);
    const small = { storeName: 'chats.rows', limits: { maxBytes: 400 } };
    const rows = await open(small);
    await rows.put([{ id: 1, n: 'x', _dirty: true }]);
    const next = await port.open(openInput({ ...small, schemaVersion: 2 }));
    expect(next.migration).toBeTruthy();
    const step = (phase, extra = {}) => port.migration({ handle: next.handle, expectedEpoch: next.epoch, phase, ...extra });
    await expect(step('begin')).resolves.toMatchObject({ ok: true });
    await expect(step('write', { changes: [{ op: 'put', key: '1', value: { id: 1, n: 'y'.repeat(2000), _dirty: true } }] }))
      .resolves.toMatchObject({ ok: false, reason: 'quota' });
    await expect(step('abort')).resolves.toMatchObject({ ok: true });
    expect(await rows.all()).toEqual([{ id: 1, n: 'x', _dirty: true }]);
  });

  it('counts a sibling rebuilding at the same time toward the domain budget, by the larger of its old and new rows', async () => {
    const { port, open } = await setup(create);
    const limits = { evict: 'lru', domainMaxBytes: 400 };
    const threads = await open({ storeName: 'chats.threads', limits });
    const messages = await open({ storeName: 'chats.messages', limits });
    await threads.put([{ id: 't1', body: 'x'.repeat(100), _dirty: true }]);
    await messages.put([{ id: 'm1', body: 'x'.repeat(100), _dirty: true }]);
    const rebuild = async (storeName) => {
      const next = await port.open(openInput({ storeName, limits, schemaVersion: 2 }));
      const step = (phase, extra = {}) => port.migration({ handle: next.handle, expectedEpoch: next.epoch, phase, ...extra });
      await expect(step('begin')).resolves.toMatchObject({ ok: true });
      return step;
    };
    const threadsStep = await rebuild('chats.threads');
    const messagesStep = await rebuild('chats.messages');
    const grown = (id) => ({ changes: [{ op: 'put', key: id, value: { id, body: 'x'.repeat(180), _dirty: true } }] });
    await expect(threadsStep('write', grown('t1'))).resolves.toMatchObject({ ok: true });
    // The threads rebuild now holds more than its old rows: the messages
    // rebuild counts it at that size, whichever of the two completes.
    await expect(messagesStep('write', grown('m1'))).resolves.toMatchObject({ ok: false, reason: 'quota' });
    await expect(threadsStep('complete')).resolves.toMatchObject({ ok: true });
    await expect(messagesStep('abort')).resolves.toMatchObject({ ok: true });
    // A commit beside a rebuild counts it too.
    const plain = await open({ storeName: 'chats.rows', limits });
    const rebuilding = await rebuild('chats.messages');
    await expect(rebuilding('write', grown('m1'))).resolves.toMatchObject({ ok: false, reason: 'quota' });
    await expect(rebuilding('write', { changes: [{ op: 'put', key: 'm1', value: { id: 'm1', body: 'x'.repeat(150), _dirty: true } }] })).resolves.toMatchObject({ ok: true });
    await expect(plain.put([{ id: 'r1', body: 'x'.repeat(60), _dirty: true }])).resolves.toMatchObject({ ok: false, reason: 'quota' });
  });

  it('keeps a rebuilt cache within its domain budget as that budget stands when the rebuild completes', async () => {
    const { port, open } = await setup(create);
    const limits = { evict: 'lru', domainMaxBytes: 400 };
    const threads = await open({ storeName: 'chats.threads', limits });
    // A sibling that declares a larger budget for itself grows past this one's.
    const messages = await open({ storeName: 'chats.messages', limits: { ...limits, domainMaxBytes: 1000 } });
    await threads.put([{ id: 't1', body: 'x'.repeat(50), _dirty: true }]);
    await messages.put([{ id: 'm1', body: 'x'.repeat(200) }]);
    const next = await port.open(openInput({ storeName: 'chats.threads', limits, schemaVersion: 2 }));
    expect(next.migration).toBeTruthy();
    const step = (phase, extra = {}) => port.migration({ handle: next.handle, expectedEpoch: next.epoch, phase, ...extra });
    const write = (length) => step('write', { changes: [{ op: 'put', key: 't1', value: { id: 't1', body: 'x'.repeat(length), _dirty: true } }] });
    await expect(step('begin')).resolves.toMatchObject({ ok: true });
    await expect(write(250)).resolves.toMatchObject({ ok: false, reason: 'quota' });
    await expect(write(100)).resolves.toMatchObject({ ok: true });
    await messages.put([{ id: 'm2', body: 'x'.repeat(100), _dirty: true }]);
    await expect(step('complete')).resolves.toMatchObject({ ok: false, reason: 'quota' });
    await expect(step('abort')).resolves.toMatchObject({ ok: true });
    expect(await threads.all()).toEqual([{ id: 't1', body: 'x'.repeat(50), _dirty: true }]);
  });

  it('forgets handles once they are closed or retired, however many opens came before', async () => {
    const { port } = await setup(create);
    for (let round = 0; round < 50; round += 1) {
      // eslint-disable-next-line no-await-in-loop
      const opened = await port.open(openInput({ storeName: 'drafts', policy: 'authored' }));
      // eslint-disable-next-line no-await-in-loop
      await port.retire({ handle: opened.handle, mode: 'close' });
    }
    expect(port.openHandles()).toBe(0);
    // A handle another opener's rebuild retired is forgotten on its next use.
    const stale = await port.open(openInput({ storeName: 'drafts', policy: 'authored', schemaFingerprint: 'schema-a' }));
    const rebuilding = await port.open(openInput({ storeName: 'drafts', policy: 'authored', schemaFingerprint: 'schema-b' }));
    const step = (phase) => port.migration({ handle: rebuilding.handle, expectedEpoch: rebuilding.epoch, phase });
    await step('begin');
    await step('complete');
    await expect(port.read({ handle: stale.handle, expectedEpoch: stale.epoch, afterKey: null, limit: 1 })).resolves.toMatchObject({ ok: false, reason: 'retired' });
    expect(port.openHandles()).toBe(1);
  });

  it('keeps open handles usable after a forced clear, and drops a rebuild in progress', async () => {
    const { port, open, stores } = await setup(create);
    const drafts = await open({ storeName: 'drafts', policy: 'authored' });
    await drafts.put([{ id: 'd1', _dirty: true }, { id: 'd2', _dirty: true }]);
    const listed = (await stores()).find((row) => row.label === 'drafts');
    await expect(port.purge({ selector: SELECTOR, store: listed.id, force: true })).resolves.toEqual({ ok: true, removed: ['d1', 'd2'] });
    expect(await drafts.all()).toEqual([]);
    // The handle's snapshot is stale: its write conflicts, then succeeds on the new revision.
    await expect(drafts.put([{ id: 'd3', _dirty: true }])).resolves.toMatchObject({ ok: false, reason: 'conflict' });
    const fresh = await port.read({ handle: drafts.handle, expectedEpoch: drafts.epoch, afterKey: null, limit: 10 });
    drafts.refresh(fresh);
    await expect(drafts.put([{ id: 'd3', _dirty: true }])).resolves.toMatchObject({ ok: true });
    expect(await drafts.all()).toEqual([{ id: 'd3', _dirty: true }]);

    // A rebuild under way when the clear lands: its opener's next step conflicts.
    const rebuilding = await port.open(openInput({ storeName: 'drafts', policy: 'authored', schemaVersion: 2 }));
    const step = (phase, extra = {}) => port.migration({ handle: rebuilding.handle, expectedEpoch: rebuilding.epoch, phase, ...extra });
    await expect(step('begin')).resolves.toMatchObject({ ok: true });
    await expect(port.purge({ selector: SELECTOR, store: listed.id, force: true })).resolves.toEqual({ ok: true, removed: ['d3'] });
    await expect(step('write', { changes: [{ op: 'put', key: 'd3', value: { id: 'd3', _dirty: true } }] })).resolves.toMatchObject({ ok: false, reason: 'conflict' });
    expect((await stores()).find((row) => row.label === 'drafts')).toMatchObject({ rowCount: 0, dirtyCount: 0 });
  });

  it('purges every namespace of a principal on logout', async () => {
    const { port, open } = await setup(create);
    const rows = await open();
    const drafts = await open({ storeName: 'drafts', policy: 'authored', who: identity({ mpId: 'forms', tenantId: 'team-4' }) });
    await rows.put([{ id: 1 }]);
    await drafts.put([{ id: 1, _dirty: true }]);
    await retireHostStorePrincipal(SELECTOR);
    expect((await port.inspect({ op: 'stores', selector: SELECTOR })).stores).toEqual([]);
    await expect(rows.put([{ id: 2 }])).resolves.toMatchObject({ ok: false, reason: 'retired' });
  });

  it('announces writes, evictions and purges in-app and to other tabs, without values', async () => {
    const Channel = createChannelBus();
    const { port, database } = await setup(create);
    const feed = createHostStoreChangeFeed({ BroadcastChannelImpl: Channel });
    const otherTab = createHostStoreChangeFeed({ BroadcastChannelImpl: Channel });
    const observed = observeHostStorePort(port, feed);
    const local = [];
    const remote = [];
    feed.subscribe((event) => local.push(event));
    otherTab.subscribe((event) => remote.push(event));
    const opened = await observed.open(openInput({ limits: { maxRows: 1, evict: 'lru' } }));
    const first = await observed.commit({ handle: opened.handle, expectedEpoch: opened.epoch, expectedStoreRevision: opened.storeRevision,
      changes: [{ op: 'put', key: '1', value: { id: 1, secret: 'body' } }] });
    await observed.commit({ handle: opened.handle, expectedEpoch: opened.epoch, expectedStoreRevision: first.storeRevision,
      changes: [{ op: 'put', key: '2', value: { id: 2, secret: 'body' } }] });
    const cache = (await observed.inspect({ op: 'stores', selector: SELECTOR })).stores[0];
    await observed.purge({ selector: SELECTOR, store: cache.id });
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    expect(local.map((event) => [event.type, event.label || null, event.keys])).toEqual([
      ['commit', 'chats.rows', ['1']], ['commit', 'chats.rows', ['2']], ['evict', null, ['1']], ['purge', null, ['2']],
    ]);
    expect(local.every((event) => event.remote === false)).toBe(true);
    expect(remote.map((event) => [event.type, event.remote])).toEqual([['commit', true], ['commit', true], ['evict', true], ['purge', true]]);
    expect(JSON.stringify([...local, ...remote])).not.toContain('secret');
    feed.close(); otherTab.close(); await database.close();
  });

  it('names no keys when it cannot name them all: every row of the store may have changed', async () => {
    const Channel = createChannelBus();
    const { port, database } = await setup(create);
    const feed = createHostStoreChangeFeed({ BroadcastChannelImpl: Channel });
    const otherTab = createHostStoreChangeFeed({ BroadcastChannelImpl: Channel });
    const observed = observeHostStorePort(port, feed);
    const local = [];
    const remote = [];
    feed.subscribe((event) => local.push(event));
    otherTab.subscribe((event) => remote.push(event));
    const opened = await observed.open(openInput());
    const many = Array.from({ length: 150 }, (_, index) => ({ op: 'put', key: String(index), value: { id: index } }));
    await observed.commit({ handle: opened.handle, expectedEpoch: opened.epoch, expectedStoreRevision: opened.storeRevision, changes: many.slice(0, 100) });
    const listed = (await observed.inspect({ op: 'stores', selector: SELECTOR })).stores[0];
    await observed.commit({ handle: opened.handle, expectedEpoch: opened.epoch, expectedStoreRevision: listed.revision ?? 1, changes: many.slice(100) });
    const cache = (await observed.inspect({ op: 'stores', selector: SELECTOR })).stores[0];
    await observed.purge({ selector: SELECTOR, store: cache.id });
    // A principal's purge names no store and no keys.
    feed.publish({ type: 'purge', principal: 'p' });
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    const shape = (event) => [event.type, event.keys === undefined ? 'every row' : event.keys.length, event.truncated === true];
    expect(local.map(shape)).toEqual([['commit', 100, false], ['commit', 50, false], ['purge', 'every row', true], ['purge', 'every row', false]]);
    expect(remote.map(shape)).toEqual(local.map(shape));
    feed.close(); otherTab.close(); await database.close();
  });
});
