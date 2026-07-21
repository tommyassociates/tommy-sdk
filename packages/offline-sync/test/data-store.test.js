/**
 * data-store.test.js — per-(tenant, MP) naming (token-derived, never
 * caller-constructed), recordSchema enforcement on put, sync metadata
 * stamps, and the selector subscription (offline-sync.md §1/§4;
 * sdk-types.ts DataStore).
 */
import { describe, it, expect } from 'vitest';
import { databaseName, BROKER_DATABASE, createDataManager } from '../src/index.js';

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
});
