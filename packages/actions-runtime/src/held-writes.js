/**
 * The host queue's held writes: an activity that declares `holdUnsettled`
 * keeps its write in the queue from before its request goes until an answer
 * settles it. These decide the subject a write holds and whether an answer
 * settles it. No imports, so a Mini Program's tests can check its own
 * declaration against them.
 */
// A server code as the host hands it on (a refusal's own code, never a runtime one).
const SERVER_CODE = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

/**
 * The subject a `holdUnsettled` activity holds one write for: the values of
 * its declared `key` input fields, as text, in order. Null when one is not a
 * string or a number.
 */
export function holdSubject(hold, args) {
  const values = hold.key.map((field) => args?.[field]);
  if (values.some((value) => !(typeof value === 'string' && value) && !Number.isFinite(value))) return null;
  return JSON.stringify(values.map(String));
}

/**
 * Why a `holdUnsettled` write's outcome is not known, or null when the
 * server's answer is final. The first HTTP status on the error's cause chain
 * and the code beside it decide: no status (no answer, a local error) is
 * `unconfirmed`; a code the activity declares in `holdCodes` or `keepCodes`
 * is that code; a timeout (408) or a 5xx is `unconfirmed` unless its code is
 * one of `settleCodes`; an answer without a code is `unconfirmed`. Every
 * other coded answer is final.
 */
export function unsettledReason(error, hold) {
  let cause = error;
  for (let depth = 0; cause && depth < 8; depth += 1) {
    const status = Number(cause.status ?? cause.response?.status);
    if (Number.isInteger(status) && status > 0) {
      const code = [cause.code, cause.data?.code].find((one) => typeof one === 'string' && SERVER_CODE.test(one)) || null;
      if (code && ((hold.holdCodes || []).includes(code) || (hold.keepCodes || []).includes(code))) return code;
      if (status === 408 || status >= 500) return code && (hold.settleCodes || []).includes(code) ? null : 'unconfirmed';
      return code ? null : 'unconfirmed';
    }
    cause = cause.cause;
  }
  return 'unconfirmed';
}
