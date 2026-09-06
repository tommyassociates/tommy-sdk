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
 * The spacing behind `retry.backoff`, and the cap that keeps it honest.
 *
 * `backoff` has been a manifest-schema enum (`none | linear | exponential`)
 * since v1 and is declared by 26 activities across 14 MPs plus the reference
 * MP — and until spec mp-declared-bounds-that-dont-bind nothing implemented it.
 * The three attempts fired back to back, which matters most for the one
 * retryable error the runtime raises on its own: `RateLimited`. Three immediate
 * retries against a token bucket are guaranteed to fail and burn the whole
 * budget in the same millisecond.
 *
 * ⚠ THE CAP IS NOT A TUNING KNOB. Every Action run inherits this timing, so an
 * uncapped exponential turns a millisecond dead-letter into a multi-second one
 * and anything waiting on a run — a spinner, a fixed test timeout — waits with
 * it. At 100ms base and a 400ms ceiling the default 3-attempt budget adds 300ms
 * total, so a dead-letter still lands well inside a second.
 */
export const RETRY_BASE_DELAY_MS = 100;
export const RETRY_MAX_DELAY_MS = 400;

/**
 * Delay BEFORE `attempt` (1-based). The first attempt is never delayed.
 * `none` keeps the old behaviour for an activity that wants it, and is the
 * honest way to ask for immediate retries now that the default spaces them.
 */
export function retryDelayMs(backoff, attempt) {
  if (attempt <= 1) return 0;
  const n = attempt - 1;
  if (backoff === 'none') return 0;
  if (backoff === 'linear') return Math.min(RETRY_BASE_DELAY_MS * n, RETRY_MAX_DELAY_MS);
  // 'exponential', and anything unrecognised — the schema constrains the value,
  // but a runtime that guesses wrong should guess toward spacing, not against.
  return Math.min(RETRY_BASE_DELAY_MS * (2 ** (n - 1)), RETRY_MAX_DELAY_MS);
}

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
 * fallback is not yet a catalogue member (calendar, onboarding) are therefore
 * reachable only via an explicit per-primitive scope until the catalogue
 * grows — deliberate, and tracked in HANDOFF-m1-grants.md §A. `care-plans`
 * left that list in catalogue 0.3.0-starter, which added `read:care_plans`
 * for invoicing's three NDIS reads.
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
