import { createTransactionalDataStore, copyStorageRow } from './transactional-store.js';
import { utf16Units } from './bytes.js';
import { unchangedServerRow, heldProvenance, holdRowFields } from './unchanged-row.js';
/**
 * The DataStore behind `tommy.data.store(name)`: enforces the manifest
 * `recordSchema` on every put, stamps sync metadata `{_rev, _updatedAt,
 * _dirty}` (+ `_dedupeKey`, the per-write identity), and serves `subscribe`
 * and `subscribeQuery`. Backends are injected; store creation from the
 * manifest is the manager's job.
 */
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

/**
 * Why a row does not fit a declared record schema, or null when it fits (or
 * there is no schema): the same check a store's `put` makes.
 */
export function recordSchemaCheck(recordSchema) {
  const validate = recordSchema ? ajv.compile(recordSchema) : null;
  return (row) => (validate && !validate(row)
    ? (validate.errors || []).map((e) => `${e.instancePath || '$'} ${e.message}`).join('; ') : null);
}

// Per backend: the pending write turn of each row key (see `rowTurn`). A
// backend over shared storage names it (`turnKey`), so every handle over that
// storage in this page takes the same turns.
const backendTurns = new WeakMap();
const sharedTurns = new Map();
function turnsFor(backend) {
  if (typeof backend.turnKey === 'string') {
    if (!sharedTurns.has(backend.turnKey)) sharedTurns.set(backend.turnKey, new Map());
    return sharedTurns.get(backend.turnKey);
  }
  if (!backendTurns.has(backend)) backendTurns.set(backend, new Map());
  return backendTurns.get(backend);
}

/** The origin's Web Locks, shared by every tab, or null where the runtime has none. */
function webLocks() {
  try {
    const locks = globalThis.navigator?.locks;
    return locks && typeof locks.request === 'function' ? locks : null;
  } catch (_) {
    return null;
  }
}
/**
 * Runs `task` holding the Web Lock for shared storage `name`, so a read-check-
 * write in one tab never interleaves with another tab's write. Without Web
 * Locks the fenced delete relies on `deleteIf` being one synchronous step.
 */
function acrossTabs(name, task) {
  const locks = webLocks();
  return locks ? locks.request(`offline-sync:${name}`, () => task()) : task();
}

/** Rows keyed as strings like every other backend (a numeric id and its text find the same row). */
export function createMemoryStoreBackend() {
  const rows = new Map();
  return {
    async get(key) { return rows.get(String(key)); },
    async getAll() { return [...rows.values()]; },
    async put(key, record) { rows.set(String(key), record); },
    async delete(key) { rows.delete(String(key)); },
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
 * Default byte budget for ONE localStorage-backed store: ~10% of the ~5MB
 * origin quota. Budgeted in bytes, not rows, because a signed form draft
 * (base64 PNG, ~40KB) is ~100x a mileage draft (~415 bytes).
 */
const DEFAULT_MAX_BYTES = 512 * 1024;

/**
 * How much bigger than the byte budget the RETAINED (undisked) map may get
 * before the oldest rows are dropped. Must stay above 1: at 1 the very first
 * refused write would delete a draft the quota guard chose to keep.
 */
const RETAINED_BUDGET_MULTIPLE = 2;

/**
 * Rows a failed save is holding in memory, keyed by store key. `load()` reads
 * this first, so a write that missed disk survives until reload.
 */
const memoryFallback = new Map();

/** Storage a backend could not reach: its store is unknown, not empty. */
export function storageUnavailable(storeKey, cause) {
  return Object.assign(new Error(`'${storeKey}': device storage could not be read`), {
    name: 'StorageUnavailable', code: 'DATA_UNAVAILABLE', ...(cause ? { cause } : {}),
  });
}

/** What one entry costs in the serialised blob: Web Storage charges its
 *  quota in UTF-16 code units, so this store's budget counts those. */
const entryBytes = (key, record) => utf16Units(JSON.stringify(String(key)))
  + utf16Units(JSON.stringify(record)) + 1;

/**
 * A localStorage-backed backend: the memory backend's contract, persisted as
 * one JSON blob under `mp-store:{dbName}:{storeName}`. Sized for small
 * client-owned stores (`syncStrategy: last_write_wins`).
 *
 * `put`/`delete` never throw; they resolve `{ ok: true }` or
 * `{ ok: false, reason, bytes, budget, evicted }` and the DataStore decides
 * what a failed persist means. Unreachable storage rejects reads with
 * DATA_UNAVAILABLE so an unknown store is never taken for an empty one; a
 * corrupt blob reads as empty and the next write replaces it.
 */
export function createLocalStorageBackend(dbName, storeName, { maxBytes = DEFAULT_MAX_BYTES, evict = true } = {}) {
  const storeKey = `mp-store:${dbName}:${storeName}`;
  function load() {
    if (memoryFallback.has(storeKey)) return new Map(memoryFallback.get(storeKey));
    const store = webStorage();
    if (!store) throw storageUnavailable(storeKey);
    let raw;
    try { raw = store.getItem(storeKey); } catch (error) { throw storageUnavailable(storeKey, error); }
    if (!raw) return new Map();
    try {
      return new Map(Object.entries(JSON.parse(raw)));
    } catch (_) {
      return new Map();
    }
  }

  /**
   * Bring `map` under the byte budget by dropping the OLDEST evictable rows.
   * `_dirty` rows (unsent edits) and `protect` (the row being written) are
   * never evicted, so an all-dirty store over budget fails the write rather
   * than deleting unsent work. With `evict: false` (device-authored stores)
   * nothing is evictable: each row is the only copy.
   */
  function evictToFit(map, protect) {
    let total = 0;
    const rows = [];
    for (const [key, record] of map) {
      const bytes = entryBytes(key, record);
      total += bytes;
      if (!evict || (record && record._dirty)) continue;
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

  /**
   * Bound the map RETAINED in memory when a save could not reach disk, which
   * otherwise grows a row per refused write (the row cap skips dirty rows).
   * Past the ceiling rows go oldest-first, dirty included, never silently:
   * the keys return to `put`, which tells subscribers and the host.
   */
  function boundRetained(map, protect) {
    const ceiling = maxBytes * RETAINED_BUDGET_MULTIPLE;
    let total = 0;
    const rows = [];
    for (const [key, record] of map) {
      const bytes = entryBytes(key, record);
      total += bytes;
      if (protect !== undefined && String(key) === String(protect)) continue;
      rows.push({ key, bytes, at: record && record._updatedAt ? String(record._updatedAt) : '' });
    }
    if (total <= ceiling) return [];
    rows.sort((a, b) => {
      if (!a.at && !b.at) return 0;
      if (!a.at) return 1;
      if (!b.at) return -1;
      return a.at.localeCompare(b.at);
    });
    const discarded = [];
    for (const row of rows) {
      if (total <= ceiling) break;
      map.delete(row.key);
      total -= row.bytes;
      discarded.push(row.key);
    }
    return discarded;
  }

  /**
   * Retain `map` for the session, bounded, and report what the bound cost.
   * With `evict: false` nothing is held: the write is refused and the store
   * stays as saved, so no saved row is ever trimmed to bound what is held.
   */
  function retain(map, protect) {
    if (!evict) return { discarded: [], refused: true };
    const discarded = boundRetained(map, protect);
    memoryFallback.set(storeKey, new Map(map));
    return { discarded, refused: false };
  }

  /**
   * Patch a row already held in the retained map, WITHOUT a second save: going
   * through `put` would rerun the whole save path for every refused write.
   */
  function patchRetained(key, patch) {
    const map = memoryFallback.get(storeKey);
    if (!map) return false;
    const record = map.get(String(key));
    if (!record) return false;
    map.set(String(key), { ...record, ...patch });
    return true;
  }

  /**
   * Persist `map`. Returns the same result shape as put/delete; a write
   * refused and not held anywhere (see `retain`) says `retained: false`.
   */
  function save(map, protect) {
    const store = webStorage();
    if (!store) {
      // Web Storage went away mid-session (data store cleared, permission
      // revoked): retain the rows and report the failure, as the quota branch does.
      const { discarded, refused } = retain(map, protect);
      return {
        ok: false, reason: 'unavailable', budget: maxBytes, evicted: [], discarded, ...(refused ? { retained: false } : {}),
      };
    }
    const { total, evicted } = evictToFit(map, protect);
    if (total > maxBytes) {
      // Every remaining row is dirty or being written: refuse rather than drop a draft.
      const { discarded, refused } = retain(map, protect);
      return {
        ok: false, reason: 'budget', bytes: total, budget: maxBytes, evicted, discarded, ...(refused ? { retained: false } : {}),
      };
    }
    try {
      store.setItem(storeKey, JSON.stringify(Object.fromEntries(map)));
      memoryFallback.delete(storeKey);
      return { ok: true, ...(evicted.length ? { evicted } : {}) };
    } catch (e) {
      // The ORIGIN quota (another key filled it) or storage disabled.
      const { discarded, refused } = retain(map, protect);
      return {
        ok: false, reason: 'quota', bytes: total, budget: maxBytes, evicted, discarded, error: e?.name || 'Error', ...(refused ? { retained: false } : {}),
      };
    }
  }

  // A write whose store cannot be read keeps nothing: a partial map would
  // later read as the whole store.
  const unreadable = (error) => {
    if (error?.code !== 'DATA_UNAVAILABLE') throw error;
    return { ok: false, reason: 'unavailable', budget: maxBytes, evicted: [], discarded: [], retained: false };
  };
  const loadForWrite = () => {
    try { return { map: load() }; } catch (error) { return { refused: unreadable(error) }; }
  };
  return {
    async get(key) { return load().get(String(key)); },
    async getAll() { return [...load().values()]; },
    async put(key, record) {
      const { map, refused } = loadForWrite();
      if (refused) return refused;
      map.set(String(key), record);
      return save(map, String(key));
    },
    async delete(key) {
      const { map, refused } = loadForWrite();
      if (refused) return refused;
      map.delete(String(key));
      return save(map);
    },
    /**
     * Deletes the row unless `keep(stored)` says otherwise, reading and writing
     * the storage in one synchronous step. Resolves `{ kept: true }` when the
     * stored row was kept, otherwise the delete's result with `existed`.
     */
    async deleteIf(key, keep) {
      const { map, refused } = loadForWrite();
      if (refused) return refused;
      const stored = map.get(String(key));
      if (stored !== undefined && keep(stored)) return { kept: true };
      if (stored === undefined) return { ok: true, existed: false };
      map.delete(String(key));
      return { ...save(map), existed: true };
    },
    keys() { return [...load().keys()]; },
    patchRetained,
    turnKey: storeKey,
  };
}

/**
 * Default row cap: a backstop against UNBOUNDED growth (reconcile prunes only
 * the current scope, so a window-paging cache keeps every window it saw),
 * never a working-set limit. Deliberately generous so a large tenant's working
 * set stays resident and repaints warm. Pass `maxRows` for a tighter bound.
 */
const DEFAULT_MAX_ROWS = 50000;

/**
 * Windows a window-paging store keeps: the current one plus one either side,
 * for instant back/forward navigation. Applies only to reconciles that pass a
 * `windowKey`.
 */
const DEFAULT_MAX_WINDOWS = 3;

/**
 * How old a cached row may be and still be PAINTED, the same for every store:
 * a device closed for a fortnight starts cold rather than confidently stale.
 * A cache opts out only with `paintCeiling: false` (rows valid at any age,
 * e.g. pages checked by content hash); its other limits still apply. A
 * client-owned (`last_write_wins`) store is not a cache and is exempt.
 */
export const PAINT_CEILING_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Thrown by `put`/`delete` when the write could not be persisted. The row is
 * also flagged `_persistFailed`: the caller needs the rejection, while a
 * fire-and-forget caller (the MP panel boundary swallows rejections) leaves
 * the flag as the only way a surface can say "saved on this device only".
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
    this.retained = result?.retained !== false;
  }
}

/**
 * Index order for stores without a physical index (memory and Web Storage):
 * the same value order the host store's encoding gives, so a query returns
 * the same rows in the same order on every backend.
 */
function compareIndexValues(a, b) {
  const rank = (value) => (value === null || value === undefined ? 0 : typeof value === 'boolean' ? 1 : typeof value === 'number' ? 2 : 3);
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
export function queryRows(rows, fields, { equals, prefix, lower, upper } = {}, keyOf = (row) => row.id) {
  const head = equals || prefix || [];
  const at = head.length;
  return rows.filter((row) => head.every((value, index) => compareIndexValues(row[fields[index]], value) === 0)
    && (lower === undefined || compareIndexValues(row[fields[at]], lower) >= 0)
    && (upper === undefined || compareIndexValues(row[fields[at]], upper) <= 0))
    .sort((a, b) => {
      for (const field of fields) { const result = compareIndexValues(a[field], b[field]); if (result) return result; }
      const ka = String(keyOf(a)); const kb = String(keyOf(b));
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
}

export function createDataStore({
  name, keyPath = 'id', recordSchema, backend = createMemoryStoreBackend(),
  now = () => Date.now(), maxRows = DEFAULT_MAX_ROWS, maxWindows = DEFAULT_MAX_WINDOWS, onPersistError,
  syncStrategy = 'server_authoritative', indexes = {}, paintCeiling = true,
  heldFields = [], ignoredFields = [],
}) {
  if (typeof paintCeiling !== 'boolean') throw new TypeError(`store '${name}': paintCeiling must be true or false`);
  const validate = recordSchema ? ajv.compile(recordSchema) : null;
  // A client-owned (`last_write_wins`) store holds the only copy of its rows:
  // neither the row cap nor window retention removes them.
  const evictsRows = syncStrategy !== 'last_write_wins';
  const wholeStoreSubscribers = new Set();
  const selectorSubscribers = new Set(); // {selector, handler, touched:Set, last}
  const changeListeners = new Set();

  /**
   * Resident row count, so `put` only walks the store (`enforceRowCap`) when
   * the cap is exceeded: hot windowed caches are written per-row in loops.
   * Null until first use, because seeding it parses a localStorage blob.
   */
  let residentCount = null;
  // Set when the cap could evict nothing (every row dirty, the normal state of
  // an unsynced drafts store), so later puts skip a walk that cannot help.
  // Anything that can make a row evictable again clears it.
  let capSaturated = false;
  // The highest revision written or removed. A key rewritten after removal
  // takes a revision above it, so a push still in flight cannot settle the
  // new row.
  let revisionTop = 0;
  const noteRevision = (row) => { if (Number.isSafeInteger(row?._rev) && row._rev > revisionTop) revisionTop = row._rev; };
  const nextRowRevision = (previous) => { revisionTop = Math.max(revisionTop, previous?._rev || 0) + 1; return revisionTop; };
  // `put`, `delete` and `markSynced` on the same key take turns, so a check
  // against the stored row (dirty, revision) still holds when the write lands.
  // Turns belong to the backend (every handle shares them); over Web Storage
  // each turn also holds the cross-tab Web Lock. Durable collections use the
  // transactional host store, which checks inside its commit.
  const rowTurns = turnsFor(backend);
  const sharedStorage = typeof backend.turnKey === 'string' ? backend.turnKey : null;
  function rowsTurn(keys, task) {
    const ids = [...new Set(keys.map(String))];
    const run = sharedStorage ? () => acrossTabs(sharedStorage, task) : task;
    const next = Promise.all(ids.map((id) => rowTurns.get(id) || Promise.resolve())).then(run);
    const tail = next.then(() => {}, () => {});
    ids.forEach((id) => rowTurns.set(id, tail));
    tail.then(() => ids.forEach((id) => { if (rowTurns.get(id) === tail) rowTurns.delete(id); }));
    return next;
  }
  const rowTurn = (key, task) => rowsTurn([key], task);

  /**
   * Tell the host a write did not reach disk; the host decides where that
   * goes. A throwing handler must never turn a failed write into another failure.
   */
  const reportPersistFailure = (result, key) => {
    if (typeof onPersistError !== 'function') return;
    try {
      onPersistError({
        event: 'persist_failed',
        store: name,
        key,
        reason: result?.reason || 'unknown',
        bytes: result?.bytes,
        budget: result?.budget,
        evicted: result?.evicted || [],
      });
    } catch (_) { /* the reporter's problem, not the write's */ }
  };

  /**
   * Account for the rows a backend result says are GONE: byte-evicted on a
   * save, or discarded by the retention bound on a failed one. RULE: every
   * `backend.put(...)`/`backend.delete(...)` result in this file goes through
   * here, success or failure, or `residentCount` drifts and subscribers to
   * those rows never fire. Returns the keys, to fold into the caller's one notify.
   */
  function accountForGoneRows(persisted, key) {
    const byteEvicted = persisted?.evicted || [];
    const discarded = persisted?.discarded || [];
    const gone = byteEvicted.length + discarded.length;
    if (!gone) return [];
    if (residentCount !== null) residentCount -= gone;
    capSaturated = false;
    // The eviction report says the write succeeded; a refused write's
    // evictions already ride its persist_failed report.
    if (byteEvicted.length && persisted?.ok !== false) reportPersistEviction(persisted, key);
    if (discarded.length) reportRetentionDiscard(persisted, key);
    return [...byteEvicted, ...discarded];
  }

  /**
   * Tell the host the RETENTION BOUND dropped rows from the in-memory fallback,
   * `_dirty` ones included, so anything unsynced in them is lost. It cannot
   * claim they never reached disk: an earlier write may have saved them.
   */
  const reportRetentionDiscard = (result, key) => {
    if (typeof onPersistError !== 'function') return;
    try {
      onPersistError({
        event: 'retention_discarded',
        store: name,
        key,
        reason: result?.reason || 'budget',
        bytes: result?.bytes,
        budget: result?.budget,
        evicted: result?.discarded || [],
      });
    } catch (_) { /* the reporter's problem, not the write's */ }
  };

  /**
   * Tell the host the byte guard DELETED rows on a write that SUCCEEDED. Its
   * own `event`, not the failure shape: the host de-dupes failures once per
   * `mpId:store`, so an eviction must never suppress a later real failure.
   */
  const reportPersistEviction = (result, key) => {
    if (typeof onPersistError !== 'function') return;
    try {
      onPersistError({
        event: 'evicted',
        store: name,
        key,
        reason: 'budget',
        bytes: result?.bytes,
        budget: result?.budget,
        evicted: result?.evicted || [],
      });
    } catch (_) { /* the reporter's problem, not the write's */ }
  };

  const keyOf = (record) => record[keyPath];

  /** Drop the `_` sync-metadata stamps so a read returns re-put-safe domain rows. */
  const stripMeta = (record) => Object.fromEntries(
    Object.entries(record).filter(([key]) => !key.startsWith('_')),
  );

  async function snapshot() { return backend.getAll(); }

  /**
   * A delete the STORE performs (prune, row cap, window retention). It must not
   * throw: its callers loop mid-reconcile, and one rejection would abort the
   * reconcile before it notifies. A failed persist is already reported by
   * `delete()`; the row just stays. With `expectedRevision`, a row written
   * since it was read is kept. Resolves whether the row left memory.
   */
  async function evict(key, expectedRevision) {
    try {
      await api.delete(key, { silent: true, ...(expectedRevision !== undefined ? { expectedRevision } : {}) });
      return true;
    } catch (e) {
      if (e?.name !== 'PersistError') throw e;
      return e.reason !== 'conflict';
    }
  }

  /**
   * Evict the OLDEST evictable rows once the store exceeds `maxRows`. Never
   * evicted: `_dirty` rows (unsent edits; an all-dirty store stays over the
   * cap), `protect` (keys the running reconcile just fetched, else the current
   * window is the one eaten), and any row of a `last_write_wins` store.
   * Unstamped rows count as unknown age and go last. Deletes are silent and
   * the keys are returned, so one logical change costs one notify.
   */
  async function enforceRowCap({ protect, changed } = {}) {
    if (!evictsRows || !Number.isFinite(maxRows) || maxRows <= 0) return [];
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
      if (!(await evict(key, row._rev))) continue;
      if (changed) changed.add(key);
      evicted.push(key);
    }
    return evicted;
  }

  // Visit order for window retention: windowKey -> sequence, bumped whenever a
  // reconcile names that window. `_updatedAt` ties within a millisecond, so
  // recency needs the counter; it is per session, and unvisited (rehydrated)
  // windows fall back to `_updatedAt`.
  const windowVisits = new Map();
  let windowVisitSeq = 0;

  /**
   * Whether a row may be PAINTED: caches age out at the paint ceiling unless
   * declared `paintCeiling: false`; client-owned rows and dirty rows never do.
   */
  const ceilingApplies = evictsRows && paintCeiling;
  // A local delete waiting to be sent (`_deleted`) never paints.
  const paintable = (row) => {
    if (row?._deleted) return false;
    if (!ceilingApplies || !row || row._dirty) return true;
    const at = Date.parse(row._updatedAt || '');
    return !Number.isFinite(at) || at >= now() - PAINT_CEILING_MS;
  };

  if (backend.transactional) return createTransactionalDataStore({ name, keyPath, backend, validate, paintable, now, PersistError, onPersistError, maxWindows: evictsRows ? maxWindows : Infinity, indexes, queryRows, heldFields, ignoredFields });


  /**
   * Keep the K most recently visited WINDOWS; delete the rows of older ones.
   * The row cap cannot do this: oldest-rows-first eats an arbitrary part of a
   * window. The current window and dirty rows are never dropped; untagged rows
   * are not touched.
   */
  async function enforceWindowRetention({ current, changed, keep = maxWindows } = {}) {
    if (!evictsRows || !Number.isFinite(keep) || keep <= 0) return [];
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
    // On a first visit the current window's rows may be the oldest.
    const kept = new Set([current, ...ordered.filter((w) => w !== current).slice(0, Math.max(0, keep - 1))]);
    const doomed = ordered.filter((w) => !kept.has(w));
    if (!doomed.length) return [];
    const drop = new Set(doomed);
    for (const row of rows) {
      if (!row || row._window == null || !drop.has(row._window) || row._dirty) continue;
      const key = keyOf(row);
      // eslint-disable-next-line no-await-in-loop
      if (await evict(key, row._rev) && changed) changed.add(key);
    }
    return doomed;
  }

  // Keys compare as text, as the backends store them.
  function trackedQuery(records, touched) {
    const byKey = new Map(records.map((r) => [String(keyOf(r)), r]));
    return {
      get(key) { touched.add(String(key)); return byKey.get(String(key)); },
      getAll() { touched.add('*'); return records; },
    };
  }

  /**
   * Fan a change out to subscribers. `changed` is one key or an iterable, so
   * a batch wakes each subscriber once.
   */
  async function notify(changed) {
    const changedKeys = new Set([...((changed && typeof changed !== 'string' && typeof changed[Symbol.iterator] === 'function')
      ? changed : [changed])].map(String));
    const notice = changed == null ? null : { keys: [...changedKeys] };
    for (const listener of changeListeners) {
      try { listener(notice); } catch (_) { /* listener errors are theirs */ }
    }
    // Subscribers see what a read would: rows that paint (never an unsent
    // delete's tombstone, never a row past the paint ceiling).
    const records = (await snapshot()).filter(paintable);
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

  let disposed = false;
  const indexFields = Object.fromEntries(Object.entries(indexes || {}).map(([index, fields]) => [index, Array.isArray(fields) ? fields : [fields]]));
  const api = {
    /**
     * Rows by a declared index, in index order, the same as the host store's
     * physical indexes: `equals`, or a `prefix` of the leading fields with an
     * inclusive `lower`/`upper` bound on the next one. `cursor` continues.
     */
    async query(index, range = {}, { limit = 50, cursor = null, raw = false } = {}) {
      const fields = indexFields[index];
      const refuse = (why) => { throw Object.assign(new Error(`store '${name}': ${why}`), { name: 'StorageReadError', reason: 'unserializable' }); };
      if (!fields) refuse(`index '${index}' is not declared`);
      // Only the ranges the host store takes.
      const head = range.equals || range.prefix || [];
      const bounded = range.lower !== undefined || range.upper !== undefined;
      if ((range.equals && (range.prefix || bounded)) || head.length > fields.length
        || (range.equals && head.length !== fields.length) || (bounded && head.length >= fields.length)) {
        refuse(`index '${index}' takes equals of all ${fields.length} fields, or a prefix of fewer`);
      }
      const rows = queryRows((await snapshot()).filter((row) => raw || paintable(row)), fields, range, keyOf);
      const start = cursor === null ? 0 : rows.findIndex((row) => String(keyOf(row)) === String(cursor)) + 1;
      const page = rows.slice(start, start + limit);
      const more = start + limit < rows.length;
      return { rows: page, nextCursor: more ? String(keyOf(page.at(-1))) : null, complete: !more };
    },
    /** Subscribers read the store again; `removed` names rows that went, so a subscriber watching one hears it. */
    async revalidateSubscribers(removed = []) { await notify([...(backend.keys?.() || []), ...removed.map(String)]); },
    dispose(options) {
      disposed = true;
      wholeStoreSubscribers.clear();
      selectorSubscribers.clear();
      changeListeners.clear();
      return backend.close?.(options);
    },
    /** The declared store name — so a report can say WHICH store rejected. */
    name,
    /**
     * Every read a surface can reach applies the paint ceiling (a form
     * prefilled from a stale row would be saved back as current); each has a
     * `Raw` twin for writers that must see what they may not paint.
     */
    async get(key) {
      const row = await backend.get(key);
      return paintable(row) ? row : undefined;
    },
    /** The WRITERS' single-row view: unfiltered, for merge and reconcile paths. */
    async getRaw(key) {
      return backend.get(key);
    },
    /** Rows a surface may SHOW: schema rows with the paint ceiling applied. */
    async getAll() {
      return (await snapshot()).filter(paintable);
    },
    /**
     * The WRITERS' view: every row, past the paint ceiling and the host store's
     * age limit. Merge, reconcile and purge must see rows they may not paint.
     */
    async getAllRaw() {
      return snapshot();
    },
    /**
     * Cache-read half of SWR: paintable records matching `predicate(record)`,
     * meta stamps stripped. Sorting is the caller's job.
     */
    async readWhere(predicate = () => true) {
      return (await snapshot()).filter(paintable).filter(predicate).map(stripMeta);
    },
    /** What `readWhere(predicate)` would answer, from rows a subscriber was just given. */
    selectFrom(rows, predicate = () => true) {
      return (rows || []).filter(paintable).filter(predicate).map(stripMeta);
    },
    /**
     * Why a record would be REFUSED by `put`, or null: lets a batch writer
     * check before writing rather than fail partway through.
     */
    validateRecord(record) {
      if (validate && !validate(record)) {
        return (validate.errors || []).map((e) => `${e.instancePath || '$'} ${e.message}`).join('; ');
      }
      if (keyOf(record) === undefined) return `record missing keyPath '${keyPath}'`;
      return null;
    },
    // `server: true` (reconcile with `keepDirty`) stores the row synced in the
    // same write, and leaves a row with an unsent local write untouched:
    // resolves undefined then.
    async put(record, { dedupeKey, silent = false, deferCap = false, server = false, when = null, receipt = null, guardKey = null } = {}) {
      if (validate && !validate(record)) {
        const detail = (validate.errors || []).map((e) => `${e.instancePath || '$'} ${e.message}`).join('; ');
        throw Object.assign(new Error(`store '${name}': record failed recordSchema: ${detail}`), { code: 'DATA_INVALID' });
      }
      const key = keyOf(record);
      if (key === undefined) throw Object.assign(new Error(`store '${name}': record missing keyPath '${keyPath}'`), { code: 'DATA_INVALID' });
      const turn = await rowsTurn(guardKey === null ? [key] : [key, guardKey], async () => {
        const previous = await backend.get(key);
        const guard = guardKey === null ? undefined : await backend.get(guardKey);
        if (when && when(previous, guard) !== true) return null;
        if (server && previous?._dirty) return null;
        if (residentCount === null) {
          // `keys()` is cheap but optional in the backendFactory contract.
          residentCount = typeof backend.keys === 'function'
            ? backend.keys().length
            : (await backend.getAll()).length;
        }
        const stamped = {
          ...holdRowFields(record, previous, heldFields),
          ...(receipt !== null ? { _writeReceipt: receipt } : {}), // eslint-disable-line no-underscore-dangle
          // Carry `_window` forward: callers never include it, and an untagged
          // row escapes window retention. A windowed reconcile re-stamps it.
          ...(previous?._window != null ? { _window: previous._window } : {}),
          // What a push acknowledged of this row stays known through later writes.
          ...(Number.isSafeInteger(previous?._ackRev) ? { _ackRev: previous._ackRev } : {}),
          // A local write keeps a refusal for access: the row stays refused until a retry.
          ...(!server && previous?._pushRefused != null ? { _pushRefused: previous._pushRefused } : {}),
          _rev: nextRowRevision(previous),
          _updatedAt: new Date(now()).toISOString(),
          _dirty: !server,
          ...(dedupeKey ? { _dedupeKey: dedupeKey } : {}),
        };
        if (when && when(previous, guard) !== true) return null;
        if (server) capSaturated = false; // a clean row is an evictable row
        const written = await backend.put(key, stamped);
        // A write refused and not held (`retained: false`) left the row as it was.
        if (previous === undefined && !(written?.ok === false && written.retained === false)) residentCount += 1;
        return { stamped, persisted: written };
      });
      if (turn === null) return undefined;
      const { stamped, persisted } = turn;
      if (persisted && persisted.ok === false) {
        // Retained in memory, not on disk: flag it (in place where the backend
        // can; `patchRetained` is optional, so fall back to a re-put), notify,
        // tell the host, then reject. A row not retained has nothing to flag.
        let reput = null;
        if (persisted.retained !== false) {
          if (typeof backend.patchRetained !== 'function' || !backend.patchRetained(key, { _persistFailed: true })) {
            reput = await backend.put(key, { ...stamped, _persistFailed: true });
          }
        }
        // Rows can go even on the failure path (retention bound, byte guard,
        // the re-put's own save); all of them join the one notify.
        const reputGone = reput ? accountForGoneRows(reput, key) : [];
        const gone = [...accountForGoneRows(persisted, key), ...reputGone];
        if (!silent) await notify(gone.length ? [key, ...gone] : key);
        reportPersistFailure(persisted, key);
        throw new PersistError(name, persisted);
      }
      // The cap also runs here so a put-only store is bounded. `deferCap` is for
      // reconcile, which enforces once at the end rather than trimming its own
      // merge row by row.
      const byteEvicted = accountForGoneRows(persisted, key);
      let evicted = [];
      if (!deferCap && evictsRows && residentCount > maxRows && !capSaturated) {
        // Protect the row just written, or eviction could undo the write.
        evicted = await enforceRowCap({ protect: new Set([String(key)]) });
        capSaturated = evicted.length === 0;
      }
      // One notify for the write and anything it displaced.
      const displaced = byteEvicted.length ? [...byteEvicted, ...evicted] : evicted;
      if (!silent) await notify(displaced.length ? [key, ...displaced] : key);
      return key;
    },
    /**
     * With `expectedRevision`, only while the row is still that revision: a
     * row written since is kept and the delete rejects with a `conflict`
     * PersistError, as on the host store.
     */
    async delete(key, { silent = false, expectedRevision, when = null, guardKey = null } = {}) {
      const persisted = await rowsTurn(guardKey === null ? [key] : [key, guardKey], async () => {
        const guard = guardKey === null ? undefined : await backend.get(guardKey);
        if ((expectedRevision !== undefined || when) && typeof backend.deleteIf === 'function') {
          // Compared and deleted in one step on the storage itself.
          const result = await backend.deleteIf(key, (stored) => {
            noteRevision(stored);
            // eslint-disable-next-line no-underscore-dangle
            return (when && (stored._dirty || when(stored, guard) !== true))
              || (expectedRevision !== undefined && stored._rev !== expectedRevision);
          });
          if (when && (result?.kept || result?.existed === false)) return null;
          if (result?.kept) throw new PersistError(name, { reason: 'conflict', retained: false });
          if (result?.existed && !(result.ok === false && result.retained === false)) {
            capSaturated = false;
            if (residentCount !== null) residentCount -= 1;
          }
          return result;
        }
        const current = await backend.get(key);
        // eslint-disable-next-line no-underscore-dangle
        if (when && (!current || current._dirty || when(current, guard) !== true)) return null;
        noteRevision(current);
        if (current !== undefined && expectedRevision !== undefined && current._rev !== expectedRevision) {
          throw new PersistError(name, { reason: 'conflict', retained: false });
        }
        capSaturated = false;   // one fewer row: the cap may be able to act again
        const result = await backend.delete(key);
        // A delete refused and not held (`retained: false`) left the row.
        if (residentCount !== null && current !== undefined && !(result?.ok === false && result.retained === false)) residentCount -= 1;
        return result;
      });
      // A delete runs the same `save()` as a put, so it can displace rows too.
      if (persisted === null) return false;
      const gone = accountForGoneRows(persisted, key);
      if (!silent) await notify(gone.length ? [key, ...gone] : key);
      if (persisted && persisted.ok === false) {
        reportPersistFailure(persisted, key);
        throw new PersistError(name, persisted);
      }
      return when ? true : undefined;
    },
    /**
     * Replaces or removes one synced row only while a synchronous ownership
     * predicate accepts it inside the row's write turn. The optional opaque
     * receipt is storage metadata, never a domain field or an outbox entry.
     */
    async replaceSynced(key, record, { when, receipt = null, guardKey = null } = {}) {
      if ((guardKey !== null && (typeof guardKey !== 'string' || !guardKey || guardKey.length > 1024))
        || typeof when !== 'function' || (receipt !== null && (typeof receipt !== 'string' || !receipt || receipt.length > 128))) {
        throw Object.assign(new Error('replaceSynced needs an ownership predicate and a bounded receipt'), { code: 'DATA_INVALID' });
      }
      if (record === null) return { replaced: await this.delete(key, { when, guardKey }) === true };
      if (!record || String(record[keyPath]) !== String(key) || Object.keys(record).some((field) => field.startsWith('_'))) {
        throw Object.assign(new Error('replaceSynced needs a domain row with the requested key'), { code: 'DATA_INVALID' });
      }
      return { replaced: await this.put(copyStorageRow(record), { server: true, when, receipt, guardKey }) !== undefined };
    },
    /**
     * Sync engine hook: writes its markers onto a stored row without
     * validating or re-stamping the record — `_deleted` (a local delete
     * waiting to be sent, hidden from every read that paints) and
     * `_pushRefused` (the server refused the row's push). A `null` value
     * removes a marker; `dirty: true` makes the row an unsent change; `body`
     * replaces the row's fields (a tombstone keeps only its key, so it holds
     * no indexed value). Resolves whether the row was there.
     */
    async markRow(key, patch, { dirty = false, body = null } = {}) {
      const persisted = await rowTurn(key, async () => {
        const record = await backend.get(key);
        if (!record) return null;
        const meta = Object.fromEntries(Object.entries(record).filter(([field]) => field.startsWith('_')));
        const next = body ? { ...holdRowFields(body, record, heldFields), ...meta } : { ...record };
        Object.entries(patch).forEach(([field, value]) => { if (value === null) delete next[field]; else next[field] = value; });
        if (dirty) Object.assign(next, { _dirty: true, _rev: nextRowRevision(record), _updatedAt: new Date(now()).toISOString() });
        return backend.put(key, next);
      });
      if (persisted === null) return false;
      const gone = accountForGoneRows(persisted, key);
      await notify(gone.length ? [key, ...gone] : key);
      if (persisted && persisted.ok === false) {
        reportPersistFailure(persisted, key);
        throw new PersistError(name, persisted);
      }
      return true;
    },
    /**
     * Sync engine hook: clear _dirty after a successful push. With
     * `expectedRevision`, only while the row is still that revision: a later
     * local write stays dirty until its own push. `pushed` records the
     * revision as one a push acknowledged (`_ackRev`); a server row marked
     * synced is not one.
     */
    async markSynced(key, { expectedRevision, pushed = false } = {}) {
      const persisted = await rowTurn(key, async () => {
        const record = await backend.get(key);
        if (!record) return null;
        if (expectedRevision !== undefined && record._rev !== expectedRevision) return null;
        // A row on the server is not "saved on this device only".
        // `_pushRefused` stays: only a person's retry clears it.
        const { _persistFailed: _pf, ...rest } = record;
        // A now-evictable row lets the byte guard act, so this can displace rows.
        return backend.put(key, { ...rest, _dirty: false, ...(pushed ? { _ackRev: record._rev } : {}) });
      });
      if (persisted === null) return;
      const gone = accountForGoneRows(persisted, key);
      if (gone.length) await notify(gone);
      capSaturated = false;   // a clean row is an evictable row

    },
    /**
     * Sets `patch`'s fields on the stored rows of `keys` as a server change,
     * each read and written in one row turn. A row that is gone or
     * holds an unsent local write is left as it is; a row the record schema
     * refuses once patched is not written. Resolves `{ patched, unsaved,
     * skipped: [{ key, reason: 'gone' | 'unsent' }], refused: [{ key, reason }] }`;
     * `unsaved` rows are patched in memory but not on the device.
     */
    async patchSynced(keys, patch) {
      const patched = [];
      const unsaved = [];
      const skipped = [];
      const refused = [];
      const changed = [];
      for (const key of [...new Set((keys || []).map(String))]) {
        // eslint-disable-next-line no-await-in-loop
        const outcome = await rowTurn(key, async () => {
          const previous = await backend.get(key);
          if (!previous || previous._deleted) return { skip: 'gone' };
          if (previous._dirty) return { skip: 'unsent' };
          const record = { ...stripMeta(previous), ...patch };
          if (validate && !validate(record)) {
            return { refuse: (validate.errors || []).map((e) => `${e.instancePath || '$'} ${e.message}`).join('; ') || 'invalid' };
          }
          const { _persistFailed: _pf, ...meta } = Object.fromEntries(Object.entries(previous).filter(([field]) => field.startsWith('_')));
          const persisted = await backend.put(key, {
            ...record, ...meta, _rev: nextRowRevision(previous), _updatedAt: new Date(now()).toISOString(), _dirty: false,
          });
          return { persisted };
        });
        if (outcome.skip) skipped.push({ key, reason: outcome.skip });
        else if (outcome.refuse) refused.push({ key, reason: outcome.refuse });
        else {
          changed.push(key, ...accountForGoneRows(outcome.persisted, key));
          if (outcome.persisted && outcome.persisted.ok === false) {
            if (outcome.persisted.retained === false) refused.push({ key, reason: outcome.persisted.reason || 'not-saved' });
            else unsaved.push(key);
            reportPersistFailure(outcome.persisted, key);
          } else patched.push(key);
        }
      }
      if (changed.length) await notify(changed);
      return { patched, unsaved, skipped, refused };
    },
    /**
     * SWR reconcile: merge a fresh AUTHORITATIVE set into the store, upserting
     * each record as synced, then pruning rows the set dropped. Dirty rows are
     * never pruned, and only rows matching `scope` are prune candidates (omit
     * it for a whole-store replace). Returns `{ upserted, pruned, ... }`.
     *
     * `windowKey` tags the written rows with their window so
     * `enforceWindowRetention` can bound a persisted window-paging store, which
     * scoped pruning alone never would. `prune: false` only upserts.
     * `keepDirty: true` leaves a row with an unsent local write as it is (listed
     * in `skipped`). `protect`: keys the row cap never evicts for this reconcile
     * (rows a whole read answered that it did not write again).
     */
    async reconcile(submittedRecords = [], { scope, windowKey, prune = true, keepDirty = false, protect = [] } = {}) {
      const records = submittedRecords.map((record) => {
        if (!record || typeof record !== 'object' || !Object.hasOwn(record, '_writeReceipt')) return record;
        const { _writeReceipt: _receipt, ...domain } = record;
        return domain;
      });
      const existing = prune ? await backend.getAll() : [];
      const incoming = new Set();
      const skipped = [];
      // Rows kept in memory only: their device storage refused them.
      const unsaved = [];
      // ONE notify for the whole merge, at the end: per-record notifies repaint
      // N times over partially merged snapshots.
      const changed = new Set();
      for (const record of records) {
        // A row the server answered as it is held is left as it is, unwritten
        // and unannounced: see unchangedServerRow.
        const heldKey = keyOf(record);
        // eslint-disable-next-line no-await-in-loop
        const held = heldKey === undefined ? undefined : await backend.get(heldKey);
        if (heldKey !== undefined && unchangedServerRow(holdRowFields(record, held, heldFields), held, { paintable, now, windowKey, ignoredFields })) {
          incoming.add(String(heldKey));
          continue;
        }
        let key;
        try {
          // eslint-disable-next-line no-await-in-loop
          key = await api.put({ ...heldProvenance(holdRowFields(record, held, heldFields), held), ...record }, { silent: true, deferCap: true, ...(keepDirty ? { server: true } : {}) });
        } catch (e) {
          // Only a record the store refused as a record (DATA_INVALID) or kept
          // in memory (PersistError) is handled here; any other failure is the
          // storage's, and fails the whole merge rather than be counted stored.
          if (e?.name !== 'PersistError' && e?.code !== 'DATA_INVALID') throw e;
          // A PersistError row IS in the store (retained in memory, flagged), so
          // count it as present or the prune below deletes it. A schema
          // rejection is not in the store and is skipped: one bad record must
          // not cost the whole merge.
          if (e?.name === 'PersistError') {
            const failedKey = keyOf(record);
            if (failedKey !== undefined) {
              incoming.add(String(failedKey));
              changed.add(failedKey);
              unsaved.push(String(failedKey));
              // Clear the `_dirty` `put` stamped: a server row left dirty is
              // exempt from every bound and would never be collected. Keep
              // `_persistFailed`: it is still not on disk.
              // eslint-disable-next-line no-await-in-loop
              const retained = e.retained === false ? null : await backend.get(failedKey);
              if (retained) {
                // eslint-disable-next-line no-await-in-loop
                const cleared = await backend.put(failedKey, { ...retained, _dirty: false });
                // Now evictable, so this write can displace others.
                for (const k of accountForGoneRows(cleared, failedKey)) changed.add(k);
              }
            }
          }
          continue;
        }
        if (key === undefined) {
          // An unsent local write (`keepDirty`): the row stays as the user left it.
          incoming.add(String(keyOf(record)));
          skipped.push(String(keyOf(record)));
          continue;
        }
        // A `server` put already stored the row synced.
        // eslint-disable-next-line no-await-in-loop
        if (!keepDirty) await api.markSynced(key);
        // Tag the row's window straight on the backend: `_window` is store
        // metadata, never validated and never its own notify.
        if (windowKey != null) {
          // eslint-disable-next-line no-await-in-loop
          const stamped = await rowTurn(key, async () => {
            const stored = await backend.get(key);
            return stored ? backend.put(key, { ...stored, _window: String(windowKey) }) : null;
          });
          if (stamped) for (const k of accountForGoneRows(stamped, key)) changed.add(k);
        }
        incoming.add(String(key));
        changed.add(key);
      }
      let pruned = 0;
      const prunedKeys = [];
      for (const row of existing) {
        const key = keyOf(row);
        if (incoming.has(String(key)) || row._dirty) continue; // kept: fresh or optimistic
        if (scope && !scope(row)) continue; // out of the reconcile scope
        // A row written since the set was read stays.
        // eslint-disable-next-line no-await-in-loop
        if (!(await evict(key, row._rev))) continue;
        changed.add(key);
        pruned += 1;
        prunedKeys.push(String(key));
      }
      // Out-of-scope rows survive the prune, so retention and the cap bound
      // the store; their evictions join the same one notify.
      if (windowKey != null) {
        windowVisitSeq += 1;
        windowVisits.set(String(windowKey), windowVisitSeq);
      }
      const dropped = windowKey != null
        ? await enforceWindowRetention({ current: String(windowKey), changed })
        : [];
      const evicted = await enforceRowCap({ protect: new Set([...incoming, ...protect.map(String)]), changed });
      capSaturated = false;   // the merge changed both the row set and its dirtiness
      if (changed.size) await notify(changed);
      return {
        upserted: incoming.size - new Set(skipped).size,
        pruned,
        // The keys it removed, when it removed any.
        ...(prunedKeys.length ? { prunedKeys } : {}),
        ...(skipped.length ? { skipped: [...new Set(skipped)] } : {}),
        ...(unsaved.length ? { unsaved: [...new Set(unsaved)] } : {}),
        ...(dropped.length ? { windowsDropped: dropped.length } : {}),
        ...(evicted.length ? { evicted: evicted.length } : {}),
      };
    },
    subscribe(handler) {
      wholeStoreSubscribers.add(handler);
      return () => wholeStoreSubscribers.delete(handler);
    },
    /**
     * Called after every change, before subscribers read the store, with
     * `{ keys }` (the keys changed) or null when any row may have changed.
     */
    onChange(listener) {
      changeListeners.add(listener);
      return () => changeListeners.delete(listener);
    },
    subscribeQuery(selector, handler) {
      const sub = { selector, handler, touched: new Set(['*']), last: undefined };
      // Prime: compute initial value + touched set without firing the handler.
      snapshot().then((records) => {
        const touched = new Set();
        sub.last = selector(trackedQuery(records.filter(paintable), touched));
        sub.touched = touched;
      });
      selectorSubscribers.add(sub);
      return () => selectorSubscribers.delete(sub);
    },
  };
  return new Proxy(api, {
    get(target, key) {
      const value = target[key];
      if (typeof value !== 'function' || key === 'dispose') return value;
      return (...args) => {
        const current = () => { if (disposed) throw Object.assign(new Error('Data store retired'), { name: 'StorageReadError', reason: 'retired' }); };
        current();
        const result = value.apply(target, args);
        return result?.then ? result.then((resolved) => { current(); return resolved; }) : result;
      };
    },
  });
}
