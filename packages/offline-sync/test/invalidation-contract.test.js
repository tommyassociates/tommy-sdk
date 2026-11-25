import { describe, it, expect, vi } from 'vitest';
import { createDataStore, createMemoryStoreBackend } from '../src/data-store.js';
import { createDataManager } from '../src/manager.js';

const DAY = 24 * 60 * 60 * 1000;

describe.each([
  ['timesheets', 'timesheets_cache', 'windowCache'],
  ['care-plans', 'care_plans_cache', 'liveQuery'],
])('%s final revalidation read', (mpId, storeName, kind) => {
  const world = (fetch) => {
    const data = createDataManager({
      capabilityToken: { tenantId: 'team-3', mpId }, mpId,
      localData: { [storeName]: { keyPath: 'id' } },
      backendFactory: () => createMemoryStoreBackend(),
    });
    const store = data.store(storeName);
    const scope = (row) => row.group === 'visible';
    const query = kind === 'windowCache'
      ? data.windowCache(storeName, { fetch, scopeOf: () => scope })
      : data.liveQuery(storeName, { fetch, scope });
    return { data, store, revalidate: () => (kind === 'windowCache' ? query.sync({}) : query.revalidate({})) };
  };

  it('reads the final display scope once, preserving local edits and isolated return values', async () => {
    const pending = Promise.withResolvers();
    const { store, revalidate } = world(() => pending.promise);
    await store.reconcile([
      { id: 'remote', group: 'visible', title: 'old' },
      { id: 'outside', group: 'other', title: 'keep' },
    ]);
    const returnedReads = vi.spyOn(store, 'readWhere');
    const refresh = revalidate();
    await store.put({ id: 'local', group: 'visible', title: 'unsent edit' });
    pending.resolve([{ id: 'remote', group: 'visible', title: 'fresh' }]);

    const rows = await refresh;
    expect(returnedReads).toHaveBeenCalledTimes(1);
    expect(rows.map((row) => row.id).sort()).toEqual(['local', 'remote']);
    expect(rows.find((row) => row.id === 'remote').title).toBe('fresh');
    expect((await store.get('local'))._dirty).toBe(true);
    expect((await store.get('outside')).title).toBe('keep');
    expect((await store.get('remote'))._rev).toBeGreaterThan(1);
    rows.find((row) => row.id === 'remote').title = 'caller mutation';
    expect((await store.get('remote')).title).toBe('fresh');
  });

  it('performs a new final read after failed revalidation and subsequent local events', async () => {
    const { store, revalidate } = world(() => { throw new Error('offline'); });
    await store.put({ id: 'local', group: 'visible', title: 'first edit' });
    const returnedReads = vi.spyOn(store, 'readWhere');
    expect(await revalidate()).toEqual([{ id: 'local', group: 'visible', title: 'first edit' }]);
    await store.put({ id: 'local', group: 'visible', title: 'later edit' });
    expect(await revalidate()).toEqual([{ id: 'local', group: 'visible', title: 'later edit' }]);
    expect(returnedReads).toHaveBeenCalledTimes(2);
  });

  it('rejects an outstanding revalidate once the manager is disposed, even when fetch returns no records', async () => {
    const pending = Promise.withResolvers();
    const { data, revalidate } = world(() => pending.promise);
    const refresh = revalidate();
    await data.dispose();
    pending.resolve(null);
    await expect(refresh).rejects.toMatchObject({ name: 'DataServiceError', code: 'DATA_RETIRED' });
  });
});

describe('the paint ceiling (contract item 3, the platform half)', () => {
  const manager = (now) => createDataManager({
    capabilityToken: { tenantId: 'team-3', mpId: 'aged-mp' }, mpId: 'aged-mp',
    localData: { rows: { keyPath: 'id' } },
    backendFactory: () => createMemoryStoreBackend(),
    now,
  });

  const withRowAged = async (ageDays) => {
    const t0 = Date.parse('2026-09-04T00:00:00.000Z');
    let clock = t0 - (ageDays * DAY);
    const mgr = manager(() => clock);
    const lq = mgr.liveQuery('rows', { scope: () => true, fetch: () => [] });
    await lq.store.put({ id: '1' });
    await lq.store.markSynced('1');
    clock = t0;
    return lq;
  };

  it('paints a row stamped 6 days ago', async () => {
    const lq = await withRowAged(6);
    expect((await lq.read()).map((r) => r.id)).toEqual(['1']);
  });

  it('does NOT paint a row stamped 8 days ago', async () => {
    const lq = await withRowAged(8);
    expect(await lq.read()).toEqual([]);
    expect((await lq.store.getAllRaw()).length).toBe(1);
  });

  it('subscribe does not emit an over-age row either', async () => {
    const lq = await withRowAged(8);
    const seen = [];
    const off = lq.subscribe((rows) => seen.push(rows.map((r) => r.id)));
    await new Promise((r) => { setTimeout(r, 0); });
    off();
    expect(seen.flat()).toEqual([]);
  });

  it('exempts a DIRTY row — a local write is not hidden by its age', async () => {
    const t0 = Date.parse('2026-09-04T00:00:00.000Z');
    let clock = t0 - (30 * DAY);
    const mgr = manager(() => clock);
    const lq = mgr.liveQuery('rows', { scope: () => true, fetch: () => [] });
    await lq.store.put({ id: 'local' });
    clock = t0;
    expect((await lq.read()).map((r) => r.id)).toEqual(['local']);
  });

  it('applies to windowCache.read too, not just liveQuery (review R2-F2)', async () => {
    const t0 = Date.parse('2026-09-04T00:00:00.000Z');
    let clock = t0 - (8 * DAY);
    const mgr = manager(() => clock);
    const wc = mgr.windowCache('rows', { fetch: () => [] });
    const store = mgr.store('rows');
    await store.put({ id: '1' });
    await store.markSynced('1');
    clock = t0;
    expect(await wc.read({ from: 1, to: 2 })).toEqual([]);
    expect((await store.getAllRaw()).length).toBe(1);
  });

  it('windowCache.sync returns the painted set, not the raw reconcile read', async () => {
    const t0 = Date.parse('2026-09-04T00:00:00.000Z');
    let clock = t0 - (8 * DAY);
    const mgr = manager(() => clock);
    const wc = mgr.windowCache('rows', { fetch: () => [] });
    const store = mgr.store('rows');
    await store.put({ id: 'old' });
    await store.markSynced('old');
    clock = t0;
    expect(await wc.sync({ from: 1, to: 2 })).toEqual([]);
  });

  it('a revalidate that rejects does not re-emit rows the ceiling excluded', async () => {
    const t0 = Date.parse('2026-09-04T00:00:00.000Z');
    let clock = t0 - (9 * DAY);
    const mgr = manager(() => clock);
    const lq = mgr.liveQuery('rows', {
      scope: () => true,
      fetch: () => { throw new Error('offline'); },
    });
    await lq.store.put({ id: 'old' });
    await lq.store.markSynced('old');
    clock = t0;
    expect(await lq.revalidate()).toEqual([]);
  });
});

describe('pruneScope separates what a read may show from what it may delete', () => {
  const manager = () => createDataManager({
    capabilityToken: { tenantId: 'team-3', mpId: 'filtered-mp' }, mpId: 'filtered-mp',
    localData: { rows: { keyPath: 'id' } },
    backendFactory: () => createMemoryStoreBackend(),
  });

  const seed = async (store, ids) => {
    for (const id of ids) {
      await store.put({ id, member: id });
      await store.markSynced(id);
    }
  };

  it('a filtered read with pruneScope:()=>false writes without deleting', async () => {
    const mgr = manager();
    const store = mgr.store('rows');
    await seed(store, ['a', 'b']);
    const lq = mgr.liveQuery('rows', {
      scope: () => true,
      pruneScope: () => false,
      fetch: () => [{ id: 'a', member: 'a' }],
    });
    await lq.revalidate();
    expect((await store.getAll()).map((r) => r.id).sort()).toEqual(['a', 'b']);
  });

  it('WITHOUT pruneScope the same read deletes the rows it never covered', async () => {
    const mgr = manager();
    const store = mgr.store('rows');
    await seed(store, ['a', 'b']);
    const lq = mgr.liveQuery('rows', { scope: () => true, fetch: () => [{ id: 'a', member: 'a' }] });
    await lq.revalidate();
    expect((await store.getAll()).map((r) => r.id)).toEqual(['a']);
  });

  it('pruneScope does not narrow what the surface READS', async () => {
    const mgr = manager();
    const store = mgr.store('rows');
    await seed(store, ['a', 'b']);
    const lq = mgr.liveQuery('rows', { scope: () => true, pruneScope: () => false, fetch: () => [] });
    expect((await lq.read()).map((r) => r.id).sort()).toEqual(['a', 'b']);
  });
});

describe('the paint ceiling applies to a direct store read', () => {
  const storeAt = (nowFn) => createDataStore({
    name: 'rows', keyPath: 'id', backend: createMemoryStoreBackend(), now: nowFn,
  });

  const seeded = async () => {
    const t0 = Date.parse('2026-09-04T00:00:00.000Z');
    let clock = t0 - (10 * DAY);
    const store = storeAt(() => clock);
    await store.put({ id: 'old' });
    await store.markSynced('old');
    clock = t0 - (1 * DAY);
    await store.put({ id: 'fresh' });
    await store.markSynced('fresh');
    clock = t0;
    return store;
  };

  it('readWhere omits a row stamped 10 days ago and keeps the fresh one', async () => {
    const store = await seeded();
    expect((await store.readWhere(() => true)).map((r) => r.id)).toEqual(['fresh']);
  });

  it('getAll carries the ceiling too — MPs paint through it, so it cannot be the raw view', async () => {
    const store = await seeded();
    expect((await store.getAll()).map((r) => r.id)).toEqual(['fresh']);
  });

  it('getAllRaw is the writers view — hiding rows from a writer causes deletes', async () => {
    const store = await seeded();
    expect((await store.getAllRaw()).map((r) => r.id).sort()).toEqual(['fresh', 'old']);
  });

  it('a client-owned (last_write_wins) store never ages out — it is the only copy', async () => {
    const t0 = Date.parse('2026-09-04T00:00:00.000Z');
    let clock = t0 - (60 * DAY);
    const store = createDataStore({
      name: 'settings', keyPath: 'key', backend: createMemoryStoreBackend(),
      now: () => clock, syncStrategy: 'last_write_wins',
    });
    await store.put({ key: 'vendor', value: { tax: 10 } });
    await store.markSynced('vendor');
    clock = t0;
    expect((await store.readWhere(() => true)).map((r) => r.key)).toEqual(['vendor']);
    expect((await store.getAll()).length).toBe(1);
  });

  it('get(key) carries the ceiling — an edit form must not prefill from a stale row', async () => {
    const store = await seeded();
    expect(await store.get('old')).toBeUndefined();
    expect((await store.get('fresh'))?.id).toBe('fresh');
  });

  it('getRaw(key) is the writers view — a read-modify-write must see what it may not paint', async () => {
    const store = await seeded();
    expect((await store.getRaw('old'))?.id).toBe('old');
  });

  it('a dirty row is exempt however old — it has not reached the server', async () => {
    const t0 = Date.parse('2026-09-04T00:00:00.000Z');
    let clock = t0 - (40 * DAY);
    const store = storeAt(() => clock);
    await store.put({ id: 'mine' });
    clock = t0;
    expect((await store.readWhere(() => true)).map((r) => r.id)).toEqual(['mine']);
  });
});

describe('the paint ceiling has one owner', () => {
  const agedManager = (localData, clock) => createDataManager({
    capabilityToken: { tenantId: 'team-3', mpId: 'ceiling-mp' },
    mpId: 'ceiling-mp',
    localData,
    backendFactory: () => createMemoryStoreBackend(),
    now: clock,
  });

  const seedAged = async (decl, ageDays) => {
    const t0 = Date.parse('2026-09-04T00:00:00.000Z');
    let clock = t0 - (ageDays * DAY);
    const mgr = agedManager({ rows: decl }, () => clock);
    const store = mgr.store('rows');
    await store.put({ id: '1' });
    await store.markSynced('1');
    clock = t0;
    return mgr.windowCache('rows', { fetch: async () => null, scopeOf: () => () => true });
  };

  it('still shows a CLIENT-OWNED row past the ceiling — it is the only copy', async () => {
    const cache = await seedAged({ keyPath: 'id', syncStrategy: 'last_write_wins' }, 30);
    expect((await cache.read({})).map((r) => r.id)).toEqual(['1']);
  });

  it('still hides a SERVER-AUTHORITATIVE row past the ceiling', async () => {
    const cache = await seedAged({ keyPath: 'id', syncStrategy: 'server_authoritative' }, 30);
    expect(await cache.read({})).toEqual([]);
  });
});

describe('a revalidate reads the store once', () => {
  const manager = () => createDataManager({
    capabilityToken: { tenantId: 'team-3', mpId: 'reads-mp' }, mpId: 'reads-mp',
    localData: { rows: { keyPath: 'id' } },
    backendFactory: () => createMemoryStoreBackend(),
  });

  it('answers liveQuery.revalidate and windowCache.sync from the reconcile\'s own read', async () => {
    const mgr = manager();
    const lq = mgr.liveQuery('rows', { scope: () => true, fetch: () => [{ id: '1' }, { id: '2' }] });
    const reads = vi.spyOn(lq.store, 'readWhere');
    expect((await lq.revalidate()).map((row) => row.id)).toEqual(['1', '2']);
    expect(reads).toHaveBeenCalledTimes(1);
    const wc = mgr.windowCache('rows', { fetch: () => [{ id: '3' }], scopeOf: () => (row) => row.id === '3' });
    reads.mockClear();
    expect((await wc.sync({ from: 'a' })).map((row) => row.id)).toEqual(['3']);
    expect(reads).toHaveBeenCalledTimes(1);
    const filtered = mgr.liveQuery('rows', { scope: (row) => row.id !== '2', pruneScope: () => false, fetch: () => [{ id: '4' }] });
    expect((await filtered.revalidate()).map((row) => row.id).sort()).toEqual(['1', '3', '4']);
  });
});

describe('liveQuery subscribers', () => {
  it('repaint from the rows each change delivers, never reading the store again per subscriber', async () => {
    const mgr = createDataManager({
      capabilityToken: { tenantId: 'team-3', mpId: 'subs-mp' }, mpId: 'subs-mp',
      localData: { rows: { keyPath: 'id' } },
      backendFactory: () => createMemoryStoreBackend(),
    });
    const lq = mgr.liveQuery('rows', { scope: (row) => row.kind === 'shift', fetch: () => [] });
    const seen = [[], []];
    const offs = seen.map((list) => lq.subscribe((rows) => list.push(rows.map((row) => row.id))));
    await vi.waitFor(() => expect(seen.every((list) => list.length === 1)).toBe(true));
    const reads = vi.spyOn(lq.store, 'readWhere');
    await lq.store.put({ id: 's1', kind: 'shift' });
    await lq.store.put({ id: 'n1', kind: 'note' });
    await vi.waitFor(() => expect(seen.map((list) => list.at(-1))).toEqual([['s1'], ['s1']]));
    expect(reads).not.toHaveBeenCalled();
    expect(await lq.read()).toEqual([{ id: 's1', kind: 'shift' }]);
    offs.forEach((off) => off());
  });
});
