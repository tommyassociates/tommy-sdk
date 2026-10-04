// @vitest-environment node
/**
 * The data service's pushes and reads, for sources and `mutate`: local
 * changes are never overwritten, lost or sent stale; a refusal for access is
 * kept on the row; removals and a principal switch fence queued changes;
 * queries page and refuse what they cannot honour; results carry no storage
 * metadata and never hand out a live row.
 */
import { describe, it, expect, vi } from 'vitest';
import { createDataService, createDataStore, createMemoryStoreBackend } from '../src/index.js';
import { createHostStoreChangeFeed } from '../src/host-store/index.js';

const settle = () => new Promise((resolve) => { setTimeout(resolve, 0); });
const INDEXES = { byChat: ['chat_id', 'seq'] };

/** A service over one memory collection; `store` can be shared between services (two tabs, a restart). */
function service({ store = createDataStore({ name: 'items', backend: createMemoryStoreBackend(), indexes: INDEXES }), ...options } = {}) {
  const data = createDataService({ resolve: (name) => (name === 'items' ? { store, decl: { keyPath: 'id' } } : null), ...options });
  return { data, store };
}
/** A scheduler that holds each run until released. */
function heldScheduler() {
  const held = [];
  return {
    held,
    request(job) { return new Promise((resolve, reject) => { held.push(() => Promise.resolve(job.run(() => true)).then(resolve, reject)); }); },
    releaseAll() { held.splice(0).forEach((run) => run()); },
  };
}
/** A scheduler that holds every run until released, and runs a failed run once more, as the host's retries do. */
function retryingScheduler() {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  return {
    release: () => release(),
    async request(job) {
      await gate;
      try { return await job.run(() => true); } catch (_) { return job.run(() => true); }
    },
  };
}
/** How `promise` settled within `ms`: `{ value }`, `{ error }`, or 'unsettled'. */
const outcome = (promise, ms = 200) => Promise.race([promise.then((value) => ({ value }), (error) => ({ error })),
  new Promise((resolve) => { setTimeout(() => resolve('unsettled'), ms); })]);

describe('sources never overwrite or lose local changes', () => {
  it('keeps a row with an unsent local change through a list refresh and a keyed refresh', async () => {
    const { data } = service();
    const pushes = [];
    data.source('items', {
      fetch: async (target) => (target.key ? { id: 'a', v: 'server-key' } : [{ id: 'a', v: 'server' }, { id: 'b', v: 'server' }]),
      push: async (command) => { pushes.push(command); throw Object.assign(new Error('Offline'), { status: 0 }); },
    });
    await data.mutate('items', { op: 'put', record: { id: 'a', v: 'local' } });
    await settle();
    await data.refresh('items', { mode: 'visible' });
    expect((await data.read('items', 'a')).v).toBe('local');
    await data.refresh({ collection: 'items', key: 'a' }, { mode: 'visible' });
    expect((await data.read('items', 'a')).v).toBe('local');
    expect((await data.read('items', 'b')).v).toBe('server');
  });

  it('never deletes a row the server no longer has while a local change to it lands', async () => {
    const shared = createDataStore({ name: 'items', backend: createMemoryStoreBackend(), indexes: INDEXES });
    await shared.reconcile([{ id: 'a', v: 'server' }], { prune: false });
    let first = true;
    const store = new Proxy(shared, {
      get(target, prop) {
        if (prop !== 'getRaw') return target[prop];
        return async (key) => {
          const row = await target.getRaw(key);
          // A local change lands while the refresh holds its first look at the row.
          if (first) { first = false; await target.put({ id: 'a', v: 'local' }); }
          return row;
        };
      },
    });
    const { data } = service({ store });
    data.source('items', { fetch: async () => null });
    await data.refresh({ collection: 'items', key: 'a' }, { mode: 'visible' });
    expect((await data.read('items', 'a'))?.v).toBe('local');
  });
});

describe('a local delete waiting to be sent', () => {
  it('is kept as a hidden, unsent tombstone that a restart sends again, and leaves once sent', async () => {
    const { data, store } = service();
    await store.reconcile([{ id: 'a', v: 'server' }], { prune: false });
    const offline = vi.fn(async () => { throw Object.assign(new Error('Offline'), { status: 0 }); });
    data.source('items', { fetch: async () => [], push: offline });
    await data.mutate('items', { op: 'delete', key: 'a' });
    await settle();
    // Hidden from every read, kept for the push.
    expect(await data.read('items', 'a')).toBeNull();
    expect(await data.read('items')).toEqual([]);
    expect((await store.getRaw('a'))._dirty).toBe(true);
    // The service is rebuilt (a reload): the delete goes out again.
    data.dispose();
    const sent = [];
    const next = service({ store }).data;
    next.source('items', { fetch: async () => [], push: async (command) => { sent.push(command); } });
    await vi.waitFor(() => expect(sent).toEqual([{ op: 'delete', key: 'a' }]));
    await vi.waitFor(async () => expect(await store.getRaw('a')).toBeUndefined());
  });
});

describe('a service for one account among several', () => {
  it('reads and sends with its own principal, in its own lane, and behind the displayed account when it is not displayed', async () => {
    const principal = { viewerId: '7', accountType: 'Team', accountId: '44', partnerId: null, partnerCode: null };
    const jobs = [];
    let displayed = true;
    const scheduler = { request(job) { jobs.push(job); return Promise.resolve(job.run(() => true)); } };
    const { data } = service({ principal, lane: 'team-44', foreground: () => displayed, scheduler });
    const contexts = [];
    data.source('items', {
      fetch: async (target, context) => { contexts.push(['fetch', context]); return [{ id: 'a', v: 'server' }]; },
      push: async (command, record, context) => { contexts.push(['push', context]); },
    });
    await data.refresh('items', { mode: 'visible' });
    await data.mutate('items', { op: 'put', record: { id: 'b', v: 'local' } }, { wait: true });
    expect(contexts).toEqual([['fetch', { principal, background: true }], ['push', { principal, background: true }]]);
    expect(jobs.map((job) => [job.key.split(':')[1], job.target])).toEqual([['team-44', 'team-44|items'], ['team-44', 'push:team-44|items']]);
    expect(jobs[0]).toMatchObject({ visible: true, priority: 2 });
    // Another account is displayed now: this one's work waits behind it.
    displayed = false;
    jobs.length = 0;
    await data.refresh('items', { mode: 'visible' });
    expect(jobs[0]).toMatchObject({ visible: false, priority: 3 });
  });
});

describe('whether a service is idle', () => {
  it('is idle only with no unsent change in memory and no read on its way', async () => {
    const scheduler = heldScheduler();
    const { data } = service({ scheduler });
    let answer;
    data.source('items', {
      fetch: () => new Promise((resolve) => { answer = () => resolve([]); }),
      push: async () => {},
    });
    // The restore of unsent rows the push started counts too, until it ends.
    await vi.waitFor(() => expect(data.idle()).toBe(true));
    const read = data.refresh('items', { mode: 'visible' });
    expect(data.idle()).toBe(false);
    scheduler.releaseAll();
    await vi.waitFor(() => expect(answer).toBeTypeOf('function'));
    answer();
    await read;
    expect(data.idle()).toBe(true);
    const sent = data.mutate('items', { op: 'put', record: { id: 'a' } }, { wait: true });
    await vi.waitFor(() => expect(scheduler.held.length).toBe(1));
    expect(data.idle()).toBe(false);
    scheduler.releaseAll();
    await sent;
    expect(data.idle()).toBe(true);
  });

  it('is not idle while a local write, an ingest or a read is on its way', async () => {
    const store = createDataStore({ name: 'items', backend: createMemoryStoreBackend(), indexes: INDEXES });
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const slow = new Proxy(store, {
      get(target, property) {
        if (['put', 'reconcile', 'getAll', 'getAllRaw'].includes(property)) {
          return async (...args) => { await gate; return target[property](...args); };
        }
        const value = target[property];
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    const { data } = service({ store: slow });
    data.source('items', { fetch: async () => [], push: async () => {} });
    await vi.waitFor(() => expect(data.idle()).toBe(false));
    const write = data.mutate('items', { op: 'put', record: { id: 'a' } });
    const ingest = data.ingest('items', [{ id: 'b' }]);
    const read = data.read('items');
    expect(data.idle()).toBe(false);
    release();
    await Promise.all([write, ingest, read]);
    await vi.waitFor(() => expect(data.idle()).toBe(true));
  });
});

describe('a change restored after a restart', () => {
  it('is sent as the row is when it goes out, and not at all once another tab sent it', async () => {
    const { store } = service();
    await store.put({ id: 'a', v: 'unsent' });
    const scheduler = heldScheduler();
    const { data } = service({ store, scheduler });
    const push = vi.fn(async () => {});
    data.source('items', { fetch: async () => [], push });
    await vi.waitFor(() => expect(scheduler.held.length).toBe(1));
    // Another tab sends it first: its push acknowledges the row.
    await store.markSynced('a', { pushed: true });
    scheduler.releaseAll();
    await settle(); await settle();
    expect(push).not.toHaveBeenCalled();
    expect(data.pending()).toEqual([]);
  });
});

describe('fencing queued changes', () => {
  it('drops a change another service in this tab queued for a row this service force-removes', async () => {
    const feed = createHostStoreChangeFeed({ BroadcastChannelImpl: null });
    const store = createDataStore({ name: 'items', backend: createMemoryStoreBackend(), indexes: INDEXES });
    const host = service({ store, feed }).data;
    const mp = service({ store, feed }).data;
    mp.source('items', { fetch: async () => [], push: async () => { throw Object.assign(new Error('Server'), { status: 500 }); } });
    await mp.mutate('items', { op: 'put', record: { id: 'a', v: 'local' } });
    await settle();
    expect(mp.pending().map((entry) => entry.key)).toEqual(['a']);
    await host.purge('items', { keys: ['a'], force: true });
    feed.publish({ type: 'purge', principal: 'p', store: 's', keys: ['a'] });
    await vi.waitFor(() => expect(mp.pending()).toEqual([]));
    feed.close();
  });

  it('fences every queued change on a principal switch, leaving the rows unsent on disk', async () => {
    const { data, store } = service();
    data.source('items', { fetch: async () => [], push: async () => { throw Object.assign(new Error('Server'), { status: 500 }); } });
    await data.mutate('items', { op: 'put', record: { id: 'a', v: 'local' } });
    await settle();
    expect(data.pending()).toHaveLength(1);
    data.fence();
    expect(data.pending()).toEqual([]);
    expect((await store.getRaw('a'))._dirty).toBe(true);
  });
});

describe('a push refused for access', () => {
  it('is kept on the row, so a restart lists it as access changed and does not send it until asked', async () => {
    const { data, store } = service();
    data.source('items', { fetch: async () => [], push: async () => { throw Object.assign(new Error('Forbidden'), { status: 403 }); } });
    await data.mutate('items', { op: 'put', record: { id: 'a', v: 'local' } });
    await vi.waitFor(() => expect(data.pending()[0]?.state).toBe('access_changed'));
    data.dispose();
    const push = vi.fn(async () => {});
    const next = service({ store }).data;
    next.source('items', { fetch: async () => [], push });
    await vi.waitFor(() => expect(next.pending().map((entry) => [entry.key, entry.state])).toEqual([['a', 'access_changed']]));
    expect(push).not.toHaveBeenCalled();
    // Only an explicit retry sends it again.
    await next.retry('items', 'a');
    expect(push).toHaveBeenCalledTimes(1);
    await vi.waitFor(async () => expect((await store.getRaw('a'))._dirty).toBe(false));
  });

  it('stays refused through later edits: they stay unsent until a retry, which sends the latest state once', async () => {
    const { data, store } = service();
    const pushes = [];
    let refuse = true;
    data.source('items', {
      fetch: async () => [],
      push: async (command) => {
        pushes.push(command);
        if (refuse) throw Object.assign(new Error('Forbidden'), { status: 403 });
      },
    });
    await data.mutate('items', { op: 'put', record: { id: 'a', v: 'first' } });
    await vi.waitFor(() => expect(data.pending()[0]?.state).toBe('access_changed'));
    // A later edit of the refused row is kept on the device, unsent, with it.
    const later = data.mutate('items', { op: 'patch', key: 'a', patch: { v: 'second' } }, { wait: true });
    await expect(later).rejects.toBeTruthy();
    await settle();
    expect(pushes).toHaveLength(1);
    expect(data.pending().map((entry) => [entry.key, entry.state])).toEqual([['a', 'access_changed']]);
    expect(await store.getRaw('a')).toMatchObject({ v: 'second', _dirty: true, _pushRefused: 'access' });
    // A restart lists it as refused and sends nothing.
    data.dispose();
    const next = service({ store }).data;
    next.source('items', { fetch: async () => [], push: async (command) => { pushes.push(command); } });
    await vi.waitFor(() => expect(next.pending().map((entry) => entry.state)).toEqual(['access_changed']));
    expect(pushes).toHaveLength(1);
    // Asked: one push, of the latest state.
    refuse = false;
    await next.retry('items', 'a');
    expect(pushes).toHaveLength(2);
    expect(pushes[1]).toMatchObject({ op: 'put', record: { id: 'a', v: 'second' } });
  });

  it('sends a refused row once, as it is now, when retried in the same session after later edits', async () => {
    const { data } = service();
    const pushes = [];
    let refuse = true;
    data.source('items', {
      fetch: async () => [],
      push: async (command) => { pushes.push(command); if (refuse) throw Object.assign(new Error('Forbidden'), { status: 403 }); },
    });
    await data.mutate('items', { op: 'put', record: { id: 'a', v: 'first' } });
    await vi.waitFor(() => expect(data.pending()[0]?.state).toBe('access_changed'));
    await data.mutate('items', { op: 'patch', key: 'a', patch: { v: 'second' } });
    await data.mutate('items', { op: 'patch', key: 'a', patch: { v: 'third' } });
    await settle();
    expect(pushes).toHaveLength(1);
    refuse = false;
    await data.retry('items', 'a');
    expect(pushes).toHaveLength(2);
    expect(pushes[1]).toMatchObject({ op: 'put', record: { id: 'a', v: 'third' } });
    expect(data.pending()).toEqual([]);
  });

  it('retries only failed changes when asked to retry failures', async () => {
    const { data } = service();
    let fail = true;
    const push = vi.fn(async () => { if (fail) throw Object.assign(new Error('Server'), { status: 500 }); });
    data.source('items', { fetch: async () => [], push });
    await data.mutate('items', { op: 'put', record: { id: 'a', v: 'local' } });
    await vi.waitFor(() => expect(data.pending()[0]?.state).toBe('failed'));
    fail = false;
    await data.retryFailed();
    await vi.waitFor(() => expect(data.pending()).toEqual([]));
  });
});

describe('queries', () => {
  it('refuses a row filter it cannot apply to an index read, and pages a read without an index', async () => {
    const { data } = service();
    await data.ingest('items', ['e', 'c', 'a', 'd', 'b'].map((id) => ({ id, chat_id: 7, seq: 1 })));
    await expect(data.query('items', { index: 'byChat', prefix: [7], where: () => true })).rejects.toMatchObject({ code: 'DATA_INVALID' });
    const first = await data.query('items', { limit: 2 });
    expect(first.rows.map((row) => row.id)).toEqual(['a', 'b']);
    expect(first.complete).toBe(false);
    const second = await data.query('items', { limit: 2, cursor: first.nextCursor });
    expect(second.rows.map((row) => row.id)).toEqual(['c', 'd']);
    const last = await data.query('items', { limit: 2, cursor: second.nextCursor, where: (row) => row.id !== 'z' });
    expect(last).toMatchObject({ rows: [expect.objectContaining({ id: 'e' })], nextCursor: null, complete: true });
    expect(() => data.subscribe({ collection: 'items', query: { index: 'byChat', prefix: [7], where: () => true } }, () => {}))
      .toThrow(expect.objectContaining({ code: 'DATA_INVALID' }));
  });

  it('prunes only the rows of the query a refresh read, never the rest of the collection', async () => {
    const { data } = service();
    await data.ingest('items', [{ id: 'x', chat_id: 7, seq: 1 }, { id: 'y', chat_id: 8, seq: 1 }]);
    data.source('items', { fetch: async () => [{ id: 'z', chat_id: 7, seq: 2 }] });
    await data.refresh({ collection: 'items', query: { index: 'byChat', prefix: [7] } }, { mode: 'visible' });
    expect((await data.read('items')).map((row) => row.id).sort()).toEqual(['y', 'z']);
  });
});

describe('an unsent delete in a memory or browser-storage store', () => {
  it('reaches subscribers as the row gone, never as a key-only row', async () => {
    const { data, store } = service();
    await store.reconcile([{ id: 'a', v: 'server' }, { id: 'b', v: 'server' }], { prune: false });
    data.source('items', { fetch: async () => [], push: async () => { throw Object.assign(new Error('Offline'), { status: 0 }); } });
    const whole = [];
    store.subscribe((rows) => whole.push(rows.map((row) => row.id)));
    const picked = [];
    store.subscribeQuery((q) => q.get('a')?.v ?? null, (value) => picked.push(value));
    await settle();
    await data.mutate('items', { op: 'delete', key: 'a' });
    await settle();
    expect(whole.at(-1)).toEqual(['b']);
    expect(picked.at(-1)).toBeNull();
    expect((await store.getAll()).map((row) => row.id)).toEqual(['b']);
  });
});

describe('refreshing a query target without an index', () => {
  it('fetches, and prunes only the rows the query selects', async () => {
    const { data } = service();
    await data.ingest('items', [{ id: 'x', chat_id: 7, seq: 1 }, { id: 'y', chat_id: 8, seq: 1 }]);
    data.source('items', { fetch: async () => [{ id: 'z', chat_id: 7, seq: 2 }] });
    const target = { collection: 'items', query: { where: (row) => row.chat_id === 7 } };
    await data.refresh(target, { mode: 'visible' });
    expect((await data.read('items')).map((row) => row.id).sort()).toEqual(['y', 'z']);
  });

  it('keeps queries with different predicates apart: each fetches, each has its own status', async () => {
    const { data } = service();
    const fetched = [];
    data.source('items', { fetch: async (target) => { fetched.push(target.query.where({ chat_id: 7 })); return []; } });
    const seven = { collection: 'items', query: { where: (row) => row.chat_id === 7 } };
    const eight = { collection: 'items', query: { where: (row) => row.chat_id === 8 } };
    await Promise.all([data.refresh(seven, { mode: 'visible' }), data.refresh(eight, { mode: 'visible' })]);
    expect(fetched.sort()).toEqual([false, true]);
    expect(data.status(seven).state).toBe('fresh');
    expect(data.status({ collection: 'items', query: { where: (row) => row.chat_id === 9 } }).state).toBe('stale');
  });
});

describe('a complete ingest', () => {
  it('marks the collection fresh, as a replacing one does', async () => {
    const { data } = service();
    expect(data.status('items').state).toBe('stale');
    await data.ingest('items', [{ id: 'a', chat_id: 7, seq: 1 }], { complete: true });
    expect(data.status('items')).toMatchObject({ state: 'fresh', syncedAt: expect.any(Number) });
    const partial = service().data;
    await partial.ingest('items', [{ id: 'a', chat_id: 7, seq: 1 }]);
    expect(partial.status('items')).toMatchObject({ state: 'stale', syncedAt: null });
  });
});

describe('a whole-collection read', () => {
  it('stops at its byte budget when it has to page, as a complete read does', async () => {
    const MiB = 1024 * 1024;
    const rows = Array.from({ length: 40 }, (_, index) => ({ key: `r${index}`, value: { id: `r${index}` }, revision: 1, bytes: MiB }));
    // A backend whose complete read refuses (too large) and pages 10 rows at a time.
    const backend = {
      transactional: true, policy: 'authored', limits: { maxRows: 50000 },
      async getAll() { throw Object.assign(new Error('scan-required'), { name: 'StorageReadError', reason: 'scan-required' }); },
      async page({ afterKey = null }) {
        const start = afterKey === null ? 0 : rows.findIndex((row) => row.key === afterKey) + 1;
        const slice = rows.slice(start, start + 10);
        return { epoch: 1, storeRevision: 1, rows: slice, nextKey: start + 10 < rows.length ? slice.at(-1).key : null };
      },
      async get() { return undefined; },
      async snapshot() { return { epoch: 1, storeRevision: 1, rows: [], nextKey: null }; },
      async commit() { return { ok: true, epoch: 1, storeRevision: 2 }; },
      async close() {},
    };
    const store = createDataStore({ name: 'items', backend });
    await expect(store.getAll()).rejects.toMatchObject({ reason: 'scan-required' });
    rows.splice(20);
    expect(await store.getAll()).toHaveLength(20);
  });
});

describe('results', () => {
  it('carry no storage metadata and are copies, never the stored rows', async () => {
    const { data } = service();
    await data.ingest('items', [{ id: 'a', chat_id: 7, seq: 1, nested: { n: 1 } }]);
    const read = await data.read('items', 'a');
    expect(Object.keys(read).filter((field) => field.startsWith('_'))).toEqual([]);
    read.nested.n = 99;
    const [listed] = await data.read('items');
    expect(listed.nested.n).toBe(1);
    const { rows } = await data.query('items', { index: 'byChat', prefix: [7] });
    expect(Object.keys(rows[0]).filter((field) => field.startsWith('_'))).toEqual([]);
    const seen = [];
    const off = data.subscribe('items', (value) => seen.push(value));
    await settle();
    off();
    expect(Object.keys(seen[0][0]).filter((field) => field.startsWith('_'))).toEqual([]);
    // Writers asking for the raw view still get what is stored.
    const [raw] = await data.read('items', null, { raw: true });
    expect(raw).toHaveProperty('_rev');
  });
});

describe('fencing, cleanup after a sent delete, and queued deletes', () => {
  it('never sends a change the scheduler held once the outbox is fenced', async () => {
    const scheduler = heldScheduler();
    const { data } = service({ scheduler });
    const push = vi.fn(async () => {});
    data.source('items', { fetch: async () => [], push });
    await data.mutate('items', { op: 'put', record: { id: 'a', v: 'local' } });
    await vi.waitFor(() => expect(scheduler.held.length).toBe(1));
    data.fence();
    scheduler.releaseAll();
    await settle(); await settle();
    expect(push).not.toHaveBeenCalled();
  });

  it('never removes a newer row after sending a delete of a key it held no row for', async () => {
    const { data, store } = service();
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    data.source('items', { fetch: async () => [], push: async (command) => { if (command.op === 'delete') await gate; } });
    const sent = data.mutate('items', { op: 'delete', key: 'k' }, { wait: true });
    await settle();
    // A new row for the key lands while the delete is on its way.
    await store.put({ id: 'k', v: 'new' });
    release();
    await sent;
    expect(await store.getRaw('k')).toMatchObject({ v: 'new', _dirty: true });
  });

  it('leaves a newer row in place after a delete whose tombstone was replaced', async () => {
    const { data, store } = service();
    await store.reconcile([{ id: 'a', v: 'server' }], { prune: false });
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    data.source('items', { fetch: async () => [], push: async (command) => { if (command.op === 'delete') await gate; } });
    const sent = data.mutate('items', { op: 'delete', key: 'a' }, { wait: true });
    await settle();
    await store.put({ id: 'a', v: 'again' });
    release();
    await sent;
    expect(await store.getRaw('a')).toMatchObject({ v: 'again', _dirty: true });
  });

  it('drops a queued delete whose tombstone was force-removed, so no retry sends it', async () => {
    const feed = createHostStoreChangeFeed({ BroadcastChannelImpl: null });
    const store = createDataStore({ name: 'items', backend: createMemoryStoreBackend(), indexes: INDEXES });
    await store.reconcile([{ id: 'a', v: 'server' }], { prune: false });
    const host = service({ store, feed }).data;
    const mp = service({ store, feed }).data;
    const push = vi.fn(async () => { throw Object.assign(new Error('Server'), { status: 500 }); });
    mp.source('items', { fetch: async () => [], push });
    await mp.mutate('items', { op: 'delete', key: 'a' });
    await vi.waitFor(() => expect(mp.pending()[0]?.state).toBe('failed'));
    await host.purge('items', { keys: ['a'], force: true });
    feed.publish({ type: 'purge', principal: 'p', store: 's', keys: ['a'] });
    await vi.waitFor(() => expect(mp.pending()).toEqual([]));
    push.mockClear();
    await mp.retryFailed();
    expect(push).not.toHaveBeenCalled();
    feed.close();
  });

  it('discards a change made just before the discard, in turn with it, and never sends it', async () => {
    const { data, store } = service();
    const push = vi.fn(async () => {});
    data.source('items', { fetch: async () => [], push });
    const writing = data.mutate('items', { op: 'put', record: { id: 'a', v: 'local' } });
    const discarding = data.discard('items', 'a');
    await Promise.all([writing, discarding]);
    await settle(); await settle();
    expect(push).not.toHaveBeenCalled();
    expect(await store.getRaw('a')).toBeUndefined();
    expect(data.pending()).toEqual([]);
  });

  it('sends a restored change as the row is, and settles the edits queued behind it with that one send', async () => {
    const { store } = service();
    await store.put({ id: 'a', v: 'A' });
    const scheduler = heldScheduler();
    const { data } = service({ store, scheduler });
    const sent = [];
    data.source('items', { fetch: async () => [], push: async (command) => { sent.push(command.record?.v); } });
    await vi.waitFor(() => expect(scheduler.held.length).toBe(1));
    // Two newer edits are queued behind the restored change.
    const b = data.mutate('items', { op: 'put', record: { id: 'a', v: 'B' } }, { wait: true });
    const c = data.mutate('items', { op: 'put', record: { id: 'a', v: 'C' } }, { wait: true });
    await settle();
    scheduler.releaseAll();
    await vi.waitFor(async () => expect(await Promise.all([b, c])).toEqual([{ key: 'a', pushed: true }, { key: 'a', pushed: true }]));
    scheduler.releaseAll();
    await settle(); await settle();
    expect(sent).toEqual(['C']);
    expect((await store.getRaw('a'))).toMatchObject({ v: 'C', _dirty: false });
  });

  it('keeps every edit queued behind a restored change unsent when that send fails', async () => {
    const { store } = service();
    await store.put({ id: 'a', v: 'A' });
    const scheduler = heldScheduler();
    const { data } = service({ store, scheduler });
    data.source('items', { fetch: async () => [], push: async () => { throw Object.assign(new Error('Server'), { status: 500 }); } });
    await vi.waitFor(() => expect(scheduler.held.length).toBe(1));
    const b = data.mutate('items', { op: 'put', record: { id: 'a', v: 'B' } }, { wait: true });
    await settle();
    scheduler.releaseAll();
    await expect(b).rejects.toMatchObject({ status: 500 });
    expect((await store.getRaw('a'))).toMatchObject({ v: 'B', _dirty: true });
  });

  it('never sends a change the row has moved past once another tab synced the newer state', async () => {
    const { store } = service();
    const scheduler = heldScheduler();
    const { data: first } = service({ store, scheduler });
    const firstSent = [];
    first.source('items', { fetch: async () => [], push: async (command) => { firstSent.push(command.record?.v); } });
    const queued = first.mutate('items', { op: 'put', record: { id: 'a', v: 'B' } }, { wait: true });
    await vi.waitFor(() => expect(scheduler.held.length).toBe(1));
    // Another tab sends that row, then a newer edit of its own.
    const { data: second } = service({ store });
    const secondSent = [];
    second.source('items', { fetch: async () => [], push: async (command) => { secondSent.push(command.record?.v); } });
    await vi.waitFor(async () => expect((await store.getRaw('a'))._dirty).toBe(false));
    await second.mutate('items', { op: 'put', record: { id: 'a', v: 'C' } }, { wait: true });
    expect(secondSent).toEqual(['B', 'C']);
    scheduler.releaseAll();
    expect(await outcome(queued)).toEqual({ value: { key: 'a', pushed: false } });
    expect(firstSent).toEqual([]);
    expect(await store.getRaw('a')).toMatchObject({ v: 'C', _dirty: false });
  });

  it('sends an edit whose row a server read overwrote, never taking the overwrite for its acknowledgement', async () => {
    const { data, store } = service();
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const sent = [];
    data.source('items', { fetch: async () => [], push: async (command) => { if (!sent.length) await gate; sent.push(command.record?.v); } });
    await data.mutate('items', { op: 'put', record: { id: 'a', v: 'one' } });
    const second = data.mutate('items', { op: 'put', record: { id: 'a', v: 'two' } }, { wait: true });
    await settle();
    // An MP's own reconcile stores the server's row over the unsent edit.
    await store.reconcile([{ id: 'a', v: 'server' }], { prune: false });
    release();
    expect(await outcome(second)).toEqual({ value: { key: 'a', pushed: true } });
    expect(sent).toEqual(['one', 'two']);
    expect(data.pending()).toEqual([]);
  });

  it('sends a restored change whose row a server read overwrote or a purge removed, and skips one a push acknowledged', async () => {
    const { store } = service();
    // Unsent changes from an earlier session.
    await store.put({ id: 'a', v: 'A' });
    await store.put({ id: 'b', v: 'B' });
    await store.put({ id: 'c', v: 'C' });
    const scheduler = heldScheduler();
    const { data } = service({ store, scheduler });
    const sent = [];
    data.source('items', { fetch: async () => [], push: async (command) => { sent.push(command.record?.v); } });
    await vi.waitFor(() => expect(scheduler.held.length).toBe(3));
    // A server read stores its copy over a and c (acknowledging neither), c is
    // then removed as a clean row, and another tab's push acknowledges b.
    await store.reconcile([{ id: 'a', v: 'server' }, { id: 'c', v: 'server' }], { prune: false });
    await store.delete('c');
    await store.markSynced('b', { pushed: true });
    scheduler.releaseAll();
    await vi.waitFor(() => expect(data.pending()).toEqual([]));
    expect(sent.sort()).toEqual(['A', 'C']);
  });

  it('never reports a push the server acknowledged as failed when its store was retired meanwhile, nor sends it again', async () => {
    const store = createDataStore({ name: 'items', backend: createMemoryStoreBackend(), indexes: INDEXES });
    const failures = [];
    // A scheduler that runs a failed job again, as the host's does.
    const scheduler = {
      async request(job) {
        try { return await job.run(() => true); } catch (error) { failures.push(error); return job.run(() => true); }
      },
    };
    const { data } = service({ store, scheduler });
    let answer;
    const push = vi.fn(() => new Promise((resolve) => { answer = resolve; }));
    data.source('items', { fetch: async () => [], push });
    const sent = data.mutate('items', { op: 'put', record: { id: 'a', v: 'one' } }, { wait: true });
    await vi.waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    await store.dispose();
    answer();
    expect(await outcome(sent)).toEqual({ value: { key: 'a', pushed: true } });
    expect(failures).toEqual([]);
    expect(push).toHaveBeenCalledTimes(1);
  });

  it('keeps the edits a restored change carries through a rerun of its send, and settles them with it', async () => {
    const { store } = service();
    await store.put({ id: 'a', v: 'A' });
    const scheduler = retryingScheduler();
    const { data } = service({ store, scheduler });
    let attempts = 0;
    const sent = [];
    data.source('items', { fetch: async () => [], push: async (command) => {
      attempts += 1;
      if (attempts === 1) throw Object.assign(new Error('Busy'), { status: 503 });
      sent.push(command.record?.v);
    } });
    await vi.waitFor(() => expect(data.pending()[0]?.restored).toBe(true));
    const b = data.mutate('items', { op: 'put', record: { id: 'a', v: 'B' } }, { wait: true });
    await settle();
    scheduler.release();
    expect(await outcome(b)).toEqual({ value: { key: 'a', pushed: true } });
    expect(sent).toEqual(['B']);
    expect(await store.getRaw('a')).toMatchObject({ v: 'B', _dirty: false });
  });

  it('rejects the edits a restored change carries when the outbox is fenced while it is sent', async () => {
    const { store } = service();
    await store.put({ id: 'a', v: 'A' });
    const scheduler = heldScheduler();
    const { data } = service({ store, scheduler });
    let answer = null;
    data.source('items', { fetch: async () => [], push: () => new Promise((resolve) => { answer = resolve; }) });
    await vi.waitFor(() => expect(scheduler.held.length).toBe(1));
    const b = data.mutate('items', { op: 'put', record: { id: 'a', v: 'B' } }, { wait: true });
    await settle();
    scheduler.releaseAll();
    await vi.waitFor(() => expect(answer).toBeTypeOf('function'));
    data.fence();
    answer();
    expect(await outcome(b)).toEqual({ error: expect.objectContaining({ code: 'DATA_FENCED' }) });
  });

  it('rejects the changes still queued when the service is disposed, and leaves them unsent on disk', async () => {
    const { data, store } = service();
    let answer = null;
    data.source('items', { fetch: async () => [], push: () => new Promise((resolve) => { answer = resolve; }) });
    const first = data.mutate('items', { op: 'put', record: { id: 'a', v: 'A' } }, { wait: true });
    await vi.waitFor(() => expect(answer).toBeTypeOf('function'));
    const second = data.mutate('items', { op: 'put', record: { id: 'a', v: 'B' } }, { wait: true });
    await settle();
    data.dispose();
    answer();
    expect(await outcome(second)).toEqual({ error: expect.objectContaining({ code: 'DATA_FENCED' }) });
    await outcome(first);
    expect(await store.getRaw('a')).toMatchObject({ v: 'B', _dirty: true });
  });

  it('never queues a change whose local write was still running when the outbox was fenced', async () => {
    const { data, store } = service();
    const push = vi.fn(async () => {});
    data.source('items', { fetch: async () => [], push });
    const writing = data.mutate('items', { op: 'put', record: { id: 'a', v: 'local' } });
    data.fence();
    await writing;
    await settle(); await settle();
    expect(push).not.toHaveBeenCalled();
    expect(data.pending()).toEqual([]);
    expect((await store.getRaw('a'))._dirty).toBe(true);
  });

  it('keeps a queued delete for a key that never had a row when an unrelated purge lands', async () => {
    const feed = createHostStoreChangeFeed({ BroadcastChannelImpl: null });
    const { data } = service({ feed });
    data.source('items', { fetch: async () => [], push: async () => { throw Object.assign(new Error('Server'), { status: 500 }); } });
    await data.mutate('items', { op: 'delete', key: 'never-held' });
    await vi.waitFor(() => expect(data.pending()[0]?.state).toBe('failed'));
    feed.publish({ type: 'purge', principal: 'p', store: 's', keys: ['other'] });
    await settle(); await settle();
    expect(data.pending().map((entry) => entry.key)).toEqual(['never-held']);
    feed.close();
  });
});

describe('a restored change refused for access while it waited', () => {
  it('is not sent, stays refused through its wait, and goes only when a person retries', async () => {
    const store = createDataStore({ name: 'items', backend: createMemoryStoreBackend(), indexes: INDEXES });
    // An unsent row from before this service (a reload): restored as a change.
    await store.put({ id: 'd1', chat_id: 7, seq: 1, v: 'draft' });
    const scheduler = heldScheduler();
    const push = vi.fn(async () => ({}));
    const { data } = service({ store, scheduler });
    data.source('items', { fetch: async () => [], push });
    await vi.waitFor(() => expect(scheduler.held).toHaveLength(1));
    // Another tab's push of the row was refused meanwhile.
    await store.markRow('d1', { _pushRefused: 'access' });
    scheduler.releaseAll();
    await settle();
    await settle();
    expect(push).not.toHaveBeenCalled();
    expect(data.pending()).toEqual([expect.objectContaining({ key: 'd1', state: 'access_changed' })]);
    expect(await store.getRaw('d1')).toMatchObject({ _pushRefused: 'access', _dirty: true });
    // A person retries: the refusal is cleared and the row goes once.
    const retrying = data.retry('items', 'd1');
    await vi.waitFor(() => expect(scheduler.held).toHaveLength(1));
    scheduler.releaseAll();
    await retrying;
    expect(push).toHaveBeenCalledTimes(1);
    expect(await store.getRaw('d1')).not.toHaveProperty('_pushRefused');
  });
});


describe('a change held until its account is displayed', () => {
  it('lists as waiting, never failed or access changed, and goes once retried', async () => {
    const { data } = service();
    let displayed = false;
    const sent = [];
    data.source('items', {
      fetch: async () => [],
      push: async (command, record) => {
        if (!displayed) throw Object.assign(new Error('This Mini Program belongs to an account that is not displayed now'), { code: 'ACCOUNT_NOT_DISPLAYED', retryable: true });
        sent.push(record.id);
      },
    });
    await data.mutate('items', { op: 'put', record: { id: 'a', chat_id: 1, seq: 1 } }, { wait: true }).catch(() => {});
    const [entry] = data.pending('items');
    expect(entry).toMatchObject({ key: 'a', state: 'queued' });
    expect(entry.state).not.toBe('access_changed');
    // Its account displayed again: the host sends it again.
    displayed = true;
    await data.retryFailed();
    expect(sent).toEqual(['a']);
    expect(data.pending('items')).toEqual([]);
  });

  it('goes when its account is displayed again, while a change that failed otherwise waits for its own retry', async () => {
    const { data } = service();
    let displayed = false;
    let release;
    const sent = [];
    data.source('items', {
      fetch: async () => [],
      push: async (command, record) => {
        if (record.id === 'broken') throw Object.assign(new Error('Server error'), { code: 'SERVER', retryable: true });
        if (!displayed) throw Object.assign(new Error('This Mini Program belongs to an account that is not displayed now'), { code: 'ACCOUNT_NOT_DISPLAYED', retryable: true });
        await new Promise((resolve) => { release = resolve; });
        sent.push(record.id);
      },
    });
    await data.mutate('items', { op: 'put', record: { id: 'a', chat_id: 1, seq: 1 } }, { wait: true }).catch(() => {});
    await data.mutate('items', { op: 'put', record: { id: 'broken', chat_id: 1, seq: 2 } }, { wait: true }).catch(() => {});
    displayed = true;
    const going = data.retryHeld();
    await vi.waitFor(() => expect(typeof release).toBe('function'));
    // On its way, it is sending, no longer waiting for its account.
    const sending = data.pending('items').find((entry) => entry.key === 'a');
    expect(sending.state).toBe('sending');
    expect(sending.waiting).toBeUndefined();
    release();
    await going;
    expect(sent).toEqual(['a']);
    expect(data.pending('items').map((entry) => [entry.key, entry.state, entry.attempts])).toEqual([['broken', 'failed', 1]]);
  });
});
