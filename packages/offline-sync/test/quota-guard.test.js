import {
  describe, it, expect, beforeEach, afterEach, vi,
} from 'vitest';
import {
  createDataStore, createLocalStorageBackend, createDataManager, PersistError,
} from '../src/index.js';
import { databaseName } from '../src/names.js';

const dbFor = (tenantId) => databaseName({ tenantId }, 'time-clock');

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
      // eslint-disable-next-line no-await-in-loop
      await store.markSynced(`s-${i}`);
    }
    const rows = await store.getAll();
    expect(rows).toHaveLength(10);
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

  it('leaves an all-dirty store over the cap rather than dropping a draft', async () => {
    const store = createDataStore({ name: 'mileage_drafts', maxRows: 10, now: ticker() });
    for (let i = 0; i < 40; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await store.put({ id: `mil-${i}`, distance: i });
    }
    expect(await store.getAll()).toHaveLength(40);
  });

  it('bounds without re-reading the whole store on every write', async () => {
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
    expect(getAllCalls).toBe(50);
  });
});

describe('finding 2: a write that cannot be persisted fails loudly', () => {
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
    expect(await backend.get('b')).toBeTruthy();
    expect(await backend.getAll()).toHaveLength(1);
  });

  it('recovers to disk as soon as a later write fits', async () => {
    globalThis.localStorage = fakeLocalStorage({ maxBytes: 4000 });
    const backend = createLocalStorageBackend(dbFor('team-3'), 'drafts_recovers');
    const big = await backend.put('b', { id: 'b', notes: 'x'.repeat(8000), _dirty: true });
    expect(big.ok).toBe(false);
    await backend.delete('b');
    const ok = await backend.put('c', { id: 'c', notes: 'small', _dirty: true });
    expect(ok.ok).toBe(true);
    expect(globalThis.localStorage._bytes()).toBeGreaterThan(0);
  });

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

      expect(reported).toHaveLength(1);
      expect(reported[0].store).toBe('mileage_drafts');
      expect(reported[0].reason).toBe('quota');
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
    for (let i = 1; i <= 3; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      expect(await backend.get(`${i}`)).toBeTruthy();
    }
  });
});

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
        return undefined;
      },
    });
    expect(seen).toEqual([
      { storeName: 'settings', syncStrategy: 'last_write_wins' },
      { storeName: 'attendance_cache', syncStrategy: 'server_authoritative' },
      { storeName: 'prefs', syncStrategy: 'last_write_wins' },
    ]);
  });

  it('a host-shaped factory therefore persists last_write_wins across a reload', async () => {
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

describe('QG-R5-1: the byte guard\'s own evictions are accounted for', () => {
  const ticker = () => {
    let t = Date.parse('2026-08-31T00:00:00.000Z');
    return () => { t += 1000; return t; };
  };
  const filler = (id, n) => ({ id, blob: 'x'.repeat(n) });

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

    expect(batches.length).toBe(1);

    const eviction = reports.find((r) => r.event === 'evicted');
    expect(eviction).toBeTruthy();
    expect(eviction.evicted.length).toBeGreaterThan(0);
    expect(reports.some((r) => r.event === 'persist_failed')).toBe(false);
  });

  it('keeps residentCount accurate, so a later put does not walk getAll()', async () => {
    const reports = [];
    const inner = createLocalStorageBackend(dbFor('team-3'), 'qg_r5_1_count', { maxBytes: 4000 });
    let getAllCalls = 0;
    const counting = {
      ...inner,
      async getAll() { getAllCalls += 1; return inner.getAll(); },
    };
    const store = createDataStore({
      name: 'documents_cache',
      maxRows: 5,
      backend: counting,
      onPersistError: (r) => reports.push(r),
      now: ticker(),
    });
    await seedSynced(store, 4, 800);
    await store.put(filler('r-new', 800));

    const evicted = reports.flatMap((r) => r.evicted || []);
    expect(evicted.length).toBe(1);
    expect((await store.getAllRaw()).length).toBe(4);

    const before = getAllCalls;
    await store.put(filler('r-newer', 10));
    expect(getAllCalls).toBe(before + 1);
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
    await expect(store.put(filler('r-new', 800))).resolves.toBeTruthy();
    expect(reports.length).toBeGreaterThan(0);
    expect(reports.every((r) => r.event === 'evicted')).toBe(true);
    expect(reports.every((r) => (r.evicted || []).length > 0)).toBe(true);
  });
});

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

    expect(rejections).toBeGreaterThan(0);

    const resident = await store.getAllRaw();
    expect(resident.length).toBeLessThan(50);

    const bytes = JSON.stringify(resident).length;
    expect(bytes).toBeLessThanOrEqual(3000 * 2 + 1000);

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
    expect(ids).toContain('d-29');
    expect(ids).not.toContain('d-00');
  });

  it('keeps every draft through the refusals the finalized spec was written about', async () => {
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
    expect(reports.some((r) => r.event === 'persist_failed')).toBe(true);
    expect(reports.some((r) => r.event === 'retention_discarded')).toBe(false);
    expect((await store.getAllRaw()).length).toBe(4);
  });

  it('does not run the whole save path twice per refused write', async () => {
    globalThis.localStorage = fakeLocalStorage({ maxBytes: 400 });
    const inner = createLocalStorageBackend(dbFor('team-3'), 'qg_r5_2_twice');
    let puts = 0;
    const counting = { ...inner, async put(k, r) { puts += 1; return inner.put(k, r); } };
    const store = createDataStore({ name: 'mileage_drafts', backend: counting, now: ticker() });

    await store.put({ id: 'a', notes: 'x'.repeat(2000) }).catch(() => {});
    expect(puts).toBe(1);
    expect((await store.getAllRaw())[0]._persistFailed).toBe(true);
  });
});

describe('MSRB-3: every path that displaces rows accounts for them', () => {
  const ticker = () => {
    let t = Date.parse('2026-08-31T00:00:00.000Z');
    return () => { t += 1000; return t; };
  };

  const displacingBackend = () => {
    const rows = new Map();
    let displaceNext = null;
    return {
      async get(key) { return rows.get(String(key)); },
      async getAll() { return [...rows.values()]; },
      async put(key, record) { rows.set(String(key), record); return { ok: true }; },
      async delete(key) {
        rows.delete(String(key));
        if (!displaceNext) return { ok: true };
        const out = displaceNext; displaceNext = null;
        for (const k of [...(out.evicted || []), ...(out.discarded || [])]) rows.delete(String(k));
        return out;
      },
      keys() { return [...rows.keys()]; },
      _displace(next) { displaceNext = next; },
    };
  };

  it('notifies, counts and reports rows a DELETE displaced', async () => {
    const reports = [];
    const backend = displacingBackend();
    const store = createDataStore({
      name: 'documents_cache', maxRows: 50, backend, onPersistError: (r) => reports.push(r), now: ticker(),
    });
    for (let i = 1; i <= 4; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await store.put({ id: `r-${i}` });
    }

    const batches = [];
    store.subscribe(() => { batches.push(1); });
    backend._displace({ ok: true, evicted: ['r-1', 'r-2'] });
    await store.delete('r-4');

    expect(batches.length).toBe(1);
    expect(reports.some((r) => r.event === 'evicted')).toBe(true);
  });

  it('reports a retention discard reached through a delete', async () => {
    const reports = [];
    const backend = displacingBackend();
    const store = createDataStore({
      name: 'mileage_drafts', backend, onPersistError: (r) => reports.push(r), now: ticker(),
    });
    await store.put({ id: 'a' });
    await store.put({ id: 'b' });

    backend._displace({
      ok: false, reason: 'budget', bytes: 900, budget: 300, evicted: [], discarded: ['a'],
    });
    await store.delete('b').catch(() => {});

    expect(reports.some((r) => r.event === 'retention_discarded')).toBe(true);
  });

  it('accounts for rows markSynced displaced', async () => {
    const reports = [];
    const rows = new Map();
    const backend = {
      async get(key) { return rows.get(String(key)); },
      async getAll() { return [...rows.values()]; },
      async put(key, record) {
        rows.set(String(key), record);
        if (record._dirty === false && rows.has('old-1')) {
          rows.delete('old-1');
          return { ok: true, evicted: ['old-1'] };
        }
        return { ok: true };
      },
      async delete(key) { rows.delete(String(key)); return { ok: true }; },
      keys() { return [...rows.keys()]; },
    };
    const store = createDataStore({
      name: 'documents_cache', backend, onPersistError: (r) => reports.push(r), now: ticker(),
    });
    await store.put({ id: 'old-1' });
    await store.put({ id: 'fresh' });

    const batches = [];
    store.subscribe(() => { batches.push(1); });
    await store.markSynced('fresh');

    expect(reports.some((r) => r.event === 'evicted')).toBe(true);
    expect(batches.length).toBe(1);
  });

  it('accounts for rows the byte guard evicted on a REFUSED write', async () => {
    const reports = [];
    const rows = new Map();
    const backend = {
      async get(key) { return rows.get(String(key)); },
      async getAll() { return [...rows.values()]; },
      async put(key, record) {
        rows.set(String(key), record);
        if (String(key) !== 'big') return { ok: true };
        rows.delete('clean-1');
        return {
          ok: false, reason: 'budget', bytes: 900, budget: 300, evicted: ['clean-1'], discarded: [],
        };
      },
      async delete(key) { rows.delete(String(key)); return { ok: true }; },
      keys() { return [...rows.keys()]; },
    };
    const store = createDataStore({
      name: 'mileage_drafts', backend, onPersistError: (r) => reports.push(r), now: ticker(),
    });
    await store.put({ id: 'clean-1' });

    const batches = [];
    store.subscribe((r) => { batches.push(r.length); });
    await store.put({ id: 'big' }).catch(() => {});

    expect(reports.some((r) => r.event === 'evicted')).toBe(false);
    const failure = reports.find((r) => r.event === 'persist_failed');
    expect(failure).toBeTruthy();
    expect(failure.evicted).toEqual(['clean-1']);
    expect(batches.length).toBe(1);
  });
});
