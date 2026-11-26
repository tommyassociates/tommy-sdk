export const DEFAULT_THROTTLE_PROFILE = Object.freeze({
  emitsPerMin: 120,
  invokesPerMin: 120,
  queriesPerMin: 120,
  burst: 30,
  maxFanoutPerRoot: 500,
  maxChainDepth: 12,
  maxNodeRepeats: 3,
});

// A read that finds the bucket empty takes the next token and waits for it, up to this.
export const QUERY_RATE_WAIT_MAX_MS = 2000;

export const QUEUE_MAX_ENTRIES = 500;
export const QUEUE_MAX_BYTES = 5 * 1024 * 1024;
// A queued row older than this is never sent.
export const QUEUE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const SYNC_EMIT_TIMEOUT_MS = 3000;

export const DEFAULT_RETRY = Object.freeze({ maxAttempts: 3, backoff: 'exponential' });

// Backoff base for errors a handler raises.
export const RETRY_BASE_DELAY_MS = 100;
export const RETRY_MAX_DELAY_MS = 400;

// Spaced so a weak link does not resend a never-delivered write back to back on every drain.
export const QUEUE_RESEND_BASE_MS = 5000;
export const QUEUE_RESEND_MAX_MS = 120000;

// The longest Retry-After a throttled queued write waits for before its next send.
export const QUEUE_THROTTLE_MAX_MS = 60 * 60 * 1000;

// The wait after the `failures`-th unanswered send of a queued write.
export function queueResendDelayMs(failures) {
  if (!(failures > 0)) return 0;
  return Math.min(QUEUE_RESEND_BASE_MS * (2 ** (failures - 1)), QUEUE_RESEND_MAX_MS);
}

// The first attempt is never delayed; `none` keeps immediate retries.
export function retryDelayMs(backoff, attempt) {
  if (attempt <= 1) return 0;
  const n = attempt - 1;
  if (backoff === 'none') return 0;
  if (backoff === 'linear') return Math.min(RETRY_BASE_DELAY_MS * n, RETRY_MAX_DELAY_MS);
  return Math.min(RETRY_BASE_DELAY_MS * (2 ** (n - 1)), RETRY_MAX_DELAY_MS);
}

// The catalogue speaks in domains but the broker checks per-MP scopes, so domains are derived here.
export const DOMAIN_SCOPE_BY_MP = Object.freeze({
  scheduling: 'shifts',
  'time-clock': 'attendance',
  invoicing: 'invoices',
  team: 'team_members',
  'team-comms': 'messages',
  payroll: 'pay_templates',
});

export function domainScopeForMp(mpId, overrides = {}) {
  const domain = overrides[mpId] || DOMAIN_SCOPE_BY_MP[mpId] || String(mpId).replace(/-/g, '_');
  return `read:${domain}`;
}

// Primitives domain derivation must never grant; they need the explicit scope.
export const SENSITIVE_CONDITIONS = Object.freeze(new Set([
  'time-clock.kiosk_pin',
  'invoicing.vendor_settings',
]));
