/**
 * data-store.test.js — per-(tenant, MP) naming (token-derived, never
 * caller-constructed), recordSchema enforcement on put, sync metadata
 * stamps, the selector subscription (offline-sync.md §1/§4;
 * sdk-types.ts DataStore), and the reconcile row cap.
 */
import { describe, it, expect } from 'vitest';
import {
  databaseName, BROKER_DATABASE, createDataManager, createDataStore,
} from '../src/index.js';

const token = { tenantId: 'team-4401', mpId: 'time-clock' };

const localData = {
  entries: {
    keyPath: 'id',
    syncStrategy: 'last_write_wins',
    recordSchema: {
      type: 'object',
      required: ['id', 'shiftId'],
      properties: { id: { type: 'string' }, shiftId: { type: 'string' }, hours: { type: 'number' } },
    },
  },
};

describe('per-(tenant, MP) naming', () => {
  it('derives tenantId from the capability token — never caller-supplied', () => {
    expect(databaseName(token, 'time-clock')).toBe('tommy-mp:team-4401:time-clock');
    expect(() => databaseName({}, 'time-clock')).toThrow(/tenantId must come from the capability token/);
    expect(() => databaseName({ tenantId: 't', mpId: 'other' }, 'time-clock')).toThrow(/bound to mp 'other'/);
  });

  it("the broker's own store is not an MP store", () => {
    expect(BROKER_DATABASE).toBe('tommy-broker');
    expect(BROKER_DATABASE.startsWith('tommy-mp:')).toBe(false);
  });
});

describe('tommy.data stores', () => {
  it('only manifest-declared stores exist', () => {
    const data = createDataManager({ capabilityToken: token, mpId: 'time-clock', localData });
    expect(() => data.store('undeclared')).toThrow(/not declared in manifest.localData/);
    expect(data.store('entries')).toBeTruthy();
  });

  it('put enforces the recordSchema and stamps sync metadata', async () => {
    const data = createDataManager({ capabilityToken: token, mpId: 'time-clock', localData });
    const store = data.store('entries');
    await expect(store.put({ id: 'e1' })).rejects.toThrow(/failed recordSchema/);
    await store.put({ id: 'e1', shiftId: 's-1', hours: 8 }, { dedupeKey: 'ck-1' });
    const record = await store.get('e1');
    expect(record._rev).toBe(1);
    expect(record._dirty).toBe(true);
    expect(record._dedupeKey).toBe('ck-1');
    await store.put({ id: 'e1', shiftId: 's-1', hours: 9 });
    expect((await store.get('e1'))._rev).toBe(2);
    await store.markSynced('e1');
    expect((await store.get('e1'))._dirty).toBe(false);
  });

  it('subscribeQuery recomputes ONLY when an entity the selector read changes', async () => {
    const data = createDataManager({ capabilityToken: token, mpId: 'time-clock', localData });
    const store = data.store('entries');
    await store.put({ id: 'a', shiftId: 's-1', hours: 1 });
    await store.put({ id: 'b', shiftId: 's-2', hours: 2 });

    const fired = [];
    store.subscribeQuery((q) => q.get('a')?.hours || 0, (value) => fired.push(value));
    await new Promise((resolve) => { setTimeout(resolve, 5); });

    await store.put({ id: 'b', shiftId: 's-2', hours: 5 }); // untouched entity
    await store.put({ id: 'a', shiftId: 's-1', hours: 3 }); // touched entity
    expect(fired).toEqual([3]);
  });

  it('syncState exposes the SWR inputs', () => {
    const data = createDataManager({ capabilityToken: token, mpId: 'time-clock', localData });
    expect(data.syncState('entries')).toEqual({ lastSyncedAt: null, pending: 0, online: true });
  });

  it('readWhere returns predicate-matching records with meta stamps stripped', async () => {
    const data = createDataManager({ capabilityToken: token, mpId: 'time-clock', localData });
    const store = data.store('entries');
    await store.put({ id: 'a', shiftId: 's-1', hours: 2 });
    await store.put({ id: 'b', shiftId: 's-2', hours: 9 });

    const low = await store.readWhere((r) => r.hours < 5);
    expect(low).toEqual([{ id: 'a', shiftId: 's-1', hours: 2 }]); // no _rev/_dirty/_updatedAt
    expect(await store.readWhere((r) => r.hours > 100)).toEqual([]);
    expect((await store.readWhere()).length).toBe(2); // no predicate = all
  });

  it('windowCache.read paints from cache; sync fetches, reconciles, and returns fresh rows', async () => {
    const data = createDataManager({ capabilityToken: token, mpId: 'time-clock', localData });
    const store = data.store('entries');
    // Seed one in-scope row so read() has something to paint instantly.
    await store.put({ id: 'a', shiftId: 's-1', hours: 1 }); await store.markSynced('a');

    let fetchArg = null;
    const cache = data.windowCache('entries', {
      fetch: (win) => { fetchArg = win; return [{ ref: 'a', hours: 5 }, { ref: 'c', hours: 6 }]; },
      toRecord: (dto) => ({ id: dto.ref, shiftId: `s-${dto.ref}`, hours: dto.hours }),
      scopeOf: (win) => (row) => row.hours >= win.min && row.hours <= win.max,
      keyOf: (dto) => dto.ref,
    });

    const win = { min: 0, max: 8 };
    expect(await cache.read(win)).toEqual([{ id: 'a', shiftId: 's-1', hours: 1 }]); // instant

    const fresh = await cache.sync(win);
    expect(fetchArg).toEqual(win); // fetch got the window
    expect(fresh.map((r) => r.id).sort()).toEqual(['a', 'c']); // reconciled cache read
    expect((await store.get('a')).hours).toBe(5); // upserted
    expect((await store.get('a'))._dirty).toBe(false); // server-authoritative
  });

  it('windowCache.sync keeps the cache intact when fetch throws (SWR paint holds)', async () => {
    const data = createDataManager({ capabilityToken: token, mpId: 'time-clock', localData });
    const store = data.store('entries');
    await store.put({ id: 'a', shiftId: 's-1', hours: 2 }); await store.markSynced('a');

    const cache = data.windowCache('entries', {
      fetch: () => { throw new Error('offline'); },
      scopeOf: () => () => true,
    });
    const rows = await cache.sync({});
    expect(rows).toEqual([{ id: 'a', shiftId: 's-1', hours: 2 }]); // unchanged, not blanked
  });

  it('liveQuery.subscribe paints warm data immediately, then on every store change', async () => {
    const data = createDataManager({ capabilityToken: token, mpId: 'time-clock', localData });
    const store = data.store('entries');
    await store.put({ id: 'a', shiftId: 's-1', hours: 1 }); await store.markSynced('a');

    const q = data.liveQuery('entries', { scope: (r) => r.hours < 8 });
    const paints = [];
    const off = q.subscribe((rows) => paints.push(rows.map((r) => `${r.id}:${r.hours}`)));
    await new Promise((resolve) => { setTimeout(resolve, 5); });
    // instant first paint from the warm cache
    expect(paints[0]).toEqual(['a:1']);

    // a store change re-fires the subscriber with the fresh scope read
    await store.put({ id: 'b', shiftId: 's-2', hours: 3 }); await store.markSynced('b');
    await new Promise((resolve) => { setTimeout(resolve, 5); });
    expect(paints[paints.length - 1].sort()).toEqual(['a:1', 'b:3']);

    // unsubscribe stops further paints
    off();
    const before = paints.length;
    await store.put({ id: 'c', shiftId: 's-3', hours: 4 });
    await new Promise((resolve) => { setTimeout(resolve, 5); });
    expect(paints.length).toBe(before);
  });

  it('liveQuery.revalidate fetches, reconciles into the store, and notifies subscribers', async () => {
    const data = createDataManager({ capabilityToken: token, mpId: 'time-clock', localData });
    const store = data.store('entries');
    await store.put({ id: 'a', shiftId: 's-1', hours: 1 }); await store.markSynced('a');

    const q = data.liveQuery('entries', {
      scope: (r) => r.hours < 8,
      fetch: () => [{ ref: 'a', hours: 5 }, { ref: 'c', hours: 6 }],
      toRecord: (dto) => ({ id: dto.ref, shiftId: `s-${dto.ref}`, hours: dto.hours }),
      keyOf: (dto) => dto.ref,
    });
    const paints = [];
    q.subscribe((rows) => paints.push(rows.map((r) => r.id).sort()));
    await new Promise((resolve) => { setTimeout(resolve, 5); });
    expect(paints[0]).toEqual(['a']); // warm

    const fresh = await q.revalidate({});
    expect(fresh.map((r) => r.id).sort()).toEqual(['a', 'c']);
    expect((await store.get('a')).hours).toBe(5); // upserted
    await new Promise((resolve) => { setTimeout(resolve, 5); });
    // subscriber saw the reconciled set (fired via reconcile's notify)
    expect(paints[paints.length - 1]).toEqual(['a', 'c']);
  });

  it('reconcile upserts fresh rows as synced, prunes in-scope drops, keeps out-of-scope + dirty rows', async () => {
    const data = createDataManager({ capabilityToken: token, mpId: 'time-clock', localData });
    const store = data.store('entries');
    // Seed: a1/a2 are synced in-scope rows; b1 is out of scope; d1 is a dirty
    // (unsynced/optimistic) in-scope row.
    await store.put({ id: 'a1', shiftId: 's-1', hours: 1 }); await store.markSynced('a1');
    await store.put({ id: 'a2', shiftId: 's-2', hours: 2 }); await store.markSynced('a2');
    await store.put({ id: 'b1', shiftId: 's-9', hours: 9 }); await store.markSynced('b1');
    await store.put({ id: 'd1', shiftId: 's-4', hours: 4 }); // left dirty

    // Server returns only a1 (re-timed) for the in-scope set (hours < 8 = "in scope").
    const scope = (row) => row.hours < 8;
    const result = await store.reconcile([{ id: 'a1', shiftId: 's-1', hours: 5 }], { scope });

    expect(result).toEqual({ upserted: 1, pruned: 1 }); // a2 pruned
    const a1 = await store.get('a1');
    expect(a1.hours).toBe(5); // upserted
    expect(a1._dirty).toBe(false); // marked synced (server-authoritative)
    expect(await store.get('a2')).toBeUndefined(); // in-scope, dropped by server
    expect((await store.get('b1')).hours).toBe(9); // out of scope — untouched
    expect((await store.get('d1'))._dirty).toBe(true); // dirty optimistic — never pruned
  });

  it('reconcile notifies subscribers ONCE for the whole merge, with the final set', async () => {
    const data = createDataManager({ capabilityToken: token, mpId: 'time-clock', localData });
    const store = data.store('entries');
    await store.put({ id: 'old', shiftId: 's-0', hours: 1 }); await store.markSynced('old');

    // Per-record notifies made an N-row reconcile wake every subscriber N
    // times, each with a partially-merged snapshot — the quadratic repaint (and
    // the request storm it drove on any surface that fetches per rendered row).
    const paints = [];
    store.subscribe((rows) => paints.push(rows.map((r) => r.id).sort()));
    await store.reconcile([
      { id: 'a', shiftId: 's-1', hours: 1 },
      { id: 'b', shiftId: 's-2', hours: 2 },
      { id: 'c', shiftId: 's-3', hours: 3 },
    ]);

    expect(paints.length).toBe(1);
    expect(paints[0]).toEqual(['a', 'b', 'c']); // the final set, not a prefix of it
  });

  it('reconcile merges every VALID record when one fails the schema', async () => {
    const data = createDataManager({ capabilityToken: token, mpId: 'time-clock', localData });
    const store = data.store('entries');

    const paints = [];
    store.subscribe((rows) => paints.push(rows.map((r) => r.id).sort()));
    const result = await store.reconcile([
      { id: 'a', shiftId: 's-1', hours: 1 },
      { id: 'bad', shiftId: 's-2', hours: 'not-a-number' }, // fails recordSchema
      { id: 'c', shiftId: 's-3', hours: 3 },
    ]);

    // The bad row is skipped, not fatal — a surface must not go blank because
    // one row of thirty had the wrong type.
    expect(result.upserted).toBe(2);
    expect(paints).toEqual([['a', 'c']]);
    expect(await store.get('bad')).toBeUndefined();
  });

  it('reconcile still wakes a selector subscriber that read one of the merged keys', async () => {
    const data = createDataManager({ capabilityToken: token, mpId: 'time-clock', localData });
    const store = data.store('entries');
    await store.put({ id: 'a', shiftId: 's-1', hours: 1 }); await store.markSynced('a');

    // The batched notify carries the whole changed set, so a selector that only
    // ever read key 'a' must still fire when 'a' is one of many rows merged.
    const fired = [];
    store.subscribeQuery((q) => q.get('a')?.hours || 0, (value) => fired.push(value));
    await store.reconcile([
      { id: 'z', shiftId: 's-9', hours: 9 },
      { id: 'a', shiftId: 's-1', hours: 7 },
    ]);

    expect(fired).toEqual([7]);
  });
});

/**
 * The row cap (`maxRows`) — the backstop against a windowed cache growing for
 * the life of the tab. Scoped reconcile prunes only the CURRENT scope, so every
 * previously-viewed window survives by design; without the cap the store just
 * accumulates. Exercised through createDataStore directly because `maxRows` is
 * a store-construction option (createDataManager builds its stores on the
 * default).
 */
describe('reconcile row cap', () => {
  // put() stamps `_updatedAt` from `now()` and eviction orders by that stamp;
  // a real clock ties every row written inside the same millisecond, so tests
  // that care about age inject a monotonic one.
  const ticker = () => {
    let t = Date.parse('2026-08-31T00:00:00.000Z');
    return () => { t += 1000; return t; };
  };
  const row = (id, window) => ({ id, shiftId: `s-${window}`, hours: window });
  const windowRows = (w, count) => Array.from({ length: count }, (_, i) => row(`w${w}-${i}`, w));
  const idsOf = async (store) => (await store.getAll()).map((r) => r.id).sort();

  it('holds a window-paging store at or under maxRows across successive reconciles', async () => {
    const store = createDataStore({ name: 'entries', maxRows: 20, now: ticker() });
    // Each window reconciles under its OWN scope, so every earlier window is
    // out of scope and survives the prune — uncapped this ends at 50 rows.
    for (let w = 0; w < 5; w += 1) {
      // eslint-disable-next-line no-await-in-loop
      await store.reconcile(windowRows(w, 10), { scope: (r) => r.hours === w });
    }
    const rows = await store.getAll();
    expect(rows.length).toBeLessThanOrEqual(20);
    // and what is still resident is the two most recent windows
    expect([...new Set(rows.map((r) => r.hours))].sort()).toEqual([3, 4]);
  });

  it('evicts the OLDEST rows by _updatedAt and keeps the newest', async () => {
    const store = createDataStore({ name: 'entries', maxRows: 3, now: ticker() });
    // Two OLD windows land first (each its own scope, so neither prunes the
    // other) — these are the eviction candidates.
    await store.reconcile([row('r1', 1), row('r2', 2)], { scope: (r) => r.hours <= 2 });
    await store.reconcile([row('r3', 3)], { scope: (r) => r.hours === 3 });
    // The CURRENT window arrives and takes the store over the cap.
    const result = await store.reconcile([row('r4', 4), row('r5', 5)], { scope: (r) => r.hours >= 4 });
    expect(result).toEqual({ upserted: 2, pruned: 0, evicted: 2 }); // evictions are reported
    expect((await idsOf(store)).sort()).toEqual(['r3', 'r4', 'r5']); // r1/r2 were the oldest
  });

  it('never evicts the window the reconcile JUST fetched — it stays over the cap instead', async () => {
    // The whole incoming set exceeds the cap: honouring it would mean dropping
    // rows fetched microseconds earlier, so the grid would silently paint half
    // a window. Staying over cap is the honest outcome (adversarial review
    // 2026-08-31), exactly like the all-dirty case below.
    const store = createDataStore({ name: 'entries', maxRows: 3, now: ticker() });
    const result = await store.reconcile(
      ['r1', 'r2', 'r3', 'r4', 'r5'].map((id, i) => row(id, i)),
      { scope: () => true },
    );
    expect(result).toEqual({ upserted: 5, pruned: 0 }); // nothing evicted, nothing reported
    expect((await idsOf(store)).sort()).toEqual(['r1', 'r2', 'r3', 'r4', 'r5']);
  });

  it('eviction notifies as ONE batch — the subscriber cost does not scale with rows evicted', async () => {
    // Per-row api.delete fired a full subscriber pass each (202 repaints for
    // one logical change, measured) — eviction is a single batched mutation
    // now, so evicting 6 rows costs the same notifications as evicting 1.
    const countFor = async (oldRows) => {
      // maxRows 1: the seed reconcile leaves all `oldRows` resident (they are
      // the protected incoming window), so the NEXT reconcile has exactly
      // `oldRows` evictable candidates.
      const store = createDataStore({ name: 'entries', maxRows: 1, now: ticker() });
      const seed = Array.from({ length: oldRows }, (_, i) => row(`o${i}`, i));
      await store.reconcile(seed, { scope: (r) => r.hours < oldRows });
      let notifications = 0;
      store.subscribe(() => { notifications += 1; });
      const result = await store.reconcile([row('n1', 99)], { scope: (r) => r.hours === 99 });
      return { notifications, evicted: result.evicted };
    };
    const one = await countFor(1);   // 1 old row resident -> evicts 1
    const many = await countFor(6);  // 6 old rows resident -> evicts 6
    expect(one.evicted).toBe(1);
    expect(many.evicted).toBe(6);
    expect(many.notifications).toBe(one.notifications);
  });

  it('NEVER evicts a _dirty row — an all-dirty store stays over the cap instead', async () => {
    const store = createDataStore({ name: 'entries', maxRows: 3, now: ticker() });
    for (const id of ['d1', 'd2', 'd3', 'd4', 'd5']) {
      // eslint-disable-next-line no-await-in-loop
      await store.put(row(id, 1)); // left dirty: an unpushed local write
    }
    const result = await store.reconcile([], { scope: () => true });

    expect(result).toEqual({ upserted: 0, pruned: 0 }); // nothing was evictable
    const rows = await store.getAll();
    expect(rows.length).toBe(5); // over the cap ON PURPOSE
    expect(rows.every((r) => r._dirty)).toBe(true); // not one local edit dropped
  });

  it('evicts around a dirty row: old clean rows go, the unpushed write stays', async () => {
    const store = createDataStore({ name: 'entries', maxRows: 3, now: ticker() });
    await store.reconcile([row('c1', 1), row('c2', 1)], { scope: () => true }); // oldest, clean
    await store.put(row('d1', 2)); // a local edit, newer than c1/c2, never pushed

    const result = await store.reconcile([row('c4', 3), row('c5', 3)], { scope: (r) => r.hours === 3 });

    expect(result).toEqual({ upserted: 2, pruned: 0, evicted: 2 });
    expect(await idsOf(store)).toEqual(['c4', 'c5', 'd1']);
    expect((await store.get('d1'))._dirty).toBe(true);
  });

  it('leaves the result shape untouched when it evicts nothing', async () => {
    const store = createDataStore({ name: 'entries', maxRows: 100, now: ticker() });
    const result = await store.reconcile([row('a', 1), row('b', 1)], { scope: () => true });
    expect(result).toEqual({ upserted: 2, pruned: 0 }); // no `evicted` key at all
    expect('evicted' in result).toBe(false);
  });
});
