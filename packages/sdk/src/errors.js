/**
 * errors.js — TommyError / TommySDKError + the unknown-method guard.
 *
 * Every rejection from the SDK is a TommyError with a named, machine-checkable
 * `code` (src/types.ts TommyErrorCode) — never a bare string or undefined
 * (03-sdk-runtime/README design rules). The guard makes a hallucinated method
 * name throw a helpful "did you mean" error instead of returning undefined.
 */

const RETRYABLE_CODES = new Set(['Timeout', 'RateLimited', 'ActivityFailed']);

export class TommyError extends Error {
  /**
   * @param {object} opts
   * @param {string} opts.code TommyErrorCode
   * @param {string} opts.message names the broken rule
   * @param {string} [opts.rule] manifest/schema path that failed
   * @param {boolean} [opts.retryable]
   * @param {string} [opts.runId]
   * @param {unknown} [opts.cause]
   */
  constructor({ code, message, rule, retryable, runId, cause }) {
    super(message);
    this.name = 'TommyError';
    this.code = code;
    this.rule = rule;
    this.retryable = retryable !== undefined ? retryable : RETRYABLE_CODES.has(code);
    this.runId = runId;
    this.cause = cause;
  }
}

export const isTommyError = (e) => !!e && e.name === 'TommyError' && typeof e.code === 'string';

export class TommySDKError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'TommySDKError';
    this.code = code;
  }
}

/** Levenshtein distance — small inputs only (method names). */
function distance(a, b) {
  const m = a.length; const n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j += 1) d[0][j] = j;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return d[m][n];
}

export function nearest(name, known) {
  let best = null; let bestDist = Infinity;
  for (const k of known) {
    const dist = distance(String(name).toLowerCase(), k.toLowerCase());
    if (dist < bestDist) { best = k; bestDist = dist; }
  }
  return bestDist <= Math.max(2, Math.floor(String(name).length / 3)) ? best : null;
}

/**
 * Wrap an SDK namespace so unknown property access throws a named error with
 * a suggestion — critical for AI authors (03-sdk-runtime/README §guard).
 */
export function guard(ns, nsName) {
  return new Proxy(ns, {
    get(target, prop) {
      if (typeof prop === 'symbol' || prop in target) return target[prop];
      // Promise-interop probes (then/catch) and inspection internals pass through.
      if (['then', 'catch', 'finally', 'toJSON', 'constructor', 'valueOf', 'toString', 'inspect'].includes(prop)) return undefined;
      const known = Object.keys(target);
      const suggestion = nearest(prop, known);
      const prefix = nsName ? `tommy.${nsName}` : 'tommy';
      throw new TommySDKError(
        'UnknownMethod',
        `${prefix}.${String(prop)} does not exist.${suggestion ? ` Did you mean '${prefix}.${suggestion}'?` : ''}`,
      );
    },
  });
}
