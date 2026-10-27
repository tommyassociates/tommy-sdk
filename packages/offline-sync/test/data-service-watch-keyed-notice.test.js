// @vitest-environment node
/**
 * A watcher of a collection hears which rows changed: `watch` calls its
 * listener with `{ keys }` when every changed row's key is known (this tab's
 * writes and the rows their evictions removed, change-feed commits that list
 * their keys, and evictions that list each store's keys), and with null when
 * any row may have changed (another handle's change, a purge),
 * so a caller keeping rows derived from the collection can re-read only the
 * keys named.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createDataService, createDataStore, createMemoryStoreBackend } from '../src/index.js';
import { createHostStorePort } from '../src/host-store/index.js';
import { DATABASES, identity } from './helpers/host-databases.js';

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
    page: ({ afterKey = null, limit = 100, aged = false, metadataOnly = false } = {}) => read({ afterKey, limit, aged, ...(metadataOnly ? { metadataOnly } : {}) }),
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

const closers = [];
afterEach(async () => { await Promise.all(closers.splice(0).map((close) => close())); });

function open(create, { maxRows = 1000, evict, changeOwner = null } = {}) {
  let store;
  if (create) {
    const database = create();
    closers.push(() => database.close());
    const port = createHostStorePort({ database, backend: database.kind === 'sqlite' ? 'electron_sqlite' : 'indexeddb' });
    const options = { identity: identity(), storeName: 'shifts', policy: 'cache', schemaVersion: 1, cacheFingerprint: 'fp',
      limits: { maxRows, maxAgeMs: 30 * 86400000, maxBytes: null, ...(evict ? { evict } : {}) } };
    store = createDataStore({ name: 'shifts', backend: transactionalBackend(port, options) });
  } else store = createDataStore({ name: 'shifts', backend: createMemoryStoreBackend() });
  const listeners = new Set();
  const feed = { subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); } };
  const data = createDataService({ feed, changeOwner, resolve: (name) => (name === 'shifts' ? { store, decl: { keyPath: 'id' } } : null) });
  closers.push(() => data.dispose());
  const emit = (event) => [...listeners].forEach((fn) => fn(event));
  return { data, store, emit };
}

const ROWS = Array.from({ length: 5 }, (_, at) => ({ id: String(100 + at), user_id: String(at) }));
const sortedKeys = (notice) => [...notice.keys].sort();

describe.each([...DATABASES, ['memory', null]])('watching a collection (%s)', (_name, create) => {
  it('names the keys this tab wrote', async () => {
    const { data } = open(create);
    const heard = [];
    data.watch('shifts', (notice) => heard.push(notice));
    await data.ingest('shifts', ROWS);
    await data.writer('shifts').put({ id: '102', user_id: 'changed' });
    await data.writer('shifts').delete('104');
    const keyed = heard.filter(Boolean);
    expect(keyed.length).toBe(heard.length);
    expect(sortedKeys(keyed[0])).toEqual(ROWS.map((row) => row.id));
    expect(keyed.at(-2).keys).toEqual(['102']);
    expect(keyed.at(-1).keys).toEqual(['104']);
  });

  it('says any row may have changed when it cannot name them', async () => {
    const { data, store, emit } = open(create);
    await data.ingest('shifts', ROWS);
    const heard = [];
    data.watch('shifts', (notice) => heard.push(notice));
    if (create) {
      await store.revalidateSubscribers();
      expect(heard.at(-1)).toBeNull();
    }
    emit({ type: 'commit', label: 'shifts', keys: ['101'] });
    expect(heard.at(-1)).toEqual({ keys: ['101'] });
    emit({ type: 'commit', label: 'shifts', truncated: true });
    expect(heard.at(-1)).toBeNull();
    emit({ type: 'evict', labels: ['shifts'], keys: ['101'] });
    expect(heard.at(-1)).toBeNull();
    emit({ type: 'evict', labels: ['shifts', 'tags'], keys: ['101', '7'], keysByLabel: { shifts: ['101'], tags: ['7'] } });
    expect(heard.at(-1)).toEqual({ keys: ['101'] });
    emit({ type: 'evict', labels: ['shifts'], keys: ['101'], keysByLabel: { tags: ['7'] } });
    expect(heard.at(-1)).toBeNull();
    emit({ type: 'purge', label: 'shifts', keys: ['101'] });
    expect(heard.at(-1)).toBeNull();
    emit({ type: 'purge' });
    expect(heard.at(-1)).toBeNull();
  });
});

describe.each([...DATABASES, ['memory', null]])('another owner\'s change (%s)', (_name, create) => {
  it('is not heard, and every notice heard moves the revision by one', async () => {
    const own = JSON.stringify(['https://api.test', '3', 'Team', '743', null]);
    const other = JSON.stringify(['https://api.test', '3', 'Team', '743', 'member']);
    const { data, emit } = open(create, { changeOwner: own });
    await data.ingest('shifts', ROWS);
    const start = data.status('shifts', { receipt: true }).revision;
    const heard = [];
    data.watch('shifts', (notice) => heard.push(notice));
    emit({ type: 'commit', label: 'shifts', owner: other, keys: ['900'] });
    emit({ type: 'evict', labels: ['shifts'], owner: other, keys: ['101'], keysByLabel: { shifts: ['101'] } });
    emit({ type: 'purge', owner: other, principal: JSON.stringify(['https://api.test', '9']) });
    expect(heard).toEqual([]);
    expect(data.status('shifts', { receipt: true }).revision).toBe(start);
    emit({ type: 'commit', label: 'shifts', owner: own, keys: ['901'] });
    expect(heard).toEqual([{ keys: ['901'] }]);
    expect(data.status('shifts', { receipt: true }).revision).toBe(start + 1);
  });

  it('does not re-read a subscribed target', async () => {
    const own = JSON.stringify(['https://api.test', '3', 'Team', '743', null]);
    const other = JSON.stringify(['https://api.test', '3', 'Team', '743', 'member']);
    const { data, store, emit } = open(create, { changeOwner: own });
    await data.ingest('shifts', ROWS);
    let reads = 0;
    const getAll = store.getAll.bind(store);
    store.getAll = (...args) => { reads += 1; return getAll(...args); };
    const off = data.subscribe('shifts', () => {});
    await new Promise((resolve) => { setTimeout(resolve, 20); });
    const settled = reads;
    emit({ type: 'commit', label: 'shifts', owner: other, keys: ['900'] });
    await new Promise((resolve) => { setTimeout(resolve, 20); });
    expect(reads).toBe(settled);
    emit({ type: 'commit', label: 'shifts', owner: own, keys: ['901'] });
    await new Promise((resolve) => { setTimeout(resolve, 20); });
    expect(reads).toBeGreaterThan(settled);
    off();
  });
});

describe.each(DATABASES)('a write that evicts rows (%s)', (_name, create) => {
  it('names the rows it wrote and the rows the eviction removed', async () => {
    const { data } = open(create, { maxRows: 5, evict: 'lru' });
    await data.ingest('shifts', ROWS);
    const heard = [];
    data.watch('shifts', (notice) => heard.push(notice));
    await data.writer('shifts').put({ id: '200', user_id: 'new' });
    const notice = heard.at(-1);
    expect(notice).not.toBeNull();
    expect(notice.keys).toContain('200');
    expect(notice.keys).toHaveLength(2);
    const evicted = notice.keys.find((key) => key !== '200');
    expect(ROWS.map((row) => row.id)).toContain(evicted);
    expect(await data.read('shifts', [evicted])).toEqual([null]);
  });
});
