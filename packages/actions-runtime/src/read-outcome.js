/**
 * read-outcome.js — what a failed host read means for the view that holds its
 * answer: `refused` (clear what is held) or `stale` (keep it, say it could not
 * be refreshed). One classifier for the broker's held-first conditions and
 * the host's collection follows and contract-read bridges.
 *
 * The lists:
 *   refused, reason 'access'      — HTTP 401 or 403 anywhere in the cause
 *                                   chain; PermissionDenied, DATA_FORBIDDEN,
 *                                   DATA_ACCESS_CHANGED, FORBIDDEN, NotAuthorized
 *   refused, reason 'unavailable' — UnknownCondition, DATA_UNDECLARED
 *   stale, the host retries       — DATA_OFFLINE, DATA_NOT_READ, Timeout,
 *                                   REFRESH_BUSY, HTTP 408 or 5xx, no status
 *   stale, no retry               — InvalidPayload (a caller bug)
 *   nothing shown                 — DATA_RETIRED (no caller waits)
 * A code no list names goes through `unlistedReadCode`, the one place its
 * meaning is decided: today it answers stale without a retry and reports the
 * code to the `report` callback.
 */

const ACCESS_CODES = new Set(['PermissionDenied', 'DATA_FORBIDDEN', 'DATA_ACCESS_CHANGED', 'FORBIDDEN', 'NotAuthorized']);
const UNAVAILABLE_CODES = new Set(['UnknownCondition', 'DATA_UNDECLARED']);
const RETRY_CODES = new Set(['DATA_OFFLINE', 'DATA_NOT_READ', 'Timeout', 'REFRESH_BUSY']);
// Codes the broker and SDK use to wrap another error; the wrapped one decides.
const WRAPPER_CODES = new Set(['ConditionError', 'ActivityFailed']);

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
 * A code no list names. The one place its meaning is decided: stale with no
 * retry, reported so it can be named.
 */
export function unlistedReadCode(code, status, { report } = {}) {
  try { report?.(code, status); } catch (_) { /* a report never changes the outcome */ }
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
 * retrying }`, or `{ state: 'silent' }` (nothing is shown).
 * @param {unknown} error
 * @param {{ report?: (code: string, status: number|null) => void }} [options]
 */
export function classifyReadOutcome(error, options = {}) {
  const chain = chainOf(error);
  const codes = chain.map(codeOf).filter(Boolean);
  const statuses = chain.map(statusOf).filter((status) => status !== null);
  if (statuses.some((status) => status === 401 || status === 403) || codes.some((code) => ACCESS_CODES.has(code))) {
    return { state: 'refused', reason: 'access' };
  }
  if (codes.some((code) => UNAVAILABLE_CODES.has(code))) return { state: 'refused', reason: 'unavailable' };
  if (codes.includes('DATA_RETIRED')) return { state: 'silent' };
  if (codes.includes('InvalidPayload')) return { state: 'stale', retrying: false };
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
