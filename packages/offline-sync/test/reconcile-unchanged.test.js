// @vitest-environment node
/**
 * A server row answered exactly as a store holds it is not a change:
 * reconcile leaves it unwritten (a commit is announced on the change feed)
 * and tells no one, so two strict reads over shared rows never void each
 * other's receipt.
 */
import { describe, it, expect, vi } from 'vitest';
import { createDataService, createDataStore, createMemoryStoreBackend } from '../src/index.js';
import { createHostStorePort, createHostStoreChangeFeed, observeHostStorePort } from '../src/host-store/index.js';
import { DATABASES, identity, createChannelBus } from './helpers/host-databases.js';

/** A host-store-backed collection the way the app opens one. */
function transactionalBackend(port, options) {
  let handle;
  const ready = () => (handle ||= port.open(options));
  const read = async ({ aged = false, ...input }) => {
    const h = await ready();
    const result = await port.read({ handle: h.handle, expectedEpoch: h.epoch, ...input, ...(aged ? { includeAged: true } : {}) });
    if (result.ok === false) throw Object.assign(new Error(result.reason), { name: 'StorageReadError', reason: result.reason });
    return result;
  };
  return {
    transactional: true, policy: options.policy, limits: options.limits,
    snapshot: (keys, { aged = false } = {}) => read({ keys, aged }),
    page: ({ afterKey = null, limit = 100, aged = false } = {}) => read({ afterKey, limit, aged }),
    async get(key, { aged = false } = {}) { return (await read({ keys: [String(key)], aged })).rows[0]?.value; },
    async getAll({ aged = false } = {}) {
      const rows = []; let afterKey = null;
      do { const page = await read({ afterKey, limit: 100, aged }); rows.push(...page.rows.map((row) => row.value)); afterKey = page.nextKey; } while (afterKey !== null);
      return rows;
    },
    async commit(snapshot, changes, extra) {
      const h = await ready();
      return port.commit({ handle: h.handle, expectedEpoch: snapshot.epoch, expectedStoreRevision: snapshot.storeRevision, changes, ...(extra || {}) });
    },
    async close() {},
  };
}

function open(create, feed = null, { maxAgeMs = 30 * 86400000, now } = {}) {
  if (!create) return { database: { close: async () => {} }, store: createDataStore({ name: 'docs', backend: createMemoryStoreBackend() }) };
  const database = create();
  const raw = createHostStorePort({ database, backend: database.kind === 'sqlite' ? 'electron_sqlite' : 'indexeddb' });
  const port = feed ? observeHostStorePort(raw, feed) : raw;
  const options = { identity: identity(), storeName: 'docs', policy: 'cache', schemaVersion: 1, cacheFingerprint: 'fp',
    limits: { maxRows: 1000, maxAgeMs, maxBytes: null } };
  const backend = transactionalBackend(port, options);
  const commit = vi.spyOn(backend, 'commit');
  const store = createDataStore({ name: 'docs', backend, ...(now ? { now } : {}) });
  return { database, store, port, commit };
}

const mine = [{ id: '1', user_id: '5', status: 'approved', meta: { a: 1, b: 2 } }];
const team = [...mine, { id: '2', user_id: '6', status: 'pending', meta: { a: 3 } }];

// The host store (both engines) and the memory store a session collection uses.
const STORES = [...DATABASES, ['memory', null]];

describe.each(STORES)('reconcile of unchanged server rows (%s)', (_name, create) => {
  it('leaves an identical row unwritten and tells no one', async () => {
    const { database, store } = open(create);
    await store.reconcile(team, { prune: false, keepDirty: true, syncedAt: null });
    const before = await store.getRaw('1');
    const heard = vi.fn();
    store.onChange(heard);
    // The same rows, keys in another order.
    const answered = await store.reconcile(team.map((row) => ({ meta: { b: row.meta.b, a: row.meta.a }, status: row.status, user_id: row.user_id, id: row.id }))
      .map((row) => (row.meta.b === undefined ? { ...row, meta: { a: row.meta.a } } : row)), { prune: false, keepDirty: true, syncedAt: null });
    expect(answered.upserted).toBe(2);
    expect(heard).not.toHaveBeenCalled();
    const after = await store.getRaw('1');
    expect(after).toEqual(before);
    await database.close();
  });

  it('writes an otherwise identical row that brings its own read stamp', async () => {
    const { database, store } = open(create);
    await store.reconcile(team, { prune: false, keepDirty: true, syncedAt: null });
    const heard = vi.fn();
    store.onChange(heard);
    await store.reconcile([{ ...team[0], _readStamp: 'exact-1' }, team[1]], { prune: false, keepDirty: true, syncedAt: null });
    expect(heard).toHaveBeenCalledTimes(1);
    expect((await store.getRaw('1'))._readStamp).toBe('exact-1');
    await database.close();
  });

  it('keeps a held read stamp through an unstamped answer of the same row, unwritten', async () => {
    const { database, store } = open(create);
    await store.reconcile([{ ...team[0], _readStamp: 'exact-1' }, team[1]], { prune: false, keepDirty: true, syncedAt: null });
    const before = await store.getRaw('1');
    const heard = vi.fn();
    store.onChange(heard);
    await store.reconcile(team, { prune: false, keepDirty: true, syncedAt: null });
    expect(heard).not.toHaveBeenCalled();
    expect(await store.getRaw('1')).toEqual(before);
    await database.close();
  });

  it('leaves a row answered again with the stamp it holds unwritten', async () => {
    const { database, store } = open(create);
    await store.reconcile([{ ...team[0], _readStamp: 'exact-1' }], { prune: false, keepDirty: true, syncedAt: null });
    const before = await store.getRaw('1');
    const heard = vi.fn();
    store.onChange(heard);
    await store.reconcile([{ ...team[0], _readStamp: 'exact-1' }], { prune: false, keepDirty: true, syncedAt: null });
    expect(heard).not.toHaveBeenCalled();
    expect(await store.getRaw('1')).toEqual(before);
    await database.close();
  });

  it('writes a row answered with a new stamp', async () => {
    const { database, store } = open(create);
    await store.reconcile([{ ...team[0], _readStamp: 'exact-1' }], { prune: false, keepDirty: true, syncedAt: null });
    const heard = vi.fn();
    store.onChange(heard);
    await store.reconcile([{ ...team[0], _readStamp: 'exact-2' }], { prune: false, keepDirty: true, syncedAt: null });
    expect(heard).toHaveBeenCalledTimes(1);
    expect((await store.getRaw('1'))._readStamp).toBe('exact-2');
    await database.close();
  });

  it('keeps a held stamp through a write of the same content, and drops it over changed content', async () => {
    const { database, store } = open(create);
    await store.reconcile([{ ...team[0], _readStamp: 'exact-1' }], { prune: false, keepDirty: true, syncedAt: null, windowKey: 'w1' });
    // Another window's read: written (retagged), the content the stamp read unchanged.
    await store.reconcile([team[0]], { prune: false, keepDirty: true, syncedAt: null, windowKey: 'w2' });
    expect(await store.getRaw('1')).toMatchObject({ _readStamp: 'exact-1', _window: 'w2' });
    // A newer version no stamped read saw.
    await store.reconcile([{ ...team[0], status: 'rejected' }], { prune: false, keepDirty: true, syncedAt: null });
    const after = await store.getRaw('1');
    expect(after.status).toBe('rejected');
    expect(after._readStamp).toBeUndefined();
    await database.close();
  });

  it('leaves a stamped row with an unsent local write as it is', async () => {
    const { database, store } = open(create);
    await store.reconcile([{ ...team[0], _readStamp: 'exact-1' }], { prune: false, keepDirty: true, syncedAt: null });
    await store.put({ ...team[0], status: 'draft' });
    const before = await store.getRaw('1');
    expect(before._dirty).toBe(true);
    const heard = vi.fn();
    store.onChange(heard);
    const answered = await store.reconcile([{ ...team[0], _readStamp: 'exact-2' }], { prune: false, keepDirty: true, syncedAt: null });
    expect(answered.skipped).toEqual(['1']);
    expect(heard).not.toHaveBeenCalled();
    expect(await store.getRaw('1')).toEqual(before);
    await database.close();
  });

  it('announces a row whose content changed and gives it a new revision', async () => {
    const { database, store } = open(create);
    await store.reconcile(team, { prune: false, keepDirty: true, syncedAt: null });
    const before = await store.getRaw('2');
    const heard = vi.fn();
    store.onChange(heard);
    await store.reconcile([team[0], { ...team[1], status: 'approved' }], { prune: false, keepDirty: true, syncedAt: null });
    expect(heard).toHaveBeenCalledTimes(1);
    expect((await store.getRaw('2'))._rev).toBeGreaterThan(before._rev);
    await database.close();
  });

  it('announces a prune even when every answered row is unchanged', async () => {
    const { database, store } = open(create);
    await store.reconcile(team, { prune: false, keepDirty: true, syncedAt: null });
    const heard = vi.fn();
    store.onChange(heard);
    await store.reconcile(mine);
    expect(heard).toHaveBeenCalledTimes(1);
    expect(await store.getRaw('2')).toBeUndefined();
    await database.close();
  });

  it('keeps a team-wide and an own strict receipt current through each other\'s identical refetch', async () => {
    const feed = create ? createHostStoreChangeFeed({ BroadcastChannelImpl: createChannelBus() }) : null;
    const { database, store } = open(create, feed);
    const data = createDataService({ resolve: (name) => (name === 'docs' ? { store, decl: { keyPath: 'id' } } : null), ...(feed ? { feed } : {}) });
    const fetchTeam = vi.fn(async () => team);
    const fetchMine = vi.fn(async () => mine);
    data.source('docs', {
      fetch: async () => [],
      methods: {
        all: { params: {}, fetch: fetchTeam, strictReceipt: true },
        own: { params: {}, fetch: fetchMine, strictReceipt: true },
      },
    });
    const all = { collection: 'docs', method: 'all', params: {} };
    const own = { collection: 'docs', method: 'own', params: {} };
    await data.refresh(all, { mode: 'visible' });
    await data.refresh(own, { mode: 'visible' });
    const ownBefore = data.status(own, { receipt: true });
    expect(ownBefore.receiptRevision).toBe(ownBefore.revision);
    // The team-wide read again, answering the rows it answered before.
    await data.refresh(all, { mode: 'visible', maxAge: 0, fromNow: true });
    const ownAfter = data.status(own, { receipt: true });
    expect(ownAfter.receiptRevision).toBe(ownAfter.revision);
    const allAfter = data.status(all, { receipt: true });
    expect(allAfter.receiptRevision).toBe(allAfter.revision);
    expect(fetchTeam).toHaveBeenCalledTimes(2);
    data.dispose(); feed?.close();
    await database.close();
  });
});

describe.each(DATABASES)('reconcile of unchanged server rows that stamp the collection synced (%s)', (_name, create) => {
  it('stamps freshness without writing identical rows or moving their revisions', async () => {
    const feed = createHostStoreChangeFeed({ BroadcastChannelImpl: null });
    const { database, store, port, commit } = open(create, feed);
    await store.reconcile(team, { keepDirty: true, syncedAt: 1000 });
    const notice = vi.fn();
    feed.subscribe(notice);
    const before = await store.getAllRaw();
    commit.mockClear();
    const heard = vi.fn();
    store.onChange(heard);
    await store.reconcile(team, { keepDirty: true, syncedAt: 2000 });
    expect(commit.mock.calls.flatMap(([, changes]) => changes)).toEqual([]);
    expect(await store.getAllRaw()).toEqual(before);
    expect(heard).not.toHaveBeenCalled();
    const inspected = await port.inspect({ op: 'stores', selector: { authorityOrigin: 'https://api.example.test', viewerId: '7' } });
    expect(inspected.stores[0].syncedAt).toBe(2000);
    expect(notice).not.toHaveBeenCalled();
    feed.close();
    await database.close();
  });

  it('restamps an identical row past half a short age limit, keeping its revision, and nothing before', async () => {
    let at = Date.UTC(2026, 9, 30, 9);
    const { database, store, commit } = open(create, null, { maxAgeMs: 60 * 60 * 1000, now: () => at });
    await store.reconcile(team, { keepDirty: true });
    const before = await store.getRaw('1');
    commit.mockClear();
    at += 20 * 60 * 1000;
    await store.reconcile(team, { keepDirty: true });
    expect(commit.mock.calls.flatMap(([, changes]) => changes)).toEqual([]);
    at += 15 * 60 * 1000;
    await store.reconcile(team, { keepDirty: true });
    expect(commit.mock.calls.flatMap(([, changes]) => changes).map((change) => [change.op, change.key])).toEqual([['put', '1'], ['put', '2']]);
    const after = await store.getRaw('1');
    expect(after._rev).toBe(before._rev);
    expect(after._updatedAt).toBe(new Date(at).toISOString());
    await database.close();
  });

  it('writes only the changed row and still prunes a missing row', async () => {
    const { database, store, commit } = open(create);
    await store.reconcile(team, { keepDirty: true });
    commit.mockClear();
    await store.reconcile([team[0], { ...team[1], status: 'approved' }], { keepDirty: true });
    expect(commit.mock.calls.flatMap(([, changes]) => changes).filter((change) => change.op === 'put').map((change) => change.key)).toEqual(['2']);
    commit.mockClear();
    await store.reconcile(mine, { keepDirty: true });
    expect(commit.mock.calls.flatMap(([, changes]) => changes)).toEqual([{ op: 'delete', key: '2' }]);
    expect(await store.getRaw('2')).toBeUndefined();
    await database.close();
  });
});
