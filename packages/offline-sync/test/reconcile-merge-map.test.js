/**
 * reconcile-merge-map.test.js — spec mp-store-retention-bounds phase 4.
 *
 * Three defects met on `manager.js` `fetchAndReconcile`, which is why they are
 * one file and not three: the merge map was meta-stamped, one bad DTO took valid
 * rows AND the prune with it, and the map was ceilinged so it could not see the
 * rows it existed to merge onto.
 *
 * Reachability is real, not theoretical: `timesheets_cache` and
 * `invoicing_cache` both declare `additionalProperties: false`, and timesheets
 * passes NO `toRecord`, so raw host DTOs go straight into a strict schema.
 */
import { describe, it, expect } from 'vitest';
import { createDataManager } from '../src/manager.js';
import { createMemoryStoreBackend } from '../src/data-store.js';

const DAY = 24 * 60 * 60 * 1000;

/** A cache store shaped like the shipped ones: strict, so meta keys are fatal. */
const strictCache = {
  rows: {
    keyPath: 'id',
    recordSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['id'],
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        rich: { type: 'string' },
      },
    },
  },
};

const managerAt = (clock, onPersistError) => createDataManager({
  capabilityToken: { tenantId: 'team-3', mpId: 'merge-mp' },
  mpId: 'merge-mp',
  localData: strictCache,
  backendFactory: () => createMemoryStoreBackend(),
  now: clock,
  onPersistError,
});

describe('the reconcile merge map', () => {
  it('does not poison its own record with the meta stamps it read', async () => {
    // `prev` is documented to be SPREAD into the new record for rich-field
    // preservation. Built from rows carrying `_rev/_dirty/_updatedAt`, that
    // spread produced a record the strict schema refuses — the write threw, the
    // surrounding try swallowed it, and the STALE row came back looking synced.
    let t = Date.parse('2026-09-04T00:00:00.000Z');
    const mgr = managerAt(() => t);
    const store = mgr.store('rows');
    const cache = mgr.windowCache('rows', {
      fetch: async () => [{ id: '1', title: 'fresh' }],
      toRecord: (dto, prev) => ({ ...(prev || {}), ...dto }),
      keyOf: (dto) => dto.id,
      scopeOf: () => () => true,
    });

    await store.put({ id: '1', title: 'stale', rich: 'keep me' });
    await store.markSynced('1');

    const rows = await cache.sync({});
    expect(rows.map((r) => r.title)).toEqual(['fresh']);
    // The rich field survived the thin DTO — the whole point of `prev`.
    expect(rows[0].rich).toBe('keep me');
  });

  it('sees a row the paint ceiling hides, so the merge is not silently skipped', async () => {
    // Since the ceiling landed, `getAll()` hides rows older than 7 days, so
    // `prevByKey` could not see a row it was meant to merge onto and
    // `toRecord(dto, undefined)` ran as though the row were new.
    let t = Date.parse('2026-09-04T00:00:00.000Z');
    const mgr = managerAt(() => t);
    const store = mgr.store('rows');
    const cache = mgr.windowCache('rows', {
      fetch: async () => [{ id: '1', title: 'fresh' }],
      toRecord: (dto, prev) => ({ ...(prev || {}), ...dto }),
      keyOf: (dto) => dto.id,
      scopeOf: () => () => true,
    });

    await store.put({ id: '1', title: 'stale', rich: 'keep me' });
    await store.markSynced('1');
    t += 30 * DAY;                       // well past the paint ceiling

    await cache.sync({});
    const raw = (await store.getAllRaw()).find((r) => r.id === '1');
    expect(raw.rich).toBe('keep me');    // merged, not overwritten as new
  });

  it('drops a malformed DTO without silence, and without taking the batch with it', async () => {
    // ⚠ THE SURVIVAL HALF ALREADY HELD ON THIS BRANCH and this test says so
    // rather than claiming a fix it did not make: `reconcile` catches a schema
    // rejection per record and carries on, so the valid rows and the prune were
    // never at risk here. Proved by removing the partition — this case stayed
    // green. What was missing was the REPORT: the row vanished from the cache
    // and nothing said why. Both halves are asserted, so a future change that
    // breaks either one is caught.
    const reports = [];
    let t = Date.parse('2026-09-04T00:00:00.000Z');
    const mgr = managerAt(() => t, (r) => reports.push(r));
    const store = mgr.store('rows');
    const cache = mgr.windowCache('rows', {
      fetch: async () => [
        { id: 'a', title: 'first' },
        { id: 'b', title: 'bad', notInSchema: true },
        { id: 'c', title: 'third' },
      ],
      toRecord: (dto) => dto,
      keyOf: (dto) => dto.id,
      scopeOf: () => () => true,
    });

    // A row the server has since dropped: the prune must remove it.
    await store.put({ id: 'gone', title: 'server dropped me' });
    await store.markSynced('gone');

    const rows = await cache.sync({});
    const ids = rows.map((r) => r.id).sort();

    expect(ids).toContain('a');
    expect(ids).toContain('c');          // NOT lost behind the bad row
    expect(ids).not.toContain('b');      // malformed, dropped
    expect(ids).not.toContain('gone');   // the prune still ran

    // And the drop was REPORTED. Dropping a malformed row is a judgement call;
    // dropping it silently is not.
    const rejected = reports.filter((r) => r.event === 'record_rejected');
    expect(rejected.length).toBe(1);
    expect(rejected[0].rejected).toBe(1);
    expect(rejected[0].store).toBe('rows');
  });
});
