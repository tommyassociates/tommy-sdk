// @vitest-environment node
/* eslint no-underscore-dangle: "off" */
/** Conditional canonical replacements on memory and both transactional engines. */
import { afterEach, describe, expect, it, vi } from 'vitest';
// Node ESM requires the file extensions on the package's relative modules.
// eslint-disable-next-line import/extensions
import { createDataService, createDataStore, createMemoryStoreBackend, createDataManager } from '../src/index.js';
// eslint-disable-next-line import/extensions
import { createHostStorePort } from '../src/host-store/index.js';
// eslint-disable-next-line import/extensions
import { DATABASES, identity } from './helpers/host-databases.js';

/** A host-store-backed collection the way the app opens one. */
function transactionalBackend(port, opened, options) {
  let handle;
  const ready = () => { handle ||= port.open(options); return handle; };
  // A writer's read (`aged`) includes rows past the age limit, as the app's backend asks.
  const read = async ({ aged = false, ...input }) => {
    const h = await ready();
    const result = await port.read({ handle: h.handle, expectedEpoch: h.epoch, ...input, ...(aged ? { includeAged: true } : {}) });
    if (result.ok === false) throw Object.assign(new Error(result.reason), { name: 'StorageReadError', reason: result.reason });
    return result;
  };
  return {
    transactional: true,
    policy: options.policy,
    limits: options.limits,
    snapshot: (keys, { aged = false } = {}) => read({ keys, aged }),
    page: ({ afterKey = null, limit = 100, aged = false } = {}) => read({ afterKey, limit, aged }),
    async get(key, { aged = false } = {}) { return (await read({ keys: [String(key)], aged })).rows[0]?.value; },
    async getAll({ aged = false } = {}) {
      const rows = []; let afterKey = null;
      do {
        // Each page follows the previous page's cursor.
        // eslint-disable-next-line no-await-in-loop
        const page = await read({ afterKey, limit: 100, aged });
        rows.push(...page.rows.map((row) => row.value));
        afterKey = page.nextKey;
      } while (afterKey !== null);
      return rows;
    },
    async query({ aged = false, ...input }) {
      const h = await ready();
      const result = await port.query({ handle: h.handle, expectedEpoch: h.epoch, ...input, ...(aged ? { includeAged: true } : {}) });
      if (result.ok === false) throw Object.assign(new Error(result.reason), { name: 'StorageReadError', reason: result.reason });
      return result;
    },
    async commit(snapshot, changes, extra) {
      const h = await ready();
      return port.commit({ handle: h.handle, expectedEpoch: snapshot.epoch, expectedStoreRevision: snapshot.storeRevision, changes, ...(extra || {}) });
    },
    async close() { /* the fixture owns the port and database */ },
    async retire() { return port.retire({ handle: (await ready()).handle, mode: 'purge_owner' }); },
    opened,
  };
}

const closes = [];
afterEach(async () => {
  await closes.splice(0).reverse().reduce((work, close) => work.then(close), Promise.resolve());
});
const NAME = 'person.settings';
const KEY = 'theme';
const row = (data) => ({ id: KEY, data });
const schema = { type: 'object', required: ['id', 'data'], properties: { id: { type: 'string' }, data: { type: 'string' } }, additionalProperties: false };
const ENGINES = [['memory', null], ...DATABASES];
async function setup(create) {
  let backend;
  let openAnother;
  if (!create) {
    backend = createMemoryStoreBackend();
    openAnother = () => backend;
  } else {
    const database = create();
    closes.push(() => database.close());
    const port = createHostStorePort({ database, backend: database.kind === 'sqlite' ? 'electron_sqlite' : 'indexeddb' });
    const options = {
      identity: identity(),
      storeName: NAME,
      policy: 'authored',
      schemaVersion: 1,
      cacheFingerprint: null,
      limits: { maxRows: 1000, maxAgeMs: null, maxBytes: null },
    };
    openAnother = () => transactionalBackend(port, null, options);
    backend = openAnother();
  }
  function service(storage) {
    const store = createDataStore({ name: NAME, backend: storage, recordSchema: schema });
    const data = createDataService({ resolve: (name) => (name === NAME ? { store, decl: { keyPath: 'id' } } : null) });
    closes.push(() => data.dispose());
    return { data, store };
  }
  return { ...service(backend), backend, another: () => service(openAnother()) };
}

const owned = (raw) => raw?._writeReceipt === 'receipt-a';
describe.each(ENGINES)('conditional canonical rows on %s', (_name, create) => {
  it('restores and removes its own clean receipt, without an outbox or a source stamp', async () => {
    const { data, store } = await setup(create);
    await data.replaceSyncedRow(NAME, KEY, row('optimistic'), { when: () => true, receipt: 'receipt-a' });
    expect(await store.getRaw(KEY)).toMatchObject({ data: 'optimistic', _writeReceipt: 'receipt-a', _dirty: false });
    expect(await data.read(NAME, KEY)).toEqual(row('optimistic'));
    expect(data.pending()).toEqual([]);
    expect(data.status(NAME).syncedAt).toBeNull();
    await expect(data.replaceSyncedRow(NAME, KEY, row('before'), { when: owned })).resolves.toEqual({ replaced: true });
    expect(await store.getRaw(KEY)).not.toHaveProperty('_writeReceipt');
    await data.replaceSyncedRow(NAME, KEY, row('optimistic'), { when: () => true, receipt: 'receipt-a' });
    await expect(data.replaceSyncedRow(NAME, KEY, null, { when: owned })).resolves.toEqual({ replaced: true });
    expect(await data.read(NAME, KEY)).toBeNull();
    await store.put(row('ordinary'));
    await expect(store.delete(KEY)).resolves.toBeUndefined();
    await expect(store.delete(KEY)).resolves.toBeUndefined();
  });

  it.each(['different', 'identical', 'removed'])('retains a newer canonical %s receipt', async (kind) => {
    const { data, store } = await setup(create);
    await data.replaceSyncedRow(NAME, KEY, row('optimistic'), { when: () => true, receipt: 'receipt-a' });
    const latest = kind === 'removed' ? [] : [row(kind === 'identical' ? 'optimistic' : 'server')];
    await data.ingest(NAME, latest, { replace: true });
    const current = await store.getRaw(KEY);
    expect(current?._writeReceipt).toBeUndefined();
    await expect(data.replaceSyncedRow(NAME, KEY, row('before'), { when: owned })).resolves.toEqual({ replaced: false });
    expect(await data.read(NAME)).toEqual(latest);
  });

  it('does not restore over dirty authored changes, and validates only domain rows', async () => {
    const { data, store } = await setup(create);
    await store.put(row('unsent'));
    await expect(data.replaceSyncedRow(NAME, KEY, row('before'), { when: () => true })).resolves.toEqual({ replaced: false });
    expect(await store.getRaw(KEY)).toMatchObject({ data: 'unsent', _dirty: true });
    await expect(data.replaceSyncedRow(NAME, KEY, { id: KEY, data: 1 }, { when: () => true })).rejects.toThrow(/recordSchema/);
    await expect(data.replaceSyncedRow(NAME, KEY, { ...row('bad'), _writeReceipt: 'forged' }, { when: () => true })).rejects.toMatchObject({ code: 'DATA_INVALID' });
    await expect(data.replaceSyncedRow(NAME, 'another-key', row('bad'), { when: () => true })).rejects.toMatchObject({ code: 'DATA_INVALID' });
    await expect(data.replaceSyncedRow(NAME, KEY, row('bad'), { when: () => true, receipt: 'x'.repeat(129) })).rejects.toMatchObject({ code: 'DATA_INVALID' });
  });

  it('clears carried local receipts during every canonical ingest', async () => {
    const { data, store } = await setup(create);
    await data.replaceSyncedRow(NAME, KEY, row('optimistic'), { when: () => true, receipt: 'receipt-a' });
    await data.ingest(NAME, [{ ...row('optimistic'), _writeReceipt: 'receipt-a' }], { replace: true });
    expect(await store.getRaw(KEY)).not.toHaveProperty('_writeReceipt');
    await expect(data.replaceSyncedRow(NAME, KEY, row('before'), { when: owned })).resolves.toEqual({ replaced: false });
  });

  it('keeps host metadata detached and emits an identical domain rereceipt', async () => {
    const { data, store } = await setup(create);
    const received = [];
    const off = data.subscribe(NAME, (rows) => received.push(rows), { storageMetadata: true });
    await vi.waitFor(() => expect(received).toEqual([[]]));
    await data.replaceSyncedRow(NAME, KEY, row('optimistic'), { when: () => true, receipt: 'receipt-a' });
    await vi.waitFor(() => expect(received.at(-1)[0]).toHaveProperty('_writeReceipt', 'receipt-a'));
    received.at(-1)[0]._writeReceipt = 'subscriber-mutation';
    expect(await store.getRaw(KEY)).toHaveProperty('_writeReceipt', 'receipt-a');
    await data.ingest(NAME, [row('optimistic')]);
    await vi.waitFor(() => expect(received).toHaveLength(3));
    expect(received.at(-1)[0]).not.toHaveProperty('_writeReceipt');
    off();
    await data.ingest(NAME, [row('after-off')]);
    expect(received).toHaveLength(3);
  });

  it('snapshots nested submitted data before a held collection turn', async () => {
    const { data, backend } = await setup(create);
    const method = create ? 'snapshot' : 'get';
    const original = backend[method].bind(backend);
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const held = vi.spyOn(backend, method).mockImplementationOnce(async (...args) => { await gate; return original(...args); });
    const first = data.replaceSyncedRow(NAME, KEY, row('first'), { when: () => true });
    await vi.waitFor(() => expect(held).toHaveBeenCalled());
    // This deliberately invalid nested body is refused after the queued turn;
    // mutating it to a valid body cannot change what the ask submitted.
    const submitted = { id: KEY, data: { nested: 'original' } };
    const pending = data.replaceSyncedRow(NAME, KEY, submitted, { when: () => true });
    pending.catch(() => {});
    submitted.data.nested = 'changed';
    submitted.data = 'valid-later';
    release();
    await first;
    await expect(pending).rejects.toThrow(/recordSchema/);
    expect(await data.read(NAME, KEY)).toEqual(row('first'));
    // The low-level memory hook also snapshots rather than sharing nested data.
    const nestedBackend = createMemoryStoreBackend();
    const nested = createDataStore({ name: NAME, backend: nestedBackend });
    const body = { id: KEY, data: { nested: 'original' } };
    await nested.replaceSynced(KEY, body, { when: () => true });
    body.data.nested = 'after-success';
    expect((await nested.getRaw(KEY)).data).toEqual({ nested: 'original' });
  });

  it('checks changed ownership inside a held device turn and after a service fence', async () => {
    const { data, backend } = await setup(create);
    const method = create ? 'snapshot' : 'get';
    const original = backend[method].bind(backend);
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const held = vi.spyOn(backend, method).mockImplementationOnce(async (...args) => { await gate; return original(...args); });
    let active = true;
    const pending = data.replaceSyncedRow(NAME, KEY, row('late'), { when: () => active, receipt: 'receipt-a' });
    await vi.waitFor(() => expect(held).toHaveBeenCalled());
    active = false;
    release();
    await expect(pending).resolves.toEqual({ replaced: false });
    expect(await data.read(NAME)).toEqual([]);
    let releaseAgain;
    const gateAgain = new Promise((resolve) => { releaseAgain = resolve; });
    held.mockImplementationOnce(async (...args) => { await gateAgain; return original(...args); });
    const retired = data.replaceSyncedRow(NAME, KEY, row('retired'), { when: () => true });
    await vi.waitFor(() => expect(held).toHaveBeenCalledTimes(2));
    data.fence();
    releaseAgain();
    await expect(retired).resolves.toEqual({ replaced: false });
  });
});

describe.each(DATABASES)('canonical CAS ownership on %s', (_name, create) => {
  it.each(['identical', 'removed'])('rechecks the receipt after another tab commits %s during rollback', async (kind) => {
    const { data, backend, another } = await setup(create);
    await data.replaceSyncedRow(NAME, KEY, row('optimistic'), { when: () => true, receipt: 'receipt-a' });
    const other = another();
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const original = backend.commit.bind(backend);
    const commits = vi.spyOn(backend, 'commit').mockImplementationOnce(async (...args) => { await gate; return original(...args); });
    const undo = data.replaceSyncedRow(NAME, KEY, row('before'), { when: owned });
    await vi.waitFor(() => expect(commits).toHaveBeenCalledTimes(1));
    const latest = kind === 'removed' ? [] : [row('optimistic')];
    await other.data.ingest(NAME, latest, { replace: true });
    release();
    await expect(undo).resolves.toEqual({ replaced: false });
    expect(commits).toHaveBeenCalledTimes(1);
    expect(await data.read(NAME)).toEqual(latest);
  });
});

describe.each(DATABASES)('pinned canonical beforeimages on %s', (_name, create) => {
  it('retires the original device epoch across a clear and reopen', async () => {
    const { data, store, backend, another } = await setup(create);
    await data.ingest(NAME, [row('before'), { id: '~read', data: 'read-a' }], { replace: true });
    const revision = (await store.getRaw(KEY))._rev;
    const original = backend.commit.bind(backend);
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const commits = vi.spyOn(backend, 'commit').mockImplementationOnce(async (...args) => { await gate; return original(...args); });
    const pending = data.replaceSyncedRow(NAME, KEY, row('retired'), {
      guardKey: '~read', when: (previous, guard) => previous?._rev === revision && guard?.data === 'read-a',
    });
    pending.catch(() => {});
    await vi.waitFor(() => expect(commits).toHaveBeenCalledTimes(1));
    await backend.retire();
    const fresh = another();
    await fresh.data.ingest(NAME, [row('fresh'), { id: '~read', data: 'read-b' }], { replace: true });
    expect((await fresh.store.getRaw(KEY))._rev).toBe(revision);
    release();
    await expect(pending).rejects.toMatchObject({ reason: 'retired' });
    expect(await fresh.data.read(NAME, KEY)).toEqual(row('fresh'));
  });

  it.each(['different', 'identical', 'removed', 'absent-reread', 'absent-created'])('rejects a held initial command after a canonical %s receipt', async (kind) => {
    const { data, store, backend, another } = await setup(create);
    const absent = kind.startsWith('absent-');
    const read = (value) => ({ id: '~read', data: value });
    await data.ingest(NAME, [...(absent ? [] : [row('before')]), read('read-a')], { replace: true });
    const before = await store.getRaw(KEY);
    const pinnedRevision = before?._rev;
    const original = backend.commit.bind(backend);
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const commits = vi.spyOn(backend, 'commit').mockImplementationOnce(async (...args) => { await gate; return original(...args); });
    const pending = data.replaceSyncedRow(NAME, KEY, row('optimistic'), {
      receipt: 'receipt-a',
      guardKey: '~read',
      when: (previous, guard) => guard?.data === 'read-a'
        && (absent ? previous === undefined : previous?._rev === pinnedRevision),
    });
    await vi.waitFor(() => expect(commits).toHaveBeenCalledTimes(1));
    const latest = kind === 'removed' || kind === 'absent-reread' ? [] : [row(kind === 'identical' ? 'before' : 'server')];
    const other = another();
    await other.data.ingest(NAME, [...latest, read('read-b')], { replace: true });
    release();
    await expect(pending).resolves.toEqual({ replaced: false });
    expect(await data.read(NAME, KEY)).toEqual(latest[0] || null);
    // A new command created after this canonical receipt remains legitimate.
    const fresh = await store.getRaw(KEY);
    await expect(data.replaceSyncedRow(NAME, KEY, row('fresh'), {
      guardKey: '~read',
      when: (previous, guard) => guard?.data === 'read-b'
        && (fresh ? previous?._rev === fresh._rev : previous === undefined),
    })).resolves.toEqual({ replaced: true });
    expect(await data.read(NAME, KEY)).toEqual(row('fresh'));
  });
});

describe('memory related-row ownership', () => {
  it('holds a shared exclusion for the target and read witness across handles', async () => {
    const { data, backend, another } = await setup(null);
    await data.ingest(NAME, [row('before'), { id: '~read', data: 'read-a' }], { replace: true });
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const original = backend.get.bind(backend);
    const read = vi.spyOn(backend, 'get').mockImplementationOnce(async (...args) => {
      const previous = original(...args);
      await gate;
      return previous;
    });
    const pending = data.replaceSyncedRow(NAME, KEY, row('optimistic'), {
      guardKey: '~read', when: (_previous, guard) => guard?.data === 'read-a',
    });
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    const other = another();
    let witnessCommitted = false;
    const witness = other.store.put({ id: '~read', data: 'read-b' }, { server: true }).then(() => { witnessCommitted = true; return true; });
    await Promise.resolve();
    expect(witnessCommitted).toBe(false);
    release();
    await expect(pending).resolves.toEqual({ replaced: true });
    await witness;
    expect(await data.read(NAME, '~read')).toEqual({ id: '~read', data: 'read-b' });
  });

  it('rechecks lifetime after an asynchronous custom capacity count', async () => {
    const backing = createMemoryStoreBackend();
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const backend = { ...backing, keys: undefined, async getAll() { await gate; return backing.getAll(); } };
    const store = createDataStore({ name: NAME, backend });
    const data = createDataService({ resolve: () => ({ store, decl: { keyPath: 'id' } }) });
    closes.push(() => data.dispose());
    let active = true;
    const asked = vi.fn(() => active);
    const pending = data.replaceSyncedRow(NAME, KEY, row('retired'), { when: asked });
    await vi.waitFor(() => expect(asked).toHaveBeenCalledTimes(1));
    active = false;
    release();
    await expect(pending).resolves.toEqual({ replaced: false });
    expect(await store.getRaw(KEY)).toBeUndefined();
  });
});

describe.each(ENGINES)('projected MP handles on %s', (_name, create) => {
  it('preserves void deletion, private boundaries and mutable final-read instrumentation on every public path', async () => {
    let backendFactory = () => createMemoryStoreBackend();
    if (create) {
      const database = create();
      closes.push(() => database.close());
      const port = createHostStorePort({ database, backend: database.kind === 'sqlite' ? 'electron_sqlite' : 'indexeddb' });
      backendFactory = (_database, storeName) => transactionalBackend(port, null, {
        identity: identity(),
        storeName,
        policy: 'authored',
        schemaVersion: 1,
        cacheFingerprint: null,
        limits: { maxRows: 1000, maxAgeMs: null, maxBytes: null },
      });
    }
    const data = createDataManager({
      capabilityToken: { tenantId: 'team-44', mpId: 'scheduling' },
      mpId: 'scheduling',
      backendFactory,
      localData: { items: { keyPath: 'id', syncStrategy: 'server_authoritative' } },
    });
    closes.push(() => data.dispose());
    const store = data.store('items');
    const query = data.liveQuery('items', { fetch: () => [] });
    expect(query.store).toBe(store);
    await [store, query.store].reduce(async (previous, handle) => {
      await previous;
      expect(handle.replaceSynced).toBeUndefined();
      expect('replaceSynced' in handle).toBe(false);
      expect(Reflect.ownKeys(handle)).not.toContain('replaceSynced');
      expect(Object.getOwnPropertyDescriptor(handle, 'replaceSynced')).toBeUndefined();
      expect(handle.valueOf()).toBe(handle);
      await Object.getOwnPropertyDescriptor(handle, 'put').value(row('own'), {
        when: () => false, receipt: 'public-attempt', guardKey: '~read',
      });
      expect(await handle.getRaw(KEY)).not.toHaveProperty('_writeReceipt');
      // Neither the new options nor the internal deletion flag enter the MP contract.
      await expect(handle.delete(KEY, { when: () => false, guardKey: '~read' })).resolves.toBeUndefined();
      expect(await handle.getRaw(KEY)).toBeUndefined();
      await expect(handle.delete(KEY)).resolves.toBeUndefined();
    }, Promise.resolve());
    const writes = vi.spyOn(store, 'put');
    await store.put(row('spy'));
    expect(writes).toHaveBeenCalledTimes(1);
    expect(await store.getRaw(KEY)).toMatchObject({ data: 'spy' });
    writes.mockRestore();
    const removals = vi.spyOn(store, 'delete');
    await expect(store.delete(KEY)).resolves.toBeUndefined();
    expect(removals).toHaveBeenCalledTimes(1);
    removals.mockRestore();
    const returned = vi.spyOn(store, 'readWhere');
    await data.windowCache('items', { fetch: () => [] }).sync({});
    expect(returned).toHaveBeenCalledTimes(1);
    returned.mockRestore();
    const queryReads = vi.spyOn(query.store, 'readWhere');
    await query.revalidate({});
    expect(queryReads).toHaveBeenCalledTimes(1);
    queryReads.mockRestore();
    const original = store.readWhere;
    let receiver;
    store.readWhere = function substitutedRead(...args) {
      receiver = this;
      return original(...args);
    };
    await query.read();
    expect(receiver).toBe(store);
    expect(receiver.replaceSynced).toBeUndefined();
  });
});

describe('private canonical metadata boundaries', () => {
  it('keeps the MP data API unchanged, including reflective store access', async () => {
    const data = createDataManager({
      capabilityToken: { tenantId: 'team-44', mpId: 'scheduling' },
      mpId: 'scheduling',
      localData: { items: { keyPath: 'id', syncStrategy: 'server_authoritative' } },
    });
    closes.push(() => data.dispose());
    const store = data.store('items');
    expect(data.replaceSyncedRow).toBeUndefined();
    expect(store.replaceSynced).toBeUndefined();
    expect('replaceSynced' in store).toBe(false);
    expect(Reflect.ownKeys(store)).not.toContain('replaceSynced');
    expect(Object.getOwnPropertyDescriptor(store, 'replaceSynced')).toBeUndefined();
    expect(store.valueOf()).toBe(store);
    expect(store.valueOf().replaceSynced).toBeUndefined();
    await store.put(row('own'), { when: () => false, receipt: 'public-attempt', guardKey: '~read' });
    expect(await store.getRaw(KEY)).not.toHaveProperty('_writeReceipt');
    await Object.getOwnPropertyDescriptor(store, 'put').value(row('own'), { receipt: 'descriptor-attempt', when: () => false });
    expect(await store.getRaw(KEY)).not.toHaveProperty('_writeReceipt');
    expect(await data.read('items', KEY, { storageMetadata: true })).toEqual(row('own'));
    const received = [];
    const off = data.subscribe('items', (rows) => received.push(rows), { storageMetadata: true });
    await vi.waitFor(() => expect(received).toEqual([[row('own')]]));
    off();
  });

  it('preserves the paint ceiling and tombstone hiding for host metadata subscriptions', async () => {
    let clock = 1000;
    const store = createDataStore({ name: NAME, now: () => clock });
    const data = createDataService({ resolve: (name) => (name === NAME ? { store, decl: { keyPath: 'id' } } : null) });
    closes.push(() => data.dispose());
    await data.replaceSyncedRow(NAME, KEY, row('aged'), { when: () => true, receipt: 'receipt-a' });
    clock += 8 * 24 * 60 * 60 * 1000;
    const received = [];
    const off = data.subscribe(NAME, (rows) => received.push(rows), { storageMetadata: true });
    await vi.waitFor(() => expect(received).toEqual([[]]));
    expect(await data.read(NAME, undefined, { storageMetadata: true })).toEqual([]);
    off();
  });
});
