import { describe, it, expect } from 'vitest';
import { createDataManager } from '../src/manager.js';
import { createMemoryStoreBackend } from '../src/data-store.js';

const DAY = 24 * 60 * 60 * 1000;

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
    expect(rows[0].rich).toBe('keep me');
  });

  it('sees a row the paint ceiling hides, so the merge is not silently skipped', async () => {
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
    t += 30 * DAY;

    await cache.sync({});
    const raw = (await store.getAllRaw()).find((r) => r.id === '1');
    expect(raw.rich).toBe('keep me');
  });

  it('drops a malformed DTO without silence, and without taking the batch with it', async () => {
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

    await store.put({ id: 'gone', title: 'server dropped me' });
    await store.markSynced('gone');

    const rows = await cache.sync({});
    const ids = rows.map((r) => r.id).sort();

    expect(ids).toContain('a');
    expect(ids).toContain('c');
    expect(ids).not.toContain('b');
    expect(ids).not.toContain('gone');

    const rejected = reports.filter((r) => r.event === 'record_rejected');
    expect(rejected.length).toBe(1);
    expect(rejected[0].rejected).toBe(1);
    expect(rejected[0].store).toBe('rows');
  });
});
