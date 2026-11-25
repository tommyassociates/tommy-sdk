const ACCESS_CODES = new Set([
  'PermissionDenied', 'DATA_FORBIDDEN', 'DATA_ACCESS_CHANGED', 'FORBIDDEN', 'NotAuthorized',
  'SCOPE_DENIED', 'DeniedScope', 'Unauthorized', 'Forbidden',
]);
const UNAVAILABLE_CODES = new Set(['UnknownCondition', 'DATA_UNDECLARED', 'DATA_TRUNCATED', 'DATA_NOT_APPLICABLE', 'NDIS_DISABLED']);
const RETRY_CODES = new Set(['DATA_OFFLINE', 'DATA_NOT_READ', 'Timeout', 'REFRESH_BUSY', 'DATA_BUSY']);
const NO_RETRY_CODES = new Set(['InvalidPayload', 'DATA_INVALID']);
const HELD_CODES = new Set(['ACCOUNT_NOT_DISPLAYED', 'MP_WORLD_RETIRED']);
const WRAPPER_CODES = new Set(['ConditionError', 'ActivityFailed']);

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

export function unlistedReadCode(code, status, { report } = {}) {
  try { report?.(code, status); } catch (_) { /* a report never changes the outcome */ }
  if (status === 401 || status === 403) return { state: 'refused', reason: 'access' };
  if (status === 404 || status === 410) return { state: 'refused', reason: 'unavailable' };
  return { state: 'stale', retrying: false };
}

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
  const named = chain.map((link) => ({ code: codeOf(link), wraps: !!link.cause }))
    .filter(({ code, wraps }) => code && !(WRAPPER_CODES.has(code) && wraps));
  const status = statuses.length ? statuses[0] : null;
  if (named.length) return unlistedReadCode(named[named.length - 1].code, status, options);
  if (status !== null) return unlistedReadCode(null, status, options);
  return { state: 'stale', retrying: true };
}
