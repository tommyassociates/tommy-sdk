// @vitest-environment node
/**
 * A whole read of a host-store collection copies each row once: the store's
 * whole read already answers rows copied for that caller alone, so the data
 * service only drops their storage metadata. Kept reads (`wholeReadReuseMs`)
 * and stores that hand out their own rows are still copied per caller.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
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
afterEach(async () => { await Promise.all(closers.splice(0).map((close) => close())); vi.restoreAllMocks(); });

function open(create, extra = {}) {
  let store;
  if (create) {
    const database = create();
    closers.push(() => database.close());
    const port = createHostStorePort({ database, backend: database.kind === 'sqlite' ? 'electron_sqlite' : 'indexeddb' });
    const options = { identity: identity(), storeName: 'shifts', policy: 'cache', schemaVersion: 1, cacheFingerprint: 'fp',
      limits: { maxRows: 1000, maxAgeMs: 30 * 86400000, maxBytes: null } };
    store = createDataStore({ name: 'shifts', backend: transactionalBackend(port, options) });
  } else store = createDataStore({ name: 'shifts', backend: createMemoryStoreBackend() });
  const data = createDataService({ resolve: (name) => (name === 'shifts' ? { store, decl: { keyPath: 'id' } } : null), ...extra });
  closers.push(() => data.dispose());
  return { data, store };
}

const ROWS = Array.from({ length: 60 }, (_, at) => ({ id: String(100 + at), user_id: String(at % 7), notes: { text: `n${at}` } }));
// JSON.parse calls made by one read (each row copy is one or more).
async function parsesDuring(read) {
  const parse = vi.spyOn(JSON, 'parse');
  const before = parse.mock.calls.length;
  const rows = await read();
  const count = parse.mock.calls.length - before;
  parse.mockRestore();
  return { rows, count };
}

describe.each(DATABASES)('a whole read of a host-store collection (%s)', (_name, create) => {
  it('copies each row once and still gives each caller its own rows', async () => {
    const { data, store } = open(create);
    await data.ingest('shifts', ROWS);
    await data.read('shifts');
    // What the store's own whole read costs: it reads and copies each row.
    const { count: storeCount } = await parsesDuring(() => store.getAll());
    const { rows, count } = await parsesDuring(() => data.read('shifts'));
    expect(rows).toHaveLength(ROWS.length);
    expect(Object.keys(rows[0]).filter((field) => field.startsWith('_'))).toEqual([]);
    expect(rows[0]).toEqual(ROWS[0]);
    // The service adds no copy of its own to the store's read.
    expect(count).toBeLessThan(storeCount + ROWS.length / 2);
    rows[0].notes.text = 'mutated';
    rows[1].user_id = 'mutated';
    const again = await data.read('shifts');
    expect(again[0].notes.text).toBe('n0');
    expect(again[1].user_id).toBe('1');
    expect(again[0]).not.toBe(rows[0]);
  });

  it('keeps storage metadata and aged rows for raw and metadata reads', async () => {
    const { data } = open(create);
    await data.ingest('shifts', ROWS);
    const raw = await data.read('shifts', null, { raw: true });
    expect(raw).toHaveLength(ROWS.length);
    expect(Object.keys(raw[0]).some((field) => field.startsWith('_'))).toBe(true);
    const withMeta = await data.read('shifts', null, { storageMetadata: true });
    expect(Object.keys(withMeta[0]).some((field) => field.startsWith('_'))).toBe(true);
    withMeta[0].notes.text = 'mutated';
    expect((await data.read('shifts', null, { storageMetadata: true }))[0].notes.text).toBe('n0');
  });
});

describe('whole reads still copied per caller', () => {
  it('when the store hands out its own rows (memory store)', async () => {
    const { data } = open(null);
    await data.ingest('shifts', ROWS);
    const rows = await data.read('shifts');
    rows[0].notes.text = 'mutated';
    expect((await data.read('shifts'))[0].notes.text).toBe('n0');
  });

  it('when a kept read answers several callers', async () => {
    const [, create] = DATABASES[0];
    const feed = { subscribe() { return () => {}; } };
    const owner = JSON.stringify(['https://api.example.test', '31', 'Team', '44', null]);
    const { data } = open(create, { feed, changeOwner: owner, wholeReadReuseMs: 15000, now: () => 1000 });
    await data.ingest('shifts', ROWS);
    const first = await data.read('shifts');
    first[0].notes.text = 'mutated';
    const second = await data.read('shifts');
    expect(second[0].notes.text).toBe('n0');
    expect(second[0]).not.toBe(first[0]);
  });
});
