// @vitest-environment node
/**
 * A watcher of a collection hears which rows changed: `watch` calls its
 * listener with `{ keys }` when every changed row's key is known (this tab's
 * writes, and change-feed commits that list their keys), and with null when
 * any row may have changed (another handle's change, an eviction, a purge),
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

function open(create) {
  let store;
  if (create) {
    const database = create();
    closers.push(() => database.close());
    const port = createHostStorePort({ database, backend: database.kind === 'sqlite' ? 'electron_sqlite' : 'indexeddb' });
    const options = { identity: identity(), storeName: 'shifts', policy: 'cache', schemaVersion: 1, cacheFingerprint: 'fp',
      limits: { maxRows: 1000, maxAgeMs: 30 * 86400000, maxBytes: null } };
    store = createDataStore({ name: 'shifts', backend: transactionalBackend(port, options) });
  } else store = createDataStore({ name: 'shifts', backend: createMemoryStoreBackend() });
  const listeners = new Set();
  const feed = { subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); } };
  const data = createDataService({ feed, resolve: (name) => (name === 'shifts' ? { store, decl: { keyPath: 'id' } } : null) });
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
    emit({ type: 'purge', label: 'shifts', keys: ['101'] });
    expect(heard.at(-1)).toBeNull();
    emit({ type: 'purge' });
    expect(heard.at(-1)).toBeNull();
  });
});
