// @vitest-environment node
/**
 * The data service surface over the DataStore layer, on memory and on the
 * host store (both engines): read/query/subscribe/refresh/mutate/purge/status,
 * cross-tab change notification, MP namespace confinement.
 */
import { describe, it, expect, vi } from 'vitest';
import { createDataService, createDataStore, createMemoryStoreBackend, createDataManager } from '../src/index.js';
import { PREFS_DECL } from '../src/manager.js';
import { createHostStorePort, createHostStoreChangeFeed, observeHostStorePort } from '../src/host-store/index.js';
import { COMPLETE_ROWS } from '../src/host-store/protocol.js';
import { DATABASES, identity, createChannelBus } from './helpers/host-databases.js';

const settle = () => new Promise((resolve) => { setTimeout(resolve, 0); });
const INDEXES = { byChat: ['chat_id', 'seq'] };

function memoryService(options = {}) {
  const stores = new Map([['chats.messages', createDataStore({ name: 'chats.messages', backend: createMemoryStoreBackend(), indexes: INDEXES })]]);
  return createDataService({ resolve: (name) => (stores.has(name) ? { store: stores.get(name), decl: { keyPath: 'id' } } : null), ...options });
}

/** A host-store-backed collection the way the app opens one. */
function transactionalBackend(port, opened, options) {
  let handle;
  const ready = () => (handle ||= port.open(options));
  // A writer's read (`aged`) includes rows past the age limit, as the app's backend asks.
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
    async close() {},
    opened,
  };
}

describe('data service on memory stores', () => {
  it('reads, queries by index and subscribes with the current value first', async () => {
    const data = memoryService();
    await data.mutate('chats.messages', { op: 'put', record: { id: 'a', chat_id: 7, seq: 10 } });
    await data.mutate('chats.messages', { op: 'put', record: { id: 'b', chat_id: 7, seq: 2 } });
    await data.mutate('chats.messages', { op: 'put', record: { id: 'c', chat_id: 12, seq: 1 } });
    expect((await data.read('chats.messages', 'a')).seq).toBe(10);
    const page = await data.query('chats.messages', { index: 'byChat', prefix: [7] });
    expect(page.rows.map((row) => row.id)).toEqual(['b', 'a']);
    const seen = [];
    const off = data.subscribe({ collection: 'chats.messages', query: { index: 'byChat', prefix: [7] } }, (rows) => seen.push(rows.map((row) => row.id)));
    await settle();
    expect(seen).toEqual([['b', 'a']]);
    await data.mutate('chats.messages', { op: 'put', record: { id: 'd', chat_id: 7, seq: 5 } });
    await settle();
    expect(seen).toEqual([['b', 'a'], ['b', 'd', 'a']]);
    // A change that leaves the value the same does not fire again.
    await data.mutate('chats.messages', { op: 'put', record: { id: 'e', chat_id: 12, seq: 9 } });
    await settle();
    expect(seen).toHaveLength(2);
    off();
    await expect(data.read('contacts.people')).rejects.toMatchObject({ code: 'DATA_UNDECLARED' });
  });

  it('refreshes through the scheduler: coalesced, skipped while fresh, silent errors in status', async () => {
    const requests = [];
    const scheduler = { request: vi.fn((job) => { requests.push(job); return Promise.resolve().then(() => job.run(() => true)); }) };
    let clock = 0;
    const data = memoryService({ scheduler, now: () => clock });
    const fetch = vi.fn(async () => [{ id: 'a', chat_id: 7, seq: 1 }]);
    data.source('chats.messages', { fetch, scope: () => (row) => row.chat_id === 7 });
    expect(data.status('chats.messages').state).toBe('stale');
    const [first, second] = [data.refresh('chats.messages'), data.refresh('chats.messages')];
    await Promise.all([first, second]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(requests[0]).toMatchObject({ key: expect.stringContaining('chats.messages'), target: 'chats.messages', budgetKey: 'host', priority: 2, visible: false });
    expect(data.status('chats.messages')).toMatchObject({ state: 'fresh', syncedAt: 0 });
    await data.refresh('chats.messages', { maxAge: 60000 });
    expect(fetch).toHaveBeenCalledTimes(1);
    clock = 10 * 60000;
    expect(data.status('chats.messages').state).toBe('stale');
    fetch.mockRejectedValueOnce(Object.assign(new Error('Overloaded'), { status: 503 }));
    await expect(data.refresh('chats.messages')).resolves.toMatchObject({ state: 'error', error: { status: 503 } });
    fetch.mockRejectedValueOnce(Object.assign(new Error('Overloaded'), { status: 503 }));
    await expect(data.refresh('chats.messages', { mode: 'visible', priority: 'visible' })).rejects.toMatchObject({ status: 503 });
    expect(requests.at(-1)).toMatchObject({ visible: true, priority: 0 });
    // Rows already shown stay through failed refreshes.
    expect((await data.read('chats.messages')).map((row) => row.id)).toEqual(['a']);
  });

  it('keeps a push the server refused for access as access changed: unsent, listed, never sent again on its own', async () => {
    const data = memoryService();
    const push = vi.fn(async () => { throw Object.assign(new Error('Forbidden'), { status: 403 }); });
    data.source('chats.messages', { fetch: async () => [], push });
    await data.mutate('chats.messages', { op: 'put', record: { id: 'draft', chat_id: 7, seq: 2 } });
    await settle();
    expect(data.pending()).toEqual([expect.objectContaining({ key: 'draft', state: 'access_changed', attempts: 1 })]);
    expect((await data.read('chats.messages', 'draft'))._dirty).toBe(true);
    // A refusal by code reads the same.
    push.mockImplementationOnce(async () => { throw Object.assign(new Error('Denied'), { code: 'PermissionDenied' }); });
    await data.mutate('chats.messages', { op: 'put', record: { id: 'other', chat_id: 7, seq: 3 } });
    await settle();
    expect(data.pending().map((entry) => [entry.key, entry.state]).sort()).toEqual([['draft', 'access_changed'], ['other', 'access_changed']]);
    expect(push).toHaveBeenCalledTimes(2);
    await data.discard('chats.messages', 'draft');
    expect((await data.read('chats.messages')).map((row) => row.id)).toEqual(['other']);
  });

  it('keeps dirty rows through a refresh and a purge, and tracks pushes until confirmed', async () => {
    const data = memoryService();
    let fail = true;
    const push = vi.fn(async () => { if (fail) throw Object.assign(new Error('Offline'), { status: 0 }); });
    data.source('chats.messages', { fetch: async () => [{ id: 'server', chat_id: 7, seq: 1 }], push });
    await data.mutate('chats.messages', { op: 'put', record: { id: 'draft', chat_id: 7, seq: 2 } });
    await settle();
    expect(data.pending()).toEqual([expect.objectContaining({ key: 'draft', state: 'failed', attempts: 1, lastError: expect.objectContaining({ status: 0 }) })]);
    await data.refresh('chats.messages');
    expect((await data.read('chats.messages')).map((row) => row.id).sort()).toEqual(['draft', 'server']);
    expect(await data.purge('chats.messages')).toEqual({ removed: ['server'] });
    expect((await data.read('chats.messages')).map((row) => row.id)).toEqual(['draft']);
    fail = false;
    await data.retry('chats.messages', 'draft');
    expect(data.pending()).toEqual([]);
    expect((await data.read('chats.messages', 'draft'))._dirty).toBe(false);
    await data.discard('chats.messages', 'draft');
    expect(await data.read('chats.messages')).toEqual([]);
  });

  it('sends every change to a row in order and marks it synced only at its latest write', async () => {
    const data = memoryService();
    const sent = [];
    const releases = [];
    const push = vi.fn((command) => {
      sent.push(command.op === 'patch' ? command.patch.seq : command.record.seq);
      return new Promise((resolve) => { releases.push(resolve); });
    });
    data.source('chats.messages', { fetch: async () => [], push });
    await data.mutate('chats.messages', { op: 'put', record: { id: 'a', chat_id: 7, seq: 1 } });
    await settle();
    const second = data.mutate('chats.messages', { op: 'patch', key: 'a', patch: { seq: 2 } }, { wait: true });
    await settle();
    expect(push).toHaveBeenCalledTimes(1);
    expect(data.pending()).toEqual([expect.objectContaining({ key: 'a', changes: 2, state: 'sending', op: 'patch' })]);
    releases[0]();
    await vi.waitFor(() => expect(push).toHaveBeenCalledTimes(2));
    // The first push is confirmed, but the row has a later local write.
    expect((await data.read('chats.messages', 'a'))._dirty).toBe(true);
    releases[1]();
    await expect(second).resolves.toEqual({ key: 'a', pushed: true });
    expect(sent).toEqual([1, 2]);
    expect((await data.read('chats.messages', 'a'))._dirty).toBe(false);
    expect(data.pending()).toEqual([]);
  });

  it('sends a change left unsent by a disposed service', async () => {
    const store = createDataStore({ name: 'chats.messages', backend: createMemoryStoreBackend(), indexes: INDEXES });
    const make = (decl = { keyPath: 'id' }) => createDataService({ resolve: (name) => (name === 'chats.messages' ? { store, decl } : null) });
    const first = make();
    first.source('chats.messages', { fetch: async () => [], push: async () => { throw Object.assign(new Error('Offline'), { status: 0 }); } });
    await first.mutate('chats.messages', { op: 'put', record: { id: 'a', chat_id: 7, seq: 3 } });
    await settle();
    expect(first.pending()).toEqual([expect.objectContaining({ key: 'a', state: 'failed' })]);
    first.dispose();
    // A rebuilt service sends it when its push is registered.
    const push = vi.fn(async () => {});
    const second = make();
    second.source('chats.messages', { fetch: async () => [], push });
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith({ op: 'put', record: { id: 'a', chat_id: 7, seq: 3 } }, { id: 'a', chat_id: 7, seq: 3 }));
    await vi.waitFor(async () => expect((await store.getRaw('a'))._dirty).toBe(false));
    expect(second.pending()).toEqual([]);
    second.dispose();
    // A declared push with no registration is sent on retry.
    await store.put({ id: 'b', chat_id: 7, seq: 4 });
    const declared = vi.fn(async () => {});
    const third = make({ keyPath: 'id', push: declared });
    expect(third.pending()).toEqual([]);
    await expect(third.retry('chats.messages', 'b')).resolves.toEqual({ key: 'b', pushed: true });
    expect(declared).toHaveBeenCalledWith({ op: 'put', record: { id: 'b', chat_id: 7, seq: 4 } }, { id: 'b', chat_id: 7, seq: 4 });
    expect((await store.getRaw('b'))._dirty).toBe(false);
  });

  it('hands a keyed refresh the previous row without storage metadata', async () => {
    const store = createDataStore({ name: 'chats.messages', backend: createMemoryStoreBackend(), recordSchema: {
      type: 'object', additionalProperties: false, properties: { id: { type: 'string' }, chat_id: { type: 'number' }, seq: { type: 'number' } },
    } });
    const data = createDataService({ resolve: (name) => (name === 'chats.messages' ? { store, decl: { keyPath: 'id' } } : null) });
    const toRecord = vi.fn((dto, prev) => ({ ...prev, ...dto }));
    data.source('chats.messages', { fetch: async (target) => (target.key ? { id: 'a', seq: 2 } : [{ id: 'a', chat_id: 7, seq: 1 }]), toRecord });
    await data.refresh('chats.messages');
    await data.refresh({ collection: 'chats.messages', key: 'a' });
    expect(Object.keys(toRecord.mock.calls.at(-1)[1]).filter((field) => field.startsWith('_'))).toEqual([]);
    expect(await data.read('chats.messages', 'a')).toMatchObject({ chat_id: 7, seq: 2 });
  });

  it('reads a row by its key whether the key is given as a number or as text', async () => {
    const stores = new Map([['chats.rows', createDataStore({ name: 'chats.rows', backend: createMemoryStoreBackend() })]]);
    const data = createDataService({ resolve: (name) => (stores.has(name) ? { store: stores.get(name), decl: { keyPath: 'id' } } : null) });
    await data.ingest('chats.rows', [{ id: 101, title: 'Numeric id' }]);
    expect((await data.read('chats.rows', '101')).title).toBe('Numeric id');
    expect((await data.read('chats.rows', 101)).title).toBe('Numeric id');
    expect(await data.purge('chats.rows', { keys: [101] })).toEqual({ removed: ['101'] });
  });

  it('subscribes to a later page of an indexed query', async () => {
    const data = memoryService();
    for (const [id, seq] of [['a', 1], ['b', 2], ['c', 3]]) await data.mutate('chats.messages', { op: 'put', record: { id, chat_id: 7, seq } });
    const seen = [];
    data.subscribe({ collection: 'chats.messages', query: { index: 'byChat', prefix: [7], limit: 1, cursor: 'a' } }, (rows) => seen.push(rows.map((row) => row.id)));
    await vi.waitFor(() => expect(seen).toEqual([['b']]));
  });

  it('reports offline without fetching', async () => {
    const data = memoryService({ isOnline: () => false });
    const fetch = vi.fn();
    data.source('chats.messages', { fetch });
    await expect(data.refresh('chats.messages')).resolves.toMatchObject({ state: 'offline' });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('MP data API confinement', () => {
  const token = { tenantId: 'team-44', mpId: 'scheduling' };
  const localData = { shifts: { keyPath: 'id', syncStrategy: 'server_authoritative' } };

  it('offers the same surface over its own stores only', async () => {
    const data = createDataManager({ capabilityToken: token, mpId: 'scheduling', localData });
    await data.mutate('shifts', { op: 'put', record: { id: '1', at: 'mon' } });
    expect((await data.read('mp.scheduling.shifts', '1')).at).toBe('mon');
    await expect(data.read('mp.time-clock.shifts')).rejects.toMatchObject({ code: 'DATA_FORBIDDEN' });
    await expect(data.read('chats.messages')).rejects.toMatchObject({ code: 'DATA_FORBIDDEN' });
    await expect(data.read('undeclared')).rejects.toMatchObject({ code: 'DATA_UNDECLARED' });
    data.source('shifts', { fetch: async () => [{ id: '2', at: 'tue' }] });
    await data.refresh('shifts');
    expect((await data.read('shifts')).map((row) => row.id)).toEqual(['1', '2']);
    expect(data.status('shifts').state).toBe('fresh');
    await data.ingest('mp.scheduling.shifts', [{ id: '3', at: 'wed' }]);
    expect((await data.read('shifts', '3'))._dirty).toBe(false);
    await expect(data.ingest('chats.messages', [{ id: 'x' }])).rejects.toMatchObject({ code: 'DATA_FORBIDDEN' });
    await expect(data.trim('mp.time-clock.shifts', { index: 'by_day', keep: 1 })).rejects.toMatchObject({ code: 'DATA_FORBIDDEN' });
  });
  it('reads a whole collection raw, past the paint ceiling', async () => {
    let clock = Date.parse('2026-09-01T00:00:00Z');
    const store = createDataStore({ name: 'chats.messages', backend: createMemoryStoreBackend(), now: () => clock });
    const data = createDataService({ resolve: (name) => (name === 'chats.messages' ? { store, decl: { keyPath: 'id' } } : null), now: () => clock });
    await data.ingest('chats.messages', [{ id: 'old' }]);
    clock += 8 * 24 * 60 * 60 * 1000;
    await data.ingest('chats.messages', [{ id: 'new' }]);
    expect((await data.read('chats.messages')).map((row) => row.id)).toEqual(['new']);
    expect((await data.read('chats.messages', null, { raw: true })).map((row) => row.id).sort()).toEqual(['new', 'old']);
  });

  it('gives every MP its own prefs, read at once once loaded and kept as settled rows', async () => {
    const backends = new Map();
    const factory = (_db, store) => { if (!backends.has(store)) backends.set(store, createMemoryStoreBackend()); return backends.get(store); };
    const data = createDataManager({ capabilityToken: token, mpId: 'scheduling', localData: {}, backendFactory: factory });
    await data.prefs.ready();
    expect(data.prefs.get('layout', 'list')).toBe('list');
    await data.prefs.set('layout', 'board');
    await data.prefs.set('filters', { status: ['open'] });
    const value = data.prefs.get('filters');
    value.status.push('mutated');
    expect(data.prefs.get('filters')).toEqual({ status: ['open'] });
    // Stored per MP, not pending: a new manager over the same stores reads them back.
    expect(data.pending()).toEqual([]);
    const next = createDataManager({ capabilityToken: token, mpId: 'scheduling', localData: {}, backendFactory: factory });
    await next.prefs.ready();
    expect(next.prefs.get('layout')).toBe('board');
    await next.prefs.remove('layout');
    const third = createDataManager({ capabilityToken: token, mpId: 'scheduling', localData: {}, backendFactory: factory });
    await third.prefs.ready();
    expect(third.prefs.get('layout', 'list')).toBe('list');
    // Other MPs cannot reach them.
    await expect(next.read('mp.time-clock.prefs')).rejects.toMatchObject({ code: 'DATA_FORBIDDEN' });
  });

  it('opens an MP\'s prefs only when it reads one, and always with the host\'s declaration', async () => {
    const reads = [];
    const backends = new Map();
    const factory = (_db, store, _strategy, decl) => {
      if (!backends.has(store)) {
        const inner = createMemoryStoreBackend();
        backends.set(store, { ...inner, decl, async getAll() { reads.push(store); return inner.getAll(); } });
      }
      return backends.get(store);
    };
    const bogus = { keyPath: 'id', syncStrategy: 'server_authoritative', recordSchema: { type: 'object' } };
    const data = createDataManager({ capabilityToken: token, mpId: 'scheduling', localData: { prefs: bogus }, backendFactory: factory });
    expect(backends.get('prefs').decl).toEqual(PREFS_DECL);
    await new Promise((resolve) => { setTimeout(resolve, 5); });
    expect(reads).toEqual([]);
    // The first read starts the load and answers the fallback; ready() then has it.
    expect(data.prefs.get('layout', 'list')).toBe('list');
    await data.prefs.ready();
    expect(reads).toEqual(['prefs']);
  });

  it('queries the indexes its manifest declares', async () => {
    const data = createDataManager({ capabilityToken: token, mpId: 'scheduling', localData: {
      shifts: { keyPath: 'id', syncStrategy: 'server_authoritative', indexes: [{ name: 'by_day', keyPath: 'at' }] },
    } });
    await data.mutate('shifts', { op: 'put', record: { id: '1', at: 'tue' } });
    await data.mutate('shifts', { op: 'put', record: { id: '2', at: 'mon' } });
    expect((await data.query('shifts', { index: 'by_day' })).rows.map((row) => row.id)).toEqual(['2', '1']);
    expect((await data.query('mp.scheduling.shifts', { index: 'by_day', equals: ['tue'] })).rows.map((row) => row.id)).toEqual(['1']);
  });
});

describe.each(DATABASES)('data service on the host store (%s)', (_name, create) => {
  it('queries physical indexes and hears writes from another tab', async () => {
    const Channel = createChannelBus();
    const database = create();
    const port = createHostStorePort({ database, backend: database.kind === 'sqlite' ? 'electron_sqlite' : 'indexeddb' });
    const options = { identity: identity(), storeName: 'chats.messages', policy: 'cache', schemaVersion: 1, cacheFingerprint: 'fp',
      limits: { maxRows: 1000, maxAgeMs: 86400000, maxBytes: null }, indexes: INDEXES };
    const tab = (feed) => {
      const observed = observeHostStorePort(port, feed);
      const store = createDataStore({ name: 'chats.messages', backend: transactionalBackend(observed, null, options) });
      return createDataService({ resolve: (name) => (name === 'chats.messages' ? { store, decl: { keyPath: 'id' } } : null), feed });
    };
    const feedA = createHostStoreChangeFeed({ BroadcastChannelImpl: Channel });
    const feedB = createHostStoreChangeFeed({ BroadcastChannelImpl: Channel });
    const a = tab(feedA);
    const b = tab(feedB);
    const seen = [];
    b.subscribe({ collection: 'chats.messages', query: { index: 'byChat', prefix: [7] } }, (rows) => seen.push(rows.map((row) => row.id)));
    await settle();
    expect(seen).toEqual([[]]);
    a.source('chats.messages', { fetch: async () => [{ id: 'x', chat_id: 7, seq: 3 }, { id: 'y', chat_id: 7, seq: 1 }] });
    await a.refresh('chats.messages');
    await vi.waitFor(() => expect(seen.at(-1)).toEqual(['y', 'x']));
    expect((await a.query('chats.messages', { index: 'byChat', prefix: [7], lower: 2 })).rows.map((row) => row.id)).toEqual(['x']);
    const listed = (await port.inspect({ op: 'stores', selector: { authorityOrigin: 'https://api.example.test', viewerId: '7' } })).stores[0];
    expect(listed.syncedAt).toEqual(expect.any(Number));
    feedA.close(); feedB.close(); await database.close();
  });

  it('drops a change another tab queued for a row this tab force-purges', async () => {
    const Channel = createChannelBus();
    const database = create();
    const port = createHostStorePort({ database, backend: database.kind === 'sqlite' ? 'electron_sqlite' : 'indexeddb' });
    const options = { identity: identity(), storeName: 'chats.messages', policy: 'cache', schemaVersion: 1, cacheFingerprint: 'fp',
      limits: { maxRows: 1000, maxAgeMs: 86400000, maxBytes: null }, indexes: INDEXES };
    const tab = (feed) => {
      const store = createDataStore({ name: 'chats.messages', backend: transactionalBackend(observeHostStorePort(port, feed), null, options), indexes: INDEXES });
      return createDataService({ resolve: (name) => (name === 'chats.messages' ? { store, decl: { keyPath: 'id' } } : null), feed });
    };
    const feedA = createHostStoreChangeFeed({ BroadcastChannelImpl: Channel });
    const feedB = createHostStoreChangeFeed({ BroadcastChannelImpl: Channel });
    const a = tab(feedA);
    const b = tab(feedB);
    const push = vi.fn(async () => { throw Object.assign(new Error('Offline'), { status: 0 }); });
    a.source('chats.messages', { fetch: async () => [], push });
    await a.mutate('chats.messages', { op: 'put', record: { id: 'draft', chat_id: 7, seq: 1 } });
    await a.mutate('chats.messages', { op: 'put', record: { id: 'other', chat_id: 8, seq: 1 } });
    await vi.waitFor(() => expect(a.pending().map((entry) => [entry.key, entry.state]).sort()).toEqual([['draft', 'failed'], ['other', 'failed']]));
    expect(await b.purge('chats.messages', { force: true, query: { index: 'byChat', prefix: [7] } })).toEqual({ removed: ['draft'] });
    await vi.waitFor(() => expect(a.pending().map((entry) => entry.key)).toEqual(['other']));
    await expect(a.retry('chats.messages', 'draft')).resolves.toEqual({ key: 'draft', pushed: false });
    expect(push.mock.calls.map(([command]) => command.record.id).sort()).toEqual(['draft', 'other']);
    feedA.close(); feedB.close(); await database.close();
  });

  it('reads a declared index in memory where the store opened without it', async () => {
    const database = create();
    const port = createHostStorePort({ database, backend: database.kind === 'sqlite' ? 'electron_sqlite' : 'indexeddb' });
    const options = { identity: identity({ mpId: 'scheduling', tenantId: 'team-44' }), storeName: 'shifts', policy: 'cache', schemaVersion: 1, cacheFingerprint: 'fp',
      limits: { maxRows: 1000, maxAgeMs: 86400000, maxBytes: null } };
    const store = createDataStore({ name: 'shifts', backend: { ...transactionalBackend(port, null, options), indexes: [] }, indexes: { byDay: 'at' } });
    await store.put({ id: '1', at: 'tue' });
    await store.put({ id: '2', at: 'mon' });
    await store.put({ id: '3', at: 'wed' });
    const first = await store.query('byDay', {}, { limit: 2 });
    expect(first.rows.map((row) => row.id)).toEqual(['2', '1']);
    expect((await store.query('byDay', {}, { limit: 2, cursor: first.nextCursor })).rows.map((row) => row.id)).toEqual(['3']);
    await expect(store.query('undeclared')).rejects.toMatchObject({ reason: 'unserializable' });
    await database.close();
  });
});

/** A host-store-backed data service over `chats.messages`, counting commits. */
function hostService(create, { maxRows = 5000 } = {}) {
  const database = create();
  const port = createHostStorePort({ database, backend: database.kind === 'sqlite' ? 'electron_sqlite' : 'indexeddb' });
  const commits = { count: 0 };
  const counted = { ...port, commit: (input) => { commits.count += 1; return port.commit(input); } };
  const options = { identity: identity(), storeName: 'chats.messages', policy: 'cache', schemaVersion: 1, cacheFingerprint: 'fp',
    limits: { maxRows, maxAgeMs: 86400000, maxBytes: null }, indexes: INDEXES };
  const backend = transactionalBackend(counted, null, options);
  // The shell adapter refuses a complete read past COMPLETE_ROWS, as here.
  const completeReads = { count: 0 };
  const bounded = { ...backend, async getAll() {
    completeReads.count += 1;
    const rows = await backend.getAll();
    if (rows.length > COMPLETE_ROWS) throw Object.assign(new Error('scan-required'), { name: 'StorageReadError', reason: 'scan-required' });
    return rows;
  } };
  const store = createDataStore({ name: 'chats.messages', backend: bounded, indexes: INDEXES });
  const data = createDataService({ resolve: (name) => (name === 'chats.messages' ? { store, decl: { keyPath: 'id' } } : null) });
  return { data, store, commits, completeReads, close: () => database.close() };
}
const messages = (chat, from, to) => Array.from({ length: to - from + 1 }, (_, index) => ({ id: `${chat}:${from + index}`, chat_id: chat, seq: from + index }));

describe.each([
  ['memory', () => ({ data: memoryService(), close: () => {} })],
  ...DATABASES.map(([name, create]) => [`host store (${name})`, () => hostService(create)]),
])('server rows written into a collection (%s)', (_name, make) => {
  it('ingests server rows as synced, never pruning unless the set replaces a scope', async () => {
    const { data, close } = make();
    await data.mutate('chats.messages', { op: 'put', record: { id: 'draft', chat_id: 7, seq: 99 } });
    await data.ingest('chats.messages', messages(7, 1, 3));
    await data.ingest('chats.messages', messages(8, 1, 2));
    expect((await data.read('chats.messages')).map((row) => [row.id, row._dirty]).sort()).toEqual([
      ['7:1', false], ['7:2', false], ['7:3', false], ['8:1', false], ['8:2', false], ['draft', true],
    ]);
    expect(data.pending()).toEqual([]);
    // A complete set for chat 7 prunes the chat-7 rows it leaves out; dirty rows stay.
    await data.ingest('chats.messages', messages(7, 2, 3), { replace: true, scope: (row) => row.chat_id === 7 });
    expect((await data.read('chats.messages')).map((row) => row.id).sort()).toEqual(['7:2', '7:3', '8:1', '8:2', 'draft']);
    expect(data.status('chats.messages').state).toBe('fresh');
    await close();
  });

  it('keeps an unsent local write when the server copy of its row arrives', async () => {
    const { data, close } = make();
    await data.mutate('chats.messages', { op: 'put', record: { id: '7:2', chat_id: 7, seq: 2, body: 'unsent' } });
    expect(await data.ingest('chats.messages', messages(7, 1, 3))).toEqual({ written: 2 });
    expect(await data.read('chats.messages', '7:2')).toMatchObject({ body: 'unsent', _dirty: true });
    // A replacement, and one past a single chunk, keep it too.
    expect(await data.ingest('chats.messages', messages(7, 1, 3), { replace: true, scope: (row) => row.chat_id === 7 })).toEqual({ written: 2 });
    expect(await data.ingest('chats.messages', messages(7, 1, 600), { replace: true })).toEqual({ written: 599 });
    expect(await data.read('chats.messages', '7:2')).toMatchObject({ body: 'unsent', _dirty: true });
    expect(await data.read('chats.messages', '7:3')).toMatchObject({ _dirty: false });
    await close();
  });

  it('counts an unsent row left in two chunks once', async () => {
    const { data, close } = make();
    await data.mutate('chats.messages', { op: 'put', record: { id: '7:1', chat_id: 7, seq: 1, body: 'unsent' } });
    const rows = [...messages(7, 1, 500), { id: '7:1', chat_id: 7, seq: 1 }];
    expect(await data.ingest('chats.messages', rows)).toEqual({ written: 499 });
    expect(await data.read('chats.messages', '7:1')).toMatchObject({ body: 'unsent', _dirty: true });
    await close();
  });

  it('purges one subject by index, and specific keys, keeping unsent rows unless forced', async () => {
    const { data, close } = make();
    await data.ingest('chats.messages', [...messages(7, 1, 3), ...messages(8, 1, 2)]);
    await data.mutate('chats.messages', { op: 'put', record: { id: 'draft', chat_id: 7, seq: 99 } });
    expect(await data.purge('chats.messages', { query: { index: 'byChat', prefix: [7] } })).toEqual({ removed: ['7:1', '7:2', '7:3'] });
    expect((await data.read('chats.messages')).map((row) => row.id).sort()).toEqual(['8:1', '8:2', 'draft']);
    expect(await data.purge('chats.messages', { keys: ['8:2', 'draft', 'missing'] })).toEqual({ removed: ['8:2'] });
    expect(await data.purge('chats.messages', { query: { index: 'byChat', prefix: [7] }, force: true })).toEqual({ removed: ['draft'] });
    expect((await data.read('chats.messages')).map((row) => row.id)).toEqual(['8:1']);
    await close();
  });

  it('trims a subject to its newest rows in index order, never an unsent one', async () => {
    const { data, close } = make();
    await data.mutate('chats.messages', { op: 'put', record: { id: 'draft', chat_id: 7, seq: 0 } });
    await data.ingest('chats.messages', [...messages(7, 1, 6), ...messages(8, 1, 2)]);
    const seen = [];
    data.subscribe({ collection: 'chats.messages', query: { index: 'byChat', prefix: [7], limit: 100 } }, (rows) => seen.push(rows.map((row) => row.seq)));
    await vi.waitFor(() => expect(seen.at(-1)).toEqual([0, 1, 2, 3, 4, 5, 6]));
    expect(await data.trim('chats.messages', { index: 'byChat', prefix: [7], keep: 3 })).toEqual({ removed: ['7:1', '7:2', '7:3'] });
    await vi.waitFor(() => expect(seen.at(-1)).toEqual([0, 4, 5, 6]));
    expect(await data.trim('chats.messages', { index: 'byChat', prefix: [8], keep: 3 })).toEqual({ removed: [] });
    await expect(data.trim('chats.messages', { prefix: [7], keep: 3 })).rejects.toMatchObject({ code: 'DATA_INVALID' });
    await close();
  });
});

describe.each([
  ['memory', () => ({ store: createDataStore({ name: 'chats.messages', backend: createMemoryStoreBackend(), indexes: INDEXES }), close: () => {} })],
  ...DATABASES.map(([name, create]) => [`host store (${name})`, () => hostService(create)]),
])('a delete at a known revision (%s)', (_name, make) => {
  it('removes the row only while it is still that revision', async () => {
    const { store, close } = make();
    await store.put({ id: 'a', chat_id: 7, seq: 1 });
    const listed = await store.getRaw('a');
    await store.put({ id: 'a', chat_id: 7, seq: 1, body: 'written since' });
    await expect(store.delete('a', { expectedRevision: listed._rev })).rejects.toMatchObject({ name: 'PersistError', reason: 'conflict' });
    expect(await store.get('a')).toMatchObject({ body: 'written since' });
    await store.delete('a', { expectedRevision: (await store.getRaw('a'))._rev });
    expect(await store.get('a')).toBeUndefined();
    await close();
  });
});

/** A memory store whose next read of `method` answers late: the value it read, after `release()`. */
function lateStore(method) {
  const inner = createMemoryStoreBackend();
  let gate = null;
  const backend = { ...inner, async [method](...args) {
    const value = await inner[method](...args);
    if (gate) { const wait = gate.promise; gate = null; await wait; }
    return value;
  } };
  const store = createDataStore({ name: 'chats.messages', backend, indexes: INDEXES });
  return {
    store,
    backend,
    hold() { let release; gate = { promise: new Promise((resolve) => { release = resolve; }) }; return () => release(); },
  };
}

describe('a memory store writes each row in turn', () => {
  it('never lets a server row overwrite a local write that landed while it read', async () => {
    const { store, hold } = lateStore('get');
    const release = hold();
    const server = store.reconcile([{ id: 'a', chat_id: 7, seq: 1, body: 'server' }], { prune: false, keepDirty: true });
    const local = store.put({ id: 'a', chat_id: 7, seq: 1, body: 'unsent' });
    await settle();
    release();
    await Promise.all([server, local]);
    expect(await store.getRaw('a')).toMatchObject({ body: 'unsent', _dirty: true });
  });

  it('never deletes a revision written while the delete read the row', async () => {
    const { store, hold } = lateStore('get');
    await store.put({ id: 'a', chat_id: 7, seq: 1 });
    const listed = (await store.getRaw('a'))._rev;
    const release = hold();
    const removal = store.delete('a', { expectedRevision: listed });
    const local = store.put({ id: 'a', chat_id: 7, seq: 1, body: 'written since' });
    await settle();
    release();
    await Promise.allSettled([removal, local]);
    expect(await store.get('a')).toMatchObject({ body: 'written since' });
  });

  it('takes turns with another store handle over the same backend', async () => {
    const { store, backend, hold } = lateStore('get');
    const other = createDataStore({ name: 'chats.messages', backend, indexes: INDEXES });
    await store.put({ id: 'a', chat_id: 7, seq: 1 });
    const listed = (await store.getRaw('a'))._rev;
    const release = hold();
    const removal = store.delete('a', { expectedRevision: listed });
    const local = other.put({ id: 'a', chat_id: 7, seq: 1, body: 'from the other handle' });
    await settle();
    release();
    await Promise.allSettled([removal, local]);
    expect(await other.get('a')).toMatchObject({ body: 'from the other handle' });
  });

  it('never prunes a row written while a reconcile read the set', async () => {
    const { store, hold } = lateStore('getAll');
    await store.reconcile([{ id: 'a', chat_id: 7, seq: 1 }]);
    const release = hold();
    const server = store.reconcile([]);
    await settle();
    await store.put({ id: 'a', chat_id: 7, seq: 1, body: 'unsent' });
    release();
    expect(await server).toMatchObject({ pruned: 0 });
    expect(await store.getRaw('a')).toMatchObject({ body: 'unsent', _dirty: true });
  });
});

describe('whole-range purge and trim, and the rows an ingest stored', () => {
  it('purges and trims an index range of any size, never stopping part-way', async () => {
    const data = memoryService();
    await data.ingest('chats.messages', messages(7, 1, 6000));
    await data.ingest('chats.messages', messages(8, 1, 10));
    expect((await data.trim('chats.messages', { index: 'byChat', prefix: [7], keep: 100 })).removed).toHaveLength(5900);
    const kept = await data.query('chats.messages', { index: 'byChat', prefix: [7], limit: 1000 });
    expect(kept.rows.map((row) => row.seq)).toEqual(messages(7, 5901, 6000).map((row) => row.seq));
    await data.ingest('chats.messages', messages(7, 1, 5900));
    expect((await data.purge('chats.messages', { query: { index: 'byChat', prefix: [7] } })).removed).toHaveLength(6000);
    expect((await data.query('chats.messages', { index: 'byChat', limit: 1000 })).rows.map((row) => row.chat_id)).toEqual(Array(10).fill(8));
  });

  it('refuses a query limit that is not a whole number up to the platform maximum', async () => {
    const data = memoryService();
    await data.ingest('chats.messages', messages(7, 1, 3));
    for (const limit of [Infinity, 5001, 0, 2.5]) {
      // eslint-disable-next-line no-await-in-loop
      await expect(data.query('chats.messages', { index: 'byChat', prefix: [7], limit })).rejects.toMatchObject({ code: 'DATA_INVALID' });
      expect(() => data.subscribe({ collection: 'chats.messages', query: { index: 'byChat', limit } }, () => {})).toThrow(expect.objectContaining({ code: 'DATA_INVALID' }));
    }
    await expect(data.query('chats.messages', { limit: Infinity })).rejects.toMatchObject({ code: 'DATA_INVALID' });
    expect((await data.query('chats.messages', { index: 'byChat', prefix: [7], limit: 5000 })).rows).toHaveLength(3);
  });

  it('refuses paging or filter fields on a range it would otherwise over-purge', async () => {
    const data = memoryService();
    await data.ingest('chats.messages', messages(7, 1, 5));
    await expect(data.purge('chats.messages', { query: { index: 'byChat', prefix: [7], limit: 2 } })).rejects.toMatchObject({ code: 'DATA_INVALID' });
    await expect(data.purge('chats.messages', { query: { index: 'byChat', cursor: '7:1' } })).rejects.toMatchObject({ code: 'DATA_INVALID' });
    await expect(data.purge('chats.messages', { query: { index: 'byChat', prefix: [7], keep: 2 } })).rejects.toMatchObject({ code: 'DATA_INVALID' });
    await expect(data.trim('chats.messages', { index: 'byChat', prefix: [7], keep: 1, where: () => true })).rejects.toMatchObject({ code: 'DATA_INVALID' });
    expect((await data.read('chats.messages'))).toHaveLength(5);
  });

  it('keeps a row written dirty after a purge or trim listed it', async () => {
    const store = createDataStore({ name: 'chats.messages', backend: createMemoryStoreBackend(), indexes: INDEXES });
    let data;
    let edit = null;
    // A local edit lands after the range was listed, before its rows are removed.
    const listing = new Proxy(store, { get(target, property) {
      if (property !== 'query') return typeof target[property] === 'function' ? target[property].bind(target) : target[property];
      return async (...args) => {
        const page = await target.query(...args);
        if (edit) { data.mutate('chats.messages', { op: 'put', record: edit }); edit = null; }
        return page;
      };
    } });
    data = createDataService({ resolve: (name) => (name === 'chats.messages' ? { store: listing, decl: { keyPath: 'id' } } : null) });
    await data.ingest('chats.messages', messages(7, 1, 4));
    edit = { id: '7:1', chat_id: 7, seq: 1, body: 'unsent' };
    expect((await data.purge('chats.messages', { query: { index: 'byChat', prefix: [7] } })).removed).toEqual(['7:2', '7:3', '7:4']);
    expect(await data.read('chats.messages', '7:1')).toMatchObject({ body: 'unsent', _dirty: true });
    await data.ingest('chats.messages', messages(7, 2, 4));
    edit = { id: '7:2', chat_id: 7, seq: 2, body: 'unsent too' };
    expect((await data.trim('chats.messages', { index: 'byChat', prefix: [7], keep: 1 })).removed).toEqual(['7:3']);
    expect((await data.read('chats.messages')).map((row) => row.id).sort()).toEqual(['7:1', '7:2', '7:4']);
  });

  it('drops the unsent changes of a row it force-purges', async () => {
    const data = memoryService();
    const push = vi.fn(async () => { throw Object.assign(new Error('Offline'), { status: 0 }); });
    data.source('chats.messages', { fetch: async () => [], push });
    await data.mutate('chats.messages', { op: 'put', record: { id: 'draft', chat_id: 7, seq: 1 } });
    await vi.waitFor(() => expect(data.pending()).toEqual([expect.objectContaining({ key: 'draft', state: 'failed' })]));
    expect(await data.purge('chats.messages', { force: true, query: { index: 'byChat', prefix: [7] } })).toEqual({ removed: ['draft'] });
    expect(data.pending()).toEqual([]);
    await expect(data.retry('chats.messages', 'draft')).resolves.toEqual({ key: 'draft', pushed: false });
    expect(push).toHaveBeenCalledTimes(1);
  });

  it('counts each accepted key once, and a refused row never keeps an old version through a replacement', async () => {
    const store = createDataStore({ name: 'chats.messages', backend: createMemoryStoreBackend(), indexes: INDEXES, recordSchema: {
      type: 'object', required: ['id', 'chat_id'], properties: { id: { type: 'string' }, chat_id: { type: 'number' }, seq: { type: 'number' } },
    } });
    const data = createDataService({ resolve: (name) => (name === 'chats.messages' ? { store, decl: { keyPath: 'id' } } : null) });
    const many = messages(7, 1, 500);
    // The last key of the first chunk comes again in the second.
    expect(await data.ingest('chats.messages', [...many, { ...many[499], seq: 9999 }])).toEqual({ written: 500 });
    await data.ingest('chats.messages', [{ id: 'old', chat_id: 7, seq: 0 }]);
    const replacement = [...messages(8, 1, 500), { id: 'old', chat_id: 'not a number' }];
    expect(await data.ingest('chats.messages', replacement, { replace: true })).toEqual({ written: 500 });
    expect(await data.read('chats.messages', 'old')).toBeNull();
  });

  it('reports the rows an ingest stored, not the rows it was given', async () => {
    const store = createDataStore({ name: 'chats.messages', backend: createMemoryStoreBackend(), indexes: INDEXES, recordSchema: {
      type: 'object', required: ['id', 'chat_id'], properties: { id: { type: 'string' }, chat_id: { type: 'number' }, seq: { type: 'number' } },
    } });
    const data = createDataService({ resolve: (name) => (name === 'chats.messages' ? { store, decl: { keyPath: 'id' } } : null) });
    const given = [{ id: 'a', chat_id: 7, seq: 1 }, { id: 'a', chat_id: 7, seq: 2 }, { id: 'b', chat_id: 'seven' }, { id: 'c', chat_id: 7, seq: 3 }];
    expect(await data.ingest('chats.messages', given)).toEqual({ written: 2 });
    expect(await data.ingest('chats.messages', given, { replace: true })).toEqual({ written: 2 });
  });
});

describe.each(DATABASES)('large collections on the host store (%s)', (_name, create) => {
  it('writes a page of server rows in bounded transactions, not one per row', async () => {
    const { data, commits, close } = hostService(create);
    await data.ingest('chats.messages', messages(7, 1, 250));
    expect(commits.count).toBeLessThanOrEqual(3);
    expect((await data.query('chats.messages', { index: 'byChat', prefix: [7], limit: 1 })).rows[0].seq).toBe(1);
    await close();
  });

  it('purges and trims in bounded commits, keeping a row written dirty after it was listed', async () => {
    const { data, store, commits, close } = hostService(create);
    await data.ingest('chats.messages', [...messages(7, 1, 250), ...messages(8, 1, 250)]);
    commits.count = 0;
    expect((await data.purge('chats.messages', { query: { index: 'byChat', prefix: [7] } })).removed).toHaveLength(250);
    expect(commits.count).toBeLessThanOrEqual(3);
    commits.count = 0;
    expect((await data.trim('chats.messages', { index: 'byChat', prefix: [8], keep: 20 })).removed).toHaveLength(230);
    expect(commits.count).toBeLessThanOrEqual(3);
    // A local write lands after the range was listed, before its rows go.
    let edited;
    const listing = new Proxy(store, { get(target, property) {
      if (property !== 'query') return typeof target[property] === 'function' ? target[property].bind(target) : target[property];
      return async (...args) => {
        const page = await target.query(...args);
        if (!edited) edited = target.put({ id: '8:240', chat_id: 8, seq: 240, body: 'unsent' });
        await edited;
        return page;
      };
    } });
    const racing = createDataService({ resolve: (name) => (name === 'chats.messages' ? { store: listing, decl: { keyPath: 'id' } } : null) });
    expect((await racing.purge('chats.messages', { query: { index: 'byChat', prefix: [8] } })).removed).toHaveLength(19);
    expect(await data.read('chats.messages', '8:240')).toMatchObject({ body: 'unsent', _dirty: true });
    await close();
  });

  it('reads a whole collection past one complete read, page by page', async () => {
    const { data, store, close } = hostService(create);
    await data.ingest('chats.messages', messages(7, 1, 1500));
    expect(await store.getAll()).toHaveLength(1500);
    expect(await data.read('chats.messages')).toHaveLength(1500);
    const seen = [];
    store.subscribe((rows) => seen.push(rows.length));
    await data.ingest('chats.messages', messages(8, 1, 1));
    await vi.waitFor(() => expect(seen.at(-1)).toBe(1501));
    await close();
  });

  it('stops trying one complete read on a collection that needed pages, until it fits one again', async () => {
    const { data, store, completeReads, close } = hostService(create);
    await data.ingest('chats.messages', messages(7, 1, 1500));
    await store.getAll();
    const after = completeReads.count;
    await store.getAll();
    await data.read('chats.messages');
    expect(completeReads.count).toBe(after);
    await data.purge('chats.messages', { query: { index: 'byChat', prefix: [7] }, force: true });
    await data.ingest('chats.messages', messages(9, 1, 3));
    expect(await store.getAll()).toHaveLength(3);
    expect(await store.getAll()).toHaveLength(3);
    expect(completeReads.count).toBe(after + 1);
    await close();
  });

  it('reads and subscribes to more rows than one index page holds', async () => {
    const { data, close } = hostService(create);
    await data.ingest('chats.messages', messages(7, 1, 250));
    const all = await data.query('chats.messages', { index: 'byChat', prefix: [7], limit: 1000 });
    expect(all).toMatchObject({ complete: true, nextCursor: null });
    expect(all.rows.map((row) => row.seq)).toEqual(messages(7, 1, 250).map((row) => row.seq));
    const first = await data.query('chats.messages', { index: 'byChat', prefix: [7], limit: 120 });
    expect(first.rows).toHaveLength(120);
    expect(first.complete).toBe(false);
    const rest = await data.query('chats.messages', { index: 'byChat', prefix: [7], limit: 1000, cursor: first.nextCursor });
    expect(rest.rows[0].seq).toBe(121);
    const seen = [];
    data.subscribe({ collection: 'chats.messages', query: { index: 'byChat', prefix: [7], limit: 200 } }, (rows) => seen.push(rows.length));
    await vi.waitFor(() => expect(seen).toEqual([200]));
    await close();
  });

  it('keeps a subscription live once the collection outgrows a complete read', async () => {
    const { data, close } = hostService(create);
    for (let chat = 1; chat <= 3; chat += 1) await data.ingest('chats.messages', messages(chat, 1, 400)); // eslint-disable-line no-await-in-loop
    const seen = [];
    data.subscribe({ collection: 'chats.messages', query: { index: 'byChat', prefix: [9], limit: 10 } }, (rows) => seen.push(rows.map((row) => row.seq)));
    await vi.waitFor(() => expect(seen).toEqual([[]]));
    await data.ingest('chats.messages', messages(9, 1, 2));
    await vi.waitFor(() => expect(seen.at(-1)).toEqual([1, 2]));
    await close();
  });
});
