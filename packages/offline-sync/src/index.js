/**
 * @tommy/offline-sync — per-(tenant, MP) data stores, sync metadata, and the
 * offline replay orchestration (offline-sync.md; fabric engine sits above).
 */
export { databaseName, BROKER_DATABASE } from './names.js';
export {
  createDataStore, createMemoryStoreBackend, createLocalStorageBackend, hasWebStorage,
} from './data-store.js';
export { createDataManager, createReplayCoordinator } from './manager.js';
