/**
 * constants.js — pinned defaults (sdk-broker harden round-1).
 *
 * Rate seeds from security-model.md §7 (120 action calls/min/MP, 500
 * RPC/min/instance); loop caps from actions-runtime.md §7.2/§7.3. The
 * per-kind split + burst were unspecified — recorded design decision,
 * M6-tunable from telemetry (see the spec's Deviations).
 */
export const DEFAULT_THROTTLE_PROFILE = Object.freeze({
  emitsPerMin: 120,
  invokesPerMin: 120,
  queriesPerMin: 120,
  burst: 30,
  maxFanoutPerRoot: 500,
  maxChainDepth: 12,
  maxNodeRepeats: 3,
});

/** offline-sync.md §3 — per-MP offline queue caps. */
export const QUEUE_MAX_ENTRIES = 500;
export const QUEUE_MAX_BYTES = 5 * 1024 * 1024;

/** actions-runtime.md §1 `sync` emission — broker ack timeout. */
export const SYNC_EMIT_TIMEOUT_MS = 3000;

/** Default retry budget when an activity declares none. */
export const DEFAULT_RETRY = Object.freeze({ maxAttempts: 3, backoff: 'exponential' });
