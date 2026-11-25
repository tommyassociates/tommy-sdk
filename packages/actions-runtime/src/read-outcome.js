/**
 * read-outcome.js — what a failed host read means for the view that holds its
 * answer: `refused` (clear what is held) or `stale` (keep it, say it could not
 * be refreshed), or no notice at all. One classifier for the broker's
 * held-first conditions and the host's collection follows and contract-read
 * bridges (host API level 20, refusal list as completed).
 *
 *   refused, reason 'access'      — HTTP 401 or 403 anywhere in the cause
 *                                   chain; PermissionDenied, DATA_FORBIDDEN,
 *                                   DATA_ACCESS_CHANGED, FORBIDDEN, NotAuthorized,
 *                                   SCOPE_DENIED, DeniedScope, Unauthorized, Forbidden
 *   refused, reason 'unavailable' — UnknownCondition, DATA_UNDECLARED,
 *                                   DATA_TRUNCATED, DATA_NOT_APPLICABLE, NDIS_DISABLED
 *   stale, the host retries       — DATA_OFFLINE, DATA_NOT_READ, Timeout,
 *                                   REFRESH_BUSY, DATA_BUSY, HTTP 408 or 5xx,
 *                                   no status
 *   stale, no retry               — InvalidPayload, DATA_INVALID (a caller bug)
 *   no notice ('silent')          — DATA_RETIRED (no caller waits)
 *   no notice ('held')            — ACCOUNT_NOT_DISPLAYED, MP_WORLD_RETIRED:
 *                                   delivery waits until that account is shown
 *   no notice ('signed_out')      — DATA_SIGNED_OUT: terminal; the sign-out
 *                                   purge clears what is held
 * A code no list names goes through `unlistedReadCode`: by its HTTP status,
 * 401/403 refused (access), 404/410 refused (unavailable), anything else stale
 * with no retry, and the code is reported (never row data) so the list can be
 * completed.
 */

const ACCESS_CODES = new Set([
  'PermissionDenied', 'DATA_FORBIDDEN', 'DATA_ACCESS_CHANGED', 'FORBIDDEN', 'NotAuthorized',
  'SCOPE_DENIED', 'DeniedScope', 'Unauthorized', 'Forbidden',
]);
const UNAVAILABLE_CODES = new Set(['UnknownCondition', 'DATA_UNDECLARED', 'DATA_TRUNCATED', 'DATA_NOT_APPLICABLE', 'NDIS_DISABLED']);
const RETRY_CODES = new Set(['DATA_OFFLINE', 'DATA_NOT_READ', 'Timeout', 'REFRESH_BUSY', 'DATA_BUSY']);
const NO_RETRY_CODES = new Set(['InvalidPayload', 'DATA_INVALID']);
const HELD_CODES = new Set(['ACCOUNT_NOT_DISPLAYED', 'MP_WORLD_RETIRED']);
// Codes the broker and SDK use to wrap another error; the wrapped one decides.
const WRAPPER_CODES = new Set(['ConditionError', 'ActivityFailed']);

/** Every code the lists name, for tests that pin another copy of the table. */
export const READ_OUTCOME_CODES = Object.freeze({
  access: [...ACCESS_CODES],
  unavailable: [...UNAVAILABLE_CODES],
  retry: [...RETRY_CODES],
  noRetry: [...NO_RETRY_CODES],
  silent: ['DATA_RETIRED'],
  held: [...HELD_CODES],
  signedOut: ['DATA_SIGNED_OUT'],
});
const statusOf = (error) => {
  const status = Number(error?.status ?? error?.statusCode ?? error?.response?.status);
  return Number.isFinite(status) && status > 0 ? status : null;
};
const codeOf = (error) => error?.data?.code || error?.response?.data?.code || error?.code || null;

/** Every error in the chain, outermost first (bounded). */
function chainOf(error) {
  const chain = [];
  const seen = new Set();
  let current = error;
  while (current && typeof current === 'object' && !seen.has(current) && chain.length < 8) {
    seen.add(current);
    chain.push(current);
    current = current.cause || current.error;
  }
  return chain;
}

/**
 * A code no list names: by its HTTP status, 401/403 refused (access), 404/410
 * refused (unavailable), anything else stale with no retry. The code is
 * reported either way.
 */
export function unlistedReadCode(code, status, { report } = {}) {
  try { report?.(code, status); } catch (_) { /* a report never changes the outcome */ }
  if (status === 401 || status === 403) return { state: 'refused', reason: 'access' };
  if (status === 404 || status === 410) return { state: 'refused', reason: 'unavailable' };
  return { state: 'stale', retrying: false };
}

/** The `ReadError` shape of an error: the answer's code and status, else the innermost meaningful error's. */
export function readErrorOf(error) {
  const chain = chainOf(error);
  const answered = chain.find((link) => statusOf(link) !== null);
  const meaningful = chain.find((link) => codeOf(link) && !(WRAPPER_CODES.has(codeOf(link)) && link.cause)) || chain[chain.length - 1] || error;
  const source = answered || meaningful;
  return {
    code: codeOf(source) || codeOf(meaningful) || null,
    status: answered ? statusOf(answered) : null,
    message: String(source?.message || error?.message || ''),
  };
}

/**
 * Classify a failed read: `{ state: 'refused', reason }`, `{ state: 'stale',
 * retrying }`, or a state that delivers no notice: `silent`, `held` (wait
 * until the account is displayed) or `signed_out`.
 * @param {unknown} error
 * @param {{ report?: (code: string|null, status: number|null) => void }} [options]
 */
export function classifyReadOutcome(error, options = {}) {
  const chain = chainOf(error);
  const codes = chain.map(codeOf).filter(Boolean);
  const statuses = chain.map(statusOf).filter((status) => status !== null);
  if (codes.includes('DATA_SIGNED_OUT')) return { state: 'signed_out' };
  if (codes.some((code) => HELD_CODES.has(code))) return { state: 'held' };
  if (statuses.some((status) => status === 401 || status === 403) || codes.some((code) => ACCESS_CODES.has(code))) {
    return { state: 'refused', reason: 'access' };
  }
  if (codes.some((code) => UNAVAILABLE_CODES.has(code))) return { state: 'refused', reason: 'unavailable' };
  if (codes.includes('DATA_RETIRED')) return { state: 'silent' };
  if (codes.some((code) => NO_RETRY_CODES.has(code))) return { state: 'stale', retrying: false };
  if (codes.some((code) => RETRY_CODES.has(code))) return { state: 'stale', retrying: true };
  if (statuses.some((status) => status === 408 || status >= 500)) return { state: 'stale', retrying: true };
  // The innermost code that is more than a wrapper decides the rest.
  const named = chain.map((link) => ({ code: codeOf(link), wraps: !!link.cause }))
    .filter(({ code, wraps }) => code && !(WRAPPER_CODES.has(code) && wraps));
  const status = statuses.length ? statuses[0] : null;
  if (named.length) return unlistedReadCode(named[named.length - 1].code, status, options);
  if (status !== null) return unlistedReadCode(null, status, options);
  return { state: 'stale', retrying: true };
}
