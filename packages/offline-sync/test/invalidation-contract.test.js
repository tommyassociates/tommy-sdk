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
