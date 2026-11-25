import { databaseName, viewerDatabaseName } from './names.js';
import { reconcileFetched, windowKeyOf } from './reconcile.js';
import { createDataService } from './data-service.js';

// Client-owned rows never age out: a member's own settings or draft is the only copy.
import {
  createDataStore, createMemoryStoreBackend, createLocalStorageBackend, hasWebStorage,
} from './data-store.js';

// Client-owned stores persist across reload in Web Storage when no host backend is injected.
const persistsByDefault = (syncStrategy, viewerDb) => syncStrategy === 'last_write_wins' && !!viewerDb && hasWebStorage();
function defaultBackend(viewerDb, storeName, syncStrategy) {
  if (persistsByDefault(syncStrategy, viewerDb)) {
    // Its rows are the only copy: a write that does not fit is refused, never evicted.
    return createLocalStorageBackend(viewerDb, storeName, { evict: false });
  }
  // Caches default to memory: durable caching needs host storage, and the SDK must not grow a storage dependency.
  return createMemoryStoreBackend();
}

export function manifestIndexes(indexes) {
  if (Array.isArray(indexes)) {
    return Object.fromEntries(indexes.filter((entry) => typeof entry?.name === 'string' && entry.name && entry.keyPath)
      .map((entry) => [entry.name, entry.keyPath]));
  }
  return indexes && typeof indexes === 'object' ? { ...indexes } : {};
}

// Kept per account on the device, never sent anywhere; `prefs` is a host-owned name.
export const PREFS_STORE = 'prefs';
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

export function createDataManager({
  capabilityToken, mpId, localData: declaredData = {}, backendFactory, now, onPersistError,
  scheduler, feed = null, changeOwner = null, isOnline, lane = null, viewer = null,
}) {
  const localData = { ...declaredData, [PREFS_STORE]: PREFS_DECL };
  const dbName = databaseName(capabilityToken, mpId);
  const viewerDb = !backendFactory && typeof viewer === 'string' && viewer ? viewerDatabaseName(capabilityToken, mpId, viewer) : null;
  const stores = new Map();
  const writers = new Map();
  let disposed = false;
  const live = () => { if (disposed) throw Object.assign(new Error('Data manager retired'), { name: 'StorageReadError', reason: 'retired' }); };
  const syncMeta = new Map();

  const durableStores = new Set();
  for (const [storeName, decl] of Object.entries(localData)) {
    const backend = backendFactory
      ? backendFactory(dbName, storeName, decl.syncStrategy, decl)
      : defaultBackend(viewerDb, storeName, decl.syncStrategy);
    if (backendFactory || persistsByDefault(decl.syncStrategy, viewerDb)) durableStores.add(storeName);
    stores.set(storeName, createDataStore({
      name: storeName,
      keyPath: decl.keyPath || 'id',
      recordSchema: decl.recordSchema,
      indexes: manifestIndexes(decl.indexes),
      backend,
      now,
      ...(decl.maxRows ? { maxRows: decl.maxRows } : {}),
      syncStrategy: decl.syncStrategy || 'server_authoritative',
      onPersistError,
    }));
    syncMeta.set(storeName, { lastSyncedAt: null, pending: 0, online: true, strategy: decl.syncStrategy || 'server_authoritative' });
  }

  // A failed fetch is swallowed so the SWR paint holds.
  // The server's copy never replaces an edit still waiting to go.
  const qualified = (storeName) => `mp.${mpId}.${storeName}`;
  // Through the data service's read guard, so an older read never undoes a newer change.
  const fetchAndReconcile = (store, keyPath, spec, scope, window, windowKey, storeName, complete) => service.reconcileWindow( // eslint-disable-line no-use-before-define
    qualified(storeName), {
      fetch: spec.fetch, toRecord: spec.toRecord, keyOf: spec.keyOf, readKey: spec.readKey, onReadDropped: spec.onReadDropped, scope, window, windowKey, complete, keepDirty: service.sends(qualified(storeName)), // eslint-disable-line no-use-before-define
    },
  );

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
    changeOwner,
    onPersistError,
  });

  // Consumers receive this interface, never the private writer as their receiver.
  function publicWriter(name) {
    if (writers.has(name)) return writers.get(name);
    const writer = service.writer(qualified(name));
    const target = {};
    const readMethods = new Set([
      'get', 'getRaw', 'getAll', 'getAllRaw', 'readWhere', 'selectFrom',
      'query', 'validateRecord', 'subscribe', 'subscribeQuery', 'onChange',
    ]);
    const publicArgs = (property, args) => {
      if (property !== 'put' && property !== 'delete') return args;
      const { when: _when, receipt: _receipt, guardKey: _guardKey, ...options } = args[1] || {};
      return [args[0], options, ...args.slice(2)];
    };
    Reflect.ownKeys(writer).filter((property) => property !== 'replaceSynced').forEach((property) => {
      const value = writer[property];
      if (typeof value === 'function') {
        target[property] = (...args) => Reflect.apply(value, writer, publicArgs(property, args));
      } else target[property] = value;
    });
    let handle;
    const forward = (property, value) => {
      if (readMethods.has(property) && typeof value === 'function') {
        writer[property] = (...args) => Reflect.apply(value, handle, publicArgs(property, args));
      }
    };
    handle = new Proxy(target, {
      set(projected, property, value) {
        const changed = Reflect.set(projected, property, value, projected);
        if (changed) forward(property, value);
        return changed;
      },
      defineProperty(projected, property, descriptor) {
        const changed = Reflect.defineProperty(projected, property, descriptor);
        if (changed && Object.hasOwn(descriptor, 'value')) forward(property, descriptor.value);
        return changed;
      },
    });
    writers.set(name, handle);
    return handle;
  }

  // Opens on first use, so an MP that never reads a preference never opens it.
  // A change the device refused never counts as saved.
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
  const prefWrites = new Map();
  function inPrefOrder(name, task) {
    const next = (prefWrites.get(name) || Promise.resolve()).then(task);
    const tail = next.then(() => {}, () => {});
    prefWrites.set(name, tail);
    tail.then(() => { if (prefWrites.get(name) === tail) prefWrites.delete(name); });
    return next;
  }
  const storageRefusal = (error) => error?.name === 'PersistError' || error?.code === 'DATA_UNAVAILABLE'
    || (error?.name === 'StorageReadError' && error.reason !== 'retired');
  function notSaved(name, error) {
    if (error && !storageRefusal(error)) return error;
    return Object.assign(new Error(`tommy.prefs: '${name}' was not saved on this device`), { code: 'DATA_NOT_SAVED', ...(error ? { cause: error } : {}) });
  }
  // Once disposed, prefs answer nothing held (never the previous account's).
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
      if (!durableStores.has(PREFS_STORE)) { change.refused(); throw notSaved(name); }
      const result = await inPrefOrder(name, () => service.ingest(PREFS_STORE, [{ key: name, value: stored }]))
        .catch((error) => { change.refused(); throw notSaved(name, error); });
      if (result?.unsaved?.includes(name)) { change.refused(); throw notSaved(name); }
      if (!result?.written) { change.refused(); throw Object.assign(new Error(`tommy.prefs: '${name}' was not saved`), { code: 'DATA_INVALID' }); }
      change.saved();
    },
    async remove(key) {
      live();
      const name = String(key);
      const change = changePref(name, false);
      if (!durableStores.has(PREFS_STORE)) { change.refused(); throw notSaved(name); }
      // A removal still overtaken is refused, never reported done.
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
    read: (collection, key, { raw = false } = {}) => { live(); return service.read(collection, key, { raw }); },
    query: (...args) => { live(); return service.query(...args); },
    subscribe: (target, callback, { onError } = {}) => { live(); return service.subscribe(target, callback, { onError }); },
    source: (...args) => { live(); return service.source(...args); },
    refresh: (...args) => { live(); return service.refresh(...args); },
    mutate: (...args) => { live(); return service.mutate(...args); },
    ingest: (...args) => { live(); return service.ingest(...args); },
    purge: (...args) => { live(); return service.purge(...args); },
    trim: (...args) => { live(); return service.trim(...args); },
    status: (...args) => service.status(...args),
    pending: (...args) => service.pending(...args),
    retryFailed: () => service.retryFailed(),
    retryHeld: () => service.retryHeld(),
    // Only manifest-declared stores exist.
    store(name) {
      live();
      const store = stores.get(name);
      if (!store) throw new Error(`tommy.data.store('${name}'): store not declared in manifest.localData`);
      return publicWriter(name);
    },
    // Windows are keyed by sorted JSON so retention counts windows, not rows.
    windowCache(storeName, {
      fetch, toRecord = (dto) => dto, scopeOf, keyOf, readKey,
    } = {}) {
      const store = stores.get(storeName);
      if (!store) throw new Error(`tommy.data.windowCache('${storeName}'): store not declared in manifest.localData`);
      const keyPath = localData[storeName]?.keyPath || 'id';
      const scopeFor = (window) => (scopeOf ? scopeOf(window) : () => true);
      return {
        read: (window) => store.readWhere(scopeFor(window)),
        sync: (window) => fetchAndReconcile(
          store, keyPath, { fetch, toRecord, keyOf, readKey }, scopeFor(window), window, windowKeyOf(window), storeName, !scopeOf,
        ),
      };
    },
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
          // Transport begins inside the shared guard, so a late answer cannot undo a newer change.
          return service.reconcileRecord(qualified(storeName), key, {
            fetch: () => fetch(id), toRecord, keepDirty: service.sends(qualified(storeName)),
          });
        },
      };
    },
    liveQuery(storeName, {
      scope, pruneScope, fetch, toRecord = (dto) => dto, keyOf, readKey, onReadDropped,
    } = {}) {
      const store = stores.get(storeName);
      if (!store) throw new Error(`tommy.data.liveQuery('${storeName}'): store not declared in manifest.localData`);
      const keyPath = localData[storeName]?.keyPath || 'id';
      const scopePredicate = typeof scope === 'function' ? scope : () => true;
      // Paint ceiling: a persisted cache must not paint a confident, weeks-old view.
      const predicate = scopePredicate;
      // Reading and deleting are different authorities: prune uses pruneScope, not the display scope.
      const prunePredicate = typeof pruneScope === 'function' ? pruneScope : scopePredicate;
      const wholeRead = typeof scope !== 'function' && typeof pruneScope !== 'function';
      return {
        store: publicWriter(storeName),
        read: () => store.readWhere(predicate),
        subscribe(handler) {
          let live = true;
          const emit = () => {
            if (!live) return;
            store.readWhere(predicate)
              .then((rows) => { if (live) handler(rows); })
              .catch(() => { /* subscriber read error — skip this emit */ });
          };
          const off = store.subscribe((rows) => {
            if (!live) return;
            if (!Array.isArray(rows) || typeof store.selectFrom !== 'function') { emit(); return; }
            try { handler(store.selectFrom(rows, predicate)); } catch (_) { /* subscriber errors are theirs */ }
          });
          emit();
          return () => { live = false; off(); };
        },
        revalidate: (window) => fetchAndReconcile(
          store, keyPath, { fetch, toRecord, keyOf, readKey, onReadDropped }, prunePredicate, window, windowKeyOf(window), storeName, wholeRead,
        ).then((rows) => (prunePredicate === predicate ? rows : store.readWhere(predicate))),
      };
    },
    syncState(storeName) {
      const meta = syncMeta.get(storeName);
      if (!meta) throw new Error(`tommy.data.syncState('${storeName}'): store not declared`);
      return { lastSyncedAt: meta.lastSyncedAt, pending: meta.pending, online: meta.online };
    },
    _setSyncState(storeName, patch) {
      const meta = syncMeta.get(storeName);
      if (meta) Object.assign(meta, patch);
    },
  };
}

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
