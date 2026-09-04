/**
 * invalidation-contract.test.js — mp-durable-instant-surfaces review F1.
 *
 * The spec declared a four-item invalidation contract and said all four were
 * "required together". Items 1 (the account/tenant key) and 4 (always
 * revalidate) shipped; items 2 and 3 did not, which left a durable cache
 * surviving a PERMISSION CHANGE with no bound on its age. These pin both.
 */
import { describe, it, expect, vi } from 'vitest';
import { createMemoryStoreBackend } from '../src/data-store.js';
import { createDataManager } from '../src/manager.js';

const DAY = 24 * 60 * 60 * 1000;

describe('the paint ceiling (contract item 3, the platform half)', () => {
  const manager = (now) => createDataManager({
    capabilityToken: { tenantId: 'team-3', mpId: 'aged-mp' }, mpId: 'aged-mp',
    localData: { rows: { keyPath: 'id' } },
    backendFactory: () => createMemoryStoreBackend(),
    now,
  });

  /** Put a row stamped `ageDays` ago, then read through liveQuery at "now". */
  const withRowAged = async (ageDays) => {
    const t0 = Date.parse('2026-09-04T00:00:00.000Z');
    let clock = t0 - (ageDays * DAY);
    const mgr = manager(() => clock);
    const lq = mgr.liveQuery('rows', { scope: () => true, fetch: () => [] });
    await lq.store.put({ id: '1' });
    await lq.store.markSynced('1');
    clock = t0;                       // travel forward to the read
    return lq;
  };

  it('paints a row stamped 6 days ago', async () => {
    const lq = await withRowAged(6);
    expect((await lq.read()).map((r) => r.id)).toEqual(['1']);
  });

  it('does NOT paint a row stamped 8 days ago', async () => {
    const lq = await withRowAged(8);
    expect(await lq.read()).toEqual([]);
    // Still STORED — the ceiling governs the paint; the store's TTL evicts.
    expect((await lq.store.getAll()).length).toBe(1);
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
    await lq.store.put({ id: 'local' });    // never markSynced -> dirty
    clock = t0;
    expect((await lq.read()).map((r) => r.id)).toEqual(['local']);
  });

  it('applies to windowCache.read too, not just liveQuery (review R2-F2)', async () => {
    // The ceiling is a platform promise about what may be SHOWN. Living inside
    // liveQuery, it left windowCache — the path timesheets_cache and
    // invoicing_cache are read through — painting up to the 30-day store TTL.
    const t0 = Date.parse('2026-09-04T00:00:00.000Z');
    let clock = t0 - (8 * DAY);
    const mgr = manager(() => clock);
    const wc = mgr.windowCache('rows', { fetch: () => [] });
    const store = mgr.store('rows');
    await store.put({ id: '1' });
    await store.markSynced('1');
    clock = t0;
    expect(await wc.read({ from: 1, to: 2 })).toEqual([]);
    expect((await store.getAll()).length).toBe(1);   // stored, just not painted
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
    // A failed fetch keeps the cache (the SWR contract) — but the stale rows
    // must not come back through the read the revalidate returns.
    expect(await lq.revalidate()).toEqual([]);
  });
});

/**
 * pruneScope — review CAL-FILTERED-PRUNE.
 *
 * `scope` answers "what should this surface show". `reconcile` reused it to
 * answer "what may this read DELETE", and those diverge the moment a read is
 * FILTERED: the rows the filter never covered are absent from the answer and
 * were deleted as though the server had dropped them. Scheduling hit this twice
 * and hand-rolled a separate predicate in both writers; this is that predicate
 * as a primitive.
 */
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
      fetch: () => [{ id: 'a', member: 'a' }],     // only member a's rows came back
    });
    await lq.revalidate();
    expect((await store.getAll()).map((r) => r.id).sort()).toEqual(['a', 'b']);
  });

  it('WITHOUT pruneScope the same read deletes the rows it never covered', async () => {
    // The defect, pinned so the primitive cannot be quietly removed.
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
