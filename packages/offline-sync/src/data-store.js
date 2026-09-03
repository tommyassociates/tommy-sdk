/**
 * data-store.js — the DataStore behind `tommy.data.store(name)`
 * (sdk-types.ts DataStore/DataApi; offline-sync.md §1/§4).
 *
 * The MP never touches raw IndexedDB: this wrapper enforces the manifest
 * `recordSchema` on every put, stamps sync metadata `{_rev, _updatedAt,
 * _dirty}` (+ `_dedupeKey` when supplied — the fabric's per-write identity),
 * and provides the whole-store `subscribe` plus the additive selector
 * `subscribeQuery` (fires only when an entity the selector read changes).
 *
 * Backends are injected: MemoryBackend for tests/node, an IndexedDB backend
 * in the shell. Store creation/upgrade from the manifest is the manager's job.
 */
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

export function createMemoryStoreBackend() {
  const rows = new Map();
  return {
    async get(key) { return rows.get(key); },
    async getAll() { return [...rows.values()]; },
    async put(key, record) { rows.set(key, record); },
    async delete(key) { rows.delete(key); },
    keys() { return [...rows.keys()]; },
  };
}

/** The runtime's Web Storage (localStorage), or null when there is none
 *  (node, or access throws in a sandboxed/locked-down context). */
function webStorage() {
  try {
    return (typeof globalThis !== 'undefined' && globalThis.localStorage) || null;
  } catch (_) {
    return null;
  }
}

/** Whether this runtime can persist a store across a reload (has Web Storage). */
export function hasWebStorage() {
  return !!webStorage();
}

/**
 * Default byte budget for ONE localStorage-backed store.
 *
 * Chosen from measurement, not from a round number (spec mp-store-quota-guard,
 * Phase 0, Team 3): the whole app was using 27,647 bytes across 26 keys — about
 * 0.5% of the ~5MB origin quota — and almost all of it was capability tokens.
 * 512KB is therefore ~10% of the origin quota per store, roughly 1,260 mileage
 * drafts, while leaving the other fifteen stores and the app's own keys room to
 * breathe.
 *
 * ⚠ ROWS WOULD HAVE BEEN THE WRONG UNIT, BY TWO ORDERS OF MAGNITUDE. A fully
 * populated mileage draft is 415 bytes; a form draft carrying one signature is a
 * base64 PNG data URI — `drawable-image.vue` produces `toDataURL('image/png')` —
 * so ~40KB, about a hundred times bigger. A row cap tuned for one is useless for
 * the other, which is why the guard that protects a drafts store counts bytes.
 */
const DEFAULT_MAX_BYTES = 512 * 1024;

/**
 * Rows a failed save is holding in memory, keyed by store key.
 *
 * ⚠ THIS IS WHAT MADE THE OLD COMMENT TRUE. `save()` used to swallow the quota
 * throw under a comment promising it would "degrade to in-memory-until-reload",
 * and it did no such thing: every operation begins with `load()`, which reads
 * from storage, so there was no in-memory map for the write to survive in. The
 * row was gone by the next read and `put()` had already resolved. Retaining the
 * map here is what the comment always described.
 */
const memoryFallback = new Map();

/** Approximate the bytes one entry costs in the serialised blob. Quota is
 *  charged in UTF-16 code units, which is what `.length` counts. */
const entryBytes = (key, record) => JSON.stringify(String(key)).length
  + JSON.stringify(record).length + 1;

/**
 * A localStorage-backed store backend — the same async contract as
 * createMemoryStoreBackend, but the whole store PERSISTS across a shell reload
 * under a stable `mp-store:{dbName}:{storeName}` key. Sized for small
 * client-owned stores (manifest `syncStrategy: last_write_wins`, e.g. an MP's
 * `settings`): the whole store is a single JSON blob.
 *
 * WRITES CAN FAIL, AND SAY SO. `put`/`delete` resolve to `{ ok: true }` or to
 * `{ ok: false, reason, bytes, budget, evicted }`. They do NOT throw — the
 * DataStore above decides what a failed persist means to a caller — but they no
 * longer pretend to have succeeded either, which is the defect this closes.
 *
 * Reads still degrade to empty rather than throwing when storage is absent or
 * the blob is corrupt: there is nothing useful to tell a caller who asked what
 * is in an unreadable store, and the answer "nothing" is true.
 */
export function createLocalStorageBackend(dbName, storeName, { maxBytes = DEFAULT_MAX_BYTES } = {}) {
  const storeKey = `mp-store:${dbName}:${storeName}`;
  function load() {
    if (memoryFallback.has(storeKey)) return new Map(memoryFallback.get(storeKey));
    const store = webStorage();
    if (!store) return new Map();
    try {
      const raw = store.getItem(storeKey);
      return raw ? new Map(Object.entries(JSON.parse(raw))) : new Map();
    } catch (_) {
      return new Map(); // corrupt/unavailable — behave as empty, never throw
    }
  }

  /**
   * Bring `map` under the byte budget by dropping the OLDEST evictable rows.
   *
   * Same two exemptions the row cap uses, for the same reasons: `_dirty` rows
   * are unpushed local edits and `protect` is the row being written right now.
   * Which means an all-dirty store cannot be shrunk at all — and that is the
   * point. A drafts store over budget FAILS THE WRITE rather than deleting
   * somebody's unsent work to make room for the next one.
   */
  function evictToFit(map, protect) {
    let total = 0;
    const rows = [];
    for (const [key, record] of map) {
      const bytes = entryBytes(key, record);
      total += bytes;
      if (record && record._dirty) continue;
      if (protect !== undefined && String(key) === String(protect)) continue;
      rows.push({ key, bytes, at: record && record._updatedAt ? String(record._updatedAt) : '' });
    }
    if (total <= maxBytes) return { total, evicted: [] };
    // Stamped rows oldest-first; unstamped last, so an unknown age is treated as
    // unknown rather than as epoch-zero.
    rows.sort((a, b) => {
      if (!a.at && !b.at) return 0;
      if (!a.at) return 1;
      if (!b.at) return -1;
      return a.at.localeCompare(b.at);
    });
    const evicted = [];
    for (const row of rows) {
      if (total <= maxBytes) break;
      map.delete(row.key);
      total -= row.bytes;
      evicted.push(row.key);
    }
    return { total, evicted };
  }

  /** Persist `map`. Returns the same result shape as put/delete. */
  function save(map, protect) {
    const store = webStorage();
    if (!store) {
      // NOT `{ ok: true }`. This backend is only ever chosen because Web Storage
      // existed at construction, so reaching here means it went away mid-session
      // (a WKWebView data store cleared, a permission revoked) — and answering
      // "ok" to a write that reached nothing is the exact silent-loss shape this
      // store's quota path was written to end (review finding F4). Retain the
      // rows for the session and tell the caller, the same way the quota branch
      // does.
      memoryFallback.set(storeKey, new Map(map));
      return {
        ok: false, reason: 'unavailable', budget: maxBytes, evicted: [],
      };
    }
    const { total, evicted } = evictToFit(map, protect);
    if (total > maxBytes) {
      // Over budget with nothing left to give — every remaining row is either
      // dirty or the row being written. Refuse rather than drop a draft.
      memoryFallback.set(storeKey, new Map(map));
      return {
        ok: false, reason: 'budget', bytes: total, budget: maxBytes, evicted,
      };
    }
    try {
      store.setItem(storeKey, JSON.stringify(Object.fromEntries(map)));
      // Back on disk: whatever we were holding in memory is now redundant.
      memoryFallback.delete(storeKey);
      return { ok: true, ...(evicted.length ? { evicted } : {}) };
    } catch (e) {
      // The ORIGIN quota, not our own budget — some other key filled the 5MB, or
      // storage is disabled. Keep the rows for the session so the write is not
      // simply lost, and tell the caller it did not reach disk.
      memoryFallback.set(storeKey, new Map(map));
      return {
        ok: false, reason: 'quota', bytes: total, budget: maxBytes, evicted, error: e?.name || 'Error',
      };
    }
  }

  return {
    async get(key) { return load().get(String(key)); },
    async getAll() { return [...load().values()]; },
    async put(key, record) {
      const map = load();
      map.set(String(key), record);
      return save(map, String(key));
    },
    async delete(key) { const map = load(); map.delete(String(key)); return save(map); },
    keys() { return [...load().keys()]; },
  };
}

/**
 * Default row cap for a store (memory audit 2026-08-31). `reconcile` prunes
 * only rows in the CURRENT scope, so a store fed one window after another
 * (schedule/attendance/timesheet caches paging through weeks) accumulated
 * every window ever viewed for the world's lifetime.
 *
 * DELIBERATELY GENEROUS (owner ruling 2026-08-31: optimise for fast toggle,
 * not minimum memory). This is a backstop against UNBOUNDED growth, never a
 * working-set limit: a large tenant's real working set (the bench's 401
 * members / 8,865 events) must stay resident so returning to a team repaints
 * warm instead of re-fetching. Callers needing a tighter bound pass `maxRows`.
 */
const DEFAULT_MAX_ROWS = 50000;

/**
 * How many WINDOWS a window-paging store keeps (spec mp-durable-instant-surfaces
 * round-5). Three, because the experience being bought is instant
 * back-navigation: the window you are on plus the one either side of it covers
 * "back to last week and forward again" without a fetch, and every window beyond
 * that is an archive nobody asked to keep. Only applies to reconciles that pass a
 * `windowKey`; a store that never does is unaffected.
 */
const DEFAULT_MAX_WINDOWS = 3;

/**
 * Thrown by `put`/`delete` when the write could not be persisted.
 *
 * ⚠ IT REJECTS *AND* THE ROW IS FLAGGED, DELIBERATELY BOTH. Rejecting alone
 * rides the MP panel boundary, which swallows async handler rejections, so a
 * caller that fires and forgets would learn nothing. Flagging alone leaves every
 * existing `await store.put(...)` believing it succeeded. The two audiences are
 * different: the CALLER needs the truth, and the USER needs a surface able to
 * say "saved on this device only". `_persistFailed` on the retained row is what
 * lets a surface say it.
 */
export class PersistError extends Error {
  constructor(storeName, result) {
    super(`store '${storeName}': write not persisted (${result?.reason || 'unknown'})`);
    this.name = 'PersistError';
    this.reason = result?.reason || 'unknown';
    this.bytes = result?.bytes;
    this.budget = result?.budget;
    this.evicted = result?.evicted || [];
    this.storeName = storeName;
  }
}

export function createDataStore({
  name, keyPath = 'id', recordSchema, backend = createMemoryStoreBackend(),
  now = () => Date.now(), maxRows = DEFAULT_MAX_ROWS, maxWindows = DEFAULT_MAX_WINDOWS, onPersistError,
}) {
  const validate = recordSchema ? ajv.compile(recordSchema) : null;
  const wholeStoreSubscribers = new Set();
  const selectorSubscribers = new Set(); // {selector, handler, touched:Set, last}

  /**
   * Resident row count, so `put` can bound the store WITHOUT walking it.
   *
   * ⚠ THE CAP HAS TO BE FREE ON THE STEADY-STATE PATH. `enforceRowCap` opens
   * with `backend.getAll()`; calling it on every put would add an O(store)
   * array build to every optimistic write, and the stores nearest the cap are
   * exactly the hot ones — a windowed cache holding thousands of rows, written
   * per-row inside loops by the flows that drag, publish and assign shifts. So
   * the count is tracked instead and the walk happens only when it is exceeded.
   *
   * Null until first use: seeding it costs a `keys()` call, which a
   * localStorage-backed store answers by parsing its whole blob. Doing that at
   * construction would tax every manager build, including for MPs the user
   * never opens.
   */
  let residentCount = null;
  // ⚠ THE CAP CAN BE SATURATED, AND THEN IT MUST STOP TRYING. `enforceRowCap`
  // evicts nothing when every resident row is dirty (an unsynced drafts store is
  // exactly that by definition — Phase 2 documents it as the expected steady
  // state). `residentCount` therefore stays above `maxRows` forever, and without
  // this latch EVERY later put paid a full `backend.getAll()` walk that could
  // not help — quietly breaking the "no extra store walk per write" constraint in
  // the configuration most likely to hit it (review finding F5). Anything that
  // can make a row evictable again — a delete, a markSynced clearing `_dirty` —
  // clears the latch.
  let capSaturated = false;

  /**
   * Tell the host a write did not reach disk. One channel, not two: the host
   * decides where it goes (a once-per-store log, telemetry, a user-facing
   * warning) because the SDK cannot know. A throwing handler must never turn a
   * failed write into a different failure.
   */
  const reportPersistFailure = (result, key) => {
    if (typeof onPersistError !== 'function') return;
    try {
      onPersistError({
        store: name,
        key,
        reason: result?.reason || 'unknown',
        bytes: result?.bytes,
        budget: result?.budget,
        evicted: result?.evicted || [],
      });
    } catch (_) { /* the reporter's problem, not the write's */ }
  };

  const keyOf = (record) => record[keyPath];

  /** Drop the sync-metadata stamps (_rev/_dirty/_updatedAt/_dedupeKey) so a read
   *  returns clean, re-put-safe domain rows. */
  const stripMeta = (record) => Object.fromEntries(
    Object.entries(record).filter(([key]) => !key.startsWith('_')),
  );

  async function snapshot() { return backend.getAll(); }

  /**
   * Evict the OLDEST evictable rows once the store exceeds `maxRows`.
   *
   * NEVER evictable:
   *   · `_dirty` rows — unpushed local writes; dropping one silently loses a
   *     user's edit. A store whose rows are all dirty stays OVER the cap:
   *     the sync engine, not eviction, is what relieves it.
   *   · `protect` — the keys the in-flight reconcile just fetched. Without
   *     this the budget was computed against ALL rows (dirty included) but
   *     spent on the only candidates available, which are the freshest ones:
   *     a store holding many dirty rows strip-mined the CURRENT window and the
   *     grid silently painted half of it (adversarial review 2026-08-31).
   *
   * Rows lacking `_updatedAt` sort as UNKNOWN age, not as epoch-zero, so they
   * are evicted only after genuinely-older stamped rows.
   *
   * Deletion is always SILENT and the evicted keys are RETURNED, so the caller
   * folds them into whatever notify it was going to fire anyway and one logical
   * change costs one subscriber pass: a notify per deleted row fired a full
   * pass each (202 repaints for one logical change, measured).
   */
  async function enforceRowCap({ protect, changed } = {}) {
    if (!Number.isFinite(maxRows) || maxRows <= 0) return [];
    const rows = await backend.getAll();
    if (rows.length <= maxRows) return [];
    const evictable = rows.filter((row) => !row._dirty
      && !(protect && protect.has(String(keyOf(row)))));
    // Budget against what may ACTUALLY go: never more than the evictable set,
    // so a dirty-heavy store stays over the cap instead of eating fresh rows.
    const over = Math.min(rows.length - maxRows, evictable.length);
    if (over <= 0) return [];
    const stamped = evictable.filter((row) => row._updatedAt)
      .sort((a, b) => String(a._updatedAt).localeCompare(String(b._updatedAt)));
    const unstamped = evictable.filter((row) => !row._updatedAt);
    const doomed = [...stamped, ...unstamped].slice(0, over);
    const evicted = [];
    for (const row of doomed) {
      const key = keyOf(row);
      // eslint-disable-next-line no-await-in-loop
      await api.delete(key, { silent: true });
      if (changed) changed.add(key);
      evicted.push(key);
    }
    return evicted;
  }

  /**
   * Keep the K most recently touched WINDOWS; delete the rows of older ones.
   *
   * ⚠ THE ROW CAP CANNOT DO THIS JOB. `enforceRowCap` sorts by `_updatedAt` and
   * drops the oldest ROWS, which on a window-paging store strip-mines whichever
   * window happens to hold the least recently written rows — potentially half of
   * the window the user is looking at. Retention has to be by window or it is
   * not retention, it is corruption of an arbitrary page.
   *
   * The current window is never dropped, dirty rows are never dropped (they are
   * unsynced local writes, same exemption as everywhere else), and untagged rows
   * are invisible to this pass — a store that never passes `windowKey` behaves
   * exactly as it did before.
   *
   * Recency is per WINDOW, and it is a VISIT COUNTER, not a timestamp.
   *
   * ⚠ `_updatedAt` IS NOT GOOD ENOUGH FOR THIS AND THE TEST CAUGHT IT. Paging
   * quickly (or any run of reconciles inside one millisecond) stamps several
   * windows identically, and with tied stamps "most recent" collapses to
   * whatever order the backend happens to iterate in — which dropped the middle
   * window and kept the oldest. `windowVisits` records the order windows were
   * actually reconciled in, so recency is exact regardless of clock resolution.
   * `_updatedAt` remains the tie-break for windows this session has not visited
   * (rows rehydrated from disk carry no visit number).
   */
  // Visit order for window retention: windowKey -> monotonically increasing
  // sequence, bumped every time a reconcile names that window. Per store
  // instance and deliberately NOT persisted — it describes this session's
  // navigation, and a rehydrated store falls back to `_updatedAt`.
  const windowVisits = new Map();
  let windowVisitSeq = 0;

  async function enforceWindowRetention({ current, changed, keep = maxWindows } = {}) {
    if (!Number.isFinite(keep) || keep <= 0) return [];
    const rows = await backend.getAll();
    const lastTouched = new Map();
    for (const row of rows) {
      const w = row && row._window;
      if (w == null) continue;
      const at = String(row._updatedAt || '');
      const prev = lastTouched.get(w);
      if (prev === undefined || at.localeCompare(prev) > 0) lastTouched.set(w, at);
    }
    if (lastTouched.size <= keep) return [];
    const ordered = [...lastTouched.entries()]
      .sort((a, b) => {
        const va = windowVisits.get(a[0]);
        const vb = windowVisits.get(b[0]);
        if (va !== undefined || vb !== undefined) return (vb ?? -1) - (va ?? -1);
        return b[1].localeCompare(a[1]);
      })
      .map(([w]) => w);
    // The current window is retained regardless of stamp order — it is the one
    // the user is looking at, and on a first visit its rows may be the oldest.
    const kept = new Set([current, ...ordered.filter((w) => w !== current).slice(0, Math.max(0, keep - 1))]);
    const doomed = ordered.filter((w) => !kept.has(w));
    if (!doomed.length) return [];
    const drop = new Set(doomed);
    for (const row of rows) {
      if (!row || row._window == null || !drop.has(row._window) || row._dirty) continue;
      const key = keyOf(row);
      // eslint-disable-next-line no-await-in-loop
      await api.delete(key, { silent: true });
      if (changed) changed.add(key);
    }
    return doomed;
  }

  function trackedQuery(records, touched) {
    const byKey = new Map(records.map((r) => [keyOf(r), r]));
    return {
      get(key) { touched.add(key); return byKey.get(key); },
      getAll() { touched.add('*'); return records; },
    };
  }

  /**
   * Fan a change out to subscribers. `changed` is ONE key or an iterable of
   * them — reconcile passes the whole batch so a merge of N records wakes
   * every subscriber exactly once instead of N times (see reconcile below).
   */
  async function notify(changed) {
    const changedKeys = (changed && typeof changed !== 'string' && typeof changed[Symbol.iterator] === 'function')
      ? new Set(changed)
      : new Set([changed]);
    const records = await snapshot();
    for (const handler of wholeStoreSubscribers) {
      try { handler(records); } catch (_) { /* subscriber errors are theirs */ }
    }
    for (const sub of selectorSubscribers) {
      if (!sub.touched.has('*') && ![...changedKeys].some((k) => sub.touched.has(k))) continue;
      const touched = new Set();
      const value = sub.selector(trackedQuery(records, touched));
      sub.touched = touched;
      if (JSON.stringify(value) !== JSON.stringify(sub.last)) {
        sub.last = value;
        try { sub.handler(value); } catch (_) { /* theirs */ }
      }
    }
  }

  const api = {
    async get(key) {
      return backend.get(key);
    },
    async getAll() {
      return snapshot();
    },
    /** Cache-read half of SWR: the stored records matching `predicate(record)`,
     *  meta stamps stripped (clean domain rows). Sorting is the caller's job. */
    async readWhere(predicate = () => true) {
      return (await snapshot()).filter(predicate).map(stripMeta);
    },
    async put(record, { dedupeKey, silent = false, deferCap = false } = {}) {
      if (validate && !validate(record)) {
        const detail = (validate.errors || []).map((e) => `${e.instancePath || '$'} ${e.message}`).join('; ');
        throw new Error(`store '${name}': record failed recordSchema: ${detail}`);
      }
      const key = keyOf(record);
      if (key === undefined) throw new Error(`store '${name}': record missing keyPath '${keyPath}'`);
      const previous = await backend.get(key);
      if (residentCount === null) {
        // `keys()` is the cheap route (both shipped backends answer it without
        // deserialising rows), but it is not part of the documented
        // backendFactory contract, so fall back rather than throw on a custom one.
        residentCount = typeof backend.keys === 'function'
          ? backend.keys().length
          : (await backend.getAll()).length;
      }
      const stamped = {
        ...record,
        _rev: (previous?._rev || 0) + 1,
        _updatedAt: new Date(now()).toISOString(),
        _dirty: true,
        ...(dedupeKey ? { _dedupeKey: dedupeKey } : {}),
      };
      const persisted = await backend.put(key, stamped);
      if (previous === undefined) residentCount += 1;
      if (persisted && persisted.ok === false) {
        // The row IS in the store — the backend retained it in memory — but it
        // is not on disk. Flag it so a surface can say so, notify so the flag
        // reaches that surface, tell the host, and only then reject.
        await backend.put(key, { ...stamped, _persistFailed: true });
        if (!silent) await notify(key);
        reportPersistFailure(persisted, key);
        throw new PersistError(name, persisted);
      }
      // Bound a store nothing reconciles. Until this existed the cap ran from
      // `reconcile` and nowhere else, so every put-only store — which is every
      // client-owned one, there being no server set to reconcile a drafts store
      // against — grew without a ceiling for the life of the installation.
      //
      // `deferCap` is for reconcile, which puts each record in turn and then
      // enforces once at the end: without it a merge would trim itself row by
      // row while it was still arriving, evicting rows the same merge was about
      // to add.
      let evicted = [];
      if (!deferCap && residentCount > maxRows && !capSaturated) {
        // `protect` the row just written — it is the newest thing in the store,
        // and eviction spending its budget on it would undo the write.
        evicted = await enforceRowCap({ protect: new Set([String(key)]) });
        // Nothing could go: the walk cannot help until something becomes
        // evictable, so stop repeating it (see `capSaturated`).
        capSaturated = evicted.length === 0;
      }
      // One notify for the write AND anything it displaced.
      if (!silent) await notify(evicted.length ? [key, ...evicted] : key);
      return key;
    },
    async delete(key, { silent = false } = {}) {
      capSaturated = false;   // one fewer row: the cap may be able to act again
      if (residentCount !== null && (await backend.get(key)) !== undefined) residentCount -= 1;
      const persisted = await backend.delete(key);
      if (!silent) await notify(key);
      if (persisted && persisted.ok === false) {
        reportPersistFailure(persisted, key);
        throw new PersistError(name, persisted);
      }
    },
    /** Sync engine hook: clear _dirty after a successful push. */
    async markSynced(key) {
      const record = await backend.get(key);
      if (!record) return;
      // Drop `_persistFailed` alongside `_dirty`: a row that reached the server
      // is no longer "saved on this device only", whatever happened to the local
      // copy on the way.
      const { _persistFailed: _pf, ...rest } = record;
      await backend.put(key, { ...rest, _dirty: false });
      capSaturated = false;   // a clean row is an evictable row

    },
    /**
     * SWR reconcile — merge a fresh AUTHORITATIVE set of records into the store,
     * the read-through pattern every windowed MP grid needs: upsert each record
     * and mark it synced (it came from the server, not a local edit), then prune
     * rows the fresh set dropped. Two invariants baked in so each MP can't get
     * them subtly wrong: locally-dirty (unsynced/optimistic) rows are NEVER
     * pruned, and only rows matching `scope` are prune-candidates (e.g. "in this
     * window") — omit `scope` for a whole-store authoritative replace. Returns
     * `{ upserted, pruned }`.
     *
     * `windowKey` (optional) TAGS the rows this reconcile wrote with the window
     * they belong to, which is what makes bounded retention possible on a
     * PERSISTED store. Scoped reconcile deliberately leaves out-of-scope rows
     * alone — that is what scoping means — so paging week to week ACCUMULATES
     * every week ever viewed, bounded only by the row cap. In memory that lasts
     * a session; on disk it is forever, which is precisely the 50-200MB archive
     * the legacy Vuex plugin refused to keep (`core/src/store/plugins/
     * indexeddb.js`). With a `windowKey`, `enforceWindowRetention` keeps the K
     * most recently touched windows and drops the rest. Untagged rows are never
     * touched by it: a non-windowed store behaves exactly as before.
     */
    async reconcile(records = [], { scope, windowKey } = {}) {
      const existing = await backend.getAll();
      const incoming = new Set();
      // ONE notify for the whole merge, at the end. Per-record notifies made a
      // reconcile of N rows wake every subscriber N times, each with a
      // partially-merged snapshot — so an instant-data surface repainted N
      // times on a single revalidate, and anything its render kicks off (the
      // Forms activity pane's per-subject reads) ran N times over a list that
      // grew by one row each pass. Quadratic, and every intermediate paint was
      // a lie about the store's contents.
      const changed = new Set();
      for (const record of records) {
        let key;
        try {
          // eslint-disable-next-line no-await-in-loop
          key = await api.put(record, { silent: true, deferCap: true });
        } catch (e) {
          // ⚠ TWO DIFFERENT FAILURES ARRIVE HERE AND THEY ARE NOT THE SAME ROW.
          //
          // A `PersistError` means the row IS in the store — the backend kept it
          // in memory and flagged `_persistFailed` — it just did not reach disk.
          // Skipping it here left it out of `incoming`, so the prune below then
          // DELETED it as absent, microseconds after the retain contract promised
          // to keep it. On a durable cache under storage pressure, which is the
          // one place this failure is likely at scale, `_persistFailed` was
          // therefore unobservable and the Phase 3 guarantee did not hold on the
          // reconcile path (review finding F2). Count it as present.
          //
          // Anything else — a `recordSchema` rejection — genuinely is not in the
          // store, and skipping it is correct: ONE bad record must not cost the
          // whole merge. The throw used to abort the loop mid-way, which with a
          // single notify at the end would paint NOTHING — a surface going blank
          // because row 12 of 31 had a number where the schema wants a string.
          if (e?.name === 'PersistError') {
            const failedKey = keyOf(record);
            if (failedKey !== undefined) {
              incoming.add(String(failedKey));
              changed.add(failedKey);
              // ...and clear `_dirty`, which `put` stamped on the way in. This
              // row came from the SERVER; leaving it dirty misuses the flag that
              // means "unpushed user work" and makes the row untouchable — dirty
              // rows are exempt from the prune, from the row cap and from window
              // retention, and this one is never `_window`-tagged either, so a
              // store under storage pressure would accumulate rows nothing could
              // ever collect (round-2 finding QG-R2-2, a consequence of the F2
              // repair above). `_persistFailed` is deliberately KEPT: not on disk
              // is still true.
              // eslint-disable-next-line no-await-in-loop
              const retained = await backend.get(failedKey);
              // eslint-disable-next-line no-await-in-loop
              if (retained) await backend.put(failedKey, { ...retained, _dirty: false });
            }
          }
          continue;
        }
        // eslint-disable-next-line no-await-in-loop
        await api.markSynced(key);
        // Tag the row with the window it was fetched under, so retention can
        // drop whole windows later. Written straight to the backend rather than
        // through `put` so it costs no schema validation and no extra notify —
        // `_window` is store metadata, the same class as `_updatedAt`, and must
        // never reach a recordSchema.
        if (windowKey != null) {
          // eslint-disable-next-line no-await-in-loop
          const stored = await backend.get(key);
          // eslint-disable-next-line no-await-in-loop
          if (stored) await backend.put(key, { ...stored, _window: String(windowKey) });
        }
        incoming.add(String(key));
        changed.add(key);
      }
      let pruned = 0;
      for (const row of existing) {
        const key = keyOf(row);
        if (incoming.has(String(key)) || row._dirty) continue; // kept: fresh or optimistic
        if (scope && !scope(row)) continue; // out of the reconcile scope
        // eslint-disable-next-line no-await-in-loop
        await api.delete(key, { silent: true });
        changed.add(key);
        pruned += 1;
      }
      // Out-of-scope rows survive the prune above BY DESIGN (that is what
      // scoped reconcile means), so the cap is the only thing standing
      // between a window-paging store and unbounded growth. Evictions join
      // the SAME `changed` batch as the upserts and prunes, so the whole
      // reconcile still costs exactly one notify.
      if (windowKey != null) {
        windowVisitSeq += 1;
        windowVisits.set(String(windowKey), windowVisitSeq);
      }
      const dropped = windowKey != null
        ? await enforceWindowRetention({ current: String(windowKey), changed })
        : [];
      const evicted = await enforceRowCap({ protect: incoming, changed });
      capSaturated = false;   // the merge changed both the row set and its dirtiness
      if (changed.size) await notify(changed);
      return {
        upserted: incoming.size,
        pruned,
        ...(dropped.length ? { windowsDropped: dropped.length } : {}),
        ...(evicted.length ? { evicted: evicted.length } : {}),
      };
    },
    subscribe(handler) {
      wholeStoreSubscribers.add(handler);
      return () => wholeStoreSubscribers.delete(handler);
    },
    subscribeQuery(selector, handler) {
      const sub = { selector, handler, touched: new Set(['*']), last: undefined };
      // Prime: compute initial value + touched set without firing the handler.
      snapshot().then((records) => {
        const touched = new Set();
        sub.last = selector(trackedQuery(records, touched));
        sub.touched = touched;
      });
      selectorSubscribers.add(sub);
      return () => selectorSubscribers.delete(sub);
    },
  };
  return api;
}
