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
import { createDataStore, createMemoryStoreBackend } from './data-store.js';

/**
 * @param {object} opts
 * @param {object} opts.capabilityToken the ISSUED token record — tenantId is
 *   derived from it, never passed separately (offline-sync.md §1).
 * @param {string} opts.mpId
 * @param {object} opts.localData manifest.localData (validated upstream)
 * @param {function} [opts.backendFactory] (databaseName, storeName) => backend
 * @param {function} [opts.now]
 */
export function createDataManager({ capabilityToken, mpId, localData = {}, backendFactory, now }) {
  const dbName = databaseName(capabilityToken, mpId);
  const stores = new Map();
  const syncMeta = new Map(); // storeName -> { lastSyncedAt, pending, online }

  for (const [storeName, decl] of Object.entries(localData)) {
    const backend = backendFactory ? backendFactory(dbName, storeName) : createMemoryStoreBackend();
    stores.set(storeName, createDataStore({
      name: storeName,
      keyPath: decl.keyPath || 'id',
      recordSchema: decl.recordSchema,
      backend,
      now,
    }));
    syncMeta.set(storeName, { lastSyncedAt: null, pending: 0, online: true, strategy: decl.syncStrategy || 'server_authoritative' });
  }

  return {
    databaseName: dbName,
    /** DataApi.store — only manifest-declared stores exist. */
    store(name) {
      const store = stores.get(name);
      if (!store) throw new Error(`tommy.data.store('${name}'): store not declared in manifest.localData`);
      return store;
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
