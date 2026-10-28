// @vitest-environment node
/**
 * A read whose callers were answered at its deadline (REFRESH_TIMEOUT) while
 * the scheduler went on with it: what it then stores marks the collection
 * fresh through the normal status path, with nothing asked again. The read
 * guard tells the scheduler while it stores an answer it already has, and
 * the service lists the status of its method reads.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  createDataService, createDataStore, createMemoryStoreBackend,
} from '../src/index.js';

const timeout = () => Object.assign(new Error('Refresh took too long'), { code: 'REFRESH_TIMEOUT', retryable: true });
const flush = () => new Promise((resolve) => { setTimeout(resolve, 0); });

// A scheduler that runs each job at once and lets the test answer its
// callers with REFRESH_TIMEOUT while the run goes on (`passDeadline()`), as
// the host's does for a read past its deadline. It records the storing spans.
function lateScheduler() {
  const runs = [];
  const spans = [];
  return {
    runs,
    spans,
    request(job) {
      let reject;
      let resolve;
      const answer = new Promise((_resolve, _reject) => { resolve = _resolve; reject = _reject; });
      const storing = () => {
        const span = { began: true, ended: false };
        spans.push(span);
        return () => { span.ended = true; };
      };
      const run = { job, passDeadline: () => reject(timeout()) };
      runs.push(run);
      Promise.resolve().then(() => job.run(() => true, { storing })).then(resolve, reject).catch(() => {});
      return answer;
    },
    revalidate: vi.fn(),
  };
}
function deferred() {
  let resolve;
  const promise = new Promise((_resolve) => { resolve = _resolve; });
  return { promise, resolve };
}
function service(scheduler) {
  const store = createDataStore({ name: 'members', backend: createMemoryStoreBackend() });
  const data = createDataService({
    resolve: (name) => (name === 'members' ? { store, decl: { keyPath: 'id' } } : null), scheduler, principal: { id: 'p1' },
  });
  return { data, store };
}
const rows = [{ id: '1', name: 'Sam' }, { id: '2', name: 'Alex' }];

describe('a read answered at its deadline that goes on', () => {
  it('marks the collection fresh when its answer lands: subscribers hear it once, and nothing is asked again', async () => {
    const scheduler = lateScheduler();
    const { data } = service(scheduler);
    const answer = deferred();
    const fetch = vi.fn(() => answer.promise);
    data.source('members', { fetch });
    const seen = [];
    data.onStatusChange(() => {
      const { state } = data.status('members');
      if (seen[seen.length - 1] !== state) seen.push(state);
    });
    const delivered = [];
    data.subscribe('members', (value) => { delivered.push(value.map((row) => row.id)); });
    await flush();
    const asked = data.refresh('members', { mode: 'visible' });
    await flush();
    scheduler.runs[0].passDeadline();
    await expect(asked).rejects.toMatchObject({ code: 'REFRESH_TIMEOUT' });
    expect(data.status('members')).toMatchObject({ state: 'error', syncedAt: null, error: { code: 'REFRESH_TIMEOUT' } });
    const before = delivered.length;
    answer.resolve(rows);
    await vi.waitFor(() => expect(data.status('members').state).toBe('fresh'));
    expect(data.status('members')).toMatchObject({ error: null });
    expect(data.status('members').syncedAt).not.toBeNull();
    await flush();
    expect(delivered.slice(before)).toEqual([['1', '2']]);
    expect(seen.slice(-3)).toEqual(['refreshing', 'error', 'fresh']);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(scheduler.runs).toHaveLength(1);
  });

  it('leaves the status to a read begun after it', async () => {
    const scheduler = lateScheduler();
    const { data } = service(scheduler);
    const first = deferred();
    const second = deferred();
    const fetch = vi.fn().mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);
    data.source('members', { fetch });
    const asked = data.refresh('members', { mode: 'visible' });
    await flush();
    scheduler.runs[0].passDeadline();
    await asked.catch(() => {});
    // A later read is on its way when the first one's answer lands.
    data.refresh('members', { mode: 'silent' });
    await flush();
    expect(data.status('members').state).toBe('refreshing');
    first.resolve(rows);
    await flush();
    await flush();
    expect(data.status('members').state).toBe('refreshing');
    second.resolve(rows);
    await vi.waitFor(() => expect(data.status('members').state).toBe('fresh'));
  });

  it('leaves the status failed when what goes on fails', async () => {
    const scheduler = lateScheduler();
    const { data } = service(scheduler);
    let fail;
    data.source('members', { fetch: vi.fn(() => new Promise((_resolve, reject) => { fail = reject; })) });
    const asked = data.refresh('members', { mode: 'visible' });
    await flush();
    scheduler.runs[0].passDeadline();
    await asked.catch(() => {});
    fail(Object.assign(new Error('Bad gateway'), { status: 502 }));
    await flush();
    await flush();
    expect(data.status('members')).toMatchObject({ state: 'error', error: { code: 'REFRESH_TIMEOUT' } });
  });
});

describe('the read guard', () => {
  it('tells the scheduler while it stores an answer it already has', async () => {
    const scheduler = lateScheduler();
    const { data } = service(scheduler);
    const answer = deferred();
    data.source('members', { fetch: vi.fn(() => answer.promise) });
    const asked = data.refresh('members', { mode: 'visible' });
    await flush();
    // Waiting for the server: not storing.
    expect(scheduler.spans).toHaveLength(0);
    answer.resolve(rows);
    await asked;
    expect(scheduler.spans).toEqual([{ began: true, ended: true }]);
  });
});

describe('method statuses', () => {
  it('lists each method read asked, with its params, and leaves batched by-id reads out', async () => {
    const scheduler = lateScheduler();
    const { data } = service(scheduler);
    data.source('members', {
      fetch: vi.fn(async () => rows),
      methods: {
        byRange: { params: { from: { type: 'date' }, to: { type: 'date' } }, fetch: vi.fn(async () => { throw Object.assign(new Error('Too slow'), { code: 'REFRESH_TIMEOUT', retryable: true }); }) },
        byIds: { params: { ids: { type: 'ids' } }, batch: 'ids', fetch: vi.fn(async () => rows) },
      },
    });
    await data.refresh({ collection: 'members', method: 'byRange', params: { from: '2026-10-01', to: '2026-10-08' } }).catch(() => {});
    await data.refresh({ collection: 'members', method: 'byIds', params: { ids: ['1'] } }).catch(() => {});
    const statuses = data.methodStatuses();
    expect(statuses).toHaveLength(1);
    expect(statuses[0]).toMatchObject({
      collection: 'members', method: 'byRange', state: 'error', error: { code: 'REFRESH_TIMEOUT' },
    });
    expect(statuses[0].params).toMatchObject({ from: expect.any(String), to: expect.any(String) });
  });
});
