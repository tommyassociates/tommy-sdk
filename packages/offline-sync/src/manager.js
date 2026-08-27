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
import {
  createDataStore, createMemoryStoreBackend, createLocalStorageBackend, hasWebStorage,
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
  return createMemoryStoreBackend();
}

/**
 * @param {object} opts
 * @param {object} opts.capabilityToken the ISSUED token record — tenantId is
 *   derived from it, never passed separately (offline-sync.md §1).
 * @param {string} opts.mpId
 * @param {object} opts.localData manifest.localData (validated upstream)
 * @param {function} [opts.backendFactory] (databaseName, storeName, syncStrategy)
 *   => backend. ⚠ `syncStrategy` is passed so a host factory can make the SAME
 *   persist-vs-memory decision `defaultBackend` makes. Without it a factory has
 *   no way to tell a client-owned store from a server-authoritative cache, and
 *   would either persist caches that must not survive a session or drop
 *   preferences that must.
 * @param {function} [opts.now]
 */
export function createDataManager({ capabilityToken, mpId, localData = {}, backendFactory, now }) {
  const dbName = databaseName(capabilityToken, mpId);
  const stores = new Map();
  const syncMeta = new Map(); // storeName -> { lastSyncedAt, pending, online }

  for (const [storeName, decl] of Object.entries(localData)) {
    const backend = backendFactory
      ? backendFactory(dbName, storeName, decl.syncStrategy)
      : defaultBackend(dbName, storeName, decl.syncStrategy);
    stores.set(storeName, createDataStore({
      name: storeName,
      keyPath: decl.keyPath || 'id',
      recordSchema: decl.recordSchema,
      backend,
      now,
    }));
    syncMeta.set(storeName, { lastSyncedAt: null, pending: 0, online: true, strategy: decl.syncStrategy || 'server_authoritative' });
  }

  /** Drop `_rev/_dirty/_updatedAt/_dedupeKey` so a row read back from `getAll`
   *  is safe to spread into a new record. Mirrors DataStore's own stripMeta —
   *  duplicated rather than exported because it is three lines and exporting it
   *  would make an internal stamping detail part of the package surface. */
  const stripMeta = (row) => Object.fromEntries(
    Object.entries(row || {}).filter(([key]) => !key.startsWith('_')),
  );

  // Shared fetch→reconcile step behind both windowCache.sync and
  // liveQuery.revalidate: fetch the fresh DTOs for `window`, map through
  // `toRecord` (with a `prev` lookup when `keyOf` is supplied, for rich-field
  // preservation across a thin DTO), and reconcile them into the store under
  // `scope`. A failed fetch is swallowed so the SWR paint holds (cache intact).
  // Returns the reconciled, scope-filtered cache read.
  //
  // ⚠ INVALID RECORDS ARE PARTITIONED OUT BEFORE THE WRITE, NOT DISCOVERED
  // DURING IT. `reconcile` puts records one at a time and prunes AFTERWARDS, so
  // a throw part-way through leaves the store half-written with the prune never
  // run — and this function used to swallow that error entirely. Measured: three
  // DTOs with a schema violation in the MIDDLE one left the cache holding the
  // first fresh row, neither of the other two (the third was VALID and merely
  // queued behind the bad one), and a row the server had dropped still unpruned
  // — with `sync()` returning a normal-looking array and no signal anywhere.
  // Every later sync then failed at the same row, so the grid stayed wrong
  // indefinitely. Both live callers make this reachable: `timesheets_cache` and
  // `invoicing_cache` both declare `additionalProperties: false`, and timesheets
  // passes NO `toRecord`, so raw host DTOs go straight into a strict schema and
  // any field added host-side would silently break its grid.
  //
  // So: check first, reconcile the valid rows (the prune still runs), and REPORT
  // the bad ones. Dropping a malformed row is a judgement call; dropping it
  // silently is not.
  async function fetchAndReconcile(store, keyPath, { fetch, toRecord, keyOf }, scope, window) {
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
        // ⚠ STRIPPED. `getAll` returns rows WITH `_rev/_dirty/_updatedAt`, and
        // the `prev` lookup exists to be spread into the new record — the
        // docstring's own "rich-field preservation". Spreading a meta-stamped
        // row fails `additionalProperties: false`, which is what every MP cache
        // declares, so the documented pattern used to poison its own record and
        // land in the swallow above: the update vanished and the STALE row came
        // back as though the sync had succeeded.
        prevByKey = new Map(existing.map((row) => [String(row[keyPath]), stripMeta(row)]));
      }
      const records = [];
      const rejected = [];
      for (const dto of dtos) {
        let record;
        try {
          record = toRecord(dto, prevByKey ? prevByKey.get(String(keyOf(dto))) : undefined);
        } catch (err) {
          rejected.push(`toRecord threw: ${err && err.message}`);
          continue; // one unmappable DTO must not cost the whole window
        }
        const failure = typeof store.validateRecord === 'function' ? store.validateRecord(record) : null;
        if (failure) rejected.push(failure);
        else records.push(record);
      }
      if (rejected.length) {
        // LOUD. This is a developer error — a DTO shape that does not satisfy
        // the store's own recordSchema — and it is invisible from the surface,
        // which just shows stale rows. It has already cost one debugging cycle.
        console.error(
          `[windowCache] ${rejected.length}/${dtos.length} record(s) rejected by the store schema `
          + 'and DROPPED — the surface will show stale data for them:',
          rejected.slice(0, 3).join(' | '),
        );
      }
      try {
        await store.reconcile(records, { scope });
      } catch (err) {
        // Not silent. Anything reaching here is beyond a single bad record.
        console.error('[windowCache] reconcile failed; cache may be partially written:', err && err.message);
      }
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
    windowCache(storeName, {
      fetch, toRecord = (dto) => dto, scopeOf, keyOf,
    } = {}) {
      const store = stores.get(storeName);
      if (!store) throw new Error(`tommy.data.windowCache('${storeName}'): store not declared in manifest.localData`);
      const keyPath = localData[storeName]?.keyPath || 'id';
      const scopeFor = (window) => (scopeOf ? scopeOf(window) : () => true);
      return {
        read: (window) => store.readWhere(scopeFor(window)),
        sync: (window) => fetchAndReconcile(store, keyPath, { fetch, toRecord, keyOf }, scopeFor(window), window),
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
      scope, fetch, toRecord = (dto) => dto, keyOf,
    } = {}) {
      const store = stores.get(storeName);
      if (!store) throw new Error(`tommy.data.liveQuery('${storeName}'): store not declared in manifest.localData`);
      const keyPath = localData[storeName]?.keyPath || 'id';
      const predicate = typeof scope === 'function' ? scope : () => true;
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
        revalidate: (window) => fetchAndReconcile(store, keyPath, { fetch, toRecord, keyOf }, predicate, window),
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
