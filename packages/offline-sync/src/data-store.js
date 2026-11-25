import { createTransactionalDataStore, copyStorageRow } from './transactional-store.js';
import { utf16Units } from './bytes.js';
import { unchangedServerRow, heldProvenance, holdRowFields } from './unchanged-row.js';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

export function recordSchemaCheck(recordSchema) {
  const validate = recordSchema ? ajv.compile(recordSchema) : null;
  return (row) => (validate && !validate(row)
    ? (validate.errors || []).map((e) => `${e.instancePath || '$'} ${e.message}`).join('; ') : null);
}

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

function webLocks() {
  try {
    const locks = globalThis.navigator?.locks;
    return locks && typeof locks.request === 'function' ? locks : null;
  } catch (_) {
    return null;
  }
}
// Web Lock so a read-check-write in one tab never interleaves with another tab's write.
function acrossTabs(name, task) {
  const locks = webLocks();
  return locks ? locks.request(`offline-sync:${name}`, () => task()) : task();
}

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

function webStorage() {
  try {
    return (typeof globalThis !== 'undefined' && globalThis.localStorage) || null;
  } catch (_) {
    return null;
  }
}

export function hasWebStorage() {
  return !!webStorage();
}

// Budgeted in bytes, not rows: a signed draft (base64 PNG) is ~100x a small draft.
const DEFAULT_MAX_BYTES = 512 * 1024;

// Must stay above 1, or the first refused write would delete a draft the quota guard kept.
const RETAINED_BUDGET_MULTIPLE = 2;

const memoryFallback = new Map();

export function storageUnavailable(storeKey, cause) {
  return Object.assign(new Error(`'${storeKey}': device storage could not be read`), {
    name: 'StorageUnavailable', code: 'DATA_UNAVAILABLE', ...(cause ? { cause } : {}),
  });
}

const entryBytes = (key, record) => utf16Units(JSON.stringify(String(key)))
  + utf16Units(JSON.stringify(record)) + 1;

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

  // Dirty rows and the row being written are never evicted.
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

  // Bounds the in-memory map when saves cannot reach disk, which otherwise grows a row per refused write.
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

  function retain(map, protect) {
    if (!evict) return { discarded: [], refused: true };
    const discarded = boundRetained(map, protect);
    memoryFallback.set(storeKey, new Map(map));
    return { discarded, refused: false };
  }

  function patchRetained(key, patch) {
    const map = memoryFallback.get(storeKey);
    if (!map) return false;
    const record = map.get(String(key));
    if (!record) return false;
    map.set(String(key), { ...record, ...patch });
    return true;
  }

  function save(map, protect) {
    const store = webStorage();
    if (!store) {
      const { discarded, refused } = retain(map, protect);
      return {
        ok: false, reason: 'unavailable', budget: maxBytes, evicted: [], discarded, ...(refused ? { retained: false } : {}),
      };
    }
    const { total, evicted } = evictToFit(map, protect);
    if (total > maxBytes) {
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
      const { discarded, refused } = retain(map, protect);
      return {
        ok: false, reason: 'quota', bytes: total, budget: maxBytes, evicted, discarded, error: e?.name || 'Error', ...(refused ? { retained: false } : {}),
      };
    }
  }

  // A write whose store cannot be read keeps nothing: a partial map would later read as the whole store.
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
    // Read and write in one synchronous step.
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

// A backstop against unbounded growth, never a working-set limit.
const DEFAULT_MAX_ROWS = 50000;

const DEFAULT_MAX_WINDOWS = 3;

export const PAINT_CEILING_MS = 7 * 24 * 60 * 60 * 1000;

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
  const evictsRows = syncStrategy !== 'last_write_wins';
  const wholeStoreSubscribers = new Set();
  const selectorSubscribers = new Set();
  const changeListeners = new Set();

  // Resident count so put walks the store only when the cap is exceeded; hot caches write per row.
  let residentCount = null;
  let capSaturated = false;
  // A push still in flight cannot settle a row written again after it.
  let revisionTop = 0;
  const noteRevision = (row) => { if (Number.isSafeInteger(row?._rev) && row._rev > revisionTop) revisionTop = row._rev; };
  const nextRowRevision = (previous) => { revisionTop = Math.max(revisionTop, previous?._rev || 0) + 1; return revisionTop; };
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

  // A throwing handler must never turn a failed write into another failure.
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

  // Every backend put/delete result must pass through here so gone rows are accounted for.
  function accountForGoneRows(persisted, key) {
    const byteEvicted = persisted?.evicted || [];
    const discarded = persisted?.discarded || [];
    const gone = byteEvicted.length + discarded.length;
    if (!gone) return [];
    notifyEviction([...byteEvicted, ...discarded]);
    if (residentCount !== null) residentCount -= gone;
    capSaturated = false;
    if (byteEvicted.length && persisted?.ok !== false) reportPersistEviction(persisted, key);
    if (discarded.length) reportRetentionDiscard(persisted, key);
    return [...byteEvicted, ...discarded];
  }

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

  // Its own event: failures are de-duped per store, so an eviction must never suppress a later failure.
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

  const stripMeta = (record) => Object.fromEntries(
    Object.entries(record).filter(([key]) => !key.startsWith('_')),
  );

  async function snapshot() { return backend.getAll(); }

  // Must not throw: callers loop mid-reconcile and one rejection would abort it.
  async function evict(key, expectedRevision, coverageLoss = false) {
    try {
      await api.delete(key, { silent: true, ...(expectedRevision !== undefined ? { expectedRevision } : {}) });
      if (coverageLoss) notifyEviction([key]);
      return true;
    } catch (e) {
      if (e?.name !== 'PersistError') throw e;
      return e.reason !== 'conflict';
    }
  }

  async function enforceRowCap({ protect, changed } = {}) {
    if (!evictsRows || !Number.isFinite(maxRows) || maxRows <= 0) return [];
    const rows = await backend.getAll();
    if (rows.length <= maxRows) return [];
    const evictable = rows.filter((row) => !row._dirty
      && !(protect && protect.has(String(keyOf(row)))));
    // Never evict more than the evictable set, so a dirty-heavy store stays over the cap instead of eating fresh rows.
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
      if (!(await evict(key, row._rev, true))) continue;
      if (changed) changed.add(key);
      evicted.push(key);
    }
    return evicted;
  }

  const windowVisits = new Map();
  let windowVisitSeq = 0;

  // Client-owned and dirty rows never age out of painting.
  const ceilingApplies = evictsRows && paintCeiling;
  // A local delete waiting to be sent never paints.
  const paintable = (row) => {
    if (row?._deleted) return false;
    if (!ceilingApplies || !row || row._dirty) return true;
    const at = Date.parse(row._updatedAt || '');
    return !Number.isFinite(at) || at >= now() - PAINT_CEILING_MS;
  };

  if (backend.transactional) return createTransactionalDataStore({ name, keyPath, backend, validate, paintable, now, PersistError, onPersistError, maxWindows: evictsRows ? maxWindows : Infinity, indexes, queryRows, heldFields, ignoredFields });


  // Window retention: the row cap would eat an arbitrary part of a window.
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
    const kept = new Set([current, ...ordered.filter((w) => w !== current).slice(0, Math.max(0, keep - 1))]);
    const doomed = ordered.filter((w) => !kept.has(w));
    if (!doomed.length) return [];
    const drop = new Set(doomed);
    for (const row of rows) {
      if (!row || row._window == null || !drop.has(row._window) || row._dirty) continue;
      const key = keyOf(row);
      // eslint-disable-next-line no-await-in-loop
      if (await evict(key, row._rev, true) && changed) changed.add(key);
    }
    return doomed;
  }

  function trackedQuery(records, touched) {
    const byKey = new Map(records.map((r) => [String(keyOf(r)), r]));
    return {
      get(key) { touched.add(String(key)); return byKey.get(String(key)); },
      getAll() { touched.add('*'); return records; },
    };
  }

  function notifyEviction(keys) {
    for (const listener of changeListeners) {
      try { listener({ keys: keys.map(String), evicted: true }); } catch (_) { /* listener errors are theirs */ }
    }
  }
  async function notify(changed) {
    const changedKeys = new Set([...((changed && typeof changed !== 'string' && typeof changed[Symbol.iterator] === 'function')
      ? changed : [changed])].map(String));
    const notice = changed == null ? null : { keys: [...changedKeys] };
    for (const listener of changeListeners) {
      try { listener(notice); } catch (_) { /* listener errors are theirs */ }
    }
    // Subscribers see what a read would: never a tombstone or a row past the paint ceiling.
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
    async query(index, range = {}, { limit = 50, cursor = null, raw = false } = {}) {
      const fields = indexFields[index];
      const refuse = (why) => { throw Object.assign(new Error(`store '${name}': ${why}`), { name: 'StorageReadError', reason: 'unserializable' }); };
      if (!fields) refuse(`index '${index}' is not declared`);
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
    async revalidateSubscribers(removed = []) { await notify([...(backend.keys?.() || []), ...removed.map(String)]); },
    dispose(options) {
      disposed = true;
      wholeStoreSubscribers.clear();
      selectorSubscribers.clear();
      changeListeners.clear();
      return backend.close?.(options);
    },
    name,
    // Every surface read applies the paint ceiling: a stale prefilled form would be saved back as current.
    async get(key) {
      const row = await backend.get(key);
      return paintable(row) ? row : undefined;
    },
    async getRaw(key) {
      return backend.get(key);
    },
    async getAll() {
      return (await snapshot()).filter(paintable);
    },
    // Writers' view: merge, reconcile and purge must see rows they may not paint.
    async getAllRaw() {
      return snapshot();
    },
    async readWhere(predicate = () => true) {
      return (await snapshot()).filter(paintable).filter(predicate).map(stripMeta);
    },
    selectFrom(rows, predicate = () => true) {
      return (rows || []).filter(paintable).filter(predicate).map(stripMeta);
    },
    // Lets a batch writer check before writing rather than fail partway through.
    validateRecord(record) {
      if (validate && !validate(record)) {
        return (validate.errors || []).map((e) => `${e.instancePath || '$'} ${e.message}`).join('; ');
      }
      if (keyOf(record) === undefined) return `record missing keyPath '${keyPath}'`;
      return null;
    },
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
          residentCount = typeof backend.keys === 'function'
            ? backend.keys().length
            : (await backend.getAll()).length;
        }
        const stamped = {
          ...holdRowFields(record, previous, heldFields),
          ...(receipt !== null ? { _writeReceipt: receipt } : {}), // eslint-disable-line no-underscore-dangle
          // Carry `_window` forward: callers never include it.
          ...(previous?._window != null ? { _window: previous._window } : {}),
          ...(Number.isSafeInteger(previous?._ackRev) ? { _ackRev: previous._ackRev } : {}),
          // A local write keeps a refusal for access: the row stays refused until a retry.
          ...(!server && previous?._pushRefused != null ? { _pushRefused: previous._pushRefused } : {}),
          _rev: nextRowRevision(previous),
          _updatedAt: new Date(now()).toISOString(),
          _dirty: !server,
          ...(dedupeKey ? { _dedupeKey: dedupeKey } : {}),
        };
        if (when && when(previous, guard) !== true) return null;
        if (server) capSaturated = false;
        const written = await backend.put(key, stamped);
        if (previous === undefined && !(written?.ok === false && written.retained === false)) residentCount += 1;
        return { stamped, persisted: written };
      });
      if (turn === null) return undefined;
      const { stamped, persisted } = turn;
      if (persisted && persisted.ok === false) {
        let reput = null;
        if (persisted.retained !== false) {
          if (typeof backend.patchRetained !== 'function' || !backend.patchRetained(key, { _persistFailed: true })) {
            reput = await backend.put(key, { ...stamped, _persistFailed: true });
          }
        }
        // Rows can go even on the failure path.
        const reputGone = reput ? accountForGoneRows(reput, key) : [];
        const gone = [...accountForGoneRows(persisted, key), ...reputGone];
        if (!silent) await notify(gone.length ? [key, ...gone] : key);
        reportPersistFailure(persisted, key);
        throw new PersistError(name, persisted);
      }
      const byteEvicted = accountForGoneRows(persisted, key);
      let evicted = [];
      if (!deferCap && evictsRows && residentCount > maxRows && !capSaturated) {
        evicted = await enforceRowCap({ protect: new Set([String(key)]) });
        capSaturated = evicted.length === 0;
      }
      const displaced = byteEvicted.length ? [...byteEvicted, ...evicted] : evicted;
      if (!silent) await notify(displaced.length ? [key, ...displaced] : key);
      return key;
    },
    async delete(key, { silent = false, expectedRevision, when = null, guardKey = null } = {}) {
      const persisted = await rowsTurn(guardKey === null ? [key] : [key, guardKey], async () => {
        const guard = guardKey === null ? undefined : await backend.get(guardKey);
        if ((expectedRevision !== undefined || when) && typeof backend.deleteIf === 'function') {
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
        capSaturated = false;
        const result = await backend.delete(key);
        if (residentCount !== null && current !== undefined && !(result?.ok === false && result.retained === false)) residentCount -= 1;
        return result;
      });
      if (persisted === null) return false;
      const gone = accountForGoneRows(persisted, key);
      if (!silent) await notify(gone.length ? [key, ...gone] : key);
      if (persisted && persisted.ok === false) {
        reportPersistFailure(persisted, key);
        throw new PersistError(name, persisted);
      }
      return when ? true : undefined;
    },
    // The receipt is storage metadata, never a domain field or an outbox entry.
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
    async markSynced(key, { expectedRevision, pushed = false } = {}) {
      const persisted = await rowTurn(key, async () => {
        const record = await backend.get(key);
        if (!record) return null;
        if (expectedRevision !== undefined && record._rev !== expectedRevision) return null;
        // `_pushRefused` stays: only a person's retry clears it.
        const { _persistFailed: _pf, ...rest } = record;
        // A now-evictable row lets the byte guard act, so this can displace rows.
        return backend.put(key, { ...rest, _dirty: false, ...(pushed ? { _ackRev: record._rev } : {}) });
      });
      if (persisted === null) return;
      const gone = accountForGoneRows(persisted, key);
      if (gone.length) await notify(gone);
      capSaturated = false;

    },
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
    // Dirty rows are never pruned, and only rows matching scope are pruned.
    async reconcile(submittedRecords = [], { scope, windowKey, prune = true, keepDirty = false, protect = [] } = {}) {
      const records = submittedRecords.map((record) => {
        if (!record || typeof record !== 'object' || !Object.hasOwn(record, '_writeReceipt')) return record;
        const { _writeReceipt: _receipt, ...domain } = record;
        return domain;
      });
      const existing = prune ? await backend.getAll() : [];
      const incoming = new Set();
      const skipped = [];
      const unsaved = [];
      const changed = new Set();
      for (const record of records) {
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
          if (e?.name !== 'PersistError' && e?.code !== 'DATA_INVALID') throw e;
          // One bad record must not abort the reconcile.
          if (e?.name === 'PersistError') {
            const failedKey = keyOf(record);
            if (failedKey !== undefined) {
              incoming.add(String(failedKey));
              changed.add(failedKey);
              unsaved.push(String(failedKey));
              // eslint-disable-next-line no-await-in-loop
              const retained = e.retained === false ? null : await backend.get(failedKey);
              if (retained) {
                // eslint-disable-next-line no-await-in-loop
                const cleared = await backend.put(failedKey, { ...retained, _dirty: false });
                for (const k of accountForGoneRows(cleared, failedKey)) changed.add(k);
              }
            }
          }
          continue;
        }
        if (key === undefined) {
          incoming.add(String(keyOf(record)));
          skipped.push(String(keyOf(record)));
          continue;
        }
        // eslint-disable-next-line no-await-in-loop
        if (!keepDirty) await api.markSynced(key);
        // Window metadata is never validated and never its own notify.
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
        if (incoming.has(String(key)) || row._dirty) continue;
        if (scope && !scope(row)) continue;
        // eslint-disable-next-line no-await-in-loop
        if (!(await evict(key, row._rev))) continue;
        changed.add(key);
        pruned += 1;
        prunedKeys.push(String(key));
      }
      if (windowKey != null) {
        windowVisitSeq += 1;
        windowVisits.set(String(windowKey), windowVisitSeq);
      }
      const dropped = windowKey != null
        ? await enforceWindowRetention({ current: String(windowKey), changed })
        : [];
      const evicted = await enforceRowCap({ protect: new Set([...incoming, ...protect.map(String)]), changed });
      capSaturated = false;
      if (changed.size) await notify(changed);
      return {
        upserted: incoming.size - new Set(skipped).size,
        pruned,
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
    onChange(listener) {
      changeListeners.add(listener);
      return () => changeListeners.delete(listener);
    },
    subscribeQuery(selector, handler) {
      const sub = { selector, handler, touched: new Set(['*']), last: undefined };
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
