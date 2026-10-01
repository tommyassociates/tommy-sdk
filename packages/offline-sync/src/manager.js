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
import { reconcileFetched, windowKeyOf } from './reconcile.js';
import { createDataService } from './data-service.js';

// ⚠ THE MANAGER NO LONGER KEEPS ITS OWN COPY OF THE PAINT CEILING, and removing
// it is the fix rather than a simplification of one.
//
// The ceiling is enforced in `DataStore.readWhere`, which EVERY read here passes
// through — `windowCache.read`, `windowCache.sync` and `liveQuery` all end in
// `store.readWhere(...)`. So this file's `painted()` wrapper was a second copy of
// one rule, and the second copy was the less informed of the two: the store's
// knows the store's `syncStrategy` and exempts client-owned (`last_write_wins`)
// rows, because ageing out a member's own saved settings or half-typed draft is
// data loss dressed as a freshness guarantee. This copy knew nothing about
// strategy and filtered them anyway.
//
// It also drifted on the clock. It called `Date.now()` while the stores were
// built with the caller's injected `now`, so the manager and its own stores
// disagreed about the time — `invalidation-contract.test.js` pins
// t0 = 2026-09-04 and passed only while the real date was near it, going red on
// its own once the wall clock moved past 2026-09-05. That was repaired by
// threading the clock through; this removes the thing that needed threading.
//
// Teaching the duplicate about `syncStrategy` would have left two rules to keep
// in step, which is what produced both defects. One rule, at the read every
// caller already passes through.
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
    // Its rows are the only copy: a write that does not fit is refused, never
    // made room for by dropping another.
    return createLocalStorageBackend(dbName, storeName, { evict: false });
  }
  // ⚠ A `persist: true` SERVER-AUTHORITATIVE STORE STILL LANDS IN MEMORY HERE,
  // and that is deliberate. Durable caching needs a store far larger than Web
  // Storage can hold, so the host supplies it: its backend factory opens the
  // store on the host-store port (`app/src/services/mp-loader/mp-store-backend.js`).
  // The SDK package must not grow a storage dependency, and only the host knows the
  // account the database has to be namespaced by. With no host factory injected
  // (node, tests, a standalone SDK consumer) memory is the correct answer: the
  // declaration is honoured by whoever can honour it.
  return createMemoryStoreBackend();
}

/**
 * A store's manifest `indexes` (`[{ name, keyPath }]`) as DataStore indexes
 * (`{ name: field }`); the object form passes through.
 */
export function manifestIndexes(indexes) {
  if (Array.isArray(indexes)) {
    return Object.fromEntries(indexes.filter((entry) => typeof entry?.name === 'string' && entry.name && entry.keyPath)
      .map((entry) => [entry.name, entry.keyPath]));
  }
  return indexes && typeof indexes === 'object' ? { ...indexes } : {};
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
/**
 * Every MP's own preferences store (`mp.<mpId>.prefs`): small UI choices a
 * person makes (a layout, a filter, a toggle), kept per account on the
 * device, never sent anywhere. `prefs` is a host-owned name: a manifest
 * cannot declare it, and this declaration is the one used.
 */
export const PREFS_STORE = 'prefs';
// A removal another tab's write overtook is tried this many times in all.
const PREF_REMOVE_TRIES = 2;
export const PREFS_DECL = Object.freeze({
  keyPath: 'key',
  syncStrategy: 'last_write_wins',
  recordSchema: Object.freeze({
    type: 'object',
    required: ['key'],
    additionalProperties: false,
    properties: { key: { type: 'string', minLength: 1, maxLength: 200 }, value: {} },
  }),
});
const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

// `lane`: what keeps this world's scheduler jobs (its reads and pushes) apart
// from another world's of the same MP on a shared scheduler; the host names
// the world (its viewer and account). Without one, the MP's database for its
// tenant does.
export function createDataManager({
  capabilityToken, mpId, localData: declaredData = {}, backendFactory, now, onPersistError,
  scheduler, feed = null, isOnline, lane = null,
}) {
  const localData = { ...declaredData, [PREFS_STORE]: PREFS_DECL };
  const dbName = databaseName(capabilityToken, mpId);
  const stores = new Map();
  // Each store's handle for the MP: its writes go in the store's turn.
  const writers = new Map();
  let disposed = false;
  const live = () => { if (disposed) throw Object.assign(new Error('Data manager retired'), { name: 'StorageReadError', reason: 'retired' }); };
  const syncMeta = new Map(); // storeName -> { lastSyncedAt, pending, online }

  // Stores whose rows outlive a reload: the host's, or Web Storage for a
  // client-owned store. Prefs promise the device keeps them.
  const durableStores = new Set();
  for (const [storeName, decl] of Object.entries(localData)) {
    // The 4th argument is the store DECLARATION, added for `persist` (spec
    // mp-durable-instant-surfaces). Positional 1-3 are unchanged, so an existing
    // factory that reads three arguments keeps working untouched — the same
    // widening discipline the `syncStrategy` argument itself went through.
    const backend = backendFactory
      ? backendFactory(dbName, storeName, decl.syncStrategy, decl)
      : defaultBackend(dbName, storeName, decl.syncStrategy);
    if (backendFactory || (decl.syncStrategy === 'last_write_wins' && hasWebStorage())) durableStores.add(storeName);
    stores.set(storeName, createDataStore({
      name: storeName,
      keyPath: decl.keyPath || 'id',
      recordSchema: decl.recordSchema,
      indexes: manifestIndexes(decl.indexes),
      backend,
      now,
      ...(decl.maxRows ? { maxRows: decl.maxRows } : {}),
      // The paint ceiling applies to CACHES, not to client-owned rows: a
      // `last_write_wins` store holds the user's own settings and drafts, the
      // only copy, and ageing those out of a read is data loss wearing a
      // freshness guarantee.
      syncStrategy: decl.syncStrategy || 'server_authoritative',
      onPersistError,
    }));
    syncMeta.set(storeName, { lastSyncedAt: null, pending: 0, online: true, strategy: decl.syncStrategy || 'server_authoritative' });
  }

  // Shared fetch→reconcile step behind both windowCache.sync and
  // liveQuery.revalidate: fetch the fresh DTOs for `window`, map through
  // `toRecord` (with a `prev` lookup when `keyOf` is supplied, for rich-field
  // preservation across a thin DTO), and reconcile them into the store under
  // `scope`. A failed fetch is swallowed so the SWR paint holds (cache intact).
  // In a store that sends its changes, a row with an unsent change keeps it:
  // the server's copy never replaces an edit still waiting to go.
  // Returns the reconciled, scope-filtered cache read.
  // Only a read whose reconcile covers the whole store (`complete`) marks the
  // collection synced; a scoped read leaves its stamp as it was.
  // A store's name as the data service knows it: the manager's namespace
  // before it, so a declared name with a dot of its own stays this MP's.
  const qualified = (storeName) => `mp.${mpId}.${storeName}`;
  // Through the data service's one read guard, in the store's turn: a read
  // begun before a newer change (an ingest, a removal, a local write) never
  // undoes it.
  const fetchAndReconcile = (store, keyPath, spec, scope, window, windowKey, storeName, complete) => service.reconcileWindow( // eslint-disable-line no-use-before-define
    qualified(storeName), {
      fetch: spec.fetch, toRecord: spec.toRecord, keyOf: spec.keyOf, scope, window, windowKey, complete, keepDirty: service.sends(qualified(storeName)), // eslint-disable-line no-use-before-define
    },
  );

  // The same small surface the host uses, confined to this MP's own stores
  // (`mp.<mpId>.<store>`): anything else is refused before it reaches a store.
  const service = createDataService({
    namespace: `mp.${mpId}`,
    resolve: (name) => (stores.has(name) ? { store: stores.get(name), decl: localData[name] } : null),
    labelOf: (name) => `mp.${mpId}.${name}`,
    budgetKey: `mp.${mpId}`,
    lane: typeof lane === 'string' && lane ? lane : dbName,
    ...(scheduler ? { scheduler } : {}),
    ...(now ? { now } : {}),
    ...(typeof isOnline === 'function' ? { isOnline } : {}),
    feed,
    onPersistError,
  });

  // tommy.prefs: the store opens on first use, so an MP that never reads a
  // preference never opens it. `get` answers the change on its way when there
  // is one, else what the device holds once a load or a save has said (the
  // fallback before that; an MP reads again after `ready()`). `set` and
  // `remove` write through; a change the device refused never counts as saved.
  // A failed load is not remembered: the next `ready()` loads again.
  // Preferences are the device's own, so they are stored as settled rows,
  // never as changes waiting to be sent; a `set` the store refused rejects.
  //
  // Per key: `held`, what the device holds (`{ present, value }`, null until
  // a load or a save says); `saves`, how many changes the device saved; and
  // `changes`, the changes on their way, in the order they were asked.
  const prefKeys = new Map();
  let prefsLoaded = null;
  let prefsTried = false;
  const prefKey = (name) => {
    if (!prefKeys.has(name)) prefKeys.set(name, { held: null, saves: 0, changes: [] });
    return prefKeys.get(name);
  };
  function changePref(name, present, value) {
    const state = prefKey(name);
    const change = { present, value };
    state.changes.push(change);
    const settle = () => { state.changes.splice(state.changes.indexOf(change), 1); };
    return {
      saved() { settle(); state.held = { present, value }; state.saves += 1; },
      refused() { settle(); },
    };
  }
  // One key's writes and removals reach the store in the order they were
  // made, so what is stored follows what `get` answers.
  const prefWrites = new Map();
  function inPrefOrder(name, task) {
    const next = (prefWrites.get(name) || Promise.resolve()).then(task);
    const tail = next.then(() => {}, () => {});
    prefWrites.set(name, tail);
    tail.then(() => { if (prefWrites.get(name) === tail) prefWrites.delete(name); });
    return next;
  }
  // The one mapping every prefs write and removal answers through: a change
  // the device's storage refused (full or gone) or could not read for, on
  // any backend (a PersistError, DATA_UNAVAILABLE, or a host store's
  // StorageReadError other than a retired store), is DATA_NOT_SAVED; any
  // other error is passed on as it is.
  const storageRefusal = (error) => error?.name === 'PersistError' || error?.code === 'DATA_UNAVAILABLE'
    || (error?.name === 'StorageReadError' && error.reason !== 'retired');
  function notSaved(name, error) {
    if (error && !storageRefusal(error)) return error;
    return Object.assign(new Error(`tommy.prefs: '${name}' was not saved on this device`), { code: 'DATA_NOT_SAVED', ...(error ? { cause: error } : {}) });
  }
  // Once disposed, prefs answer nothing held (never the previous account's
  // choices), load nothing, and refuse writes.
  const prefs = Object.freeze({
    ready() {
      prefsTried = true;
      if (disposed) return Promise.resolve();
      if (prefsLoaded) return prefsLoaded;
      const savesAtStart = new Map([...prefKeys].map(([name, state]) => [name, state.saves]));
      const loading = service.read(PREFS_STORE).then((rows) => {
        if (disposed) return;
        const found = new Map();
        (rows || []).forEach((row) => { if (row && typeof row.key === 'string') found.set(row.key, row.value); });
        // What the device held when read, for every key no save has changed since.
        new Set([...found.keys(), ...prefKeys.keys()]).forEach((name) => {
          const state = prefKey(name);
          if (state.saves !== (savesAtStart.get(name) || 0)) return;
          state.held = found.has(name) ? { present: true, value: found.get(name) } : { present: false };
        });
      }).catch(() => { if (prefsLoaded === loading) prefsLoaded = null; });
      prefsLoaded = loading;
      return loading;
    },
    get(key, fallback = null) {
      if (disposed) return fallback;
      if (!prefsTried) prefs.ready();
      const state = prefKeys.get(String(key));
      const shown = state && (state.changes[state.changes.length - 1] || state.held);
      return shown && shown.present ? clone(shown.value) : fallback;
    },
    async set(key, value) {
      live();
      const name = String(key);
      const copied = clone(value);
      const stored = copied === undefined ? null : copied;
      const change = changePref(name, true, stored);
      // A device with no storage to keep prefs keeps none.
      if (!durableStores.has(PREFS_STORE)) { change.refused(); throw notSaved(name); }
      const result = await inPrefOrder(name, () => service.ingest(PREFS_STORE, [{ key: name, value: stored }]))
        .catch((error) => { change.refused(); throw notSaved(name, error); });
      // Saved only once the device holds it: a store that kept it in memory
      // only (its storage full or gone) would lose it on reload.
      if (result?.unsaved?.includes(name)) { change.refused(); throw notSaved(name); }
      if (!result?.written) { change.refused(); throw Object.assign(new Error(`tommy.prefs: '${name}' was not saved`), { code: 'DATA_INVALID' }); }
      change.saved();
    },
    async remove(key) {
      live();
      const name = String(key);
      const change = changePref(name, false);
      if (!durableStores.has(PREFS_STORE)) { change.refused(); throw notSaved(name); }
      // Removed only when the store removed it, or it is gone already: a row
      // another tab wrote since it was read is removed again, against that
      // write, and a removal still overtaken is refused, never reported done.
      await inPrefOrder(name, async () => {
        for (let attempt = 0; attempt < PREF_REMOVE_TRIES; attempt += 1) {
          // eslint-disable-next-line no-await-in-loop
          const { removed } = await service.purge(PREFS_STORE, { keys: [name], force: true });
          if (removed.includes(name)) return;
          // eslint-disable-next-line no-await-in-loop
          if (!(await service.read(PREFS_STORE, name, { raw: true }))) return;
        }
        throw Object.assign(new Error(`tommy.prefs: '${name}' was written again while it was removed`), { name: 'PersistError', reason: 'conflict', retained: false });
      }).catch((error) => { change.refused(); throw notSaved(name, error); });
      change.saved();
    },
  });

  return {
    databaseName: dbName,
    prefs,
    async dispose(options) {
      disposed = true;
      prefKeys.clear();
      service.dispose();
      await Promise.all([...stores.values()].map((store) => store.dispose?.(options)));
    },
    read: (...args) => { live(); return service.read(...args); },
    query: (...args) => { live(); return service.query(...args); },
    subscribe: (...args) => { live(); return service.subscribe(...args); },
    source: (...args) => { live(); return service.source(...args); },
    refresh: (...args) => { live(); return service.refresh(...args); },
    mutate: (...args) => { live(); return service.mutate(...args); },
    ingest: (...args) => { live(); return service.ingest(...args); },
    purge: (...args) => { live(); return service.purge(...args); },
    trim: (...args) => { live(); return service.trim(...args); },
    status: (...args) => service.status(...args),
    pending: (...args) => service.pending(...args),
    // Sends this MP's failed changes again (the host calls it on reconnect).
    retryFailed: () => service.retryFailed(),
    // Sends the changes held until this MP's account was displayed (the host
    // calls it once that account is displayed again).
    retryHeld: () => service.retryHeld(),
    /**
     * DataApi.store — only manifest-declared stores exist. Its writes go in
     * the store's turn with the data service's own, so a read already on its
     * way never undoes them.
     */
    store(name) {
      live();
      const store = stores.get(name);
      if (!store) throw new Error(`tommy.data.store('${name}'): store not declared in manifest.localData`);
      if (!writers.has(name)) writers.set(name, service.writer(qualified(name)));
      return writers.get(name);
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
        read: (window) => store.readWhere(scopeFor(window)),
        // The reconcile answers with its own read of the window's scope.
        sync: (window) => fetchAndReconcile(
          store, keyPath, { fetch, toRecord, keyOf }, scopeFor(window), window, windowKeyOf(window), storeName, !scopeOf,
        ),
      };
    },
    /**
     * DataApi.record — the SINGLE-RECORD read-through every detail/edit surface
     * wants, and the one combinator the SWR set was missing.
     *
     * `windowCache`/`liveQuery` are both WINDOW-shaped: they answer "give me the
     * rows in this range". A detail surface asks a different question — "give me
     * THIS id" — and the only thing available was a bare `store.get(id)`, which
     * returns `undefined` on a miss. Every caller then had the same choice, and
     * they all made it the same wrong way: treat "not cached" as "no data" and
     * paint an empty surface.
     *
     * ⚠ THAT IS NOT A HYPOTHETICAL. Timesheets shipped it: `getTimesheet` was
     * `store.get(id)` and nothing else, so opening the edit form for any
     * timesheet outside the loaded window — an activity-log deep link, a cold
     * refresh on the form URL, a row from a period the grid had not loaded —
     * rendered a BLANK "Edit Timesheet" over `Total Hours 0m`. Clicking a row in
     * the visible grid was the one path that always worked, which is why it
     * survived every hand test. Measured 2026-09-10.
     *
     * `get(id)`: cache first (instant, the SWR contract), and ONLY on a miss
     * fetch that one record, write it through, and return it.
     *
     * `fetch(id) → DTO | null` is the MP's own domain call. `toRecord(dto, prev)`
     * maps it to the store's record shape — the SAME lean-schema discipline
     * `windowCache` needs, since a record that fails the store's recordSchema is
     * dropped silently on put.
     *
     * ⚠ A FETCH FAILURE AND A GENUINE 404 ARE NOT THE SAME ANSWER, and conflating
     * them is exactly how the blank form happened. A miss returns `undefined`;
     * a FAILED fetch REJECTS, so the caller can tell "this record does not
     * exist" from "I could not reach the server" and say so. Callers that want
     * the old swallow-everything behaviour must opt in explicitly, in their own
     * code, where the decision is visible.
     */
    record(storeName, { fetch, toRecord = (dto) => dto } = {}) {
      const store = stores.get(storeName);
      if (!store) throw new Error(`tommy.data.record('${storeName}'): store not declared in manifest.localData`);
      return {
        async get(id, { refresh = false } = {}) {
          if (id == null) return undefined;
          const key = String(id);
          if (!refresh) {
            const hit = await store.get(key);
            if (hit) return hit;
          }
          if (typeof fetch !== 'function') return undefined;
          const dto = await fetch(id);
          if (!dto) return undefined;
          // `prev` so a thin single-record DTO cannot erase rich fields an
          // earlier window reconcile already put in the row.
          const prev = await store.get(key);
          const rec = toRecord(dto, prev);
          if (!rec) return undefined;
          // Stored as the server's row. In a store that sends its changes, a
          // row with an edit still waiting to go keeps it, and the read
          // answers with it: nothing when that edit is a delete. A cache write must never fail the read it was
          // serving: the record is returned either way, so a full/blocked
          // store degrades to fetch-every-time rather than to a blank surface.
          let kept = false;
          try {
            // One record says nothing about the rest: the collection's synced stamp stays.
            const result = await service.writer(qualified(storeName)).reconcile([rec], { prune: false, syncedAt: null, ...(service.sends(qualified(storeName)) ? { keepDirty: true } : {}) }); // eslint-disable-line no-use-before-define
            kept = (Array.isArray(result?.skipped) ? result.skipped : []).map(String).includes(key);
          } catch (_) { /* cache write is best-effort */ }
          return kept ? store.get(key) : rec;
        },
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
       * PAINTED; they are still stored until a sync replaces or prunes them,
       * a purge removes them or the store evicts them, and writers still see
       * them. A `_dirty` row is exempt: it is a local write that has not reached
       * the server, and its age is not a reason to hide it from its author.
       *
       * ⚠ THE CEILING IS APPLIED BY `DataStore.readWhere`, NOT HERE. The manager
       * used to wrap this predicate in its own copy of the rule; that copy could
       * not see the store's `syncStrategy` and so filtered client-owned rows the
       * store deliberately exempts. The read below passes through the store's
       * ceiling either way, and the reconcile scope stays the caller's own — it
       * must keep meaning "what this read covers", or an aged row would silently
       * escape pruning.
       */
      const predicate = scopePredicate;
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
      // A revalidate with neither scope reads the whole store.
      const wholeRead = typeof scope !== 'function' && typeof pruneScope !== 'function';
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
          // A change delivers the store's rows: each subscriber paints from
          // them rather than reading the whole store again.
          const off = store.subscribe((rows) => {
            if (!live) return;
            if (!Array.isArray(rows) || typeof store.selectFrom !== 'function') { emit(); return; }
            try { handler(store.selectFrom(rows, predicate)); } catch (_) { /* subscriber errors are theirs */ }
          });
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
        // The reconcile answers with its read of the prune scope; a read whose
        // paint scope differs reads that too.
        revalidate: (window) => fetchAndReconcile(
          store, keyPath, { fetch, toRecord, keyOf }, prunePredicate, window, windowKeyOf(window), storeName, wholeRead,
        ).then((rows) => (prunePredicate === predicate ? rows : store.readWhere(predicate))),
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
      if (unsubscribe) return;
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
