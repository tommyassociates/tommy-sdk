// @vitest-environment node
import {
  describe, it, expect, vi,
} from 'vitest';
import {
  createDataService, createDataStore, createMemoryStoreBackend,
} from '../src/index.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function setup(options = {}) {
  const store = options.store || createDataStore({ name: 'plans', backend: createMemoryStoreBackend() });
  const data = createDataService({
    resolve: () => ({ store, decl: { keyPath: 'id' } }), now: () => 1_000_000, principal: { id: 'p1' }, ...options,
  });
  return { data, store };
}
const target = (client = '1') => ({ collection: 'plans', method: 'client', params: { client: String(client) } });
const source = (fetch) => ({ fetch: async () => [], methods: { client: { params: { client: { type: 'id' } }, fetch } } });
const forced = (data, client = '1') => data.refresh(target(client), { mode: 'visible', fromNow: true });
const refusal = (status) => Object.assign(new Error(`HTTP ${status}`), { status });
const row = (body) => ({ id: '1', body: { sections: [body] } });
const answer = (body) => ({ rows: [row(body)], more: false });
const retired = (error, original) => {
  expect(error).toMatchObject({ code: 'REFRESH_DROPPED', retryable: false });
  expect(error).not.toHaveProperty('status');
  expect(error).not.toBe(original);
};
async function proof(data, store) {
  return { status: data.status(target(), { receipt: true }), row: await store.getRaw('1') };
}

describe('non-batched method failure authority', () => {
  it.each([500, 401, 403])('keeps a newer forced success after the older flight fails with HTTP %s', async (status) => {
    const { data, store } = setup();
    const old = deferred();
    const started = deferred();
    const fetch = vi.fn().mockImplementationOnce(() => { started.resolve(); return old.promise; })
      .mockResolvedValue(answer('new body'));
    data.source('plans', source(fetch));
    const first = forced(data).catch((error) => error);
    await started.promise;
    const current = await forced(data);
    const before = await proof(data, store);
    expect(current).toMatchObject({ state: 'fresh', keys: ['1'], receipt: expect.any(Number) });
    expect(before.row.body).toEqual(row('new body').body);
    const error = refusal(status);
    old.reject(error);
    retired(await first, error);
    expect(await proof(data, store)).toEqual(before);
    expect(fetch).toHaveBeenCalledTimes(2);
    data.dispose();
  });

  it.each([500, 401, 403])('preserves the newest flight\'s actual HTTP %s refusal', async (status) => {
    const { data, store } = setup();
    const error = refusal(status);
    const fetch = vi.fn().mockResolvedValueOnce(answer('retained candidate')).mockRejectedValue(error);
    data.source('plans', source(fetch));
    await forced(data);
    const stored = await store.getRaw('1');
    expect(await forced(data).catch((failed) => failed)).toBe(error);
    expect(data.status(target())).toMatchObject({ state: 'error', receipt: null, error: { status } });
    expect(await store.getRaw('1')).toEqual(stored);
    data.dispose();
  });

  it('drops an old failure across purge and a new exact read', async () => {
    const { data, store } = setup();
    const old = deferred();
    const started = deferred();
    const fetch = vi.fn().mockImplementationOnce(() => { started.resolve(); return old.promise; })
      .mockResolvedValue(answer('after purge'));
    data.source('plans', source(fetch));
    const first = forced(data).catch((error) => error);
    await started.promise;
    await data.purge('plans');
    expect(data.status(target()).receipt).toBeNull();
    await forced(data);
    const before = await proof(data, store);
    const error = refusal(403);
    old.reject(error);
    retired(await first, error);
    expect(await proof(data, store)).toEqual(before);
    data.dispose();
  });

  it('drops a purged flight\'s denial even when no newer flight supersedes its sequence', async () => {
    const { data, store } = setup();
    const old = deferred();
    const started = deferred();
    data.source('plans', source(() => { started.resolve(); return old.promise; }));
    const first = forced(data).catch((error) => error);
    await started.promise;
    await data.purge('plans');
    await data.ingest('plans', [row('after invalidation')]);
    const before = await proof(data, store);
    const error = refusal(403);
    old.reject(error);
    retired(await first, error);
    expect(await proof(data, store)).toEqual(before);
    data.dispose();
  });

  it.each([
    ['account', { id: 'p2', form: 'team', grant: 'read' }],
    ['form', { id: 'p1', form: 'member', grant: 'read' }],
    ['principal grant witness', { id: 'p1', form: 'team', grant: 'changed' }],
  ])('drops a late denial after the %s changes', async (_kind, next) => {
    let shown = { id: 'p1', form: 'team', grant: 'read' };
    const { data, store } = setup({ principal: () => shown });
    const old = deferred();
    const started = deferred();
    const fetch = vi.fn().mockImplementationOnce(() => { started.resolve(); return old.promise; })
      .mockResolvedValue(answer('new owner body'));
    data.source('plans', source(fetch));
    const first = forced(data).catch((error) => error);
    await started.promise;
    shown = next;
    await forced(data);
    const before = await proof(data, store);
    const error = refusal(403);
    old.reject(error);
    retired(await first, error);
    expect(await proof(data, store)).toEqual(before);
    data.dispose();
  });

  it('drops a late denial from an unregistered source without a newer flight', async () => {
    const { data, store } = setup();
    const old = deferred();
    const started = deferred();
    const unregister = data.source('plans', source(() => { started.resolve(); return old.promise; }));
    const first = forced(data).catch((error) => error);
    await started.promise;
    unregister();
    data.source('plans', source(async () => answer('replacement')));
    await data.ingest('plans', [row('replacement')]);
    const before = await proof(data, store);
    const error = refusal(401);
    old.reject(error);
    retired(await first, error);
    expect(await proof(data, store)).toEqual(before);
    data.dispose();
  });

  it('drops a service\'s late denial after retirement while its replacement keeps the current bytes', async () => {
    const { data, store } = setup();
    const old = deferred();
    const started = deferred();
    data.source('plans', source(() => { started.resolve(); return old.promise; }));
    const first = forced(data).catch((error) => error);
    await started.promise;
    data.dispose();
    const replacement = setup({ store }).data;
    replacement.source('plans', source(async () => answer('replacement owner')));
    await forced(replacement);
    const before = await proof(replacement, store);
    const error = refusal(403);
    old.reject(error);
    retired(await first, error);
    expect(await proof(replacement, store)).toEqual(before);
    replacement.dispose();
  });

  it('drops a stale scheduler rejection before run without withdrawing the newer receipt', async () => {
    const queued = deferred();
    const jobs = [];
    const scheduler = {
      request(job) {
        jobs.push(job);
        return jobs.length === 1 ? queued.promise : Promise.resolve().then(() => job.run(() => true));
      },
    };
    const { data, store } = setup({ scheduler });
    const fetch = vi.fn().mockResolvedValue(answer('new scheduled body'));
    data.source('plans', source(fetch));
    const first = forced(data).catch((error) => error);
    expect(jobs[0].valid()).toBe(true);
    await forced(data);
    const before = await proof(data, store);
    expect(jobs[0].valid()).toBe(false);
    const error = refusal(403);
    queued.reject(error);
    retired(await first, error);
    expect(await proof(data, store)).toEqual(before);
    expect(fetch).toHaveBeenCalledTimes(1);
    data.dispose();
  });

  it('refuses a superseded queued run even when the scheduler starts it with a current callback', async () => {
    const queued = deferred();
    const jobs = [];
    const scheduler = {
      request(job) {
        jobs.push(job);
        return jobs.length === 1 ? queued.promise : Promise.resolve().then(() => job.run(() => true));
      },
    };
    const { data, store } = setup({ scheduler });
    const fetch = vi.fn().mockResolvedValue(answer('new scheduled body'));
    data.source('plans', source(fetch));
    const first = forced(data).catch((error) => error);
    await forced(data);
    const before = await proof(data, store);
    const late = await jobs[0].run(() => true).catch((error) => error);
    retired(late);
    queued.reject(late);
    retired(await first);
    expect(await proof(data, store)).toEqual(before);
    expect(fetch).toHaveBeenCalledTimes(1);
    data.dispose();
  });

  it('drops an attempt after its scheduler flight ended and its old group was evicted', async () => {
    const ended = deferred();
    const old = deferred();
    const started = deferred();
    let requests = 0;
    let oldAttempt;
    const scheduler = {
      request(job) {
        requests += 1;
        if (requests === 1) {
          oldAttempt = Promise.resolve().then(() => job.run(() => true)).catch((error) => error);
          return ended.promise;
        }
        return Promise.resolve().then(() => job.run(() => true));
      },
    };
    const { data, store } = setup({ scheduler });
    let firstFetch = true;
    data.source('plans', source((params) => {
      if (firstFetch) { firstFetch = false; started.resolve(); return old.promise; }
      return Promise.resolve(params.client === '1' ? answer('new group body') : { rows: [], more: false });
    }));
    const first = forced(data).catch((error) => error);
    await started.promise;
    ended.reject(Object.assign(new Error('Refresh no longer current'), { code: 'REFRESH_DROPPED', retryable: false }));
    expect(await first).toMatchObject({ code: 'REFRESH_DROPPED' });
    for (let client = 2; client < 503; client += 1) await forced(data, String(client)); // eslint-disable-line no-await-in-loop
    await forced(data);
    const before = await proof(data, store);
    const error = refusal(403);
    old.reject(error);
    retired(await oldAttempt, error);
    expect(await proof(data, store)).toEqual(before);
    data.dispose();
  });

  it('retains a batched method\'s shared failure and successful sibling rows', async () => {
    const { data, store } = setup();
    const old = deferred();
    const started = deferred();
    const fetch = vi.fn((params) => {
      if (params.ids.includes('1')) { started.resolve(); return old.promise; }
      return Promise.resolve([{ id: '2', body: { sections: ['sibling'] } }]);
    });
    data.source('plans', { fetch: async () => [], methods: { byIds: { params: { ids: { type: 'ids' } }, batch: 'ids', fetch } } });
    const ask = (ids) => data.refresh({ collection: 'plans', method: 'byIds', params: { ids } }, { mode: 'visible', fromNow: true });
    const first = ask(['1']).catch((error) => error);
    await started.promise;
    await ask(['2']);
    const sibling = await store.getRaw('2');
    const error = refusal(403);
    old.reject(error);
    expect(await first).toBe(error);
    expect(await store.getRaw('2')).toEqual(sibling);
    expect(await data.refresh({ collection: 'plans', method: 'byIds', params: { ids: ['1'] } }))
      .toMatchObject({ state: 'error', error: { status: 403 } });
    data.dispose();
  });
});
