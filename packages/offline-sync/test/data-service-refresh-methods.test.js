// @vitest-environment node
/**
 * A source's refresh methods: named reads of part of a collection with
 * typed params. The service refuses what it cannot honour, batches the ids
 * of callers asking at once into one fetch, never fetches an id twice at
 * once or more often than the method's cadence, lets a whole read answer,
 * and merges every answer: rows it left out stay, the collection is not
 * marked synced, and only keys it names gone go.
 */
import {
  describe, it, expect, vi,
} from 'vitest';
import {
  createDataService, createDataStore, createMemoryStoreBackend,
} from '../src/index.js';

const MINUTE = 60000;
function service({ at = () => 1_000_000, online = () => true, principal = { id: 'p1' } } = {}) {
  const store = createDataStore({ name: 'members', backend: createMemoryStoreBackend() });
  const data = createDataService({
    resolve: (name) => (name === 'members' ? { store, decl: { keyPath: 'id' } } : null), now: at, isOnline: online, principal,
  });
  return { data, store };
}
// A server holding `rows`; `byUserIds` answers the rows of the users asked for.
function server(rows) {
  const asked = [];
  const whole = vi.fn(async () => ({ rows: rows.map((row) => ({ ...row })) }));
  const byUserIds = vi.fn(async (params, context) => {
    asked.push({ ...params, principal: context.principal });
    return rows.filter((row) => params.user_ids.includes(String(row.user_id))).map((row) => ({ ...row }));
  });
  return { asked, whole, byUserIds };
}
const member = (id, extra = {}) => ({ id: String(id), user_id: id + 100, name: `M${id}`, ...extra });
const ids = async (data) => (await data.read('members')).map((row) => row.id).sort();
const methods = (api, extra = {}) => ({
  byUserIds: {
    params: { user_ids: { type: 'ids', max: 3 } }, batch: 'user_ids', fetch: api.byUserIds, cadenceMs: 5 * MINUTE, ...extra,
  },
});

describe('refresh methods', () => {
  it('refuses an unknown method, unknown params and params of the wrong shape, without fetching', async () => {
    const { data } = service();
    const api = server([member(1)]);
    data.source('members', { fetch: api.whole, read: {}, methods: methods(api) });
    const refused = (target) => expect(data.refresh({ collection: 'members', ...target })).rejects.toMatchObject({ code: 'DATA_INVALID' });
    await refused({ method: 'byEmail', params: { emails: ['a'] } });
    await refused({ method: 'byUserIds', params: { user_ids: ['101'], extra: true } });
    await refused({ method: 'byUserIds', params: {} });
    await refused({ method: 'byUserIds', params: { user_ids: [] } });
    await refused({ method: 'byUserIds', params: { user_ids: [{ id: 1 }] } });
    await refused({ method: 'byUserIds', params: { user_ids: '101' } });
    // More ids than the method takes.
    await refused({ method: 'byUserIds', params: { user_ids: ['1', '2', '3', '4'] } });
    // A method with a key, query or window.
    await refused({ method: 'byUserIds', params: { user_ids: ['1'] }, key: '1' });
    expect(api.byUserIds).not.toHaveBeenCalled();
    expect(api.whole).not.toHaveBeenCalled();
    // A declaration it could not honour is refused when registered.
    expect(() => data.source('members', { fetch: api.whole, methods: { byUserIds: { params: { user_ids: { type: 'list' } }, fetch: api.byUserIds } } }))
      .toThrow(expect.objectContaining({ code: 'DATA_INVALID' }));
    expect(() => data.source('members', { fetch: api.whole, methods: { byUserIds: { params: { q: { type: 'string' } }, batch: 'q', fetch: api.byUserIds } } }))
      .toThrow(expect.objectContaining({ code: 'DATA_INVALID' }));
  });

  it('fetches only the ids asked, in one canonical form, and merges: rows it left out stay and the collection is not marked synced', async () => {
    const { data } = service();
    const api = server([member(1), member(2), member(3), member(4)]);
    data.source('members', { fetch: api.whole, read: {}, methods: methods(api) });
    await data.ingest('members', [member(9)]);
    await data.refresh({ collection: 'members', method: 'byUserIds', params: { user_ids: [103, '101', '101', 102] } }, { mode: 'visible' });
    expect(api.byUserIds).toHaveBeenCalledTimes(1);
    expect(api.asked[0]).toMatchObject({ user_ids: ['101', '102', '103'] });
    expect(api.asked[0].principal).toEqual({ id: 'p1' });
    expect(api.whole).not.toHaveBeenCalled();
    expect(await ids(data)).toEqual(['1', '2', '3', '9']);
    expect(data.status('members').syncedAt).toBe(null);
  });

  it('batches the ids of callers asking at once into one fetch, and never fetches an id already being fetched', async () => {
    const { data } = service();
    const api = server([member(1), member(2), member(3), member(4)]);
    let release;
    const held = new Promise((resolve) => { release = resolve; });
    const slow = vi.fn(async (params, context) => { await held; return api.byUserIds(params, context); });
    data.source('members', { fetch: api.whole, read: {}, methods: methods({ byUserIds: slow }) });
    const ask = (userIds) => data.refresh({ collection: 'members', method: 'byUserIds', params: { user_ids: userIds } }, { mode: 'visible' });
    // Two MPs asking overlapping ids at once: one fetch of their union.
    const first = ask(['101', '102']);
    const second = ask(['102', '103']);
    await Promise.resolve();
    // A third, while that fetch is out: only the id not being fetched goes.
    const third = ask(['103', '104']);
    release();
    await Promise.all([first, second, third]);
    expect(api.asked.map((call) => call.user_ids)).toEqual([['101', '102', '103'], ['104']]);
    expect(await ids(data)).toEqual(['1', '2', '3', '4']);
  });

  it('does not join a fetch that has not answered within the share window', async () => {
    let at = 1_000_000;
    const { data } = service({ at: () => at });
    const calls = [];
    const stalled = vi.fn((params) => { calls.push(params.user_ids); return calls.length === 1 ? new Promise(() => {}) : Promise.resolve([member(1)]); });
    data.source('members', { fetch: async () => ({ rows: [] }), read: {}, methods: methods({ byUserIds: stalled }) });
    const ask = () => data.refresh({ collection: 'members', method: 'byUserIds', params: { user_ids: ['101'] } }, { mode: 'visible' });
    ask();
    await Promise.resolve();
    at += 31000;
    await ask();
    expect(calls).toEqual([['101'], ['101']]);
    expect(await ids(data)).toEqual(['1']);
  });

  it('does not add ids to a batch that has waited past the share window without starting', async () => {
    let at = 1_000_000;
    const store = createDataStore({ name: 'members', backend: createMemoryStoreBackend() });
    // A scheduler that never starts the first job it is given.
    let first = true;
    const scheduler = {
      request(job) {
        if (first) { first = false; return new Promise(() => {}); }
        return Promise.resolve().then(() => job.run(() => true));
      },
    };
    const data = createDataService({
      resolve: (name) => (name === 'members' ? { store, decl: { keyPath: 'id' } } : null), now: () => at, scheduler, principal: { id: 'p1' },
    });
    const api = server([member(1), member(2)]);
    data.source('members', { fetch: api.whole, read: {}, methods: methods(api) });
    const ask = (userIds) => data.refresh({ collection: 'members', method: 'byUserIds', params: { user_ids: userIds } }, { mode: 'visible' });
    ask(['101']);
    at += 31000;
    await ask(['102']);
    expect(api.asked.map((call) => call.user_ids)).toEqual([['102']]);
  });

  it('splits a batch at the param\'s bound', async () => {
    const { data } = service();
    const api = server([member(1), member(2), member(3), member(4)]);
    data.source('members', { fetch: api.whole, read: {}, methods: methods(api) });
    const ask = (userIds) => data.refresh({ collection: 'members', method: 'byUserIds', params: { user_ids: userIds } }, { mode: 'visible' });
    await Promise.all([ask(['101', '102']), ask(['103', '104'])]);
    expect(api.asked.map((call) => call.user_ids)).toEqual([['101', '102', '103'], ['104']]);
  });

  it('reads an id again only after the method\'s cadence, whatever maxAge asks; a fresh whole read answers every id', async () => {
    let at = 1_000_000;
    const { data } = service({ at: () => at });
    const api = server([member(1), member(2)]);
    data.source('members', { fetch: api.whole, read: {}, methods: methods(api) });
    const ask = (userIds, options = {}) => data.refresh({ collection: 'members', method: 'byUserIds', params: { user_ids: userIds } }, { mode: 'visible', ...options });
    await ask(['101']);
    at += MINUTE;
    await ask(['101'], { maxAge: 0 });
    expect(api.byUserIds).toHaveBeenCalledTimes(1);
    // Only the id not fetched within the cadence goes.
    await ask(['101', '102']);
    expect(api.asked.map((call) => call.user_ids)).toEqual([['101'], ['102']]);
    at += 5 * MINUTE;
    await ask(['101']);
    expect(api.byUserIds).toHaveBeenCalledTimes(3);
    // A whole read within the cadence answers every id, asked or not.
    await data.refresh('members', { mode: 'visible' });
    await ask(['101', '102']);
    expect(api.byUserIds).toHaveBeenCalledTimes(3);
  });

  it('joins a whole read in flight as the same principal', async () => {
    const { data } = service();
    let release;
    const held = new Promise((resolve) => { release = resolve; });
    const api = server([member(1)]);
    const whole = vi.fn(async () => { await held; return { rows: [member(1)] }; });
    data.source('members', { fetch: whole, read: {}, methods: methods(api) });
    const reading = data.refresh('members', { mode: 'visible' });
    const asking = data.refresh({ collection: 'members', method: 'byUserIds', params: { user_ids: ['101'] } }, { mode: 'visible' });
    release();
    await Promise.all([reading, asking]);
    expect(api.byUserIds).not.toHaveBeenCalled();
    expect(await ids(data)).toEqual(['1']);
  });

  it('never shares a fetch between two principals', async () => {
    let principal = { id: 'p1' };
    const { data } = service({ principal: () => principal });
    const api = server([member(1)]);
    data.source('members', { fetch: api.whole, read: {}, methods: methods(api) });
    const first = data.refresh({ collection: 'members', method: 'byUserIds', params: { user_ids: ['101'] } }, { mode: 'visible' });
    principal = { id: 'p2' };
    const second = data.refresh({ collection: 'members', method: 'byUserIds', params: { user_ids: ['101'] } }, { mode: 'visible' });
    await Promise.all([first, second]);
    expect(api.asked.map((call) => call.principal)).toEqual([{ id: 'p1' }, { id: 'p2' }]);
  });

  it('keeps the stored rows when offline or when the fetch fails; silent mode answers the method\'s status', async () => {
    let online = false;
    const { data } = service({ online: () => online });
    const api = server([member(1, { name: 'Server' })]);
    const failing = vi.fn(async () => { throw Object.assign(new Error('Service Unavailable'), { status: 503 }); });
    data.source('members', { fetch: api.whole, read: {}, methods: { ...methods(api), byUserIdsFailing: { params: { user_ids: { type: 'ids' } }, batch: 'user_ids', fetch: failing } } });
    await data.ingest('members', [member(1, { name: 'Kept' })]);
    await expect(data.refresh({ collection: 'members', method: 'byUserIds', params: { user_ids: ['101'] } }, { mode: 'visible' }))
      .rejects.toMatchObject({ code: 'DATA_OFFLINE' });
    expect(api.byUserIds).not.toHaveBeenCalled();
    online = true;
    await expect(data.refresh({ collection: 'members', method: 'byUserIdsFailing', params: { user_ids: ['101'] } }, { mode: 'visible' }))
      .rejects.toMatchObject({ status: 503 });
    const status = await data.refresh({ collection: 'members', method: 'byUserIdsFailing', params: { user_ids: ['101'] } });
    expect(status).toMatchObject({ state: 'error', error: { status: 503 } });
    expect(await data.read('members')).toEqual([expect.objectContaining({ id: '1', name: 'Kept' })]);
  });

  it('removes only the keys an answer names gone, never one with an unsent change', async () => {
    const { data, store } = service();
    const byIds = vi.fn(async (params) => ({ rows: params.ids.includes('1') ? [member(1, { name: 'Fresh' })] : [], gone: params.ids.filter((id) => id !== '1') }));
    data.source('members', { fetch: async () => ({ rows: [] }), read: {}, methods: { byIds: { params: { ids: { type: 'ids' } }, batch: 'ids', fetch: byIds } } });
    await data.ingest('members', [member(1), member(2), member(3), member(4)]);
    // Row 3 has an unsent local change.
    await store.put({ ...member(3), name: 'Unsent' });
    expect((await store.getRaw('3'))._dirty).toBe(true);
    await data.refresh({ collection: 'members', method: 'byIds', params: { ids: ['1', '2', '3'] } }, { mode: 'visible' });
    expect(await ids(data)).toEqual(['1', '3', '4']);
    expect((await data.read('members', '1')).name).toBe('Fresh');
  });

  it('keeps a row written on this device after the method\'s read began', async () => {
    const { data } = service();
    let release;
    const held = new Promise((resolve) => { release = resolve; });
    const byUserIds = vi.fn(async () => { await held; return [member(1, { name: 'Server' })]; });
    data.source('members', { fetch: async () => ({ rows: [] }), read: {}, methods: methods({ byUserIds }) });
    const asking = data.refresh({ collection: 'members', method: 'byUserIds', params: { user_ids: ['101'] } }, { mode: 'visible' });
    await Promise.resolve();
    await data.ingest('members', [member(1, { name: 'Local' })]);
    release();
    await asking;
    expect((await data.read('members', '1')).name).toBe('Local');
  });

  it('fetches again after a purge, and counts as work until it lands', async () => {
    const { data } = service();
    const api = server([member(1)]);
    data.source('members', { fetch: api.whole, read: {}, methods: methods(api) });
    const asking = data.refresh({ collection: 'members', method: 'byUserIds', params: { user_ids: ['101'] } }, { mode: 'visible' });
    expect(data.idle()).toBe(false);
    await asking;
    expect(data.idle()).toBe(true);
    await data.purge('members');
    await data.refresh({ collection: 'members', method: 'byUserIds', params: { user_ids: ['101'] } }, { mode: 'visible' });
    expect(api.byUserIds).toHaveBeenCalledTimes(2);
  });

  it('stops writing a method answer once its service is retired', async () => {
    const store = createDataStore({ name: 'members', backend: createMemoryStoreBackend() });
    const data = createDataService({ resolve: (name) => (name === 'members' ? { store, decl: { keyPath: 'id' } } : null), principal: { id: 'p1' } });
    const reconcile = store.reconcile.bind(store);
    let chunks = 0;
    store.reconcile = async (...args) => {
      chunks += 1;
      const result = await reconcile(...args);
      if (chunks === 1) data.dispose();
      return result;
    };
    const search = vi.fn(async () => Array.from({ length: 1001 }, (_, at) => ({ id: String(at) })));
    data.source('members', { fetch: async () => ({ rows: [] }), read: {}, methods: { search: { params: { q: { type: 'string' } }, fetch: search } } });
    await data.refresh({ collection: 'members', method: 'search', params: { q: 'a' } }).catch(() => {});
    expect(chunks).toBe(1);
    expect((await store.getAllRaw()).length).toBe(500);
  });

  it('keeps a key an answer named gone from coming back through an older read, held or not', async () => {
    const { data } = service();
    let release;
    const held = new Promise((resolve) => { release = resolve; });
    const search = vi.fn(async () => { await held; return [member(1)]; });
    const byIds = vi.fn(async () => ({ rows: [], gone: ['1'] }));
    data.source('members', {
      fetch: async () => ({ rows: [] }),
      read: {},
      methods: { search: { params: { q: { type: 'string' } }, fetch: search }, byIds: { params: { ids: { type: 'ids' } }, batch: 'ids', fetch: byIds } },
    });
    const searching = data.refresh({ collection: 'members', method: 'search', params: { q: 'm' } }, { mode: 'visible' });
    await Promise.resolve();
    await data.refresh({ collection: 'members', method: 'byIds', params: { ids: ['1'] } }, { mode: 'visible' });
    release();
    await searching;
    expect(await ids(data)).toEqual([]);
  });

  it('takes an answer\'s keys from the records the source maps it to', async () => {
    const { data } = service();
    const byIds = vi.fn(async () => [{ member_id: '1', name: 'Mapped' }]);
    data.source('members', {
      fetch: async () => ({ rows: [] }),
      read: {},
      toRecord: (dto) => ({ id: dto.member_id, name: dto.name }),
      methods: { byIds: { params: { ids: { type: 'ids' } }, batch: 'ids', fetch: byIds } },
    });
    await data.refresh({ collection: 'members', method: 'byIds', params: { ids: ['1'] } }, { mode: 'visible' });
    expect(await data.read('members', '1')).toMatchObject({ id: '1', name: 'Mapped' });
  });

  it('runs a search whatever the whole collection\'s read did, and answers its own keys', async () => {
    const { data } = service();
    const api = server([member(1), member(2)]);
    const search = vi.fn(async ({ q }) => ({ rows: [member(2)], more: q === 'more' }));
    data.source('members', { fetch: api.whole, read: {}, methods: { search: { params: { q: { type: 'string' } }, fetch: search, cadenceMs: 5 * MINUTE } } });
    await data.refresh('members', { mode: 'visible' });
    const answer = await data.refresh({ collection: 'members', method: 'search', params: { q: 'more' } });
    expect(search).toHaveBeenCalledTimes(1);
    expect(answer).toMatchObject({ state: 'fresh', keys: ['2'], more: true });
  });

  it('reads by method again after a purge, though a whole read was fresh', async () => {
    const { data } = service();
    const api = server([member(1)]);
    data.source('members', { fetch: api.whole, read: {}, methods: methods(api) });
    await data.refresh('members', { mode: 'visible' });
    await data.purge('members');
    await data.refresh({ collection: 'members', method: 'byUserIds', params: { user_ids: ['101'] } }, { mode: 'visible' });
    expect(api.byUserIds).toHaveBeenCalledTimes(1);
    expect(await ids(data)).toEqual(['1']);
  });

  it('does not take an id for fetched when a purge ran while its read was out', async () => {
    const { data } = service();
    let release;
    const held = new Promise((resolve) => { release = resolve; });
    const api = server([member(1)]);
    let first = true;
    const byUserIds = vi.fn(async (params, context) => { if (first) { first = false; await held; } return api.byUserIds(params, context); });
    data.source('members', { fetch: api.whole, read: {}, methods: methods({ byUserIds }) });
    const asking = data.refresh({ collection: 'members', method: 'byUserIds', params: { user_ids: ['101'] } }, { mode: 'visible' });
    await Promise.resolve();
    await data.purge('members', { keys: ['1'] });
    release();
    await asking;
    expect(await ids(data)).toEqual([]);
    await data.refresh({ collection: 'members', method: 'byUserIds', params: { user_ids: ['101'] } }, { mode: 'visible' });
    expect(byUserIds).toHaveBeenCalledTimes(2);
    expect(await ids(data)).toEqual(['1']);
  });

  it('answers a scheduler\'s refusal in the method\'s status', async () => {
    const store = createDataStore({ name: 'members', backend: createMemoryStoreBackend() });
    const refusal = Object.assign(new Error('circuit open'), { code: 'REFRESH_CIRCUIT_OPEN' });
    const scheduler = { request: () => Promise.reject(refusal) };
    const data = createDataService({ resolve: (name) => (name === 'members' ? { store, decl: { keyPath: 'id' } } : null), scheduler, principal: { id: 'p1' } });
    const api = server([member(1)]);
    data.source('members', { fetch: api.whole, read: {}, methods: methods(api) });
    const status = await data.refresh({ collection: 'members', method: 'byUserIds', params: { user_ids: ['101'] } });
    expect(status).toMatchObject({ state: 'error', error: { code: 'REFRESH_CIRCUIT_OPEN' } });
  });

  it('refuses a method its source cannot run now before scheduling anything, and says so in its status', async () => {
    const store = createDataStore({ name: 'members', backend: createMemoryStoreBackend() });
    const scheduler = { request: vi.fn((job) => Promise.resolve().then(() => job.run(() => true))) };
    const data = createDataService({ resolve: (name) => (name === 'members' ? { store, decl: { keyPath: 'id' } } : null), scheduler, principal: { id: 'p1' } });
    const api = server([member(1)]);
    data.source('members', { fetch: api.whole, read: {}, methods: methods(api, { available: () => false }) });
    await expect(data.refresh({ collection: 'members', method: 'byUserIds', params: { user_ids: ['101'] } }, { mode: 'visible' }))
      .rejects.toMatchObject({ code: 'DATA_UNSUPPORTED', retryable: false });
    expect(await data.refresh({ collection: 'members', method: 'byUserIds', params: { user_ids: ['101'] } })).toMatchObject({ state: 'error', error: { code: 'DATA_UNSUPPORTED' } });
    expect(scheduler.request).not.toHaveBeenCalled();
    expect(api.byUserIds).not.toHaveBeenCalled();
  });

  it('refuses a string param longer than its declared bound', async () => {
    const { data } = service();
    const search = vi.fn(async () => []);
    data.source('members', { fetch: async () => ({ rows: [] }), read: {}, methods: { search: { params: { q: { type: 'string', max: 5 } }, fetch: search } } });
    await expect(data.refresh({ collection: 'members', method: 'search', params: { q: 'abcdef' } })).rejects.toMatchObject({ code: 'DATA_INVALID' });
    await data.refresh({ collection: 'members', method: 'search', params: { q: ' abc ' } }, { mode: 'visible' });
    expect(search).toHaveBeenCalledWith({ q: 'abc' }, expect.anything());
  });

  it('removes the stored rows of the ids asked that the answer left out (gone, or no longer visible), never one with an unsent change', async () => {
    const { data, store } = service();
    const api = server([member(1)]);
    data.source('members', { fetch: api.whole, read: {}, methods: methods(api, { field: 'user_id' }) });
    await data.ingest('members', [member(1), member(2), member(3), member(4)]);
    // Member 3 has an unsent local change.
    await store.put({ ...member(3), name: 'Unsent' });
    await data.refresh({ collection: 'members', method: 'byUserIds', params: { user_ids: ['101', '102', '103'] } }, { mode: 'visible' });
    expect(await ids(data)).toEqual(['1', '3', '4']);
    // By key: an id the answer left out is gone.
    const byIds = vi.fn(async ({ ids: asked }) => asked.filter((id) => id === '1').map((id) => member(Number(id))));
    data.source('members', { fetch: api.whole, read: {}, methods: { byIds: { params: { ids: { type: 'ids' } }, batch: 'ids', field: 'id', fetch: byIds } } });
    await data.refresh({ collection: 'members', method: 'byIds', params: { ids: ['1', '4'] } }, { mode: 'visible' });
    expect(await ids(data)).toEqual(['1', '3']);
  });

  it('hands a batch to the scheduler only once every id of the ask is in it', async () => {
    const store = createDataStore({ name: 'members', backend: createMemoryStoreBackend() });
    // A scheduler that runs a job the moment it is handed one.
    const scheduler = { request: (job) => Promise.resolve(job.run(() => true)) };
    const data = createDataService({ resolve: (name) => (name === 'members' ? { store, decl: { keyPath: 'id' } } : null), scheduler, principal: { id: 'p1' } });
    const api = server([member(1), member(2)]);
    data.source('members', { fetch: api.whole, read: {}, methods: methods(api) });
    await data.refresh({ collection: 'members', method: 'byUserIds', params: { user_ids: ['101', '102'] } }, { mode: 'visible' });
    expect(api.asked.map((call) => call.user_ids)).toEqual([['101', '102']]);
    expect(await ids(data)).toEqual(['1', '2']);
  });

  it('lets only the newest flight of a search store and answer, never one a later flight replaced', async () => {
    let at = 1_000_000;
    const { data } = service({ at: () => at });
    let releaseOld;
    const old = new Promise((resolve) => { releaseOld = resolve; });
    let calls = 0;
    const search = vi.fn(async () => {
      calls += 1;
      if (calls === 1) { await old; return { rows: [member(1)], more: true }; }
      return { rows: [member(2)], more: false };
    });
    data.source('members', { fetch: async () => ({ rows: [] }), read: {}, methods: { search: { params: { q: { type: 'string' } }, fetch: search, cadenceMs: 5 * MINUTE } } });
    const stalled = data.refresh({ collection: 'members', method: 'search', params: { q: 'm' } });
    await Promise.resolve();
    at += 31000;
    expect(await data.refresh({ collection: 'members', method: 'search', params: { q: 'm' } })).toMatchObject({ keys: ['2'], more: false });
    releaseOld();
    await stalled;
    expect(await data.refresh({ collection: 'members', method: 'search', params: { q: 'm' } })).toMatchObject({ keys: ['2'], more: false });
    expect(search).toHaveBeenCalledTimes(2);
    expect(await ids(data)).toEqual(['2']);
  });

  it('sends its own lookup when the whole read it joined failed, and answers that lookup\'s outcome', async () => {
    const { data } = service();
    let fail;
    const held = new Promise((resolve, reject) => { fail = reject; });
    const api = server([member(1)]);
    data.source('members', { fetch: () => held, read: {}, methods: methods(api) });
    const reading = data.refresh('members').catch(() => {});
    const asking = data.refresh({ collection: 'members', method: 'byUserIds', params: { user_ids: ['101'] } });
    fail(Object.assign(new Error('Service Unavailable'), { status: 503 }));
    await reading;
    expect(await asking).toMatchObject({ state: 'fresh' });
    expect(api.byUserIds).toHaveBeenCalledTimes(1);
    expect(await ids(data)).toEqual(['1']);
  });

  it('never inherits the refusal of a whole read it joined: an account that reads on demand still gets its lookup', async () => {
    const { data } = service();
    let refuse;
    const held = new Promise((resolve, reject) => { refuse = reject; });
    const api = server([member(1), member(2)]);
    data.source('members', { fetch: () => held, read: {}, methods: methods(api) });
    // A bootstrap's whole read, refused for this account once its access is known.
    const reading = data.refresh('members', { mode: 'visible' }).catch((error) => error);
    const asking = data.refresh({ collection: 'members', method: 'byUserIds', params: { user_ids: ['101'] } });
    refuse(Object.assign(new Error('read on demand for this account'), { code: 'DATA_ON_DEMAND', retryable: false }));
    expect(await reading).toMatchObject({ code: 'DATA_ON_DEMAND' });
    expect((await asking).state).toBe('fresh');
    expect(api.asked.map((call) => call.user_ids)).toEqual([['101']]);
    expect(await ids(data)).toEqual(['1']);
  });

  it('keeps a person a lookup found gone from coming back through an older read, held or not', async () => {
    const { data } = service();
    let release;
    const held = new Promise((resolve) => { release = resolve; });
    const search = vi.fn(async () => { await held; return [member(3)]; });
    const byUserIds = vi.fn(async () => []);
    data.source('members', {
      fetch: async () => ({ rows: [] }),
      read: {},
      methods: {
        search: { params: { q: { type: 'string' } }, fetch: search },
        byUserIds: { params: { user_ids: { type: 'ids' } }, batch: 'user_ids', field: 'user_id', fetch: byUserIds },
      },
    });
    const searching = data.refresh({ collection: 'members', method: 'search', params: { q: 'm' } }, { mode: 'visible' });
    await Promise.resolve();
    await data.refresh({ collection: 'members', method: 'byUserIds', params: { user_ids: ['103'] } }, { mode: 'visible' });
    release();
    await searching;
    expect(await ids(data)).toEqual([]);
  });

  it('removes nothing once its service is retired while it looks for the rows an answer left out', async () => {
    const store = createDataStore({ name: 'members', backend: createMemoryStoreBackend() });
    const data = createDataService({ resolve: (name) => (name === 'members' ? { store, decl: { keyPath: 'id' } } : null), principal: { id: 'p1' } });
    const byUserIds = vi.fn(async () => []);
    data.source('members', { fetch: async () => ({ rows: [] }), read: {}, methods: methods({ byUserIds }, { field: 'user_id' }) });
    await data.ingest('members', [member(2)]);
    const scan = store.getAllRaw.bind(store);
    store.getAllRaw = async () => { const rows = await scan(); data.dispose(); return rows; };
    await data.refresh({ collection: 'members', method: 'byUserIds', params: { user_ids: ['102'] } }).catch(() => {});
    store.getAllRaw = scan;
    expect((await store.getAllRaw()).map((row) => row.id)).toEqual(['2']);
  });

  it('sends its own lookup rather than join a read of only part of the collection (a scoped source)', async () => {
    const { data } = service();
    let release;
    const held = new Promise((resolve) => { release = resolve; });
    const api = server([member(1), member(2)]);
    data.source('members', {
      fetch: async () => { await held; return { rows: [member(2)] }; }, scope: () => (row) => row.id === '2', read: {}, methods: methods(api),
    });
    const reading = data.refresh('members');
    const asking = data.refresh({ collection: 'members', method: 'byUserIds', params: { user_ids: ['101'] } }, { mode: 'visible' });
    release();
    await Promise.all([reading, asking]);
    expect(data.status('members').state).toBe('fresh');
    expect(api.asked.map((call) => call.user_ids)).toEqual([['101']]);
  });

  it('answers a method a recent whole read covers as fresh, whatever it answered before', async () => {
    let at = 1_000_000;
    const { data } = service({ at: () => at });
    const api = server([member(1)]);
    let fail = true;
    const byUserIds = vi.fn(async (params, context) => { if (fail) throw Object.assign(new Error('Service Unavailable'), { status: 503 }); return api.byUserIds(params, context); });
    data.source('members', { fetch: api.whole, read: {}, methods: methods({ byUserIds }) });
    const ask = () => data.refresh({ collection: 'members', method: 'byUserIds', params: { user_ids: ['101'] } });
    expect((await ask()).state).toBe('error');
    fail = false;
    at += 1000;
    await data.refresh('members', { mode: 'visible' });
    expect(await ask()).toMatchObject({ state: 'fresh', error: null });
    expect(byUserIds).toHaveBeenCalledTimes(1);
  });

  it('refuses an answer that names more keys gone than the bound, and stores nothing of it', async () => {
    const { data } = service();
    const api = server([member(1)]);
    const gone = Array.from({ length: 5001 }, (_, n) => String(n + 1000));
    const byUserIds = vi.fn(async () => ({ rows: [member(1)], gone }));
    data.source('members', { fetch: api.whole, read: {}, methods: methods({ byUserIds }) });
    await data.ingest('members', [member(9)]);
    await expect(data.refresh({ collection: 'members', method: 'byUserIds', params: { user_ids: ['101'] } }, { mode: 'visible' }))
      .rejects.toMatchObject({ code: 'DATA_TOO_LARGE' });
    expect(await ids(data)).toEqual(['9']);
  });

  it('takes a complete ingest as a whole read that answers every id within the cadence', async () => {
    const { data } = service();
    const api = server([member(1)]);
    data.source('members', { fetch: api.whole, read: {}, methods: methods(api) });
    await data.ingest('members', [member(1)], { complete: true });
    await data.refresh({ collection: 'members', method: 'byUserIds', params: { user_ids: ['101'] } }, { mode: 'visible' });
    expect(api.byUserIds).not.toHaveBeenCalled();
  });

  it('sends nothing when its service is retired while it waits on a whole read it joined', async () => {
    const { data } = service();
    let fail;
    const held = new Promise((resolve, reject) => { fail = reject; });
    const api = server([member(1)]);
    data.source('members', { fetch: () => held, read: {}, methods: methods(api) });
    const reading = data.refresh('members').catch(() => {});
    const asking = data.refresh({ collection: 'members', method: 'byUserIds', params: { user_ids: ['101'] } }, { mode: 'visible' }).catch((error) => error);
    data.dispose();
    fail(Object.assign(new Error('Service Unavailable'), { status: 503 }));
    await reading;
    expect(await asking).toMatchObject({ code: 'DATA_RETIRED' });
    expect(api.byUserIds).not.toHaveBeenCalled();
  });

  it('sends nothing as another principal when the account changed while it waited', async () => {
    let shown = { id: 'p1' };
    const store = createDataStore({ name: 'members', backend: createMemoryStoreBackend() });
    const data = createDataService({
      resolve: (name) => (name === 'members' ? { store, decl: { keyPath: 'id' } } : null), now: () => 1_000_000, isOnline: () => true, principal: () => shown,
    });
    let fail;
    const held = new Promise((resolve, reject) => { fail = reject; });
    const api = server([member(1)]);
    data.source('members', { fetch: () => held, read: {}, methods: methods(api) });
    const reading = data.refresh('members').catch(() => {});
    const asking = data.refresh({ collection: 'members', method: 'byUserIds', params: { user_ids: ['101'] } }, { mode: 'visible' }).catch((error) => error);
    shown = { id: 'p2' };
    fail(Object.assign(new Error('Service Unavailable'), { status: 503 }));
    await reading;
    await asking;
    expect(api.byUserIds).not.toHaveBeenCalled();
  });

  it('starts its own lookup when the wait ends, so an ask of the same ids just after joins it', async () => {
    let at = 1_000_000;
    const { data } = service({ at: () => at });
    let fail;
    const held = new Promise((resolve, reject) => { fail = reject; });
    let release;
    const slow = new Promise((resolve) => { release = resolve; });
    const api = server([member(1)]);
    const byUserIds = vi.fn(async (params, context) => { await slow; return api.byUserIds(params, context); });
    data.source('members', { fetch: () => held, read: {}, methods: methods({ byUserIds }) });
    const reading = data.refresh('members').catch(() => {});
    const first = data.refresh({ collection: 'members', method: 'byUserIds', params: { user_ids: ['101'] } }, { mode: 'visible' });
    // The whole read takes longer than the share window, then fails.
    at += 2 * MINUTE;
    fail(Object.assign(new Error('Service Unavailable'), { status: 503 }));
    await reading;
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    const second = data.refresh({ collection: 'members', method: 'byUserIds', params: { user_ids: ['101'] } }, { mode: 'visible' });
    release();
    await Promise.all([first, second]);
    expect(byUserIds).toHaveBeenCalledTimes(1);
  });

  it('answers in the group its ids belong to, though idle groups were cleared while it waited', async () => {
    const { data } = service();
    let fail;
    const held = new Promise((resolve, reject) => { fail = reject; });
    const api = server([member(1)]);
    const search = vi.fn(async () => []);
    data.source('members', {
      fetch: () => held,
      read: {},
      methods: { ...methods(api), search: { params: { q: { type: 'string', max: 20 } }, fetch: search } },
    });
    const reading = data.refresh('members').catch(() => {});
    const asking = data.refresh({ collection: 'members', method: 'byUserIds', params: { user_ids: ['101'] } }, { mode: 'visible' });
    // Enough other asks to clear the idle groups while it waits.
    for (let n = 0; n < 501; n += 1) await data.refresh({ collection: 'members', method: 'search', params: { q: `q${n}` } }); // eslint-disable-line no-await-in-loop
    fail(Object.assign(new Error('Service Unavailable'), { status: 503 }));
    await reading;
    await asking;
    expect(api.byUserIds).toHaveBeenCalledTimes(1);
    // Within the cadence the id is answered without another fetch.
    await data.refresh({ collection: 'members', method: 'byUserIds', params: { user_ids: ['101'] } }, { mode: 'visible' });
    expect(api.byUserIds).toHaveBeenCalledTimes(1);
  });

  it('sends its own lookup when the whole read it joined stored nothing', async () => {
    let at = 1_000_000;
    const { data } = service({ at: () => at });
    let release;
    let held = Promise.resolve();
    const api = server([member(1)]);
    data.source('members', { fetch: async () => { await held; return null; }, read: {}, methods: methods(api, { cadenceMs: 1000 }) });
    // A fetch of its own first: the method's status is fresh.
    expect((await data.refresh({ collection: 'members', method: 'byUserIds', params: { user_ids: ['101'] } })).state).toBe('fresh');
    at += 2000;
    held = new Promise((resolve) => { release = resolve; });
    const reading = data.refresh('members');
    const asking = data.refresh({ collection: 'members', method: 'byUserIds', params: { user_ids: ['101'] } });
    release();
    await reading;
    expect((await asking).state).toBe('fresh');
    expect(api.byUserIds).toHaveBeenCalledTimes(2);
  });
});
