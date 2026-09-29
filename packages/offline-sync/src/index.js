/**
 * @tommy/offline-sync — per-(tenant, MP) data stores, sync metadata, and the
 * offline replay orchestration (offline-sync.md; fabric engine sits above).
 */
export { databaseName, BROKER_DATABASE } from './names.js';
export {
  createDataStore, createMemoryStoreBackend, createLocalStorageBackend, hasWebStorage,
  PersistError,
} from './data-store.js';
export { createDataManager, createReplayCoordinator } from './manager.js';
export { createDataService, createImmediateScheduler, DATA_STATES, DEFAULT_STALE_AFTER_MS } from './data-service.js';
export { reconcileFetched, windowKeyOf } from './reconcile.js';
export { queryRows, recordSchemaCheck } from './data-store.js';

export { StorageReadError } from './transactional-store.js';
