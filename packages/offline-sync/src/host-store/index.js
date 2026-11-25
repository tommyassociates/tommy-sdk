// Host-only adapter subpath; never imported by MP bundles.
export {
  createHostStorePort, retireHostStorePrincipal, createHostStoreChangeFeed, observeHostStorePort, HOST_STORE_CHANNEL, retirementEvent,
} from './port.js';
export * from './protocol.js';
export { createSqliteDatabase } from './sqlite.js';
