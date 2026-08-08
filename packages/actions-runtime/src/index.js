/**
 * @tommy/actions-runtime — the host broker (in-process entry points at M1;
 * the same broker serves the postMessage transport at M4).
 */
export { createBroker } from './broker.js';
export { createRecordStore, createMemoryBackend } from './records.js';
export { validateToken, createFakeIssuer } from './capability.js';
export {
  DEFAULT_THROTTLE_PROFILE, QUEUE_MAX_ENTRIES, QUEUE_MAX_BYTES, SYNC_EMIT_TIMEOUT_MS,
  // Read-scope derivation (council C1 / Option B) — exported so review tooling
  // and tests read the same lists the broker enforces.
  DOMAIN_SCOPE_BY_MP, SENSITIVE_CONDITIONS, domainScopeForMp,
} from './constants.js';
