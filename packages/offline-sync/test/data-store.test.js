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
});

describe('windowCache — a malformed DTO must not corrupt the window', () => {
  // REGRESSION (spec mp-windowed-cache, review 2026-08-27). `reconcile` writes
  // records one at a time and prunes AFTERWARDS, and windowCache used to swallow
  // any error it raised. A schema violation in the MIDDLE of a batch therefore
  // committed the rows before it, lost every row after it, skipped the prune
  // entirely, and returned a normal-looking array — so a surface showed a
  // half-updated window forever, with no signal and no self-healing.
  const strict = {
    entries: {
      keyPath: 'id',
      syncStrategy: 'last_write_wins',
      recordSchema: {
        type: 'object',
        required: ['id'],
        additionalProperties: false,
        properties: { id: { type: 'string' }, title: { type: 'string' }, note: { type: 'string' } },
      },
    },
  };

  it('keeps every VALID row and still prunes, dropping only the bad one', async () => {
    const data = createDataManager({ capabilityToken: token, mpId: 'time-clock', localData: strict });
    const store = data.store('entries');
    await store.put({ id: 'stale', title: 'server dropped me' });
    await store.markSynced('stale');

    const errors = [];
    const realError = console.error;
    console.error = (...a) => errors.push(a.join(' '));
    try {
      const wc = data.windowCache('entries', {
        fetch: async () => ([
          { id: 'a', title: 'first' },
          { id: 'b', title: 'bad', nope: 'not in the schema' }, // additionalProperties: false
          { id: 'c', title: 'queued behind the bad one' },
        ]),
        scopeOf: () => () => true,
      });
      const ids = (await wc.sync({})).map((r) => r.id).sort();

      // `c` is the one that proves it: it is VALID and was previously lost
      // purely because it sat after `b` in the batch.
      expect(ids).toEqual(['a', 'c']);
      // The prune must still run — `stale` is exactly the row a silent throw stranded.
      expect(ids).not.toContain('stale');
      // And it must be REPORTED. Dropping a row is a judgement call; dropping it
      // silently is the defect.
      expect(errors.join(' ')).toMatch(/\[windowCache\].*rejected by the store schema/);
    } finally {
      console.error = realError;
    }
  });

  it('survives a toRecord that throws, without losing the other rows', async () => {
    const data = createDataManager({ capabilityToken: token, mpId: 'time-clock', localData: strict });
    const errors = [];
    const realError = console.error;
    console.error = (...a) => errors.push(a.join(' '));
    try {
      const wc = data.windowCache('entries', {
        fetch: async () => ([{ id: 'a' }, { id: 'boom' }, { id: 'c' }]),
        toRecord: (dto) => { if (dto.id === 'boom') throw new Error('cannot map'); return dto; },
        scopeOf: () => () => true,
      });
      const ids = (await wc.sync({})).map((r) => r.id).sort();
      expect(ids).toEqual(['a', 'c']);
      expect(errors.join(' ')).toMatch(/toRecord threw/);
    } finally {
      console.error = realError;
    }
  });

  it('hands `prev` to toRecord WITHOUT meta stamps, so the documented spread works', async () => {
    // `getAll` returns rows carrying `_rev/_dirty/_updatedAt`, and `prev` exists
    // to be spread into the new record. Un-stripped, that spread failed
    // `additionalProperties: false` and the update vanished into the swallow —
    // sync() returned the STALE row as though it had succeeded.
    const data = createDataManager({ capabilityToken: token, mpId: 'time-clock', localData: strict });
    const store = data.store('entries');
    await store.put({ id: 'r1', title: 'old', note: 'rich field only the cache has' });
    await store.markSynced('r1');

    const wc = data.windowCache('entries', {
      fetch: async () => ([{ id: 'r1', title: 'new' }]), // thin DTO, no `note`
      keyOf: (dto) => dto.id,
      toRecord: (dto, prev) => ({ ...prev, ...dto }),
      scopeOf: () => () => true,
    });
    const [row] = await wc.sync({});
    expect(row.title).toBe('new');                            // the update lands
    expect(row.note).toBe('rich field only the cache has');   // and prev is preserved
  });
});
