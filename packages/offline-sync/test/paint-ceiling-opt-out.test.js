// @vitest-environment node
/**
 * The paint ceiling per store: every cache holds its rows to PAINT_CEILING_MS
 * unless it was created with `paintCeiling: false`, which paints them at any
 * age while the row cap, window retention and the backend's age limit still
 * apply. Client-owned (`last_write_wins`) stores never age out of a read, and
 * the raw reads see every row in every case. Driven on the memory store and
 * on the host store (both engines) the app opens.
 */
import { describe, it, expect } from 'vitest';
import { createDataStore, createMemoryStoreBackend, PAINT_CEILING_MS } from '../src/data-store.js';
import { createHostStorePort } from '../src/host-store/index.js';
import { DATABASES, identity } from './helpers/host-databases.js';

const DAY = 24 * 60 * 60 * 1000;
const MAX_AGE_MS = 30 * DAY;

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

// One store on a clock the test moves, on the memory backend or a host store.
function world(create, storeOptions = {}) {
  let clock = Date.parse('2026-09-01T00:00:00.000Z');
  const now = () => clock;
  let database = { close: async () => {} };
  let backend = createMemoryStoreBackend();
  if (create) {
    database = create();
    const port = createHostStorePort({ database, backend: database.kind === 'sqlite' ? 'electron_sqlite' : 'indexeddb', now });
    backend = transactionalBackend(port, {
      identity: identity(), storeName: 'rows', policy: 'cache', schemaVersion: 1, cacheFingerprint: 'fp',
      limits: { maxRows: 1000, maxAgeMs: MAX_AGE_MS, maxBytes: null },
    });
  }
  const store = createDataStore({ name: 'rows', keyPath: 'id', backend, now, ...storeOptions });
  return { store, database, age: (ms) => { clock += ms; } };
}

// What each read a surface paints through answers for row `id`.
async function painted(store, id) {
  return {
    get: (await store.get(id))?.id ?? null,
    getAll: (await store.getAll()).map((row) => row.id),
    readWhere: (await store.readWhere(() => true)).map((row) => row.id),
    selectFrom: store.selectFrom(await store.getAllRaw(), () => true).map((row) => row.id),
  };
}
const shows = (id) => ({ get: id, getAll: [id], readWhere: [id], selectFrom: [id] });
const hides = { get: null, getAll: [], readWhere: [], selectFrom: [] };

const STORES = [['memory', null], ...DATABASES];

describe.each(STORES)('the paint ceiling per store (%s)', (_name, create) => {
  it('holds a cache to the ceiling by default', async () => {
    const { store, database, age } = world(create);
    await store.reconcile([{ id: '1' }], { prune: false });
    age(PAINT_CEILING_MS - DAY);
    expect(await painted(store, '1')).toEqual(shows('1'));
    age(2 * DAY);
    expect(await painted(store, '1')).toEqual(hides);
    expect((await store.getAllRaw()).map((row) => row.id)).toEqual(['1']);
    expect((await store.getRaw('1'))?.id).toBe('1');
    await database.close();
  });

  it('holds a cache declared `paintCeiling: true` to the ceiling', async () => {
    const { store, database, age } = world(create, { paintCeiling: true });
    await store.reconcile([{ id: '1' }], { prune: false });
    age(PAINT_CEILING_MS + DAY);
    expect(await painted(store, '1')).toEqual(hides);
    await database.close();
  });

  it('paints the rows of a cache declared `paintCeiling: false` past the ceiling', async () => {
    const { store, database, age } = world(create, { paintCeiling: false });
    await store.reconcile([{ id: '1' }], { prune: false });
    age(PAINT_CEILING_MS + DAY);
    expect(await painted(store, '1')).toEqual(shows('1'));
    expect((await store.getAllRaw()).map((row) => row.id)).toEqual(['1']);
    expect((await store.getRaw('1'))?.id).toBe('1');
    await database.close();
  });

  it('tells a subscriber of a `paintCeiling: false` cache the rows it paints', async () => {
    const { store, database, age } = world(create, { paintCeiling: false });
    await store.reconcile([{ id: '1' }], { prune: false });
    age(PAINT_CEILING_MS + DAY);
    const heard = [];
    const off = store.subscribe((rows) => heard.push(rows.map((row) => row.id)));
    await store.reconcile([{ id: '2' }], { prune: false });
    await new Promise((settle) => { setTimeout(settle, 0); });
    expect(heard.at(-1)?.sort()).toEqual(['1', '2']);
    off?.();
    await database.close();
  });

  it('paints a client-owned (`last_write_wins`) store at any age, whatever `paintCeiling` says', async () => {
    for (const paintCeiling of [true, false]) {
      const { store, database, age } = world(create, { syncStrategy: 'last_write_wins', paintCeiling });
      // eslint-disable-next-line no-await-in-loop
      await store.put({ id: '1' });
      // eslint-disable-next-line no-await-in-loop
      await store.markSynced('1');
      age(20 * DAY); // past the ceiling, within the host store age limit
      // eslint-disable-next-line no-await-in-loop
      expect(await painted(store, '1')).toEqual(shows('1'));
      // eslint-disable-next-line no-await-in-loop
      await database.close();
    }
  });

  it('refuses a `paintCeiling` that is not true or false', () => {
    expect(() => world(create, { paintCeiling: 0 })).toThrow(TypeError);
    expect(() => world(create, { paintCeiling: 'false' })).toThrow(TypeError);
  });
});

describe('a `paintCeiling: false` cache keeps every other bound', () => {
  it('ages out at the host store age limit', async () => {
    const [, create] = DATABASES.find(([kind]) => kind === 'sqlite');
    const { store, database, age } = world(create, { paintCeiling: false });
    await store.reconcile([{ id: '1' }], { prune: false });
    age(MAX_AGE_MS - DAY);
    expect((await store.getAll()).map((row) => row.id)).toEqual(['1']);
    age(2 * DAY);
    expect(await store.getAll()).toEqual([]);
    expect(await store.get('1')).toBeUndefined();
    await database.close();
  });

  it('keeps to its row cap, as a cache under the ceiling does', async () => {
    let clock = Date.parse('2026-09-01T00:00:00.000Z');
    const store = createDataStore({
      name: 'rows', keyPath: 'id', backend: createMemoryStoreBackend(), now: () => clock, maxRows: 2, paintCeiling: false,
    });
    await store.reconcile([{ id: '1' }], { prune: false });
    clock += 1000;
    await store.reconcile([{ id: '2' }], { prune: false });
    clock += PAINT_CEILING_MS + DAY;
    await store.reconcile([{ id: '3' }], { prune: false });
    expect((await store.getAllRaw()).map((row) => row.id).sort()).toEqual(['2', '3']);
    expect((await store.getAll()).map((row) => row.id).sort()).toEqual(['2', '3']);
  });

  it('keeps to its window retention, as a cache under the ceiling does', async () => {
    let clock = Date.parse('2026-09-01T00:00:00.000Z');
    const store = createDataStore({
      name: 'rows', keyPath: 'id', backend: createMemoryStoreBackend(), now: () => clock, maxWindows: 2, paintCeiling: false,
    });
    for (const week of ['w1', 'w2', 'w3']) {
      // eslint-disable-next-line no-await-in-loop
      await store.reconcile([{ id: week }], { scope: (row) => row.id === week, windowKey: week });
      clock += 1000;
    }
    expect((await store.getAllRaw()).map((row) => row.id).sort()).toEqual(['w2', 'w3']);
  });
});
