// @vitest-environment node
/**
 * A read the scheduler tries again after a failure: its callers are
 * answered by the first failed attempt (the device's rows stand), while the
 * retries go on in the background and settle the read and its status. A
 * caller asking during the backoff is answered at once, with no second
 * flight. Once the service retires, none of its jobs runs or runs again.
 */
import {
  describe, it, expect, vi,
} from 'vitest';
import {
  createDataService, createDataStore, createMemoryStoreBackend,
} from '../src/index.js';

/**
 * A scheduler that keeps a job's requests through every attempt, as the
 * host's does: a failed attempt waits until `retry()` (its backoff), up to
 * `attempts`. It checks `valid()` before each attempt.
 */
function retryingScheduler({ attempts = 5 } = {}) {
  const jobs = new Map();
  const due = [];
  const dropped = () => Object.assign(new Error('Refresh no longer current'), { code: 'REFRESH_DROPPED' });
  const valid = (job) => typeof job.valid !== 'function' || job.valid();
  function start(entry) {
    entry.tries += 1;
    Promise.resolve()
      .then(() => (valid(entry.job) ? entry.job.run(() => valid(entry.job)) : Promise.reject(dropped())))
      .then((value) => {
        jobs.delete(entry.job.key);
        entry.waiters.splice(0).forEach((waiter) => waiter.resolve(value));
      }, (error) => {
        if (entry.tries < attempts && error?.code !== 'REFRESH_DROPPED') { due.push(entry); return; }
        jobs.delete(entry.job.key);
        entry.waiters.splice(0).forEach((waiter) => waiter.reject(error));
      });
  }
  return {
    request(job) {
      let entry = jobs.get(job.key);
      if (!entry) {
        entry = { job, waiters: [], tries: 0 };
        jobs.set(job.key, entry);
        start(entry);
      }
      return new Promise((resolve, reject) => { entry.waiters.push({ resolve, reject }); });
    },
    retry() { due.splice(0).forEach(start); },
    revalidate: vi.fn(),
    get waiting() { return due.length; },
  };
}

const offline = () => Object.assign(new Error('Network unreachable'), { status: 0 });
function service(scheduler) {
  const store = createDataStore({ name: 'members', backend: createMemoryStoreBackend() });
  const data = createDataService({
    resolve: (name) => (name === 'members' ? { store, decl: { keyPath: 'id' } } : null), scheduler, principal: { id: 'p1' },
  });
  return { data, store };
}
// Whether a promise has settled, after the microtasks queued so far.
async function outcome(promise) {
  let settled = null;
  promise.then((value) => { settled = ['resolved', value]; }, (error) => { settled = ['rejected', error]; });
  for (let turn = 0; turn < 20; turn += 1) await Promise.resolve(); // eslint-disable-line no-await-in-loop
  return settled;
}

describe('a read the scheduler tries again', () => {
  it('answers a visible refresh at its first failed attempt; the retry settles the read and its status in the background', async () => {
    const scheduler = retryingScheduler();
    const { data } = service(scheduler);
    const fetch = vi.fn().mockRejectedValueOnce(offline()).mockResolvedValue([{ id: '1', name: 'Ada' }]);
    data.source('members', { fetch });
    const settled = await outcome(data.refresh('members', { mode: 'visible' }));
    expect(settled?.[0]).toBe('rejected');
    expect(settled[1]).toMatchObject({ status: 0 });
    expect(data.status('members')).toMatchObject({ state: 'error', error: { status: 0 } });
    // The read is still the service's: not idle until its retries settle.
    expect(scheduler.waiting).toBe(1);
    expect(data.idle()).toBe(false);
    scheduler.retry();
    await vi.waitFor(() => expect(data.status('members').state).toBe('fresh'));
    expect((await data.read('members')).map((row) => row.name)).toEqual(['Ada']);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('answers a caller asking during the backoff at once, with no second fetch, and a silent one with the failed status', async () => {
    const scheduler = retryingScheduler();
    const { data } = service(scheduler);
    const fetch = vi.fn().mockRejectedValueOnce(offline()).mockResolvedValue([{ id: '1' }]);
    data.source('members', { fetch });
    await outcome(data.refresh('members', { mode: 'visible' }));
    const joined = await outcome(data.refresh('members', { mode: 'visible' }));
    expect(joined?.[0]).toBe('rejected');
    const silent = await outcome(data.refresh('members'));
    expect(silent).toEqual(['resolved', expect.objectContaining({ state: 'error' })]);
    // A full read asked behind it is answered with the failure too, not held.
    const full = await outcome(data.refresh('members', { mode: 'visible', full: true }));
    expect(full?.[0]).toBe('rejected');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(scheduler.waiting).toBe(1);
    // An ask while the retry runs waits for that attempt.
    scheduler.retry();
    await Promise.resolve();
    await expect(data.refresh('members', { mode: 'visible' })).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('answers a refresh method\'s callers at its first failed attempt, and joins an id asked again during the backoff', async () => {
    const scheduler = retryingScheduler();
    const { data } = service(scheduler);
    const byIds = vi.fn().mockRejectedValueOnce(offline())
      .mockImplementation(async (params) => params.ids.map((id) => ({ id, name: `N${id}` })));
    data.source('members', {
      fetch: async () => [],
      methods: { byIds: { params: { ids: { type: 'ids', max: 10 } }, batch: 'ids', fetch: byIds } },
    });
    const lookup = (ids) => data.refresh({ collection: 'members', method: 'byIds', params: { ids } }, { mode: 'visible' });
    const first = await outcome(lookup(['1', '2']));
    expect(first?.[0]).toBe('rejected');
    const again = await outcome(lookup(['1']));
    expect(again?.[0]).toBe('rejected');
    expect(byIds).toHaveBeenCalledTimes(1);
    scheduler.retry();
    await vi.waitFor(async () => expect((await data.read('members')).map((row) => row.id).sort()).toEqual(['1', '2']));
    expect(byIds).toHaveBeenCalledTimes(2);
    // A search (not batched) is answered the same way.
    const search = vi.fn().mockRejectedValueOnce(offline()).mockResolvedValue([{ id: '9' }]);
    data.source('members', {
      fetch: async () => [],
      methods: { search: { params: { q: { type: 'string' } }, fetch: search } },
    });
    const found = await outcome(data.refresh({ collection: 'members', method: 'search', params: { q: 'a' } }, { mode: 'visible' }));
    expect(found?.[0]).toBe('rejected');
    scheduler.retry();
    await vi.waitFor(async () => expect((await data.read('members')).map((row) => row.id)).toContain('9'));
    expect(search).toHaveBeenCalledTimes(2);
  });

  it('never runs a read again once the service retires, and has the scheduler end its jobs at once', async () => {
    const scheduler = retryingScheduler();
    const { data } = service(scheduler);
    const fetch = vi.fn().mockRejectedValue(offline());
    data.source('members', { fetch });
    await outcome(data.refresh('members', { mode: 'visible' }));
    expect(fetch).toHaveBeenCalledTimes(1);
    data.dispose();
    expect(scheduler.revalidate).toHaveBeenCalled();
    scheduler.retry();
    for (let turn = 0; turn < 20; turn += 1) await Promise.resolve(); // eslint-disable-line no-await-in-loop
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('shows no failure of an attempt that ends after its read settled, over the read that came next', async () => {
    // A scheduler that can end its jobs while an attempt is still running.
    const ended = [];
    const scheduler = {
      request(job) {
        return new Promise((resolve, reject) => {
          ended.push(reject);
          Promise.resolve().then(() => job.run(() => true)).then(resolve, reject);
        });
      },
      endAll() { ended.splice(0).forEach((reject) => reject(Object.assign(new Error('Refresh no longer current'), { code: 'REFRESH_DROPPED' }))); },
      revalidate: vi.fn(),
    };
    const { data } = service(scheduler);
    let failFirst;
    const fetch = vi.fn()
      .mockImplementationOnce(() => new Promise((_, reject) => { failFirst = reject; }))
      .mockResolvedValue([{ id: '1', name: 'Ada' }]);
    data.source('members', { fetch });
    const first = data.refresh('members', { mode: 'visible' }).catch((error) => error);
    for (let turn = 0; turn < 20; turn += 1) await Promise.resolve(); // eslint-disable-line no-await-in-loop
    scheduler.endAll();
    expect(await first).toMatchObject({ code: 'REFRESH_DROPPED' });
    await data.refresh('members', { mode: 'visible' });
    expect(data.status('members')).toMatchObject({ state: 'fresh', error: null });
    // The first read's attempt fails only now.
    failFirst(offline());
    for (let turn = 0; turn < 20; turn += 1) await Promise.resolve(); // eslint-disable-line no-await-in-loop
    expect(data.status('members')).toMatchObject({ state: 'fresh', error: null });
  });
});

describe('a read asked to begin after the ask', () => {
  it('is queued behind a read already on its way instead of joining it, whatever maxAge says', async () => {
    const { data } = service(retryingScheduler());
    let release;
    const fetch = vi.fn()
      .mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve([{ id: '1', name: 'Before' }]); }))
      .mockResolvedValue([{ id: '1', name: 'After' }]);
    data.source('members', { fetch });
    const before = data.refresh('members', { mode: 'visible' });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const after = data.refresh('members', { mode: 'visible', maxAge: 60000, fromNow: true });
    // Without it, an ask joins the read on its way.
    const joined = data.refresh('members', { mode: 'visible' });
    release();
    await Promise.all([before, joined, after]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect((await data.read('members')).map((row) => row.name)).toEqual(['After']);
  });
});
