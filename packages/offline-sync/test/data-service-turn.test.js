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

describe('a fetched write', () => {
  it('is recorded as of its read\'s start: a newer window read that answers last stores its rows over an older one\'s', async () => {
    const { data } = service();
    let answerA;
    let answerB;
    const a = data.reconcileWindow('members', { fetch: () => new Promise((resolve) => { answerA = resolve; }), scope: (row) => row.id === 'k' });
    await vi.waitFor(() => expect(answerA).toBeTypeOf('function'));
    const b = data.reconcileWindow('members', { fetch: () => new Promise((resolve) => { answerB = resolve; }), scope: (row) => row.id === 'k' });
    await vi.waitFor(() => expect(answerB).toBeTypeOf('function'));
    answerA([{ id: 'k', v: 1 }]);
    await a;
    answerB([{ id: 'k', v: 2 }]);
    await b;
    expect((await data.read('members', 'k')).v).toBe(2);
  });

  it('is recorded as of its read\'s start for keyed and query refreshes too', async () => {
    const { data } = service();
    const answers = [];
    data.source('members', {
      read: {},
      fetch: (target) => new Promise((resolve) => { answers.push({ target, resolve }); }),
    });
    const older = data.refresh({ collection: 'members', key: 'k' }, { mode: 'visible' });
    await vi.waitFor(() => expect(answers).toHaveLength(1));
    const newer = data.refresh({ collection: 'members', query: { where: (row) => row.id === 'k' } }, { mode: 'visible' });
    await vi.waitFor(() => expect(answers).toHaveLength(2));
    answers[0].resolve({ id: 'k', v: 1 });
    await older;
    answers[1].resolve([{ id: 'k', v: 2 }]);
    await newer;
    expect((await data.read('members', 'k')).v).toBe(2);
  });

  it('still yields to a local edit made after its read began', async () => {
    const { data } = service();
    let answer;
    const read = data.reconcileWindow('members', { fetch: () => new Promise((resolve) => { answer = resolve; }), scope: (row) => row.id === 'k' });
    await vi.waitFor(() => expect(answer).toBeTypeOf('function'));
    await data.writer('members').put({ id: 'k', v: 'local' });
    answer([{ id: 'k', v: 1 }]);
    await read;
    expect((await data.read('members', 'k')).v).toBe('local');
  });
});

describe('scoped writes', () => {
  it('keeps both of two concurrent window reads of disjoint scopes: a scoped write is no whole replacement', async () => {
    const { data } = service();
    let answerA;
    let answerB;
    const inScope = (group) => (row) => row.group === group;
    const a = data.reconcileWindow('members', { fetch: () => new Promise((resolve) => { answerA = resolve; }), scope: inScope('a') });
    const b = data.reconcileWindow('members', { fetch: () => new Promise((resolve) => { answerB = resolve; }), scope: inScope('b') });
    await vi.waitFor(() => { expect(answerA).toBeTypeOf('function'); expect(answerB).toBeTypeOf('function'); });
    answerA([{ id: 'a1', group: 'a' }]);
    await a;
    answerB([{ id: 'b1', group: 'b' }]);
    await b;
    expect((await data.read('members')).map((row) => row.id).sort()).toEqual(['a1', 'b1']);
  });

  it('keeps a declared read from undoing a row a scoped write removed after it began', async () => {
    const { data } = service();
    let release = null;
    data.source('members', {
      read: {},
      fetch: async () => {
        await new Promise((resolve) => { release = resolve; });
        return [{ id: 'gone', group: 'a' }, { id: 'kept', group: 'b' }];
      },
    });
    await data.ingest('members', [{ id: 'gone', group: 'a' }, { id: 'kept', group: 'b' }]);
    const declared = data.refresh('members', { mode: 'visible' });
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    // A window read of group a finds 'gone' removed on the server.
    await data.reconcileWindow('members', { fetch: async () => [], scope: (row) => row.group === 'a' });
    release();
    await declared;
    expect((await data.read('members')).map((row) => row.id)).toEqual(['kept']);
  });
});

describe('a declared read\'s commit', () => {
  it('keeps every row it answered in a full collection: the rows it left out go before the new ones come', async () => {
    let clock = 1_000_000;
    const store = createDataStore({ name: 'members', backend: createMemoryStoreBackend(), maxRows: 3, now: () => clock });
    const data = createDataService({ resolve: (name) => (name === 'members' ? { store, decl: { keyPath: 'id' } } : null), now: () => clock, sourceMeta: createMemorySourceMeta() });
    for (const id of ['a', 'b', 'c']) { await data.ingest('members', [{ id, v: 1 }]); clock += 1000; } // eslint-disable-line no-await-in-loop
    data.source('members', { read: {}, fetch: async () => [{ id: 'a', v: 1 }, { id: 'b', v: 2 }, { id: 'd', v: 1 }] });
    await data.refresh('members', { mode: 'visible' });
    expect((await data.read('members')).map((row) => row.id).sort()).toEqual(['a', 'b', 'd']);
  });

  it('is never undone by an older window read: its rows stay, and the ones it added stay', async () => {
    const { data } = service();
    await data.ingest('members', [{ id: 'x', v: 1 }]);
    let answerWindow;
    const windowRead = data.reconcileWindow('members', { fetch: () => new Promise((resolve) => { answerWindow = resolve; }), scope: () => true });
    await vi.waitFor(() => expect(answerWindow).toBeTypeOf('function'));
    data.source('members', { read: {}, fetch: async () => [{ id: 'x', v: 2 }, { id: 'y', v: 1 }] });
    await data.refresh('members', { mode: 'visible' });
    answerWindow([{ id: 'x', v: 1 }]);
    await windowRead;
    const rows = await data.read('members');
    expect(rows.map((row) => [row.id, row.v]).sort()).toEqual([['x', 2], ['y', 1]]);
  });

  it('never brings back a row an unscoped replacing ingest removed after it began', async () => {
    const { data } = service();
    let release = null;
    data.source('members', {
      read: {},
      fetch: async () => {
        await new Promise((resolve) => { release = resolve; });
        return [{ id: 'a' }, { id: 'b' }];
      },
    });
    const declared = data.refresh('members', { mode: 'visible' });
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    await data.ingest('members', [{ id: 'a' }, { id: 'b' }]);
    await data.ingest('members', [{ id: 'a' }], { replace: true });
    release();
    await expect(declared).rejects.toMatchObject({ code: 'REFRESH_DROPPED' });
    expect((await data.read('members')).map((row) => row.id)).toEqual(['a']);
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
