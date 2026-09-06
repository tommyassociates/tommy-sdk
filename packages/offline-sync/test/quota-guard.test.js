/**
 * quota-guard.test.js — the three defects behind spec `mp-store-quota-guard`,
 * pinned as tests BEFORE any of them is fixed (Phase 0: reproduce, don't repair).
 *
 * Every `describe` here is tagged `quota-guard red` so the phase-0 acceptance
 * command can select exactly these and assert they FAIL for the stated reason:
 *
 *   yarn vitest run -t 'quota-guard red'   → non-zero on today's code
 *
 * As each phase lands, the matching case is rewritten from "assert the defect
 * exists" to "assert the defect is gone" and its tag drops. Nothing here is a
 * permanent test of broken behaviour — the assertions that survive are the ones
 * in the FIXED half of each block.
 */
import {
  describe, it, expect, beforeEach, afterEach, vi,
} from 'vitest';
import {
  createDataStore, createLocalStorageBackend, createDataManager, PersistError,
} from '../src/index.js';
import { databaseName } from '../src/names.js';

/** Store names come from the resolver, never a literal — `sdk
 *  check:store-name-literals` enforces it (see local-store-backend.test.js). */
const dbFor = (tenantId) => databaseName({ tenantId }, 'time-clock');

/**
 * A localStorage stub with a BYTE BUDGET, which is the part a plain Map fake
 * cannot express. Real Web Storage throws `QuotaExceededError` from `setItem`
 * once the origin's ~5MB is spent; that throw is the whole subject of finding 2,
 * so the fake has to be able to produce it on demand.
 */
function fakeLocalStorage({ maxBytes = Infinity } = {}) {
  const map = new Map();
  const size = () => [...map.entries()].reduce((n, [k, v]) => n + k.length + v.length, 0);
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => {
      const next = size() - (map.has(k) ? k.length + map.get(k).length : 0) + k.length + String(v).length;
      if (next > maxBytes) {
        const err = new Error('The quota has been exceeded.');
        err.name = 'QuotaExceededError';
        throw err;
      }
      map.set(k, String(v));
    },
    removeItem: (k) => { map.delete(k); },
    clear: () => { map.clear(); },
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
    _bytes: size,
  };
}

beforeEach(() => { globalThis.localStorage = fakeLocalStorage(); });
afterEach(() => { delete globalThis.localStorage; });

/**
 * FINDING 1 — the row cap runs on `reconcile` and nowhere else.
 * `enforceRowCap` has exactly one call site (data-store.js, inside reconcile),
 * so a store that is only ever written through `put` has no ceiling at all.
 * Every `last_write_wins` store is put-only by construction: nothing reconciles
 * a drafts store, because there is no server set to reconcile it against.
 */
describe('finding 1: the row cap now runs on the put() path', () => {
  const ticker = () => {
    let t = Date.parse('2026-08-31T00:00:00.000Z');
    return () => { t += 1000; return t; };
  };

  it('bounds a store fed by put() alone once its rows are no longer dirty', async () => {
    const store = createDataStore({ name: 'schedule_cache', maxRows: 10, now: ticker() });
    for (let i = 0; i < 40; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await store.put({ id: `s-${i}` });
      // The sync engine's job, inlined: a row that reached the server is no
      // longer an unpushed local edit. Optimistic writes between reconciles are
      // cleared exactly like this by `reconcile`'s markSynced.
      // eslint-disable-next-line no-await-in-loop
      await store.markSynced(`s-${i}`);
    }
    const rows = await store.getAll();
    expect(rows).toHaveLength(10);
    // ...and it kept the NEWEST ten, not an arbitrary ten.
    expect(rows.map((r) => r.id).sort()).toEqual(
      ['s-30', 's-31', 's-32', 's-33', 's-34', 's-35', 's-36', 's-37', 's-38', 's-39'].sort(),
    );
  });

  it('never evicts the row the put just wrote', async () => {
    const store = createDataStore({ name: 'schedule_cache', maxRows: 3, now: ticker() });
    for (const id of ['a', 'b', 'c']) {
      // eslint-disable-next-line no-await-in-loop
      await store.put({ id });
      // eslint-disable-next-line no-await-in-loop
      await store.markSynced(id);
    }
    await store.put({ id: 'fresh' });
    expect(await store.get('fresh')).toBeTruthy();
    expect(await store.getAll()).toHaveLength(3);
  });

  /**
   * ⚠ THE DOCUMENTED LIMIT OF THE ROW CAP, PINNED SO IT CANNOT DRIFT.
   *
   * `_dirty` rows are never evictable — dropping one loses a user's edit — and
   * `put` stamps `_dirty: true` on every write. In a store nothing ever syncs
   * or reconciles, which is every client-owned drafts store, EVERY row is
   * therefore dirty and the cap can never bite. That is deliberate, not a
   * defect: silently deleting somebody's unsent draft to stay under a row count
   * would be a far worse bug than the growth it prevents.
   *
   * So `maxRows` bounds CACHES, whose rows the server can always send again. The
   * bound that actually protects a drafts store is the byte guard, which fails
   * the write loudly instead of dropping the row (Phase 3).
   */
  it('leaves an all-dirty store over the cap rather than dropping a draft', async () => {
    const store = createDataStore({ name: 'mileage_drafts', maxRows: 10, now: ticker() });
    for (let i = 0; i < 40; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await store.put({ id: `mil-${i}`, distance: i });
    }
    expect(await store.getAll()).toHaveLength(40);
  });

  it('bounds without re-reading the whole store on every write', async () => {
    // The cost constraint, pinned because it is the thing a naive fix gets
    // wrong. `enforceRowCap` opens with `backend.getAll()`; calling it on every
    // put would walk a 50k-row cache once per optimistic write. The
    // counter-gated fix must leave getAll untouched while the store is nowhere
    // near its ceiling.
    let getAllCalls = 0;
    const rows = new Map();
    const counting = {
      async get(key) { return rows.get(key); },
      async getAll() { getAllCalls += 1; return [...rows.values()]; },
      async put(key, record) { rows.set(key, record); },
      async delete(key) { rows.delete(key); },
      keys() { return [...rows.keys()]; },
    };
    const store = createDataStore({ name: 'schedule_cache', maxRows: 1000, backend: counting });
    for (let i = 0; i < 50; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await store.put({ id: `s-${i}` });
    }
    // `notify` legitimately snapshots once per put. The cap must not add a
    // second walk per write — 50 puts, 50 walks, not 100.
    expect(getAllCalls).toBe(50);
  });
});

/**
 * FINDING 2 — an over-quota write used to be accepted and discarded.
 *
 * `createLocalStorageBackend.save()` swallowed the `setItem` throw under a
 * comment claiming it degraded to in-memory-until-reload. It did not: every
 * operation begins with `load()`, which reads from storage, so there was no
 * in-memory map for the write to survive in. The row was gone by the next read
 * and `put()` had already resolved.
 *
 * These cases were written in Phase 0 to assert the LOSS, and are inverted here
 * now that Phase 3 has closed it — same scenarios, opposite expectations.
 */
describe('finding 2: a write that cannot be persisted fails loudly', () => {
  /**
   * ⚠ A DISTINCT STORE NAME PER CASE, ON PURPOSE.
   * The retained-in-memory map is keyed by store key and deliberately outlives
   * the backend instance — that is what "survives until reload" means, and a
   * team switch or a re-created data manager must not silently drop rows the
   * disk never got. The cost is that two tests sharing a store name also share
   * that map, so each case gets its own rather than reaching into module state
   * to clear it (there is no reset hook, and the SDK should not grow one just
   * for tests).
   */
  const backendOver = (storeName) => {
    globalThis.localStorage = fakeLocalStorage({ maxBytes: 400 });
    return createLocalStorageBackend(dbFor('team-3'), storeName);
  };

  it('reports the failure instead of resolving as if it had worked', async () => {
    const backend = backendOver('drafts_reports');
    const small = await backend.put('a', { id: 'a', notes: 'small', _dirty: true });
    expect(small.ok).toBe(true);

    const res = await backend.put('b', { id: 'b', notes: 'x'.repeat(2000), _dirty: true });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('quota');
  });

  it('retains the write in memory — the old catch comment is now true', async () => {
    const backend = backendOver('drafts_retains');
    await backend.put('b', { id: 'b', notes: 'x'.repeat(2000), _dirty: true });
    // Not on disk, but not lost either: readable for the rest of the session.
    expect(await backend.get('b')).toBeTruthy();
    expect(await backend.getAll()).toHaveLength(1);
  });

  it('recovers to disk as soon as a later write fits', async () => {
    globalThis.localStorage = fakeLocalStorage({ maxBytes: 4000 });
    const backend = createLocalStorageBackend(dbFor('team-3'), 'drafts_recovers');
    // Blow past the origin quota once...
    const big = await backend.put('b', { id: 'b', notes: 'x'.repeat(8000), _dirty: true });
    expect(big.ok).toBe(false);
    // ...then drop the offender and write something that fits.
    await backend.delete('b');
    const ok = await backend.put('c', { id: 'c', notes: 'small', _dirty: true });
    expect(ok.ok).toBe(true);
    expect(globalThis.localStorage._bytes()).toBeGreaterThan(0);
  });

  /** The DataStore half of the contract: reject AND flag AND tell the host. */
  describe('through the DataStore', () => {
    it('rejects with a PersistError, flags the row, and reports once', async () => {
      globalThis.localStorage = fakeLocalStorage({ maxBytes: 400 });
      const reported = [];
      const store = createDataStore({
        name: 'mileage_drafts',
        backend: createLocalStorageBackend(dbFor('team-3'), 'ds_rejects'),
        onPersistError: (e) => reported.push(e),
      });

      await expect(store.put({ id: 'b', notes: 'x'.repeat(2000) })).rejects.toThrow(PersistError);

      // The caller was told, the host was told...
      expect(reported).toHaveLength(1);
      expect(reported[0].store).toBe('mileage_drafts');
      expect(reported[0].reason).toBe('quota');
      // ...and the row is present and marked, so a surface can say
      // "saved on this device only" rather than showing nothing.
      const row = await store.get('b');
      expect(row?._persistFailed).toBe(true);
    });

    it('wakes subscribers so the flag actually reaches the surface', async () => {
      globalThis.localStorage = fakeLocalStorage({ maxBytes: 400 });
      const store = createDataStore({
        name: 'mileage_drafts',
        backend: createLocalStorageBackend(dbFor('team-3'), 'ds_subscribers'),
      });
      const seen = [];
      store.subscribe((rows) => seen.push(rows.map((r) => !!r._persistFailed)));
      await store.put({ id: 'b', notes: 'x'.repeat(2000) }).catch(() => {});
      expect(seen.at(-1)).toEqual([true]);
    });

    it('a reporter that throws does not change the failure', async () => {
      globalThis.localStorage = fakeLocalStorage({ maxBytes: 400 });
      const store = createDataStore({
        name: 'mileage_drafts',
        backend: createLocalStorageBackend(dbFor('team-3'), 'ds_reporter_throws'),
        onPersistError: () => { throw new Error('reporter blew up'); },
      });
      await expect(store.put({ id: 'b', notes: 'x'.repeat(2000) })).rejects.toThrow(PersistError);
    });
  });
});

/**
 * The BYTE budget — the guard that actually protects a drafts store, because
 * the row cap cannot (every draft row is `_dirty`, and dirty rows are never
 * evictable). Bytes are the right unit by measurement, not by taste: a mileage
 * draft is 415 bytes and a signature-bearing form draft is ~40KB.
 */
describe('per-store byte budget', () => {
  const bigRow = (id, n) => ({ id, blob: 'x'.repeat(n), _updatedAt: `2026-08-31T00:00:${String(id).padStart(2, '0')}.000Z` });

  it('evicts the oldest NON-dirty rows to stay under budget', async () => {
    const backend = createLocalStorageBackend(dbFor('team-3'), 'documents_cache', { maxBytes: 4000 });
    for (let i = 1; i <= 6; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await backend.put(`${i}`, bigRow(i, 800));
      expect(res.ok).toBe(true);
    }
    const ids = (await backend.getAll()).map((r) => r.id).sort((a, b) => a - b);
    // The newest survive; the oldest made way.
    expect(ids).toContain(6);
    expect(ids).not.toContain(1);
    expect(ids.length).toBeLessThan(6);
  });

  it('never evicts the row being written, even when it is the largest', async () => {
    const backend = createLocalStorageBackend(dbFor('team-3'), 'documents_cache', { maxBytes: 4000 });
    for (let i = 1; i <= 4; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await backend.put(`${i}`, bigRow(i, 800));
    }
    await backend.put('99', bigRow(99, 3000));
    expect(await backend.get('99')).toBeTruthy();
  });

  it('FAILS the write rather than dropping a draft when every row is dirty', async () => {
    const backend = createLocalStorageBackend(dbFor('team-3'), 'mileage_drafts', { maxBytes: 3000 });
    for (let i = 1; i <= 3; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await backend.put(`${i}`, { ...bigRow(i, 800), _dirty: true });
    }
    const res = await backend.put('4', { ...bigRow(4, 2000), _dirty: true });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('budget');
    expect(res.evicted).toEqual([]);
    // Every earlier draft is still there. THIS is the invariant the whole spec
    // is for: an over-budget store refuses new work, it does not eat old work.
    for (let i = 1; i <= 3; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      expect(await backend.get(`${i}`)).toBeTruthy();
    }
  });
});

/**
 * FINDING 3 — `createDataManager` calls the injected backend factory with two
 * arguments while the host's factory reads a third (`syncStrategy`), so the
 * host's persist-vs-memory branch always takes its early return and every MP
 * store in the shell is a memory store. MP persistence has been off since the
 * `mp-store-persistence` follow-up landed.
 *
 * The existing app-side test misses this by construction: it calls the factory
 * directly with all three arguments, and its only wiring assertion is a regex
 * over `index.js` source text.
 */
describe('quota-guard red · finding 3: backendFactory loses syncStrategy', () => {
  const token = { tenantId: 'team-3', mpId: 'time-clock' };
  const localData = {
    settings: { keyPath: 'key', syncStrategy: 'last_write_wins' },
    attendance_cache: { keyPath: 'id', syncStrategy: 'server_authoritative' },
  };

  it('passes the store declaration syncStrategy through to the factory', () => {
    const seen = [];
    createDataManager({
      capabilityToken: token,
      mpId: 'time-clock',
      localData,
      backendFactory: (dbName, storeName, syncStrategy) => {
        seen.push({ storeName, syncStrategy });
        return undefined; // shape only — the store never gets used here
      },
    });
    expect(seen).toEqual([
      { storeName: 'settings', syncStrategy: 'last_write_wins' },
      { storeName: 'attendance_cache', syncStrategy: 'server_authoritative' },
    ]);
  });

  it('a host-shaped factory therefore persists last_write_wins across a reload', async () => {
    // The host's factory verbatim in shape: memory unless told last_write_wins.
    const hostFactory = (dbName, storeName, syncStrategy) => (
      syncStrategy === 'last_write_wins'
        ? createLocalStorageBackend(`5:${dbName}`, storeName)
        : undefined
    );
    const first = createDataManager({
      capabilityToken: token, mpId: 'time-clock', localData, backendFactory: hostFactory,
    });
    await first.store('settings').put({ key: 'view', value: { mode: 'week' } });

    const afterReload = createDataManager({
      capabilityToken: token, mpId: 'time-clock', localData, backendFactory: hostFactory,
    });
    expect((await afterReload.store('settings').get('view'))?.value).toEqual({ mode: 'week' });
  });
});

/**
 * QG-R5-1 — the byte guard's own deletions, accounted for.
 *
 * `save()` has always RETURNED the keys `evictToFit` dropped on the SUCCESS
 * path, and `put` read only `ok === false`. So a write that succeeded while
 * silently deleting other rows told nobody: subscribers never woke for rows that
 * had vanished, `residentCount` kept counting them, and the host heard nothing
 * about storage pressure that had actually cost data.
 *
 * ⚠ REACHING THIS PATH TAKES WORK, and that is itself the finding recorded in
 * the spec. `put` stamps `_dirty: true` on every write and `evictToFit` skips
 * dirty rows, so through the DataStore the byte guard cannot evict ANYTHING
 * until something clears the flag. These tests call `markSynced` to do what a
 * push would. The defect is in the primitive, not in the shipped estate.
 */
describe('QG-R5-1: the byte guard\'s own evictions are accounted for', () => {
  const ticker = () => {
    let t = Date.parse('2026-08-31T00:00:00.000Z');
    return () => { t += 1000; return t; };
  };
  const filler = (id, n) => ({ id, blob: 'x'.repeat(n) });

  /** Rows written, then pushed — i.e. evictable, the way a synced cache is. */
  async function seedSynced(store, count, size) {
    for (let i = 1; i <= count; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await store.put(filler(`r-${i}`, size));
      // eslint-disable-next-line no-await-in-loop
      await store.markSynced(`r-${i}`);
    }
  }

  it('notifies subscribers with the evicted keys in ONE batch and reports to the host', async () => {
    const reports = [];
    const store = createDataStore({
      name: 'documents_cache',
      backend: createLocalStorageBackend(dbFor('team-3'), 'qg_r5_1_notify', { maxBytes: 4000 }),
      onPersistError: (r) => reports.push(r),
      now: ticker(),
    });
    await seedSynced(store, 4, 800);

    const batches = [];
    store.subscribe(() => { batches.push(1); });
    await store.put(filler('r-new', 800));

    // ONE subscriber pass for one logical change — the write AND everything it
    // displaced — not a pass per evicted row. That is the 202-repaints lesson.
    expect(batches.length).toBe(1);

    // The host was told, and told the TRUTH: a successful write, not a failure.
    const eviction = reports.find((r) => r.event === 'evicted');
    expect(eviction).toBeTruthy();
    expect(eviction.evicted.length).toBeGreaterThan(0);
    expect(reports.some((r) => r.event === 'persist_failed')).toBe(false);
  });

  it('keeps residentCount accurate, so a later put does not walk getAll()', async () => {
    // The counter is what gates the row cap. Over-counting evicted rows inflates
    // it until the cap runs on a store nowhere near its ceiling — the exact cost
    // the counter exists to avoid — or latches `capSaturated` against phantoms.
    //
    // ⚠ maxRows IS PINNED TO THE TRUE COUNT, deliberately. With any slack the
    // test passes with or without the fix, because the inflated counter never
    // crosses the ceiling and nothing observable differs. The first cut of this
    // test had that slack and went green against the reverted fix.
    const reports = [];
    const inner = createLocalStorageBackend(dbFor('team-3'), 'qg_r5_1_count', { maxBytes: 4000 });
    let getAllCalls = 0;
    const counting = {
      ...inner,
      async getAll() { getAllCalls += 1; return inner.getAll(); },
    };
    const store = createDataStore({
      name: 'documents_cache',
      // 4 seeded - 1 evicted + 1 written = 5 resident after the second put, so
      // the ceiling sits exactly ON the true count and one phantom crosses it.
      maxRows: 5,
      backend: counting,
      onPersistError: (r) => reports.push(r),
      now: ticker(),
    });
    await seedSynced(store, 4, 800);
    await store.put(filler('r-new', 800));   // evicts

    // Pin the arithmetic the ceiling depends on: 4 seeded + 1 written - 1 gone.
    const evicted = reports.flatMap((r) => r.evicted || []);
    expect(evicted.length).toBe(1);
    expect((await store.getAllRaw()).length).toBe(4);

    const before = getAllCalls;
    await store.put(filler('r-newer', 10));
    // True count reaches 5, at the ceiling but not over it, so the cap must not
    // run. Counting the evicted row would make it 6 and open a getAll() walk.
    expect(getAllCalls).toBe(before + 1);    // notify's own snapshot, and nothing else
  });

  it('does not report an eviction as a failed write', async () => {
    const reports = [];
    const store = createDataStore({
      name: 'documents_cache',
      backend: createLocalStorageBackend(dbFor('team-3'), 'qg_r5_1_truth', { maxBytes: 4000 }),
      onPersistError: (r) => reports.push(r),
      now: ticker(),
    });
    await seedSynced(store, 4, 800);
    // The write must RESOLVE — it reached disk. Only other rows went.
    await expect(store.put(filler('r-new', 800))).resolves.toBeTruthy();
    // ⚠ ASSERT THE REPORT EXISTS BEFORE ASSERTING ITS SHAPE. `every` on an empty
    // array is true, so the obvious version of this test passes when NOTHING is
    // reported — which is precisely the defect. It went green against the
    // reverted fix until this line was added.
    expect(reports.length).toBeGreaterThan(0);
    expect(reports.every((r) => r.event === 'evicted')).toBe(true);
    expect(reports.every((r) => (r.evicted || []).length > 0)).toBe(true);
  });
});

/**
 * QG-R5-2 — the degraded state is BOUNDED.
 *
 * This is the item `mp-store-quota-guard` declared in its own Scope ("the memory
 * fallback's own boundedness") and Objectives ("No unbounded store") and did not
 * deliver. Every refused write re-retained the whole map one row larger, and the
 * row cap could not help: `put` stamps `_dirty` on every write, the cap never
 * evicts a dirty row, and `capSaturated` latches after the first no-op walk.
 */
describe('QG-R5-2: a store past its byte budget stops growing', () => {
  const ticker = () => {
    let t = Date.parse('2026-08-31T00:00:00.000Z');
    return () => { t += 1000; return t; };
  };

  it('bounds the retained map, keeps rejecting, and never discards silently', async () => {
    const reports = [];
    const backend = createLocalStorageBackend(dbFor('team-3'), 'qg_r5_2_bound', { maxBytes: 3000 });
    const store = createDataStore({
      name: 'mileage_drafts',
      backend,
      onPersistError: (r) => reports.push(r),
      now: ticker(),
    });

    let rejections = 0;
    for (let i = 0; i < 50; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await store.put({ id: `d-${i}`, notes: 'x'.repeat(400) }).catch((e) => {
        if (e instanceof PersistError) rejections += 1; else throw e;
      });
    }

    // 1. The write still REJECTS. Bounding the retained map must not quietly
    //    turn a refused write into a successful-looking one.
    expect(rejections).toBeGreaterThan(0);

    // 2. The map STOPPED GROWING. Before this phase it held all 50.
    const resident = await store.getAllRaw();
    expect(resident.length).toBeLessThan(50);

    // 3. And it is bounded by the ceiling, not by luck.
    const bytes = JSON.stringify(resident).length;
    expect(bytes).toBeLessThanOrEqual(3000 * 2 + 1000);   // ceiling + one row's slack

    // 4. NOT SILENT. Dropping a member's typed draft without saying so would be
    //    a worse defect than the leak this closes.
    const discards = reports.filter((r) => r.event === 'retention_discarded');
    expect(discards.length).toBeGreaterThan(0);
    expect(discards.flatMap((r) => r.evicted).length).toBeGreaterThan(0);
  });

  it('drops the OLDEST rows, not the newest', async () => {
    const reports = [];
    const store = createDataStore({
      name: 'mileage_drafts',
      backend: createLocalStorageBackend(dbFor('team-3'), 'qg_r5_2_oldest', { maxBytes: 2000 }),
      onPersistError: (r) => reports.push(r),
      now: ticker(),
    });
    for (let i = 0; i < 30; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await store.put({ id: `d-${String(i).padStart(2, '0')}`, notes: 'x'.repeat(300) }).catch(() => {});
    }
    const ids = (await store.getAllRaw()).map((r) => r.id).sort();
    // The most recent draft a member typed is the one they still care about.
    expect(ids).toContain('d-29');
    expect(ids).not.toContain('d-00');
  });

  it('keeps every draft through the refusals the finalized spec was written about', async () => {
    // ⚠ THE COUNTER-TEST, and it is why the ceiling has headroom. The first cut
    // bounded at maxBytes itself, so the FIRST refused write deleted a draft —
    // walking back "refuse rather than drop a draft" completely rather than
    // merely bounding it. That broke the quota guard's own invariant test.
    const reports = [];
    const store = createDataStore({
      name: 'mileage_drafts',
      backend: createLocalStorageBackend(dbFor('team-3'), 'qg_r5_2_headroom', { maxBytes: 3000 }),
      onPersistError: (r) => reports.push(r),
      now: ticker(),
    });
    for (let i = 0; i < 4; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await store.put({ id: `d-${i}`, notes: 'x'.repeat(700) }).catch(() => {});
    }
    // Over budget — writes are being refused — but nothing has been thrown away.
    expect(reports.some((r) => r.event === 'persist_failed')).toBe(true);
    expect(reports.some((r) => r.event === 'retention_discarded')).toBe(false);
    expect((await store.getAllRaw()).length).toBe(4);
  });

  it('does not run the whole save path twice per refused write', async () => {
    // The degraded state must not also be quadratically expensive: each refused
    // write used to stringify the entire store TWICE — once for the write, once
    // to re-put the row with `_persistFailed`.
    globalThis.localStorage = fakeLocalStorage({ maxBytes: 400 });
    const inner = createLocalStorageBackend(dbFor('team-3'), 'qg_r5_2_twice');
    let puts = 0;
    const counting = { ...inner, async put(k, r) { puts += 1; return inner.put(k, r); } };
    const store = createDataStore({ name: 'mileage_drafts', backend: counting, now: ticker() });

    await store.put({ id: 'a', notes: 'x'.repeat(2000) }).catch(() => {});
    expect(puts).toBe(1);
    // ...and the flag still reached the row, which is what the second put was for.
    expect((await store.getAllRaw())[0]._persistFailed).toBe(true);
  });
});
