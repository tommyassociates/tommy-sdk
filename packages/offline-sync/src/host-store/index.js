// Host-only adapter subpath; never imported by MP bundles. The desktop shell
// vendors exactly index/port/protocol/sqlite, so nothing else is imported here.
export {
  createHostStorePort, retireHostStorePrincipal, createHostStoreChangeFeed, observeHostStorePort, HOST_STORE_CHANNEL,
} from './port.js';
export * from './protocol.js';
export { createSqliteDatabase } from './sqlite.js';
