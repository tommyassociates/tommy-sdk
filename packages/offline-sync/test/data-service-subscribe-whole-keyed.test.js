// @vitest-environment node
/**
 * A subscription to a whole collection re-reads only the keys a change names:
 * an updated row is replaced in place, a removed row leaves, and a new row is
 * placed by key when the store reads in key order (the host stores). Changes
 * that arrive while a read runs are read together after it, and every value
 * delivered equals what a fresh whole read answers.
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
const settle = () => new Promise((resolve) => { setTimeout(resolve, 20); });
const clean = (rows) => rows.map((row) => Object.fromEntries(Object.entries(row).filter(([field]) => !field.startsWith('_'))));

function counted(store) {
  const counts = { getAll: 0, get: 0 };
  const getAll = store.getAll.bind(store);
  const get = store.get.bind(store);
  store.getAll = (...args) => { counts.getAll += 1; return getAll(...args); };
  store.get = (...args) => { counts.get += 1; return get(...args); };
  return { counts, whole: () => getAll().then(clean) };
}

describe.each([...DATABASES, ['memory', null]])('a whole-collection subscription (%s)', (name, create) => {
  it('re-reads only the keys a change names and delivers what a whole read answers', async () => {
    const { data, store } = open(create);
    await data.ingest('shifts', ROWS);
    const { counts, whole } = counted(store);
    const seen = [];
    const off = data.subscribe('shifts', (rows) => seen.push(rows));
    await settle();
    expect(counts.getAll).toBe(1);
    await data.writer('shifts').put({ id: '102', user_id: 'changed' });
    await settle();
    expect(seen.at(-1)).toEqual(await whole());
    await data.writer('shifts').delete('100');
    await settle();
    expect(seen.at(-1)).toEqual(await whole());
    expect(counts.getAll).toBe(1);
    await data.writer('shifts').put({ id: '1015', user_id: 'new' });
    await settle();
    expect(seen.at(-1)).toEqual(await whole());
    // A host store reads in key order, so the new row is placed by key; the
    // memory store reads in insertion order and reads the collection again.
    expect(counts.getAll).toBe(name === 'memory' ? 2 : 1);
    expect(counts.get).toBeGreaterThanOrEqual(3);
    off();
  });

  it('keeps its order when the caller sorts the array it was given', async () => {
    const { data, store } = open(create);
    await data.ingest('shifts', ROWS);
    const { whole } = counted(store);
    const seen = [];
    const off = data.subscribe('shifts', (rows) => { rows.sort((a, b) => (a.id < b.id ? 1 : -1)); seen.push(rows); });
    await settle();
    await data.writer('shifts').put({ id: '101', user_id: 'changed' });
    await settle();
    const expected = (await whole()).sort((a, b) => (a.id < b.id ? 1 : -1));
    expect(seen.at(-1)).toEqual(expected);
    off();
  });

  it('does not deliver a value a change made during its read already supersedes', async () => {
    const { data, store } = open(create);
    await data.ingest('shifts', ROWS);
    const seen = [];
    const off = data.subscribe('shifts', (rows) => seen.push(rows.map((row) => row.user_id)));
    await settle();
    const get = store.get.bind(store);
    let release;
    const held = new Promise((resolve) => { release = resolve; });
    store.get = async (key) => { if (String(key) === '101') await held; return get(key); };
    await data.writer('shifts').put({ id: '101', user_id: 'first' });
    await settle();
    await data.writer('shifts').put({ id: '103', user_id: 'second' });
    release();
    await settle();
    expect(seen).toEqual([['0', '1', '2', '3', '4'], ['0', 'first', '2', 'second', '4']]);
    off();
  });

  it('delivers nothing when a named row did not change', async () => {
    const { data, store, emit } = open(create);
    await data.ingest('shifts', ROWS);
    counted(store);
    const seen = [];
    const off = data.subscribe('shifts', (rows) => seen.push(rows));
    await settle();
    emit({ type: 'commit', label: 'shifts', keys: ['101', '999'] });
    await settle();
    expect(seen).toHaveLength(1);
    off();
  });

  it('reads changes that arrive during a read together after it', async () => {
    const { data, store, emit } = open(create);
    await data.ingest('shifts', ROWS);
    const { counts } = counted(store);
    const off = data.subscribe('shifts', () => {});
    for (let at = 0; at < 10; at += 1) emit({ type: 'commit', label: 'shifts' });
    await settle();
    expect(counts.getAll).toBe(2);
    off();
  });

  it('reads by key the named changes that arrive during its first read', async () => {
    const { data, store } = open(create);
    await data.ingest('shifts', ROWS);
    const { counts, whole } = counted(store);
    const getAll = store.getAll;
    let release;
    const held = new Promise((resolve) => { release = resolve; });
    store.getAll = async (...args) => { const rows = await getAll(...args); await held; return rows; };
    const seen = [];
    const off = data.subscribe('shifts', (rows) => seen.push(rows));
    await settle();
    await data.writer('shifts').put({ id: '102', user_id: 'during' });
    await data.writer('shifts').delete('104');
    release();
    await settle();
    expect(counts.getAll).toBe(1);
    expect(seen.at(-1)).toEqual(await whole());
    expect(seen.at(-1).find((row) => row.id === '102').user_id).toBe('during');
    off();
  });

  it('reads the collection whole when more keys changed than it re-reads one at a time', async () => {
    const { data, store, emit } = open(create);
    await data.ingest('shifts', ROWS);
    const { counts } = counted(store);
    const off = data.subscribe('shifts', () => {});
    await settle();
    emit({ type: 'commit', label: 'shifts', keys: Array.from({ length: 501 }, (_, at) => String(1000 + at)) });
    await settle();
    expect(counts.getAll).toBe(2);
    expect(counts.get).toBe(0);
    off();
  });

  it('reports a failed read once and reads again on the next change', async () => {
    const { data, store, emit } = open(create);
    await data.ingest('shifts', ROWS);
    const getAll = store.getAll.bind(store);
    let fail = true;
    let reads = 0;
    store.getAll = (...args) => { reads += 1; return fail ? Promise.reject(new Error('busy')) : getAll(...args); };
    const errors = [];
    const seen = [];
    const off = data.subscribe('shifts', (rows) => seen.push(rows), { onError: (error) => errors.push(error.message) });
    await settle();
    expect(errors).toEqual(['busy']);
    expect(reads).toBe(1);
    fail = false;
    emit({ type: 'commit', label: 'shifts', keys: ['101'] });
    await settle();
    expect(reads).toBe(2);
    expect(seen.at(-1)).toHaveLength(ROWS.length);
    off();
  });

  it('delivers nothing after it is stopped mid-read', async () => {
    const { data, store } = open(create);
    await data.ingest('shifts', ROWS);
    const seen = [];
    const off = data.subscribe('shifts', (rows) => seen.push(rows));
    off();
    await data.writer('shifts').put({ id: '102', user_id: 'changed' });
    await settle();
    expect(seen).toHaveLength(0);
    expect(store).toBeTruthy();
  });
});
