/**
 * capability.js — the CapabilityService seam (host-interfaces.ts:46-52).
 *
 * The broker depends on `{ issue, validate, scheduleRefresh }`. At M1:
 *  - `issue` binds to the LIVE backend token-issue endpoint through the F0
 *    typed client's `issueToken` — INJECTED by the loader (never an endpoint
 *    literal in this package); tests use `createFakeIssuer`.
 *  - `validate` is REAL shared code (structure, expiry, bound ids per
 *    security-model §6.1) exercised identically under the fake and the real
 *    issuer — only issuance is ever faked (harden round-1).
 *
 * Token wire shape: contracts/schemas/capability-token.json —
 * { token, expiresAt, mpId, mpVersion, tenantId, effectiveScopes, instanceId }.
 * The opaque `token` string is signed server-side; the client-side validate
 * checks binding + expiry + the signature via an injected verifier (the
 * server independently re-validates on every server_write — the client check
 * is fail-fast, not the security boundary).
 */
import { TommyError } from '@tommy/sdk';

const invalid = (message) => new TommyError({ code: 'CapabilityTokenInvalid', message, retryable: false });

/**
 * Validate an issued token record against the caller's claimed identity.
 * Returns the bound identity or throws CapabilityTokenInvalid.
 *
 * @param {object} issued the capability-token record (schema above)
 * @param {object} opts { mpId, instanceId, now?, verify? }
 */
export function validateToken(issued, { mpId, instanceId, now = () => Date.now(), verify } = {}) {
  if (!issued || typeof issued.token !== 'string' || !issued.token) throw invalid('capability token missing');
  for (const field of ['expiresAt', 'mpId', 'mpVersion', 'tenantId', 'instanceId']) {
    if (!issued[field]) throw invalid(`capability token missing '${field}'`);
  }
  if (!Array.isArray(issued.effectiveScopes)) throw invalid("capability token missing 'effectiveScopes'");
  if (Date.parse(issued.expiresAt) <= now()) throw invalid('capability token expired');
  if (mpId && issued.mpId !== mpId) throw invalid(`token bound to mp '${issued.mpId}', caller is '${mpId}'`);
  if (instanceId && issued.instanceId !== instanceId) throw invalid('token bound to a different instance');
  if (verify && !verify(issued)) throw invalid('capability token signature invalid');
  return { mpId: issued.mpId, tenantId: issued.tenantId, scopes: issued.effectiveScopes, tokenId: issued.token };
}

/**
 * Test-only in-memory issuer. Signs with a trivially-verifiable local scheme —
 * NEVER used outside tests; the real issuer is tommy-api via the typed client.
 * TTL ≤ 15 min (security-model §3).
 */
export function createFakeIssuer({ ttlMs = 15 * 60 * 1000, now = () => Date.now() } = {}) {
  const secret = 'fake-issuer-secret';
  const sign = (payload) => `${payload}.${secret.length * payload.length}`;
  let seq = 0;

  const verify = (issued) => {
    const [payload, mac] = String(issued.token).split('.');
    return sign(payload).endsWith(`.${mac}`) && payload === `cap-${issued.mpId}-${issued.instanceId}-${issued.__seq}`;
  };

  return {
    verify,
    async issue(mpId, mpVersion, tenantId, effectiveScopes, instanceId) {
      seq += 1;
      const payload = `cap-${mpId}-${instanceId}-${seq}`;
      return {
        token: sign(payload),
        __seq: seq,
        expiresAt: new Date(now() + Math.min(ttlMs, 15 * 60 * 1000)).toISOString(),
        mpId,
        mpVersion,
        tenantId,
        effectiveScopes: [...effectiveScopes],
        instanceId,
      };
    },
    validate(issued, opts = {}) {
      return validateToken(issued, { ...opts, now, verify });
    },
    scheduleRefresh() { /* host concern; no-op in the fake */ },
  };
}
