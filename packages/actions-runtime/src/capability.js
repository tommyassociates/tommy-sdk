import { TommyError } from '@tommy/sdk';

const invalid = (message) => new TommyError({ code: 'CapabilityTokenInvalid', message, retryable: false });

export function validateToken(issued, { mpId, instanceId, subject, now = () => Date.now(), verify } = {}) {
  if (!issued || typeof issued.token !== 'string' || !issued.token) throw invalid('capability token missing');
  for (const field of ['expiresAt', 'mpId', 'mpVersion', 'tenantId', 'instanceId']) {
    if (!issued[field]) throw invalid(`capability token missing '${field}'`);
  }
  if (!Array.isArray(issued.effectiveScopes)) throw invalid("capability token missing 'effectiveScopes'");
  if (!Number.isFinite(Date.parse(issued.expiresAt)) || Date.parse(issued.expiresAt) <= now()) throw invalid('capability token expired');
  if (mpId && issued.mpId !== mpId) throw invalid(`token bound to mp '${issued.mpId}', caller is '${mpId}'`);
  if (instanceId && issued.instanceId !== instanceId) throw invalid('token bound to a different instance');
  if (subject !== undefined && subjectKey(issued.subject ?? null) !== subjectKey(subject)) throw invalid('token bound to a different client subject');
  if (subject && issued.tenantId !== `team-${subject.teamId}`) throw invalid('token bound to a different client team');
  if (verify && !verify(issued)) throw invalid('capability token signature invalid');
  return { mpId: issued.mpId, tenantId: issued.tenantId, scopes: issued.effectiveScopes, tokenId: issued.token };
}

function subjectKey(subject) {
  if (subject === null) return null;
  const ids = ['viewerId', 'apiSessionId', 'teamId', 'clientAccessId', 'clientId', 'conversationId', 'accessEpisode'];
  const fields = ['kind', 'apiSessionGeneration', 'contextVersion', ...ids];
  if (!subject || subject.kind !== 'client_access' || Object.keys(subject).length !== fields.length
    || !Number.isSafeInteger(subject.apiSessionGeneration) || subject.apiSessionGeneration < 1
    || typeof subject.contextVersion !== 'string' || !subject.contextVersion
    || ids.some((key) => typeof subject[key] !== 'string' || !/^[1-9][0-9]*$/.test(subject[key]))) {
    throw invalid('invalid client subject');
  }
  return JSON.stringify(fields.map((key) => subject[key]));
}

// Test-only in-memory issuer; never used outside tests.
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
