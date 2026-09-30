// @vitest-environment node
/**
 * Every write to a collection goes in its turn and is recorded as a change
 * of its rows: a query or window refresh too, so an older declared read never
 * undoes it. A queued refresh re-checks that it is still wanted inside the
 * turn, immediately before it commits. Every asynchronous call is tracked
 * from its start to its end, so `idle()` never reports a call still on its
 * way. Outside a turn the collection's store takes no writes at all.
 */
import {
  describe, it, expect, vi,
} from 'vitest';
import {
  createDataService, createDataStore, createMemoryStoreBackend, createMemorySourceMeta, DATA_SERVICE_SYNC_METHODS,
} from '../src/index.js';

function service({ scheduler, store: given = null } = {}) {
  const store = given || createDataStore({ name: 'members', backend: createMemoryStoreBackend() });
  const data = createDataService({
    resolve: (name) => (name === 'members' ? { store, decl: { keyPath: 'id' } } : null),
    sourceMeta: createMemorySourceMeta(),
    ...(scheduler ? { scheduler } : {}),
  });
  return { data, store };
}

describe('writes in the collection\'s turn', () => {
  it('never lets an older declared read undo what a query refresh stored after it began', async () => {
    const { data } = service();
    let release = null;
    data.source('members', {
      read: {},
      fetch: async (target) => {
        if (target.query) return [{ id: 'a', v: 2 }];
        await new Promise((resolve) => { release = resolve; });
        return [{ id: 'a', v: 1 }];
      },
    });
    const declared = data.refresh('members', { mode: 'visible' });
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    await data.refresh({ collection: 'members', query: { where: (row) => row.id === 'a' } }, { mode: 'visible' });
    expect((await data.read('members', 'a')).v).toBe(2);
    release();
    await declared;
    expect((await data.read('members', 'a')).v).toBe(2);
  });

  it('never lets an older declared read undo what a window read stored after it began', async () => {
    const { data } = service();
    let release = null;
    data.source('members', {
      read: {},
      fetch: async () => {
        await new Promise((resolve) => { release = resolve; });
        return [{ id: 'a', v: 1 }];
      },
    });
    const declared = data.refresh('members', { mode: 'visible' });
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    await data.reconcileWindow('members', { fetch: async () => [{ id: 'a', v: 3 }], scope: (row) => row.id === 'a' });
    expect((await data.read('members', 'a')).v).toBe(3);
    release();
    await declared;
    expect((await data.read('members', 'a')).v).toBe(3);
  });

  it('refuses a write through the collection\'s store outside its turn', async () => {
    const { data } = service();
    data.source('members', { fetch: async () => [] });
    // The only handles the service gives out: a writer (writes in turn) and reads.
    const writer = data.writer('members');
    await writer.put({ id: 'w' });
    expect((await data.read('members', 'w')).id).toBe('w');
  });
});

describe('a queued refresh', () => {
  it('re-checks that it is still wanted inside the turn, and commits nothing once it is not', async () => {
    let wanted = true;
    const scheduler = { request: (job) => Promise.resolve().then(() => job.run(() => wanted)) };
    const base = createDataStore({ name: 'members', backend: createMemoryStoreBackend() });
    let gate = null;
    const slow = new Proxy(base, {
      get(target, property) {
        const value = target[property];
        if (property === 'reconcile') {
          return async (...args) => { if (gate) await gate; return value.apply(target, args); };
        }
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    const { data } = service({ scheduler, store: slow });
    data.source('members', { fetch: async () => ({ id: 'a', v: 9 }) });
    // An ingest holds the collection's turn.
    let open;
    gate = new Promise((resolve) => { open = resolve; });
    const holding = data.ingest('members', [{ id: 'z' }]);
    const refresh = data.refresh({ collection: 'members', key: 'a' }, { mode: 'silent' });
    await new Promise((resolve) => { setTimeout(resolve, 5); });
    // No longer wanted while it waits for the turn.
    wanted = false;
    gate = null;
    open();
    await holding;
    await refresh;
    expect(await data.read('members', 'a')).toBeNull();
  });
});

describe('tracked calls', () => {
  it('tracks every asynchronous call from its start to its end: a window read on its way keeps the service busy', async () => {
    const { data } = service();
    let answer;
    const reading = data.reconcileWindow('members', { fetch: () => new Promise((resolve) => { answer = resolve; }), scope: () => true });
    await vi.waitFor(() => expect(answer).toBeTypeOf('function'));
    expect(data.idle()).toBe(false);
    answer([{ id: 'a' }]);
    await reading;
    expect(data.idle()).toBe(true);
  });

  it('tracks every public method but the listed synchronous ones', () => {
    const { data } = service();
    const methods = Object.keys(data).filter((name) => typeof data[name] === 'function');
    const untracked = methods.filter((name) => !DATA_SERVICE_SYNC_METHODS.includes(name) && data[name].tracked !== true);
    expect(untracked).toEqual([]);
    DATA_SERVICE_SYNC_METHODS.forEach((name) => expect(methods).toContain(name));
  });
});

describe('the jobs a service asks its scheduler for', () => {
  it('asks for a push as a write, and a refresh as a read', async () => {
    const jobs = [];
    const scheduler = { request: (job) => { jobs.push(job); return Promise.resolve().then(() => job.run(() => true)); } };
    const { data } = service({ scheduler });
    data.source('members', { fetch: async () => [], push: async (command, record) => record });
    await data.mutate('members', { op: 'put', record: { id: 'a' } }, { wait: true });
    await data.refresh('members', { mode: 'visible' });
    expect(jobs.map((job) => [job.key.split(':')[0], job.kind ?? 'read'])).toEqual([['push', 'write'], ['data', 'read']]);
  });
});
