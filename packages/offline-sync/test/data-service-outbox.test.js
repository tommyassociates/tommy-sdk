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

describe('a change restored after a restart', () => {
  it('is sent as the row is when it goes out, and not at all once another tab sent it', async () => {
    const { store } = service();
    await store.put({ id: 'a', v: 'unsent' });
    const scheduler = heldScheduler();
    const { data } = service({ store, scheduler });
    const push = vi.fn(async () => {});
    data.source('items', { fetch: async () => [], push });
    await vi.waitFor(() => expect(scheduler.held.length).toBe(1));
    // Another tab sends it first.
    await store.markSynced('a');
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
