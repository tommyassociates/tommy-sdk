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

function open(create, feed = null) {
  if (!create) return { database: { close: async () => {} }, store: createDataStore({ name: 'docs', backend: createMemoryStoreBackend() }) };
  const database = create();
  const raw = createHostStorePort({ database, backend: database.kind === 'sqlite' ? 'electron_sqlite' : 'indexeddb' });
  const port = feed ? observeHostStorePort(raw, feed) : raw;
  const options = { identity: identity(), storeName: 'docs', policy: 'cache', schemaVersion: 1, cacheFingerprint: 'fp',
    limits: { maxRows: 1000, maxAgeMs: 30 * 86400000, maxBytes: null } };
  const store = createDataStore({ name: 'docs', backend: transactionalBackend(port, options) });
  return { database, store };
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
  it('restamps an identical row, keeping its revision, for a read that stamps the collection synced', async () => {
    const { database, store } = open(create);
    await store.reconcile(team, { prune: false, keepDirty: true, syncedAt: null });
    const before = await store.getRaw('1');
    await new Promise((resolve) => { setTimeout(resolve, 5); });
    await store.reconcile(team, { prune: false, keepDirty: true });
    const after = await store.getRaw('1');
    expect(after._rev).toBe(before._rev);
    expect(after._updatedAt > before._updatedAt).toBe(true);
    await database.close();
  });
});
