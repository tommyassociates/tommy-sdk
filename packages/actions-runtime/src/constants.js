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

/**
 * Read-scope DERIVATION map (council C1 / Option B).
 *
 * The fixed permission catalogue (@tommy/manifest
 * src/catalogue/permission-catalogue.json) speaks in DOMAINS — `read:shifts`,
 * `read:attendance` — while the broker's cross-MP checks name PRIMITIVES —
 * `read:{owner}.{condition}`. Option B derives the second from the first: an
 * MP holding the owner's domain scope may read that owner's conditions and
 * subscribe to its triggers, with no new catalogue members and no per-primitive
 * minting. Explicit per-primitive scopes remain valid (a strict superset), and
 * SENSITIVE_CONDITIONS below opts individual primitives OUT of derivation.
 *
 * Only MPs whose catalogue domain differs from their id are listed; everything
 * else derives `read:{mpId with - → _}` (see `domainScopeForMp`). MPs whose
 * fallback is not yet a catalogue member (care-plans, calendar, onboarding)
 * are therefore reachable only via an explicit per-primitive scope until the
 * catalogue grows — deliberate, and tracked in HANDOFF-m1-grants.md §A.
 */
export const DOMAIN_SCOPE_BY_MP = Object.freeze({
  scheduling: 'shifts',
  'time-clock': 'attendance',
  invoicing: 'invoices',
  team: 'team_members',
  'team-comms': 'messages',
});

/** `mpId` → the catalogue domain read-scope that covers it. */
export function domainScopeForMp(mpId, overrides = {}) {
  const domain = overrides[mpId] || DOMAIN_SCOPE_BY_MP[mpId] || String(mpId).replace(/-/g, '_');
  return `read:${domain}`;
}

/**
 * Primitives that domain derivation must NEVER grant (council C1 / Option B,
 * part 2). A caller needs the EXPLICIT `read:{owner}.{primitive}` scope for
 * these even with the enforcement flags on — holding `read:attendance` does
 * not hand you the kiosk PIN. Keyed `{ownerMpId}.{primitiveName}`; exported so
 * review tooling and tests read the same list the broker enforces.
 *
 * Growing it is a REVIEW decision, not a code convenience: each entry is a
 * primitive whose payload is a credential, a financial secret, or otherwise
 * outside its own domain's normal read sensitivity.
 */
export const SENSITIVE_CONDITIONS = Object.freeze(new Set([
  'time-clock.kiosk_pin',      // device kiosk credential
  'invoicing.vendor_settings', // payment/vendor configuration
]));
