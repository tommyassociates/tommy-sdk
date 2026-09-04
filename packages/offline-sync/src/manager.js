/**
 * manager.js — builds the DataApi (`tommy.data`) for one MP instance from its
 * manifest `localData`, plus the replay coordinator that drains the broker's
 * offline queue on reconnect.
 *
 * Ownership split (sdk-broker harden round-1): the broker (@tommy/actions-
 * runtime) owns the `tommy-broker` store — action-run records + the trigger
 * queue partitioned by sourceMpId; THIS package owns the per-(tenant, MP)
 * data stores and the queue drain/replay ORCHESTRATION (connectivity watch →
 * broker.drainOfflineQueue()). Sync strategies other than the metadata
 * stamps are stubbed to `server_authoritative` behaviour at M1 — recorded,
 * not silent (the manifest still declares them; the fabric engine consumes
 * them from M1's fabric work onward).
 */
import { databaseName } from './names.js';

// The ceiling itself is enforced in `DataStore.readWhere` (every reader passes
// there, including MPs reading their stores directly). These wrappers stay so a
// manager-level read is filtered even against a store built with a custom clock.
const nowMs = () => Date.now();

/**
 * ⚠ SHARED BY BOTH READ APIs (review R2-F2). This lived inside `liveQuery`, so
 * `windowCache.read`/`sync` — the path `timesheets_cache` and `invoicing_cache`
 * are read through — painted rows right up to the 30-day store TTL. The ceiling
 * is a platform promise about what may be SHOWN, not a property of one helper,
 * so it belongs to every read the manager hands out. A `_dirty` row is exempt:
 * it is a local write that has not reached the server, and its age is not a
 * reason to hide it from its author.
 */
const paintable = (row) => {
  if (!row || row._dirty) return true;
  const at = Date.parse(row._updatedAt || '');
  return !Number.isFinite(at) || (nowMs() - at) < PAINT_CEILING_MS;
};

/** Compose a caller's scope with the paint ceiling. */
const painted = (predicate) => (row) => predicate(row) && paintable(row);
import {
  createDataStore, createMemoryStoreBackend, createLocalStorageBackend, hasWebStorage, PAINT_CEILING_MS,
} from './data-store.js';

/**
 * Default backend for a store when the host injects no `backendFactory`:
 * client-owned stores (manifest `syncStrategy: last_write_wins`, e.g. an MP's
 * view `settings`) PERSIST across a shell reload when the runtime has Web
 * Storage; everything else (server-authoritative caches) stays in memory —
 * re-seeded from the server on mount, so it must not accumulate stale rows
 * across sessions. In node (no localStorage) every store falls back to memory.
 */
function defaultBackend(dbName, storeName, syncStrategy) {
  if (syncStrategy === 'last_write_wins' && hasWebStorage()) {
    return createLocalStorageBackend(dbName, storeName);
  }
  // ⚠ A `persist: true` SERVER-AUTHORITATIVE STORE STILL LANDS IN MEMORY HERE,
  // and that is deliberate. Durable caching needs a store far larger than Web
  // Storage can hold, so the backend for it is IndexedDB-backed and lives in the
  // HOST (`app/src/services/mp-loader/mp-store-durable-backend.js`) — the SDK
  // package must not grow a storage dependency, and only the host knows the
  // account the database has to be namespaced by. With no host factory injected
  // (node, tests, a standalone SDK consumer) memory is the correct answer: the
  // declaration is honoured by whoever can honour it.
  return createMemoryStoreBackend();
}

/**
 * @param {object} opts
 * @param {object} opts.capabilityToken the ISSUED token record — tenantId is
 *   derived from it, never passed separately (offline-sync.md §1).
 * @param {string} opts.mpId
 * @param {object} opts.localData manifest.localData (validated upstream)
 * @param {function} [opts.backendFactory] (databaseName, storeName, syncStrategy)
 *   => backend. ⚠ THE THIRD ARGUMENT IS LOAD-BEARING, NOT DECORATION. The host's
 *   factory (app/src/services/mp-loader/mp-store-backend.js) mirrors the
 *   persist-vs-memory rule below and cannot see the manifest, so `syncStrategy` is
 *   the only way it can tell a client-owned store from a server-authoritative
 *   cache. It was omitted here from M1 while the host factory arrived later
 *   reading it, so it was `undefined` at every real call site, the host's guard
 *   always took its early return, and EVERY MP store in the shell was a memory
 *   store — MP persistence silently off, measured as zero `mp-store:*` keys after a
 *   five-surface walk. Do not drop it again.
 * @param {function} [opts.now]
 * @param {function} [opts.onPersistError] called when a write could not be
 *   persisted — `{ store, key, reason, bytes, budget, evicted }`. The SDK cannot
 *   know where such a report should go (console, telemetry, a user-facing
 *   "saved on this device only"), so the host decides. Without a handler the
 *   write still rejects; it just goes unreported.
 */
export function createDataManager({
  capabilityToken, mpId, localData = {}, backendFactory, now, onPersistError,
}) {
  const dbName = databaseName(capabilityToken, mpId);
  const stores = new Map();
  const syncMeta = new Map(); // storeName -> { lastSyncedAt, pending, online }

  for (const [storeName, decl] of Object.entries(localData)) {
    // The 4th argument is the store DECLARATION, added for `persist` (spec
    // mp-durable-instant-surfaces). Positional 1-3 are unchanged, so an existing
    // factory that reads three arguments keeps working untouched — the same
    // widening discipline the `syncStrategy` argument itself went through.
    const backend = backendFactory
      ? backendFactory(dbName, storeName, decl.syncStrategy, decl)
      : defaultBackend(dbName, storeName, decl.syncStrategy);
    stores.set(storeName, createDataStore({
      name: storeName,
      keyPath: decl.keyPath || 'id',
      recordSchema: decl.recordSchema,
      backend,
      now,
      ...(decl.maxRows ? { maxRows: decl.maxRows } : {}),
      onPersistError,
    }));
    syncMeta.set(storeName, { lastSyncedAt: null, pending: 0, online: true, strategy: decl.syncStrategy || 'server_authoritative' });
  }

  // Shared fetch→reconcile step behind both windowCache.sync and
  // liveQuery.revalidate: fetch the fresh DTOs for `window`, map through
  // `toRecord` (with a `prev` lookup when `keyOf` is supplied, for rich-field
  // preservation across a thin DTO), and reconcile them into the store under
  // `scope`. A failed fetch is swallowed so the SWR paint holds (cache intact).
  // Returns the reconciled, scope-filtered cache read.
  function windowKeyOf(window) {
    if (window == null || typeof window !== 'object') return undefined;
    const keys = Object.keys(window).sort();
    if (!keys.length) return undefined;
    try {
      return JSON.stringify(keys.map((k) => [k, window[k]]));
    } catch (_) {
      return undefined; // unserialisable window — no key, no window retention
    }
  }

  async function fetchAndReconcile(store, keyPath, { fetch, toRecord, keyOf }, scope, window, windowKey) {
    let dtos = null;
    try {
      dtos = typeof fetch === 'function' ? await fetch(window) : null;
    } catch (_) {
      dtos = null; // offline / fetch failed — keep the cache, paint holds
    }
    if (Array.isArray(dtos)) {
      let prevByKey = null;
      if (keyOf) {
        const existing = await store.getAll();
        prevByKey = new Map(existing.map((row) => [String(row[keyPath]), row]));
      }
      const records = dtos.map(
        (dto) => toRecord(dto, prevByKey ? prevByKey.get(String(keyOf(dto))) : undefined),
      );
      try {
        await store.reconcile(records, { scope, ...(windowKey != null ? { windowKey } : {}) });
      } catch (_) { /* store error — keep the cache intact */ }
    }
    return store.readWhere(scope);
  }

  return {
    databaseName: dbName,
    /** DataApi.store — only manifest-declared stores exist. */
    store(name) {
      const store = stores.get(name);
      if (!store) throw new Error(`tommy.data.store('${name}'): store not declared in manifest.localData`);
      return store;
    },
    /**
     * DataApi.windowCache — the reusable "instant data" (SWR) combinator every
     * windowed MP grid/list wants: `read(window)` paints from the cache
     * immediately; `sync(window)` fetches, reconciles the fresh rows into the
     * cache (upsert + prune-in-scope + keep-dirty, via DataStore.reconcile), and
     * returns the reconciled cache read. An MP supplies only its domain bits —
     * `fetch(window) → DTO[]`, `toRecord(dto, prev) → record`, `scopeOf(window)
     * → (row) → bool`, and optional `keyOf(dto)` (enables `prev` lookup for
     * rich-field preservation across a thin DTO). A failed `fetch` is swallowed
     * so the SWR paint holds (cache left intact).
     */
    /**
     * A stable identity for a window, so retention can count windows rather than
     * rows (`DataStore.enforceWindowRetention`). Windows are plain
     * `{ startAt, endAt }`-ish objects, so the key is their sorted JSON — two
     * calls describing the same week must produce the same key or every
     * revalidate would look like a NEW window and the retention budget would
     * churn through three of them per session.
     *
     * `undefined`/`null` windows (whole-store caches) get no key, which switches
     * window retention off for that store — correct, because a store with no
     * window has nothing to retain BY window and the row cap is the right bound.
     */
    windowCache(storeName, {
      fetch, toRecord = (dto) => dto, scopeOf, keyOf,
    } = {}) {
      const store = stores.get(storeName);
      if (!store) throw new Error(`tommy.data.windowCache('${storeName}'): store not declared in manifest.localData`);
      const keyPath = localData[storeName]?.keyPath || 'id';
      const scopeFor = (window) => (scopeOf ? scopeOf(window) : () => true);
      return {
        // The ceiling governs what is READ back for painting; the reconcile
        // scope below stays the caller's own, or an aged row would silently
        // escape pruning while still sitting in the store.
        read: (window) => store.readWhere(painted(scopeFor(window))),
        sync: (window) => fetchAndReconcile(
          store, keyPath, { fetch, toRecord, keyOf }, scopeFor(window), window, windowKeyOf(window),
        ).then(() => store.readWhere(painted(scopeFor(window)))),
      };
    },
    /**
     * DataApi.liveQuery — windowCache fused with the store's reactivity: the
     * single "instant + reactive" handle a surface (list OR detail) wants. It
     * unifies the three moving parts that MPs otherwise wire by hand:
     *   - `subscribe(handler)` — fires the handler IMMEDIATELY with the warm,
     *     scope-filtered cache read (instant first paint), then again on EVERY
     *     store change (our own revalidate, a form popup's optimistic write, any
     *     reconcile elsewhere). Returns an unsubscribe fn. The store is the
     *     source of truth; the handler is a projection.
     *   - `revalidate(window)` — fetch → reconcile into the store (which notifies
     *     → subscribers repaint). Same SWR semantics as windowCache.sync.
     *   - `read(window)` — a one-shot scope-filtered cache read.
     * `scope` is a plain row predicate `(row) => bool` (omit for whole-store) —
     * e.g. `r => r.kind === 'care_plan'` for a list, `r => r.carePlanId === id`
     * for a detail. subscribe uses the whole-store notify then re-filters by
     * scope: simple and correct (a change outside the scope re-runs the handler
     * to the same result — harmless). `fetch`/`toRecord`/`keyOf` are as windowCache.
     */
    liveQuery(storeName, {
      scope, pruneScope, fetch, toRecord = (dto) => dto, keyOf,
    } = {}) {
      const store = stores.get(storeName);
      if (!store) throw new Error(`tommy.data.liveQuery('${storeName}'): store not declared in manifest.localData`);
      const keyPath = localData[storeName]?.keyPath || 'id';
      const scopePredicate = typeof scope === 'function' ? scope : () => true;
      /**
       * ⚠ THE PAINT CEILING (invalidation contract item 3, second half). A cache
       * that persists has no natural end: a device left closed for a fortnight
       * would otherwise reopen and paint a confident, wrong fortnight-old
       * surface — which on a compliance or roster screen is worse than an empty
       * one, because nothing on it says it is old. Rows past the ceiling are not
       * PAINTED; they are still stored, and the store's own TTL evicts them at
       * open. A `_dirty` row is exempt: it is a local write that has not reached
       * the server, and its age is not a reason to hide it from its author.
       * Applied to the READ paths only — the reconcile scope must keep meaning
       * "what this read covers", or an aged row would silently escape pruning.
       */
      const predicate = painted(scopePredicate);
      /**
       * ⚠ READING AND DELETING ARE NOT THE SAME AUTHORITY (review
       * CAL-FILTERED-PRUNE). `scope` answers "what should this surface show";
       * `reconcile` reuses it to answer "what may this read DELETE", and those
       * diverge the moment a read is FILTERED. A member-filtered calendar read
       * scoped by window alone deletes every other member's cached entries for
       * that window — the same defect scheduling hit twice (SCE-R2-2), and the
       * reason its writers hand-rolled a separate prune predicate. `pruneScope`
       * makes that expressible instead of hand-rolled: pass `() => false` for a
       * read that may write but must not delete. Omitted, behaviour is
       * unchanged — the scope governs both, as before.
       */
      const prunePredicate = typeof pruneScope === 'function' ? pruneScope : scopePredicate;
      return {
        store,
        read: () => store.readWhere(predicate),
        subscribe(handler) {
          let live = true;
          const emit = () => {
            if (!live) return;
            store.readWhere(predicate)
              .then((rows) => { if (live) handler(rows); })
              .catch(() => { /* subscriber read error — skip this emit */ });
          };
          const off = store.subscribe(() => emit());
          emit(); // instant first paint from the warm cache
          return () => { live = false; off(); };
        },
        // ⚠ PASS THE WINDOW KEY. This dropped it while `windowCache.sync` (above)
        // passed it, so every liveQuery-driven store wrote UNTAGGED rows — and
        // `enforceWindowRetention` only ever touches rows carrying `_window`
        // (data-store.js:423). Window retention therefore never ran for a single
        // production store, because liveQuery is the path the instant surfaces
        // use. The stores were bounded by `maxRows` alone, which is the backstop,
        // not the design. A whole-store cache still passes no window and so still
        // opts out, exactly as windowCache does.
        revalidate: (window) => fetchAndReconcile(
          store, keyPath, { fetch, toRecord, keyOf }, prunePredicate, window, windowKeyOf(window),
        ).then(() => store.readWhere(predicate)),
      };
    },
    /** DataApi.syncState — SWR UX inputs (offline-sync.md §6). */
    syncState(storeName) {
      const meta = syncMeta.get(storeName);
      if (!meta) throw new Error(`tommy.data.syncState('${storeName}'): store not declared`);
      return { lastSyncedAt: meta.lastSyncedAt, pending: meta.pending, online: meta.online };
    },
    /** Sync-engine hooks (fabric work consumes these). */
    _setSyncState(storeName, patch) {
      const meta = syncMeta.get(storeName);
      if (meta) Object.assign(meta, patch);
    },
  };
}

/**
 * Reconnect orchestration: watches connectivity and drains the broker's
 * offline queue FIFO-per-source with original idempotency keys (the broker
 * owns the queue; this owns WHEN it drains).
 *
 * @param {object} opts { broker, addOnlineListener?: (fn)=>unsub }
 */
export function createReplayCoordinator({ broker, addOnlineListener }) {
  let unsubscribe = null;

  async function drain() {
    broker.setOnline(true);
    return broker.drainOfflineQueue();
  }

  return {
    start() {
      if (addOnlineListener) {
        unsubscribe = addOnlineListener(() => { drain(); });
      } else if (typeof window !== 'undefined') {
        const handler = () => { drain(); };
        window.addEventListener('online', handler);
        unsubscribe = () => window.removeEventListener('online', handler);
      }
    },
    stop() { if (unsubscribe) unsubscribe(); unsubscribe = null; },
    drain,
  };
}
