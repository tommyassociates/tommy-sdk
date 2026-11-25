// Enforcement lives here, never in SDK code; the SDK validates for developer experience only.
import { TommyError, isTommyError, buildSdk, DEFAULT_RPC_TIMEOUT_MS } from '@tommy/sdk';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import {
  DEFAULT_THROTTLE_PROFILE, QUERY_RATE_WAIT_MAX_MS, QUEUE_MAX_ENTRIES, QUEUE_MAX_BYTES, SYNC_EMIT_TIMEOUT_MS, DEFAULT_RETRY,
  retryDelayMs,
  queueResendDelayMs,
  SENSITIVE_CONDITIONS, domainScopeForMp,
} from './constants.js';
import { createRecordStore } from './records.js';
import { createIdempotencyLedger, createInvalidationEpochs } from './idempotency-ledger.js';
import { createDurableQueue } from './durable-queue.js';
import { validateToken } from './capability.js';
import { evaluatePredicate as evaluateDeclaredPredicate } from './predicate.js';
import { holdSubject, unsettledReason } from './held-writes.js';
import { createOutcomeLedger } from './outcome-ledger.js';
import { createConditionAnswers, conditionSignature } from './condition-answers.js';
import { classifyReadOutcome, readErrorOf } from './read-outcome.js';

const err = (code, message, extra = {}) => new TommyError({ code, message, ...extra });


export const SCOPED_INVOKE_HOST_API = 17;
const PARENT_RUN = Symbol('parentRun');
// A confirm's dispatch: told when its request is sent, and given one attempt.
const CONFIRM_SEND = Symbol('confirmSend');

const dayKey = (ts) => new Date(ts).toISOString().slice(0, 10);

const M1_SOURCES = new Set(['trigger', 'condition', 'option']);

// Broker-lifetime maps are caches, not ledgers: each is capped, and eviction costs a recompute, never correctness.
const CONDITION_CACHE_MAX = 500;
const PROCESSED_KEYS_MAX = 1000;
const APPLIED_KEYS_OVERFLOW_MAX = 10000;
// Past this a keyed invoke is refused, so every running key stays joinable and a stuck MP cannot pile up work.
const INFLIGHT_RUNS_MAX = 500;
const SETTLE_RETRY_AFTER_MS = 2000;
const SETTLE_RETRY_DRAINS = 3;
const CONFIRM_WITHIN_MS = 24 * 60 * 60 * 1000;
// A revalidation whose condition was purged or marked stale mid-read reads again, at most this many times.
const FENCE_RESTARTS_MAX = 2;
// A write that takes a secret input is never kept for a confirm.
const SECRET_INPUT_NAMES = new Set(['pin', 'passcode', 'password', 'secret', 'token', 'otp']);

const SCHEMA_DEPTH_MAX = 8;
const SUBSCHEMA_KEYS = ['items', 'additionalProperties', 'additionalItems', 'contains', 'not', 'if', 'then', 'else',
  'propertyNames', 'unevaluatedProperties', 'unevaluatedItems'];
const SUBSCHEMA_LIST_KEYS = ['allOf', 'anyOf', 'oneOf', 'prefixItems'];
const SUBSCHEMA_MAP_KEYS = ['patternProperties', 'dependentSchemas'];

function localRef(root, ref) {
  if (typeof ref !== 'string' || !ref.startsWith('#')) return undefined;
  if (ref === '#') return root;
  if (!ref.startsWith('#/')) return undefined;
  return ref.slice(2).split('/').map((part) => decodeURIComponent(part).replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce((node, part) => (node && typeof node === 'object' ? node[part] : undefined), root);
}

// Anything it cannot inspect (too deep, a remote or unresolvable $ref) counts as secret, so the request is never kept.
function hasSecretInput(schema, depth = 0, root = schema, seen = new Set()) {
  if (schema === undefined || schema === null || typeof schema === 'boolean') return false;
  if (typeof schema !== 'object' || depth > SCHEMA_DEPTH_MAX) return true;
  if (schema.writeOnly === true) return true;
  if (schema.$ref !== undefined) {
    const target = localRef(root, schema.$ref);
    if (target === undefined) return true;
    if (!seen.has(schema.$ref) && hasSecretInput(target, depth + 1, root, new Set([...seen, schema.$ref]))) return true;
  }
  for (const [name, property] of Object.entries(schema.properties || {})) {
    if (SECRET_INPUT_NAMES.has(String(name).toLowerCase())) return true;
    if (hasSecretInput(property, depth + 1, root, seen)) return true;
  }
  for (const key of SUBSCHEMA_MAP_KEYS) {
    if (Object.values(schema[key] || {}).some((part) => hasSecretInput(part, depth + 1, root, seen))) return true;
  }
  for (const key of SUBSCHEMA_KEYS) {
    const part = schema[key];
    if (Array.isArray(part) ? part.some((one) => hasSecretInput(one, depth + 1, root, seen)) : hasSecretInput(part, depth + 1, root, seen)) return true;
  }
  return SUBSCHEMA_LIST_KEYS.some((key) => Array.isArray(schema[key]) && schema[key].some((part) => hasSecretInput(part, depth + 1, root, seen)));
}

const confirmEligible = (activityDef) => activityDef?.idempotency === 'client_key'
  && activityDef.offlineReplayable === true && !hasSecretInput(activityDef.inputSchema);

const RESTORE_CONTEXT_ALWAYS = new Set(['team.update_member']);
// Only on a durable-queue drain: the server reads restoreContext as 'this write waited' and honours its captured time.
const RESTORE_CONTEXT_ON_DRAIN = new Set(['time-clock.record_attendance', 'time-clock.record_booking_clock']);
const wantsRestoreContext = (envelope) => RESTORE_CONTEXT_ALWAYS.has(envelope.activity)
  || (RESTORE_CONTEXT_ON_DRAIN.has(envelope.activity) && envelope.restoreDrain === true);
const wantsQueuedAt = (envelope) => RESTORE_CONTEXT_ON_DRAIN.has(envelope.activity) && envelope.restoreDrain === true;

const SYSTEM_TRIGGERS = Object.freeze({
  'settings.changed': Object.freeze({
    emission: 'async',
    payloadSchema: {
      type: 'object',
      required: ['changedKeys'],
      properties: { changedKeys: { type: 'array', items: { type: 'string' } } },
    },
  }),
});

function dottedGet(obj, path) {
  return String(path).split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().filter((k) => value[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

// FNV-1a so a derived key fits idempotencyKey maxLength (128); the server's upsert is the real duplicate guard.
function stableHash(value) {
  const text = stableStringify(value);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

const utf16Units = (text) => String(text).length;

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().filter((key) => value[key] !== undefined).map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function createBroker({
  capabilityService,
  recordBackend,
  serverInvoke,
  onOfflineOutcome,
  now = () => Date.now(),
  online = true,
  throttleOverrides = {},
  tenantStateKey = (tenantId) => tenantId,
  strictEmptyCallers = false,
  enforceConditionScopes = false,
  strictEmitOwnership = false,
  grantedScopes,
  domainScopeOverrides = {},
  sensitiveConditions = SENSITIVE_CONDITIONS,
  idempotencyLedger = createIdempotencyLedger(),
  invalidationEpochs = createInvalidationEpochs(),
  offlineQueue = createDurableQueue({ now }),
  // The queue is one store per device, so only a broker of the same owner sends a row.
  queueOwner = null,
  replayEnvelope = (envelope) => envelope,
  outcomeStore = null,
  conditionAnswerStore = null,
  viewerFingerprint = () => '',
  reportReadCode = null,
  registrationTimeoutMs = 8000,
  callerLinkAfterAnswerMs = 60000,
  inflightJoinTimeoutMs = DEFAULT_RPC_TIMEOUT_MS,
  sleep = (ms) => (ms > 0 ? new Promise((resolve) => { setTimeout(resolve, ms); }) : Promise.resolve()),
  setTimer = (fn, ms) => { const timer = setTimeout(fn, ms); timer?.unref?.(); return timer; },
  clearTimer = (timer) => clearTimeout(timer),
} = {}) {
  if (!capabilityService || typeof capabilityService.validate !== 'function') {
    throw new Error('createBroker: capabilityService with validate() required');
  }

  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const compiled = new Map();
  const compileSchema = (schema) => {
    const key = JSON.stringify(schema);
    if (!compiled.has(key)) compiled.set(key, ajv.compile(schema));
    return compiled.get(key);
  };

  const records = createRecordStore({ backend: recordBackend, now });
  const outcomes = createOutcomeLedger({ store: outcomeStore, now });
  outcomes.ready();
  let outcomeGeneration = 0;
  const conditionAnswers = createConditionAnswers({ store: conditionAnswerStore });
  conditionAnswers.ready();
  let conditionReadSeq = 0;

  const mps = new Map();
  // Panels can query an MP still loading; announced MPs are awaited instead of failing as UnknownCondition.
  const expectedMps = new Set();
  const registrationWaiters = new Map();
  const subscribers = new Map();
  const actionState = new Map();
  const settingState = new Map();
  const processedKeys = new Map();

  const appliedKeysOverflow = new Set();
  const conditionCache = new Map();
  // Bumped on every condition-cache invalidation so the late-value salvage can tell the cache moved.
  let conditionCacheEpoch = 0;
  const suppressionTally = new Map();
  const debouncePending = new Map();
  const invokeChains = new Map();
  const inflightInvokes = new Map();
  const JOIN_DEADLINE_MARGIN_MS = 250;
  const executingChains = new Map();
  const activeRuns = new Set();
  const txnSteps = new Map();
  const chainBudget = new Map();
  const buckets = new Map();
  const queueStore = offlineQueue || createDurableQueue({ now, storage: null });
  const unsettled = new Map();
  let settleRetryTimer = null;
  let settleRetries = 0;
  function scheduleSettleRetry() {
    // eslint-disable-next-line no-use-before-define
    if (retired || settleRetryTimer || settleRetries >= SETTLE_RETRY_DRAINS) return;
    settleRetries += 1;
    settleRetryTimer = setTimeout(() => {
      settleRetryTimer = null;
      // An open drain has already passed the refused row: wait for it, then drain the unsettled rows again.
      // eslint-disable-next-line no-use-before-define
      const open = drainInFlight;
      // eslint-disable-next-line no-use-before-define
      // Offline, rows wait for the reconnect drain; draining now would re-queue unsent writes.
      if (!retired) Promise.resolve(open).catch(() => {}).then(() => (retired || !unsettled.size || !isOnline ? null : drainOfflineQueue())).catch(() => {});
    }, SETTLE_RETRY_AFTER_MS);
  }
  // Applied writes whose removal the store refused: never shown held again, and never sent again.
  const appliedHolds = new Set();
  let holdCleanupTimer = null;
  let holdCleanupTries = 0;
  function scheduleHoldCleanup() {
    if (retired || holdCleanupTimer || !appliedHolds.size || holdCleanupTries >= SETTLE_RETRY_DRAINS) return;
    holdCleanupTries += 1;
    holdCleanupTimer = setTimeout(async () => {
      holdCleanupTimer = null;
      for (const id of [...appliedHolds]) {
        const row = queueStore.all().find((candidate) => candidate.id === id);
        if (!row) { appliedHolds.delete(id); continue; }
        // eslint-disable-next-line no-await-in-loop
        try { await queueStore.remove(row.seq); appliedHolds.delete(id); } catch (_) { /* tried again */ }
      }
      if (appliedHolds.size) scheduleHoldCleanup(); else holdCleanupTries = 0;
    }, SETTLE_RETRY_AFTER_MS);
  }
  // Rows being sent by a drain read as sending and cannot be discarded meanwhile.
  const drainingRows = new Set();
  let isOnline = online;
  let pendingWork = 0;
  let retired = false;
  const queueSubscriptions = new Set();
  async function trackWork(run) {
    if (retired) throw err('ActivityFailed', 'MP runtime retired', { retryable: false });
    pendingWork += 1;
    try { return await run(); } finally { pendingWork -= 1; }
  }


  const qualify = (mpId, name) => `${mpId}.${name}`;
  const splitQualified = (qualified) => {
    const idx = qualified.indexOf('.');
    return [qualified.slice(0, idx), qualified.slice(idx + 1)];
  };

  function authenticate(envelope) {
    const issued = envelope.capabilityToken;
    const identity = capabilityService.validate(issued, { mpId: envelope.sourceMpId, instanceId: envelope.instanceId });
    return identity;
  }

  function throttleProfileFor(mpId) {
    return { ...DEFAULT_THROTTLE_PROFILE, ...(throttleOverrides[mpId] || {}) };
  }

  function reserveToken(mpId, kind, maxWaitMs = 0) {
    const profile = throttleProfileFor(mpId);
    const perMin = { emit: profile.emitsPerMin, query: profile.queriesPerMin, invoke: profile.invokesPerMin }[kind];
    const key = `${mpId}:${kind}`;
    const bucket = buckets.get(key) || { tokens: profile.burst, updatedAt: now() };
    const elapsed = (now() - bucket.updatedAt) / 60000;
    bucket.tokens = Math.min(profile.burst, bucket.tokens + elapsed * perMin);
    bucket.updatedAt = now();
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      buckets.set(key, bucket);
      return 0;
    }
    const waitMs = perMin > 0 ? Math.ceil(((1 - bucket.tokens) * 60000) / perMin) : Infinity;
    buckets.set(key, bucket);
    if (waitMs > maxWaitMs) {
      throw err('RateLimited', `mp '${mpId}' exceeded ${kind} rate (${perMin}/min, burst ${profile.burst})`, {
        retryable: true,
        ...(Number.isFinite(waitMs) ? { retryAfterMs: waitMs } : {}),
      });
    }
    bucket.tokens -= 1;
    return waitMs;
  }

  function takeToken(mpId, kind) {
    reserveToken(mpId, kind, 0);
  }

  async function awaitQueryToken(mpId) {
    const waitMs = reserveToken(mpId, 'query', QUERY_RATE_WAIT_MAX_MS);
    if (waitMs <= 0) return;
    await sleep(waitMs);
    if (retired) throw err('ActivityFailed', 'MP runtime retired', { retryable: false });
  }

  function checkChain(mpId, actionName, chain) {
    const profile = throttleProfileFor(mpId);
    const { rootRunId, depth, chainPath } = chain;
    if (depth > profile.maxChainDepth) {
      throw err('ChainDepthExceeded', `chain depth ${depth} > ${profile.maxChainDepth}`, { retryable: false });
    }
    const nodeKey = `${mpId}:${actionName}`;
    const repeats = chainPath.filter((n) => n === nodeKey).length;
    if (repeats >= profile.maxNodeRepeats) {
      throw err('LoopDetected', `(${nodeKey}) repeats ${repeats}x in ancestry (max ${profile.maxNodeRepeats})`, { retryable: false });
    }
    const total = (chainBudget.get(rootRunId) || 0) + 1;
    if (total > profile.maxFanoutPerRoot) {
      throw err('FanoutLimitExceeded', `root ${rootRunId} exceeded ${profile.maxFanoutPerRoot} runs`, { retryable: false });
    }
    chainBudget.set(rootRunId, total);
  }

  function validateAgainst(schema, value, code, what) {
    if (!schema) return;
    const validate = compileSchema(schema);
    if (!validate(value)) {
      const detail = (validate.errors || []).map((e) => `${e.instancePath || '$'} ${e.message}`).join('; ');
      throw err(code, `${what} failed schema validation: ${detail}`, { rule: detail, retryable: false });
    }
  }

  function authorizeInvoke(callerMpId, targetMpId, activityName, activityDef, scopes) {
    const callers = activityDef.authorizedCallers;
    const policy = activityDef.callerPolicy;
    const callerIsTarget = callerMpId === targetMpId;
    const callerFirstParty = mps.get(callerMpId)?.firstParty === true;
    // callerPolicy is optional in v1, so an omitted one keeps the first_party default instead of becoming uninvokable.
    const explicitEmpty = Array.isArray(callers) && callers.length === 0;
    const effectivePolicy = policy
      || (Array.isArray(callers) && callers.length ? 'listed' : null)
      || ((explicitEmpty && strictEmptyCallers) ? 'owner_only' : 'first_party');
    const allowed = {
      owner_only: () => callerIsTarget,
      first_party: () => callerIsTarget || callerFirstParty,
      listed: () => callerIsTarget || (Array.isArray(callers) && callers.includes(callerMpId)),
    }[effectivePolicy]();
    if (!allowed) {
      const rule = policy
        ? `activities.${activityName}.callerPolicy`
        : `activities.${activityName}.authorizedCallers`;
      const because = policy
        ? `declares callerPolicy '${policy}', which does not admit '${callerMpId}'`
        : `does not list '${callerMpId}' in authorizedCallers`;
      throw err('PermissionDenied', `activity '${qualify(targetMpId, activityName)}' ${because}`, {
        rule,
        retryable: false,
      });
    }
    const scope = `invoke:${qualify(targetMpId, activityName)}`;
    // '*' is the host authority marker, never issuable through a capability token.
    if (!scopes.includes(scope) && !scopes.includes('*') && !callerIsTarget) {
      throw err('PermissionDenied', `caller lacks scope '${scope}'`, { rule: 'permissions', retryable: false });
    }
  }

  const isSensitive = (qualified) => (typeof sensitiveConditions?.has === 'function'
    ? sensitiveConditions.has(qualified)
    : (sensitiveConditions || []).includes(qualified));

  // Sensitive conditions accept only the explicit scope: read:attendance must not hand out time-clock.kiosk_pin.
  function readGrant(ownerMpId, primitiveName) {
    const qualified = qualify(ownerMpId, primitiveName);
    const explicit = `read:${qualified}`;
    const domain = domainScopeForMp(ownerMpId, domainScopeOverrides);
    const sensitive = isSensitive(qualified);
    return {
      qualified,
      explicit,
      domain,
      sensitive,
      accepts: sensitive ? [explicit] : [explicit, domain],
      denialMessage: sensitive
        ? `caller lacks scope '${explicit}' ('${qualified}' is sensitive — the '${domain}' domain scope does not grant it)`
        : `caller lacks scope '${explicit}' or '${domain}'`,
    };
  }

  const holdsReadGrant = (held, grant) => grant.accepts.some((s) => held.includes(s)) || held.includes('*');

  function tokenlessScopes(mpId, tenantId) {
    if (typeof grantedScopes !== 'function') return mps.get(mpId)?.manifest.permissions?.scopes || [];
    const held = grantedScopes(mpId, tenantId);
    return Array.isArray(held) ? held : [];
  }

  function authorizeQuery(callerMpId, ownerMpId, conditionName, scopes) {
    if (!enforceConditionScopes) return;
    if (callerMpId === ownerMpId) return;
    const grant = readGrant(ownerMpId, conditionName);
    if (!holdsReadGrant(scopes || [], grant)) {
      throw err('PermissionDenied', grant.denialMessage, { rule: 'permissions', retryable: false });
    }
  }

  function authorizeSubscribe(subscriberMpId, triggerQualified, tenantId) {
    if (triggerGranted(subscriberMpId, triggerQualified, tenantId)) return;
    const [ownerMpId, triggerName] = splitQualified(triggerQualified);
    const grant = readGrant(ownerMpId, triggerName);
    throw err('PermissionDenied', `mp '${subscriberMpId}' may not subscribe to '${triggerQualified}': ${grant.denialMessage}`, {
      rule: 'permissions', retryable: false,
    });
  }

  function actionKey(tenantId, mpId, actionId, locationId = null) {
    return `${tenantStateKey(tenantId)}:${mpId}:${actionId}${locationId == null ? '' : `:location:${locationId}`}`;
  }

  function eventLocation(payload = {}) {
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return null;
    const camel = payload.locationId;
    const snake = payload.location_id;
    if (camel != null && snake != null && String(camel) !== String(snake)) {
      throw err('InvalidPayload', 'Conflicting event location identifiers', { retryable: false });
    }
    const value = camel ?? snake;
    return value == null || value === '' ? null : String(value);
  }

  function invalidateConditionCache(tenantId) {
    const prefix = `${tenantStateKey(tenantId)}:`;
    conditionCacheEpoch += 1;
    for (const key of [...conditionCache.keys()]) {
      if (key.startsWith(prefix)) conditionCache.delete(key);
    }
  }

  // An ungranted binding is dropped, not thrown: one MP's manifest must not break another's writes.
  function triggerGranted(mpId, triggerQualified, tenantId) {
    if (!strictEmitOwnership) return true;
    const [ownerMpId, triggerName] = splitQualified(triggerQualified);
    if (ownerMpId === mpId) return true;
    return holdsReadGrant(tokenlessScopes(mpId, tenantId), readGrant(ownerMpId, triggerName));
  }

  function actionsForTrigger(tenantId, triggerQualified, payload) {
    const wired = [];
    const locationId = eventLocation(payload);
    for (const [mpId, entry] of mps) {
      const actions = entry.manifest.actions || {};
      for (const [actionId, action] of Object.entries(actions)) {
        const srcMp = action.trigger.mp || mpId;
        if (qualify(srcMp, action.trigger.name) !== triggerQualified) continue;
        if (!triggerGranted(mpId, triggerQualified, tenantId)) continue;
        const scopedState = locationId == null ? null : actionState.get(actionKey(tenantId, mpId, actionId, locationId));
        const local = scopedState?.inherited === true ? null : scopedState;
        if (local && action.locationOverridable !== true) continue;
        const state = local || actionState.get(actionKey(tenantId, mpId, actionId))
          || { enabled: action.required ? true : action.enabledByDefault, options: action.optionsDefault || {} };
        if (action.required || state.enabled) wired.push({ mpId, actionId, action, options: state.options });
      }
    }
    return wired;
  }

  function subscriberHears(sub, triggerQualified, tenantId) {
    if (sub.tenantKey !== undefined && sub.tenantKey !== tenantStateKey(tenantId)) return false;
    return triggerGranted(sub.mpId, triggerQualified, tenantId);
  }

  function triggerIsActive(tenantId, triggerQualified, payload) {
    return [...(subscribers.get(triggerQualified) || [])].some((sub) => subscriberHears(sub, triggerQualified, tenantId))
      || actionsForTrigger(tenantId, triggerQualified, payload).length > 0;
  }

  function identityForAction(executingMpId, emitterIdentity) {
    return {
      mpId: executingMpId,
      tenantId: emitterIdentity?.tenantId,
      scopes: tokenlessScopes(executingMpId, emitterIdentity?.tenantId),
      tokenId: undefined,
      causedByTokenId: emitterIdentity?.tokenId,
    };
  }

  async function runAction(tenantId, triggerPayload, wiredAction, chain, emitterIdentity) {
    const { mpId, actionId, action, options } = wiredAction;
    const identity = identityForAction(mpId, emitterIdentity);

    const conditionValues = {};
    const resolveSource = (source) => {
      if (source.transform) throw err('InvalidPayload', `Action '${actionId}': transform chains (E2) not implemented at M1`, { rule: 'not-implemented:2.22-E2', retryable: false });
      if (source.template !== undefined) throw err('InvalidPayload', `Action '${actionId}': template sources (E3) not implemented at M1`, { rule: 'not-implemented:2.22-E3', retryable: false });
      let value;
      if ('const' in source) value = source.const;
      else if (M1_SOURCES.has(source.from)) {
        const base = source.from === 'trigger' ? triggerPayload
          : source.from === 'option' ? options
            : conditionValues[source.ref];
        value = dottedGet(base, source.path);
      } else {
        throw err('InvalidPayload', `Action '${actionId}': inputMap source '${source.from}' not implemented at M1`, { rule: `not-implemented:inputMap.${source.from}`, retryable: false });
      }
      if (value === undefined && 'default' in source) value = source.default;
      return value;
    };

    for (const gate of action.conditions || []) {
      const ref = gate.ref || gate.name;
      const owner = gate.mp || mpId;
      let condArgs = {};
      if (gate.input) {
        for (const [field, source] of Object.entries(gate.input)) condArgs[field] = resolveSource(source);
      } else if (gate.args) {
        condArgs = gate.args;
      }
      // eslint-disable-next-line no-await-in-loop
      const value = await dispatchQuery({
        sourceMpId: mpId,
        condition: qualify(owner, gate.name),
        args: condArgs,
        tenantId,
        chain: { ...chain, depth: chain.depth + 1, chainPath: [...chain.chainPath, `${mpId}:${actionId}`] },
        identity,
      });
      conditionValues[ref] = value;
      if (!value) return { skipped: true, reason: `condition '${ref}' gated` };
    }

    const binding = action.activity;
    if (binding.select || action.forEach || action.serviceReads) {
      throw err('InvalidPayload', `Action '${actionId}': select/forEach/serviceReads (E4/E5/E6) not implemented at M1`, {
        rule: 'not-implemented:2.22-E4-E6', retryable: false,
      });
    }
    let args = {};
    for (const [field, source] of Object.entries(binding.inputMap || {})) {
      args[field] = resolveSource(source);
    }
    if (!binding.inputMap) args = triggerPayload;

    const targetMp = binding.mp || mpId;
    // No caller supplies the key, so derive it from action, payload and args; args alone repeat across events.
    const targetDef = mps.get(targetMp)?.manifest.activities?.[binding.name];
    const derivedKey = targetDef?.idempotency === 'client_key'
      ? `act-${mpId}-${actionId}-${stableHash({ trigger: triggerPayload ?? null, args })}`.slice(0, 128)
      : undefined;
    return dispatchInvoke({
      sourceMpId: mpId,
      activity: qualify(targetMp, binding.name),
      args,
      tenantId,
      identity,
      ...(derivedKey ? { idempotencyKey: derivedKey } : {}),
      chain: { ...chain, depth: chain.depth + 1, chainPath: [...chain.chainPath, `${mpId}:${actionId}`] },
      viaAction: actionId,
    });
  }

  function deliverEmit(...args) { return trackWork(() => deliverEmitInnerTracked(...args)); }

  async function deliverEmitInnerTracked(record, payload, tenantId, identity) {
    const triggerQualified = record.triggerName;
    const chain = { rootRunId: record.rootRunId, depth: record.depth, chainPath: record.chainPath };
    const deliveries = [];

    for (const sub of subscribers.get(triggerQualified) || []) {
      if (!subscriberHears(sub, triggerQualified, tenantId)) continue;
      const delivery = records.open({
        kind: 'delivery',
        parentRunId: record.runId,
        triggerName: triggerQualified,
        sourceMpId: record.sourceMpId,
        targetMpId: sub.mpId,
        tenantId,
        rootRunId: record.rootRunId,
        depth: record.depth + 1,
        chainPath: [...record.chainPath, `${sub.mpId}:subscribe(${triggerQualified})`],
        online: isOnline,
      }).then(async (rec) => {
        try {
          await sub.handler(payload, {
            emitId: record.runId, emitterMpId: record.sourceMpId, ts: new Date(now()).toISOString(), live: record.online,
          });
          await records.update(rec.runId, { status: 'succeeded' });
          return { firstParty: mps.get(sub.mpId)?.firstParty === true };
        } catch (cause) {
          await records.update(rec.runId, { status: 'failed', error: { code: 'ActivityFailed', message: String(cause && cause.message) } });
          return { firstParty: false };
        }
      });
      deliveries.push(delivery);
    }

    for (const wired of actionsForTrigger(tenantId, triggerQualified, payload)) {
      deliveries.push(
        runAction(tenantId, payload, wired, chain, identity)
          .catch(async (cause) => {
            const failed = await records.open({
              kind: 'delivery',
              parentRunId: record.runId,
              triggerName: triggerQualified,
              sourceMpId: record.sourceMpId,
              targetMpId: wired.mpId,
              tenantId,
              rootRunId: record.rootRunId,
              depth: record.depth + 1,
              chainPath: [...record.chainPath, `${wired.mpId}:${wired.actionId}`],
              online: isOnline,
            });
            await records.update(failed.runId, {
              status: isTommyError(cause) && !cause.retryable ? 'dead_letter' : 'failed',
              error: { code: isTommyError(cause) ? cause.code : 'ActivityFailed', message: String(cause.message) },
            });
            return { firstParty: false };
          }),
      );
    }

    return deliveries.map((delivery) => trackWork(() => delivery));
  }

  function dispatchEmit(...args) { return trackWork(() => dispatchEmitInnerTracked(...args)); }

  async function dispatchEmitInnerTracked(envelope) {
    const identity = envelope.identity || authenticate(envelope);
    const tenantId = identity.tenantId;
    const [emitterMp] = [envelope.sourceMpId];
    takeToken(emitterMp, 'emit');

    const [ownerMpId, triggerName] = splitQualified(envelope.trigger.includes('.') ? envelope.trigger : qualify(emitterMp, envelope.trigger));
    const triggerQualified = qualify(ownerMpId, triggerName);
    const ownerEntry = mps.get(ownerMpId);
    const triggerDef = ownerEntry?.manifest.triggers?.[triggerName]
      || (ownerEntry && SYSTEM_TRIGGERS[triggerName]);
    if (!triggerDef) throw err('UnknownTrigger', `trigger '${triggerQualified}' is not declared by any registered MP`, { retryable: false });

    // Only the owner may emit its trigger; checked before the offline enqueue so a drain is not re-judged.
    const hostOriginated = !envelope.capabilityToken && !!envelope.identity;
    if (strictEmitOwnership && ownerMpId !== emitterMp && !hostOriginated) {
      throw err('PermissionDenied', `mp '${emitterMp}' may not emit '${triggerQualified}' — the trigger is owned by '${ownerMpId}'`, {
        rule: 'triggers.owner', retryable: false,
      });
    }
    validateAgainst(triggerDef.payloadSchema, envelope.payload, 'InvalidPayload', `trigger '${triggerQualified}' payload`);

    if (!triggerIsActive(tenantId, triggerQualified, envelope.payload)) {
      const key = `${tenantId}:${triggerQualified}:${dayKey(now())}`;
      suppressionTally.set(key, (suppressionTally.get(key) || 0) + 1);
      return { emitId: `suppressed-${key}`, deliveredTo: 0, queuedFor: 0, suppressed: true };
    }

    if (!isOnline) {
      const queuedSeq = await enqueueOffline(emitterMp, { ...envelope, identity });
      return { emitId: `queued-${queuedSeq}`, deliveredTo: 0, queuedFor: 1 };
    }

    const chain = envelope.chain || { rootRunId: undefined, depth: 0, chainPath: [] };
    if (chain.rootRunId) checkChain(emitterMp, `emit(${triggerQualified})`, chain);

    const record = await records.open({
      kind: 'emit',
      triggerName: triggerQualified,
      sourceMpId: emitterMp,
      sourceMpVersion: mps.get(emitterMp)?.manifest.version,
      targetMpId: undefined,
      tenantId,
      capabilityTokenId: identity.tokenId,
      args: envelope.payload,
      rootRunId: chain.rootRunId,
      depth: chain.depth,
      chainPath: chain.chainPath,
      online: isOnline,
    });
    const emission = triggerDef.emission || 'async';
    if (emission === 'debounced') {
      return debouncedEmit(triggerQualified, emitterMp, triggerDef.debounceMs || 0, record, envelope.payload, tenantId, identity);
    }

    const deliveries = await deliverEmit(record, envelope.payload, tenantId, identity);
    await records.update(record.runId, { status: 'succeeded' });
    const receipt = { emitId: record.runId, deliveredTo: deliveries.length, queuedFor: 0 };

    if (emission === 'sync') {
      const cap = new Promise((resolve) => { setTimeout(resolve, SYNC_EMIT_TIMEOUT_MS); });
      await Promise.race([Promise.allSettled(deliveries), cap]);
    }
    return receipt;
  }

  function debouncedEmit(triggerQualified, emitterMp, debounceMs, record, payload, tenantId, identity) {
    const key = `${triggerQualified}:${emitterMp}`;
    const pending = debouncePending.get(key);
    if (pending) {
      clearTimeout(pending.timer);
      pending.superseded.push(pending.latest);
    }
    const entry = pending || { superseded: [], resolvers: [] };
    entry.latest = { record, payload };
    entry.timer = setTimeout(() => trackWork(async () => {
      debouncePending.delete(key);
      for (const old of entry.superseded) {
        // eslint-disable-next-line no-await-in-loop
        await records.update(old.record.runId, { status: 'succeeded', result: { coalesced: true } });
      }
      await deliverEmit(entry.latest.record, entry.latest.payload, tenantId, identity);
      await records.update(entry.latest.record.runId, { status: 'succeeded' });
    }), debounceMs);
    debouncePending.set(key, entry);
    return { emitId: record.runId, deliveredTo: 0, queuedFor: 0, coalescing: true };
  }

  async function resolveMpEntry(mpId) {
    const entry = mps.get(mpId);
    if (entry) return entry;
    if (!expectedMps.has(mpId)) return undefined;

    let waiters = registrationWaiters.get(mpId);
    if (!waiters) { waiters = new Set(); registrationWaiters.set(mpId, waiters); }

    await new Promise((resolve) => {
      const done = () => { clearTimeout(timer); waiters.delete(done); resolve(); };
      const timer = setTimeout(done, registrationTimeoutMs);
      // Never hold a process open on a wait nobody is watching.
      if (typeof timer?.unref === 'function') timer.unref();
      waiters.add(done);
    });

    return mps.get(mpId);
  }

  function isKnownUnknown(value) {
    return !!(value && typeof value === 'object' && value.unresolved);
  }

  function pruneConditionCache(justSetKey = null) {
    if (conditionCache.size <= CONDITION_CACHE_MAX) return;
    const t = now();
    for (const [key, entry] of conditionCache) {
      if (entry.expiresAt <= t) conditionCache.delete(key);
    }
    // Never the entry just stored, or a short-TTL condition evicts itself on every read.
    for (const key of conditionCache.keys()) {
      if (conditionCache.size <= CONDITION_CACHE_MAX) break;
      if (key === justSetKey) continue;
      conditionCache.delete(key);
    }
  }

  function dispatchQuery(...args) { return trackWork(() => dispatchQueryInnerTracked(...args)); }

  async function dispatchQueryInnerTracked(envelope) {
    const prepared = await prepareQuery(envelope);
    if (typeof envelope.onRead === 'function') return heldFirstQuery(envelope, prepared);
    const cached = cachedConditionAnswer(prepared);
    if (cached) return cached.value;
    return runQuery(envelope, prepared);
  }

  async function prepareQuery(envelope) {
    const identity = envelope.identity || authenticate(envelope);
    const tenantId = envelope.tenantId || identity.tenantId;

    const [ownerMpId, conditionName] = splitQualified(envelope.condition);
    const ownerEntry = await resolveMpEntry(ownerMpId);
    const conditionDef = ownerEntry?.manifest.conditions?.[conditionName];
    if (!conditionDef) throw err('UnknownCondition', `condition '${envelope.condition}' is not registered`, { retryable: false });

    authorizeQuery(envelope.sourceMpId, ownerMpId, conditionName, identity.scopes);
    validateAgainst(conditionDef.inputSchema, envelope.args, 'InvalidPayload', `condition '${envelope.condition}' args`);

    // A held-first condition's cached answer belongs to the viewer it was read for.
    const viewer = conditionDef.heldFirst === true ? `:${JSON.stringify(currentFingerprint())}` : '';
    const cacheKey = `${tenantStateKey(tenantId)}:${envelope.condition}:${JSON.stringify(envelope.args)}${viewer}`;
    return { identity, tenantId, ownerMpId, conditionName, ownerEntry, conditionDef, cacheKey };
  }

  function currentFingerprint() {
    try { return String(viewerFingerprint?.() ?? ''); } catch (_) { return ''; }
  }

  function cachedConditionAnswer({ conditionDef, cacheKey }) {
    if (!conditionDef.cacheable) return null;
    const hit = conditionCache.get(cacheKey);
    if (hit && hit.expiresAt > now()) return { value: hit.value };
    if (hit) conditionCache.delete(cacheKey);
    return null;
  }

  async function runQuery(envelope, prepared) {
    const {
      identity, tenantId, ownerMpId, conditionName, ownerEntry, conditionDef, cacheKey,
    } = prepared;
    const heldKey = heldConditionKey(envelope, prepared);
    const heldSeq = heldKey ? (conditionReadSeq += 1) : 0;
    const heldFence = heldKey ? conditionAnswers.epoch(envelope.condition) : null;
    const epochAtDispatch = conditionCacheEpoch;
    await awaitQueryToken(envelope.sourceMpId);

    const handler = ownerEntry.handlers?.conditions?.[conditionName];
    if (!handler) throw err('ConditionError', `condition '${envelope.condition}' has no registered handler`, { retryable: false });

    const record = await records.open({
      kind: 'query',
      conditionName: envelope.condition,
      sourceMpId: envelope.sourceMpId,
      targetMpId: ownerMpId,
      tenantId,
      capabilityTokenId: identity.tokenId,
      args: envelope.args,
      rootRunId: envelope.chain?.rootRunId,
      depth: envelope.chain?.depth || 0,
      chainPath: envelope.chain?.chainPath || [],
      online: isOnline,
    });

    const budget = conditionDef.latencyBudgetMs || 5000;
    let timer;
    let deadlinePassed = false;
    const deadline = new AbortController();
    const callerSignal = envelope.signal && typeof envelope.signal.addEventListener === 'function'
      && typeof envelope.signal.aborted === 'boolean' ? envelope.signal : null;
    const callerGone = () => deadline.abort();
    if (callerSignal?.aborted) deadline.abort();
    else callerSignal?.addEventListener('abort', callerGone, { once: true });
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        deadlinePassed = true;
        deadline.abort();
        reject(err('Timeout', `condition '${envelope.condition}' exceeded latencyBudgetMs ${budget}`, { retryable: false, runId: record.runId }));
      }, budget);
    });
    let handled;
    try {
      handled = Promise.resolve(handler(envelope.args, { tenantId, signal: deadline.signal }));
    } catch (cause) {
      handled = Promise.reject(cause);
    }
    const deadlineAwareResult = handled.then(
      (late) => {
        if (!deadlinePassed) return late;
        Promise.resolve()
          .then(async () => {
            // A cache hit is served unvalidated, so a late value must pass returnSchema before warming the cache.
            validateAgainst(conditionDef.returnSchema, late, 'ConditionError', `condition '${envelope.condition}' late return`);
            await records.update(record.runId, {
              lateResult: late,
              note: 'resolved after latency budget; the caller had already timed out',
            });
            // A moved epoch means an invalidation landed during the read, so this value must not refill the cache.
            if (conditionCacheEpoch !== epochAtDispatch) return;
            if (conditionDef.cacheable && conditionDef.cacheTtlMs > 0 && !isKnownUnknown(late)) {
              conditionCache.set(cacheKey, { value: late, expiresAt: now() + conditionDef.cacheTtlMs, condition: envelope.condition });
              pruneConditionCache(cacheKey);
            }
          })
          .catch(() => { /* best effort */ });
        return late;
      },
      (cause) => {
        if (deadlinePassed) return undefined;
        throw cause;
      },
    );
    try {
      const value = await Promise.race([deadlineAwareResult, timeout]);
      validateAgainst(conditionDef.returnSchema, value, 'ConditionError', `condition '${envelope.condition}' return`);
      await records.update(record.runId, { status: 'succeeded', result: value });
      // A zero-TTL entry could never be served, and a known-unknown must not be cached.
      if (conditionCacheEpoch === epochAtDispatch && conditionDef.cacheable && conditionDef.cacheTtlMs > 0 && !isKnownUnknown(value)) {
        conditionCache.set(cacheKey, { value, expiresAt: now() + conditionDef.cacheTtlMs, condition: envelope.condition });
        pruneConditionCache(cacheKey);
      }
      if (heldKey && !isKnownUnknown(value) && heldKey.current() && conditionAnswers.epoch(envelope.condition) === heldFence) {
        conditionAnswers.keep({ ...heldKey.entry, answer: value, at: now(), seq: heldSeq });
      }
      return value;
    } catch (cause) {
      const wrapped = isTommyError(cause) ? cause
        : err('ConditionError', `condition '${envelope.condition}' threw: ${String(cause && cause.message)}`, { retryable: false, cause });
      if (heldKey && heldKey.current() && classifyReadOutcome(wrapped).state === 'refused') conditionAnswers.remove(heldKey.id);
      await records.update(record.runId, { status: 'failed', error: { code: wrapped.code, message: wrapped.message } });
      throw wrapped;
    } finally {
      clearTimeout(timer);
      unlinkCallerLater(callerSignal, callerGone, deadline.signal);
    }
  }

  function heldConditionKey(envelope, { conditionDef, ownerEntry, tenantId }) {
    if (conditionDef?.heldFirst !== true) return null;
    const owner = recordOwner(tenantId);
    if (!owner) return null;
    const fingerprint = currentFingerprint();
    const sig = conditionSignature(ownerEntry?.manifest?.version, conditionDef);
    const id = conditionAnswers.idFor(owner, fingerprint, envelope.condition, canonicalJson(envelope.args ?? null));
    const current = () => !retired && recordOwner(tenantId) === owner && currentFingerprint() === fingerprint;
    const entry = {
      id, owner, fingerprint, condition: envelope.condition, sig,
    };
    return {
      id, owner, fingerprint, current, entry, expected: { owner, fingerprint, condition: envelope.condition, sig },
    };
  }

  function agedAt(conditionDef, at) {
    const showAgeMs = conditionDef?.freshness?.showAgeMs;
    return Number.isFinite(showAgeMs) && Number.isFinite(at) && now() - at > showAgeMs;
  }

  function retryStepsOf(conditionDef) {
    const steps = conditionDef?.freshness?.retryAfterMs;
    if (Array.isArray(steps) && steps.length && steps.length <= 3 && steps.every((step, i) => Number.isFinite(step) && step > 0 && (i === 0 || step > steps[i - 1]))) return steps;
    return [4000, 12000];
  }

  async function heldFirstQuery(envelope, prepared) {
    const { conditionDef } = prepared;
    const cached = cachedConditionAnswer(prepared);
    if (cached) return { answer: cached.value, state: 'fresh', asOf: now(), aged: false };
    const key = heldConditionKey(envelope, prepared);
    if (key) await conditionAnswers.ready();
    const found = key && key.current() ? conditionAnswers.get(key.id) : null;
    const held = found ? conditionAnswers.get(key.id, key.expected) : null;
    if (found && !held) conditionAnswers.remove(key.id);
    if (!held) {
      const value = await runQuery(envelope, prepared).catch((error) => { throw asRefusal(error); });
      return { answer: value, state: 'fresh', asOf: now(), aged: false };
    }
    const refreshAfterMs = conditionDef.freshness?.refreshAfterMs;
    const young = Number.isFinite(refreshAfterMs) && now() - held.at < refreshAfterMs;
    if (held.stale || !young) revalidateHeld(envelope, prepared, key, held);
    return {
      answer: JSON.parse(JSON.stringify(held.answer)), state: 'held', asOf: held.at, aged: agedAt(conditionDef, held.at),
    };
  }

  function revalidateHeld(envelope, prepared, key, held) {
    const { conditionDef } = prepared;
    const { onRead } = envelope;
    const steps = retryStepsOf(conditionDef);
    const callerSignal = envelope.signal && typeof envelope.signal.aborted === 'boolean' ? envelope.signal : null;
    let shownAt = held.at;
    let ended = false;
    let markedStale = held.stale === true;
    // Wait a turn so the asker has its held answer before the first notice.
    let chain = new Promise((resolve) => { setTimeout(resolve, 0); });
    const deliver = (notice, terminal = false) => {
      chain = chain.then(() => {
        if (ended) return;
        if (callerSignal?.aborted || !key.current()) { ended = true; return; }
        if (terminal) ended = true;
        try { onRead(notice); } catch (_) { /* the asker's own error */ }
      });
    };
    const base = () => ({ answered: false, asOf: shownAt, aged: agedAt(conditionDef, shownAt) });
    const attempt = async (index) => {
      if (ended || retired || callerSignal?.aborted || !key.current()) { ended = true; return; }
      deliver(markedStale
        ? { state: 'stale', ...base(), retrying: true }
        : { state: 'checking', ...base() });
      let value;
      let failure = null;
      for (let restarts = 0; ; restarts += 1) {
        const fence = conditionAnswers.epoch(envelope.condition);
        failure = null;
        try {
          value = await runQuery({ ...envelope, onRead: undefined }, prepared);
        } catch (error) {
          failure = error;
        }
        if (failure && classifyReadOutcome(failure).state === 'refused') break;
        if (conditionAnswers.epoch(envelope.condition) === fence) break;
        if (ended || retired || callerSignal?.aborted || !key.current()) { ended = true; return; }
        if (restarts >= FENCE_RESTARTS_MAX) {
          failure = Object.assign(new Error(`condition '${envelope.condition}' changed while it was read`), { code: 'REFRESH_BUSY' });
          break;
        }
      }
      if (!failure && isKnownUnknown(value)) {
        failure = Object.assign(new Error(`condition '${envelope.condition}' answered unresolved`), { code: 'DATA_NOT_READ' });
      }
      if (!failure) {
        const at = conditionAnswers.get(key.id)?.at ?? now();
        shownAt = at;
        markedStale = false;
        deliver({ state: 'fresh', answered: true, asOf: at, aged: false, answer: value }, true);
        return;
      }
      const outcome = classifyReadOutcome(failure, { report: reportReadCode });
      if (outcome.state === 'silent' || outcome.state === 'held' || outcome.state === 'signed_out') { ended = true; return; }
      if (outcome.state === 'refused') {
        if (key.current()) conditionAnswers.remove(key.id);
        deliver({
          state: 'refused', answered: false, asOf: null, aged: false, reason: outcome.reason, error: readErrorOf(failure),
        }, true);
        return;
      }
      const error = readErrorOf(failure);
      if (outcome.retrying && index < steps.length) {
        const waitMs = steps[index];
        deliver({ state: 'stale', ...base(), retrying: true, nextAttemptAt: now() + waitMs, error });
        setTimer(() => { attempt(index + 1).catch(() => {}); }, waitMs);
        return;
      }
      deliver({ state: 'stale', ...base(), retrying: false, nextAttemptAt: null, error }, true);
    };
    attempt(0).catch(() => {});
  }

  function asRefusal(error) {
    if (!isTommyError(error) || error.code !== 'ConditionError') return error;
    const outcome = classifyReadOutcome(error);
    if (outcome.state !== 'refused' || outcome.reason !== 'access') return error;
    return err('PermissionDenied', error.message, { retryable: false, cause: error.cause || error });
  }

  function purgeConditionAnswers() {
    conditionAnswers.purge();
    conditionCacheEpoch += 1;
    conditionCache.clear();
  }

  function markConditionAnswersStale(collectionIds) {
    const touched = new Set((Array.isArray(collectionIds) ? collectionIds : [collectionIds]).filter((id) => typeof id === 'string'));
    if (!touched.size) return;
    const reads = (condition) => {
      const [ownerMpId, conditionName] = splitQualified(condition);
      const sources = mps.get(ownerMpId)?.manifest?.conditions?.[conditionName]?.freshness?.sources;
      return Array.isArray(sources) && sources.some((source) => touched.has(source));
    };
    conditionAnswers.markStale(reads);
    let moved = false;
    for (const [mpId, entry] of mps) {
      for (const name of Object.keys(entry.manifest?.conditions || {})) {
        const qualified = qualify(mpId, name);
        if (reads(qualified)) { conditionAnswers.touch(qualified); moved = true; }
      }
    }
    for (const [cacheKey, hit] of [...conditionCache]) if (hit.condition && reads(hit.condition)) conditionCache.delete(cacheKey);
    if (moved) conditionCacheEpoch += 1;
  }

  function unlinkCallerLater(callerSignal, callerGone, handlerSignal) {
    if (!callerSignal) return;
    if (callerSignal.aborted || handlerSignal.aborted || !(callerLinkAfterAnswerMs > 0)) {
      callerSignal.removeEventListener('abort', callerGone);
      return;
    }
    const unlink = () => {
      clearTimeout(linkTimer);
      callerSignal.removeEventListener('abort', callerGone);
      handlerSignal.removeEventListener('abort', unlink);
    };
    const linkTimer = setTimeout(unlink, callerLinkAfterAnswerMs);
    // Never hold a process open on a link nobody is watching.
    if (typeof linkTimer?.unref === 'function') linkTimer.unref();
    handlerSignal.addEventListener('abort', unlink, { once: true });
  }

  function idempotencyKeyFor(activityDef, envelope, epoch = 0) {
    // The epoch stamps broker-derived keys only, never client_key (the server ledger keys on it); epoch 0 adds none.
    const stamp = epoch > 0 ? `e${epoch}.` : '';
    switch (activityDef.idempotency) {
      case 'client_key': {
        if (!envelope.idempotencyKey) throw err('InvalidPayload', 'idempotency=client_key requires caller-supplied idempotencyKey', { retryable: false });
        return envelope.idempotencyKey;
      }
      case 'derived_from_input':
        return `${stamp}d-${JSON.stringify(envelope.args)}`;
      case 'natural_key': {
        const field = activityDef.naturalKeyField || 'id';
        const value = dottedGet(envelope.args, field);
        return value !== undefined ? `${stamp}n-${value}` : `${stamp}n-${JSON.stringify(envelope.args)}`;
      }
      // These scheduled-write activities are offline-replayable, so a replayed drain must carry the same key.
      case 'correlationKey': {
        const value = envelope.args?.correlationKey;
        if (value === undefined || value === null || value === '') {
          throw err('InvalidPayload', 'idempotency=correlationKey requires args.correlationKey', { retryable: false });
        }
        const rest = { ...envelope.args };
        delete rest.correlationKey;
        const tail = Object.keys(rest).length ? `-${JSON.stringify(rest)}` : '';
        return `${stamp}c-${value}${tail}`;
      }
      default:
        return undefined;
    }
  }

  async function executeInvoke(envelope, activityDef, ownerEntry, ownerMpId, activityName, record) {
    const handler = ownerEntry.handlers?.activities?.[activityName];
    if (activityDef.sideEffect === 'server_write') {
      if (!serverInvoke) throw err('ActivityFailed', `server_write activity '${envelope.activity}' has no server executor wired`, { retryable: true });
      if (envelope[CONFIRM_SEND]) envelope[CONFIRM_SEND].started = true;
      return serverInvoke({
        rpcId: record.runId,
        kind: 'invoke',
        activity: envelope.activity,
        args: envelope.args,
        // Set by the runtime, never MP args: the server honours a queued punch's captured time only with this marker.
        ...(wantsRestoreContext(envelope) ? {
          restoreContext: {
            mpId: record.sourceMpId, instanceId: envelope.instanceId, tenantId: record.tenantId,
            deadlineAt: envelope.restoreDeadlineAt, replayed: envelope.restoreReplay === true,
            ...(wantsQueuedAt(envelope) && envelope.restoreQueuedAt !== undefined ? { queuedAt: envelope.restoreQueuedAt } : {}),
          },
        } : {}),
        idempotencyKey: record.idempotencyKey,
        capabilityToken: envelope.capabilityToken?.token,
        txnId: envelope.txnId,
      });
    }
    if (!handler) throw err('UnknownActivity', `activity '${envelope.activity}' has no registered handler`, { retryable: false });
    if (envelope[CONFIRM_SEND]) envelope[CONFIRM_SEND].started = true;
    const parent = {
      ownerMpId,
      keys: new Set(envelope[PARENT_RUN]?.keys || []),
    };
    if (record.idempotencyKey) parent.keys.add(`${record.tenantId}:${envelope.activity}:${record.idempotencyKey}`);
    activeRuns.add(parent);
    const invoke = buildSdk({
      init: { mpId: ownerMpId },
      adapter: { rpc: async (call) => {
        if (!activeRuns.has(parent)) throw err('ActivityFailed', 'Handler invoke scope has ended', { retryable: false });
        const context = ownerEntry.invokeContext
          ? await ownerEntry.invokeContext()
          : (ownerMpId === envelope.sourceMpId ? envelope : null);
        if (!context) throw err('PermissionDenied', 'Handler invoke requires its own MP identity', { retryable: false });
        return dispatchInvoke({
          ...context, ...call, sourceMpId: ownerMpId, tenantId: record.tenantId,
          txnId: envelope.txnId,
          chain: {
            rootRunId: record.rootRunId || record.runId,
            depth: (record.depth || 0) + 1,
            chainPath: [...(record.chainPath || []), `${ownerMpId}:invoke(${envelope.activity})`],
          },
          [PARENT_RUN]: parent,
        });
      } },
    }).actions.invoke;
    let result;
    try {
      result = await handler(envelope.args, { tenantId: record.tenantId, txnId: envelope.txnId, invoke });
    } finally {
      activeRuns.delete(parent);
    }
    return { rpcId: record.runId, status: 'succeeded', result };
  }

  function enterExecution(mpId) { executingChains.set(mpId, (executingChains.get(mpId) || 0) + 1); }
  function exitExecution(mpId) {
    const depth = (executingChains.get(mpId) || 0) - 1;
    if (depth > 0) executingChains.set(mpId, depth); else executingChains.delete(mpId);
  }

  function dispatchInvoke(...args) { return trackWork(() => dispatchInvokeInnerTracked(...args)); }

  async function dispatchInvokeInnerTracked(envelope) {
    const sourceMpId = envelope.sourceMpId;
    const parent = envelope[PARENT_RUN];
    if (parent) {
      if (!activeRuns.has(parent) || parent.ownerMpId !== sourceMpId) {
        throw err('PermissionDenied', 'Invalid handler invoke scope', { retryable: false });
      }
      return dispatchInvokeInner(envelope);
    }
    if ((mps.get(sourceMpId)?.minHostApi || 0) < SCOPED_INVOKE_HOST_API
      && executingChains.has(sourceMpId)) return dispatchInvokeInner(envelope);
    const tail = invokeChains.get(sourceMpId) || Promise.resolve();
    const run = tail.catch(() => {}).then(() => dispatchInvokeInner(envelope));
    invokeChains.set(sourceMpId, run);
    try { return await run; } finally {
      if (invokeChains.get(sourceMpId) === run) invokeChains.delete(sourceMpId);
    }
  }

  async function dispatchInvokeInner(envelope) {
    const identity = envelope.identity || authenticate(envelope);
    const tenantId = envelope.tenantId || identity.tenantId;
    const outcomeScope = outcomeScopeFor(tenantId);
    takeToken(envelope.sourceMpId, 'invoke');

    const [ownerMpId, activityName] = splitQualified(envelope.activity);
    const ownerEntry = await resolveMpEntry(ownerMpId);
    const activityDef = ownerEntry?.manifest.activities?.[activityName];
    if (!activityDef) throw err('UnknownActivity', `activity '${envelope.activity}' is not registered`, { retryable: false });

    authorizeInvoke(envelope.sourceMpId, ownerMpId, activityName, activityDef, identity.scopes);
    validateAgainst(activityDef.inputSchema, envelope.args, 'InvalidPayload', `activity '${envelope.activity}' args`);

    const chain = envelope.chain || { rootRunId: undefined, depth: 0, chainPath: [] };
    if (chain.rootRunId) checkChain(envelope.sourceMpId, `invoke(${envelope.activity})`, chain);

    const idempotencyKey = idempotencyKeyFor(
      activityDef, envelope, invalidationEpochs.get(`${tenantId}:${envelope.activity}`),
    );
    // Tenant-scoped: derived keys hash args alone, so two tenants would otherwise replay each other's result.
    const processedKey = idempotencyKey && `${tenantId}:${envelope.activity}:${idempotencyKey}`;
    if (processedKey && envelope[PARENT_RUN]?.keys.has(processedKey)) {
      throw err('LoopDetected', 'Handler invoked an ancestor activity with its running idempotency key', {
        rule: 'idempotency.cycle', retryable: false,
      });
    }
    if (processedKey && processedKeys.has(processedKey)) {
      const stored = processedKeys.get(processedKey);
      await releaseSettledHold(activityDef, envelope);
      noteReplayedSuccess(activityDef, envelope, idempotencyKey, outcomeScope);
      return { ...stored, idempotentReplay: true };
    }
    if (processedKey && appliedKeysOverflow.has(processedKey)) {
      await releaseSettledHold(activityDef, envelope);
      noteReplayedSuccess(activityDef, envelope, idempotencyKey, outcomeScope);
      return { status: 'succeeded', idempotentReplay: true, resultRetained: false };
    }

    // Results are never persisted (one may be a live PIN); client_key only, as derived keys would put tenant data on disk.
    if (processedKey && activityDef.idempotency === 'client_key' && idempotencyLedger?.has(processedKey)) {
      await releaseSettledHold(activityDef, envelope);
      noteReplayedSuccess(activityDef, envelope, idempotencyKey, outcomeScope);
      return { status: 'succeeded', idempotentReplay: true, resultRetained: false };
    }

    // A row being drained is already queued; never queue it again beside itself.
    if (!isOnline && activityDef.sideEffect !== 'local_write') {
      if (envelope.restoreDrain === true) throw err('Offline', `'${envelope.activity}' waits in the queue for a connection`, { retryable: true });
      if (activityDef.offlineReplayable) {
        await enqueueOffline(envelope.sourceMpId, { ...envelope, identity, idempotencyKey });
        const queuedRecord = await records.open({
          kind: 'invoke',
          activityName: envelope.activity,
          sourceMpId: envelope.sourceMpId,
          targetMpId: ownerMpId,
          tenantId,
          capabilityTokenId: identity.tokenId,
          args: envelope.args,
          idempotencyKey,
          rootRunId: chain.rootRunId,
          depth: chain.depth,
          chainPath: chain.chainPath,
          online: false,
        });
        await records.update(queuedRecord.runId, { status: 'queued_offline' });
        noteOutcome(activityDef, envelope, idempotencyKey, 'queued', { rpcId: queuedRecord.runId }, outcomeScope);
        return { rpcId: queuedRecord.runId, status: 'queued_offline' };
      }
      throw err('Offline', `activity '${envelope.activity}' is not offlineReplayable and the device is offline`, { retryable: false });
    }

    const admitted = {
      envelope, identity, tenantId, ownerEntry, ownerMpId, activityName, activityDef, chain, idempotencyKey, processedKey, outcomeScope,
    };
    if (!processedKey) return runAdmittedInvoke(admitted);
    const running = inflightInvokes.get(processedKey);
    if (running) return joinInflightInvoke(running, envelope);
    if (inflightInvokes.size >= INFLIGHT_RUNS_MAX) {
      throw err('RateLimited', `${INFLIGHT_RUNS_MAX} idempotent invokes are already in flight; '${envelope.activity}' was not started`, {
        rule: 'idempotency.inflight_capacity', retryable: true,
      });
    }
    const run = runAdmittedInvoke(admitted);
    const entry = { deadlineAt: envelope.rpcDeadlineAt, waiters: new Set() };
    inflightInvokes.set(processedKey, entry);
    const settle = (outcome) => {
      if (inflightInvokes.get(processedKey) === entry) inflightInvokes.delete(processedKey);
      for (const waiter of entry.waiters) waiter(outcome);
      entry.waiters.clear();
    };
    run.then((final) => settle({ final }), (error) => settle({ error }));
    return run;
  }

  function joinWaitMs(envelope, running) {
    const deadlines = [envelope.rpcDeadlineAt, running.deadlineAt].filter(Number.isFinite);
    if (!deadlines.length) return inflightJoinTimeoutMs;
    const remaining = Math.min(...deadlines) - Date.now();
    const margin = Math.min(JOIN_DEADLINE_MARGIN_MS, remaining / 5);
    return Math.max(0, Math.min(inflightJoinTimeoutMs, remaining - margin));
  }

  function joinInflightInvoke(running, envelope) {
    const waitMs = joinWaitMs(envelope, running);
    return new Promise((resolve, reject) => {
      let timer = null;
      const waiter = ({ final, error }) => {
        clearTimeout(timer);
        if (error) reject(error);
        else resolve({ ...final, idempotentReplay: true });
      };
      running.waiters.add(waiter);
      timer = setTimeout(() => {
        running.waiters.delete(waiter);
        reject(err('Timeout', `activity '${envelope.activity}' is already running with this idempotency key and did not settle within ${Math.round(waitMs)}ms`, {
          rule: 'idempotency.inflight', retryable: false,
        }));
      }, waitMs);
    });
  }

  async function runAdmittedInvoke({
    envelope, identity, tenantId, ownerEntry, ownerMpId, activityName, activityDef, chain, idempotencyKey, processedKey, outcomeScope,
  }) {
    // Queued before the request goes: a hung request neither answers nor fails, and closing the app would lose it.
    const heldSeq = activityDef.holdUnsettled
      ? await claimSubject(envelope.sourceMpId, activityDef.holdUnsettled, { ...envelope, identity, idempotencyKey })
      : (activityDef.sideEffect === 'server_write' && activityDef.offlineReplayable
        && !envelope.restoreDrain && typeof queueStore.isHeld === 'function'
        ? await holdInQueue(envelope.sourceMpId, { ...envelope, identity, idempotencyKey })
        : null);
    try {
      const record = await records.open({
        kind: 'invoke',
        activityName: envelope.activity,
        txnId: envelope.txnId,
        sourceMpId: envelope.sourceMpId,
        sourceMpVersion: mps.get(envelope.sourceMpId)?.manifest.version,
        targetMpId: ownerMpId,
        tenantId,
        capabilityTokenId: identity.tokenId,
        args: envelope.args,
        idempotencyKey,
        rootRunId: chain.rootRunId,
        depth: chain.depth,
        chainPath: chain.chainPath,
        online: isOnline,
      });
      noteOutcome(activityDef, envelope, idempotencyKey, 'queued', { rpcId: record.runId }, outcomeScope);
      return await attemptAdmittedInvoke({
        envelope, identity, tenantId, ownerEntry, ownerMpId, activityName, activityDef, idempotencyKey, processedKey, record, heldSeq, outcomeScope,
      });
    } finally {
      if (heldSeq !== null) await queueStore.release(heldSeq);
    }
  }

  async function holdInQueue(sourceMpId, envelope) {
    try {
      await queueStore.ready?.();
      const queued = ownQueuedRows().some((row) => row.sourceMpId === sourceMpId
        && row.envelope?.activity === envelope.activity && row.envelope?.idempotencyKey === envelope.idempotencyKey);
      if (queued) return null;
      return await enqueueOffline(sourceMpId, envelope, { held: true });
    } catch (_) {
      return null;
    }
  }

  async function releaseSettledHold(activityDef, envelope) {
    const hold = activityDef?.holdUnsettled;
    if (!hold) return;
    const subject = holdSubject(hold, envelope.args);
    if (subject === null) return;
    try {
      await queueStore.ready?.();
      const row = ownQueuedRows().find((candidate) => candidate.sourceMpId === envelope.sourceMpId
        && candidate.envelope?.activity === envelope.activity && candidate.subject === subject
        && candidate.envelope?.idempotencyKey === envelope.idempotencyKey && !queueStore.isHeld?.(candidate));
      if (row) await queueStore.remove(row.seq);
    } catch (_) { /* asked again later */ }
  }

  async function claimSubject(sourceMpId, hold, envelope) {
    const subject = holdSubject(hold, envelope.args);
    if (subject === null) {
      throw err('InvalidPayload', `activity '${envelope.activity}' needs its hold key fields (${hold.key.join(', ')})`, { retryable: false });
    }
    const refuse = (why) => err('WriteHeld', why, { retryable: false });
    await queueStore.ready?.();
    let holding = ownQueuedRows().find((row) => row.sourceMpId === sourceMpId
      && row.envelope?.activity === envelope.activity && row.subject === subject);
    if (holding && appliedHolds.has(holding.id)) {
      try { await queueStore.remove(holding.seq); appliedHolds.delete(holding.id); holding = null; } catch (_) {
        throw refuse(`the last write of '${envelope.activity}' for this subject is still being cleared`);
      }
    }
    if (holding) {
      if (holding.envelope?.idempotencyKey !== envelope.idempotencyKey) throw refuse(`a write of '${envelope.activity}' for this subject is held until it is checked`);
      if (canonicalJson(holding.envelope?.args ?? {}) !== canonicalJson(envelope.args ?? {})) {
        throw refuse(`the held write of '${envelope.activity}' is checked with its own request`);
      }
      if (!queueStore.hold?.(holding.seq)) throw refuse(`the held write of '${envelope.activity}' is already being checked`);
      return holding.seq;
    }
    const bytes = utf16Units(JSON.stringify(envelope.args || {}));
    const holder = currentQueueOwner();
    const partition = ownQueuedRows().filter((row) => row.sourceMpId === sourceMpId);
    if (partition.length >= QUEUE_MAX_ENTRIES || partition.reduce((sum, row) => sum + row.bytes, 0) + bytes > QUEUE_MAX_BYTES) {
      throw err('Offline_QueueFull', `the queue for mp '${sourceMpId}' is full; '${envelope.activity}' was not sent`, { retryable: false });
    }
    const owner = holder
      ? Object.fromEntries(['tenantId', ...OWNER_FIELDS].filter((key) => known(holder[key])).map((key) => [key, holder[key]]))
      : undefined;
    let seqClaimed;
    try {
      seqClaimed = await queueStore.claim({
        sourceMpId, envelope, bytes, owner, subject, held: true,
      });
    } catch (cause) {
      throw err('Offline_QueueFull', `the queue for mp '${sourceMpId}' could not keep '${envelope.activity}'; it was not sent`, { retryable: false, cause });
    }
    if (seqClaimed === null || seqClaimed === undefined) throw refuse(`a write of '${envelope.activity}' for this subject is held until it is checked`);
    return seqClaimed;
  }

  async function attemptAdmittedInvoke({
    envelope, identity, tenantId, ownerMpId, ownerEntry, activityName, activityDef, idempotencyKey, processedKey, record, heldSeq, outcomeScope,
  }) {
    const retry = { ...DEFAULT_RETRY, ...(activityDef.retry || {}), ...(envelope[CONFIRM_SEND] ? { maxAttempts: 1 } : {}) };
    let attempt = 0;
    let lastError;
    while (attempt < Math.max(1, retry.maxAttempts)) {
      attempt += 1;
      // eslint-disable-next-line no-await-in-loop
      if (attempt > 1) await sleep(retryDelayMs(retry.backoff, attempt));
      await records.update(record.runId, { status: 'running', attempts: attempt });
      try {
        enterExecution(envelope.sourceMpId);
        let result;
        try {
          result = await executeInvoke(envelope, activityDef, ownerEntry, ownerMpId, activityName, record);
        } finally {
          exitExecution(envelope.sourceMpId);
        }
        if (result.status && result.status === 'failed') throw err('ActivityFailed', result.error?.message || 'executor reported failure', { retryable: false });
        validateAgainst(activityDef.resultSchema, result.result, 'ActivityFailed', `activity '${envelope.activity}' result`);
        const final = { rpcId: record.runId, status: 'succeeded', result: result.result, ...(result.replayed === true ? { replayed: true } : {}) };
        resendFailures.delete(idempotencyKey);
        noteOutcome(activityDef, envelope, idempotencyKey, 'succeeded', { rpcId: record.runId }, outcomeScope);
        await records.update(record.runId, { status: 'succeeded', result: result.result });
        if (processedKey) {
          processedKeys.set(processedKey, final);
          // The broker cannot know inverse activities, so the MP names those whose recorded results this write invalidates.
          for (const staleActivity of activityDef.invalidatesIdempotency || []) {
            const qualified = `${ownerMpId}.${staleActivity}`;
            const prefix = `${tenantId}:${qualified}:`;
            for (const key of [...processedKeys.keys()]) {
              if (key.startsWith(prefix)) processedKeys.delete(key);
            }
            for (const key of [...appliedKeysOverflow]) {
              if (key.startsWith(prefix)) appliedKeysOverflow.delete(key);
            }
            // Move the epoch so the server's ledger misses too.
            invalidationEpochs.bump(`${tenantId}:${qualified}`);
          }
          while (processedKeys.size > PROCESSED_KEYS_MAX) {
            const oldest = processedKeys.keys().next();
            if (oldest.done) break;
            processedKeys.delete(oldest.value);
            appliedKeysOverflow.add(oldest.value);
            while (appliedKeysOverflow.size > APPLIED_KEYS_OVERFLOW_MAX) {
              const stale = appliedKeysOverflow.values().next();
              if (stale.done) break;
              appliedKeysOverflow.delete(stale.value);
            }
          }
        }
        // Record the key durably, never the result.
        if (processedKey && activityDef.idempotency === 'client_key') idempotencyLedger?.add(processedKey);
        if (heldSeq !== null) {
          const heldId = queueStore.all().find((candidate) => candidate.seq === heldSeq)?.id;
          try { await queueStore.remove(heldSeq); } catch (_) {
            if (heldId) { appliedHolds.add(heldId); scheduleHoldCleanup(); }
          }
        }
        if (envelope.txnId) {
          const steps = txnSteps.get(envelope.txnId) || [];
          steps.push({ activity: envelope.activity, args: envelope.args, idempotencyKey });
          txnSteps.set(envelope.txnId, steps);
        }
        if (activityDef.sideEffect === 'server_write') {
          conditionCacheEpoch += 1;
          for (const key of conditionCache.keys()) {
            if (key.startsWith(`${tenantStateKey(tenantId)}:${ownerMpId}.`)) conditionCache.delete(key);
          }
        }
        return final;
      } catch (cause) {
        lastError = isTommyError(cause) ? cause : err('ActivityFailed', String(cause && cause.message), { retryable: false, cause });
        if (!lastError.retryable) break;
        // Never reached the server: resending now resends the whole body for nothing; the queue spaces it.
        if (activityDef.sideEffect === 'server_write' && activityDef.offlineReplayable && neverReachedServer(lastError)) break;
      }
    }

    const unsettledWhy = activityDef.holdUnsettled && heldSeq !== null ? unsettledReason(lastError, activityDef.holdUnsettled) : null;
    if (unsettledWhy) {
      noteOutcome(activityDef, envelope, idempotencyKey, 'unconfirmed', { rpcId: record.runId }, outcomeScope);
      try { await queueStore.markUnsettled(heldSeq, { reason: unsettledWhy, at: now() }); } catch (_) { /* unmarked rows read as unconfirmed */ }
      await records.update(record.runId, {
        status: 'dead_letter', error: { code: lastError.code, message: lastError.message }, attempts: attempt,
      });
      throw Object.assign(err('ActivityFailed', `activity '${envelope.activity}' is held: ${lastError.message}`, {
        retryable: false, runId: record.runId, cause: lastError,
      }), { unsettled: { reason: unsettledWhy } });
    }

    if (activityDef.sideEffect === 'server_write' && activityDef.offlineReplayable
      && !envelope.restoreDrain && neverReachedServer(lastError)) {
      if (heldSeq === null) await enqueueOffline(envelope.sourceMpId, { ...envelope, identity, idempotencyKey });
      noteResendFailure(idempotencyKey);
      await records.update(record.runId, { status: 'queued_offline', attempts: attempt });
      noteOutcome(activityDef, envelope, idempotencyKey, 'queued', { rpcId: record.runId }, outcomeScope);
      return { rpcId: record.runId, status: 'queued_offline' };
    }

    if (refusedForGood(lastError)) {
      noteOutcome(activityDef, envelope, idempotencyKey, 'refused', { rpcId: record.runId, refusal: refusalOf(lastError) }, outcomeScope);
    } else {
      noteOutcome(activityDef, envelope, idempotencyKey, envelope.restoreDrain && neverReachedServer(lastError) ? 'queued' : 'unconfirmed', { rpcId: record.runId }, outcomeScope);
    }
    if (heldSeq !== null) await queueStore.remove(heldSeq);
    await records.update(record.runId, {
      status: 'dead_letter',
      error: { code: lastError.code, message: lastError.message },
      attempts: attempt,
    });
    throw err('ActivityFailed', `activity '${envelope.activity}' dead-lettered after ${attempt} attempt(s): ${lastError.message}`, {
      retryable: false, runId: record.runId, cause: lastError,
    });
  }

  function rollbackTransaction(...args) { return trackWork(() => rollbackTransactionInnerTracked(...args)); }

  async function rollbackTransactionInnerTracked(envelope) {
    const identity = envelope.identity || authenticate(envelope);
    const steps = txnSteps.get(envelope.txnId) || [];
    txnSteps.delete(envelope.txnId);
    for (const step of steps.reverse()) {
      const [ownerMpId, name] = splitQualified(step.activity);
      const undoName = `undo_${name}`;
      if (!mps.get(ownerMpId)?.manifest.activities?.[undoName]) continue;
      // eslint-disable-next-line no-await-in-loop
      await dispatchInvoke({
        kind: 'invoke',
        sourceMpId: ownerMpId,
        activity: qualify(ownerMpId, undoName),
        args: step.args,
        idempotencyKey: step.idempotencyKey && `undo-${step.idempotencyKey}`,
        identity: { mpId: ownerMpId, tenantId: identity.tenantId, scopes: [], tokenId: `txn-comp-${envelope.txnId}` },
        chain: { rootRunId: undefined, depth: 0, chainPath: [] },
      }).catch(() => { /* best-effort saga */ });
    }
    return { rolledBack: steps.length };
  }

  function currentQueueOwner() {
    try { return typeof queueOwner === 'function' ? queueOwner() || null : null; } catch (_) { return null; }
  }

  const OWNER_FIELDS = ['person', 'accountType', 'accountId'];
  const known = (value) => value !== undefined && value !== null && value !== '';

  function ownsQueuedRow(row, holder) {
    if (typeof queueOwner !== 'function') return true;
    if (!holder || !known(holder.tenantId)) return false;
    const stamp = row.owner || {};
    const tenant = known(stamp.tenantId) ? stamp.tenantId : row.envelope?.identity?.tenantId;
    if (String(tenant) !== String(holder.tenantId)) return false;
    return OWNER_FIELDS.every((key) => !known(stamp[key]) || (known(holder[key]) && String(stamp[key]) === String(holder[key])));
  }

  function heldEntry(row) {
    const running = queueStore.isHeld?.(row);
    return {
      id: row.id,
      activity: row.envelope.activity,
      input: JSON.parse(JSON.stringify(row.envelope.args ?? {})),
      key: row.envelope.idempotencyKey,
      reason: running ? 'sending' : (row.unsettled?.reason || 'unconfirmed'),
      heldAt: Number.isFinite(row.unsettled?.at) ? row.unsettled.at : row.queuedAt,
    };
  }

  function ownQueuedRows() {
    const holder = currentQueueOwner();
    return queueStore.all().filter((row) => ownsQueuedRow(row, holder));
  }

  // Whose held answers and outcomes these are: the queue owner, else the authenticated tenant; null keeps and serves nothing.
  function recordOwner(tenantId) {
    if (typeof queueOwner === 'function') {
      const holder = currentQueueOwner();
      if (!holder || !known(holder.tenantId)) return null;
      return JSON.stringify(['tenantId', ...OWNER_FIELDS].map((key) => (known(holder[key]) ? String(holder[key]) : null)));
    }
    if (!known(tenantId)) return null;
    let tenantKey;
    try { tenantKey = tenantStateKey(tenantId); } catch (_) { return null; }
    return known(tenantKey) ? JSON.stringify(['tenant', String(tenantKey)]) : null;
  }

  function refusalOf(error) {
    let answered = null;
    let inner = error;
    let cause = error;
    for (let depth = 0; cause && depth < 8; depth += 1) {
      const status = Number(cause.status ?? cause.response?.status);
      if (!answered && Number.isFinite(status) && status >= 100) answered = cause;
      if (cause.code !== 'ActivityFailed' || !inner || inner.code === 'ActivityFailed') inner = cause;
      cause = cause.cause;
    }
    const source = answered || inner || error;
    const status = answered ? Number(answered.status ?? answered.response?.status) : null;
    return {
      code: source?.data?.code || source?.response?.data?.code || source?.code || error?.code || null,
      status,
      message: String(source?.message || error?.message || ''),
    };
  }

  // Taken when a write is admitted, so its outcome lands with the account that sent it, and never after a purge.
  function outcomeScopeFor(tenantId) {
    return { owner: recordOwner(tenantId), generation: outcomeGeneration };
  }

  const outcomeScopeLive = (scope) => !!scope?.owner && !retired && scope.generation === outcomeGeneration;

  function noteOutcome(activityDef, envelope, idempotencyKey, state, { rpcId, refusal } = {}, scope = null) {
    if (activityDef?.idempotency !== 'client_key' || !idempotencyKey || !outcomeScopeLive(scope)) return;
    const settled = state === 'succeeded' || state === 'refused';
    const open = state === 'queued' || state === 'unconfirmed';
    const request = open && confirmEligible(activityDef) ? {
      sourceMpId: envelope.sourceMpId, activity: envelope.activity, args: envelope.args ?? {}, idempotencyKey,
    } : undefined;
    try {
      outcomes.record(scope.owner, envelope.activity, idempotencyKey, { state, rpcId: settled ? rpcId ?? null : null, refusal, request });
    } catch (_) { /* a record that cannot be kept never fails the write */ }
  }

  function noteReplayedSuccess(activityDef, envelope, idempotencyKey, scope) {
    if (!outcomeScopeLive(scope)) return;
    const before = idempotencyKey ? outcomes.get(scope.owner, envelope.activity, idempotencyKey) : null;
    if (before && (before.state === 'queued' || before.state === 'unconfirmed')) noteOutcome(activityDef, envelope, idempotencyKey, 'succeeded', {}, scope);
  }

  function ownActivity(sourceMpId, activity) {
    if (typeof activity !== 'string' || !activity || activity.includes('.')) return null;
    const activityDef = mps.get(sourceMpId)?.manifest?.activities?.[activity];
    return activityDef ? { activityDef, qualified: qualify(sourceMpId, activity) } : null;
  }

  const confirmOpen = (record) => !!record && (record.state === 'queued' || record.state === 'unconfirmed');
  const confirmable = (activityDef, record) => confirmEligible(activityDef) && confirmOpen(record) && !!record.request
    && record.confirmSent !== true && now() - record.at <= CONFIRM_WITHIN_MS;

  const notConfirmable = (reason, message) => Object.assign(
    err('WriteNotConfirmable', message, { retryable: false }), { details: { reason } },
  );

  // A discarded write is never sent, so nothing may confirm it or report it as waiting.
  function forgetDiscardedOutcome(row, owner) {
    const key = row.envelope?.idempotencyKey;
    if (!owner || typeof key !== 'string' || !key) return;
    try {
      if (confirmOpen(outcomes.get(owner, row.envelope.activity, key))) outcomes.remove(owner, row.envelope.activity, key);
    } catch (_) { /* the record ages out */ }
  }

  // A confirm answered from the idempotency ledger ran nothing new; its own run record names it.
  async function confirmRunId(own, request, restored) {
    const [targetMpId] = splitQualified(own.qualified);
    const run = await records.open({
      kind: 'invoke',
      activityName: own.qualified,
      sourceMpId: request.sourceMpId,
      targetMpId,
      tenantId: restored?.identity?.tenantId ?? restored?.tenantId,
      args: request.args,
      idempotencyKey: request.idempotencyKey,
      rootRunId: undefined,
      depth: 0,
      chainPath: [],
      online: isOnline,
    });
    await records.update(run.runId, { status: 'succeeded', note: 'confirmed by an idempotent replay' });
    return run.runId;
  }

  async function enqueueOffline(sourceMpId, envelope, { held = false } = {}) {
    const bytes = utf16Units(JSON.stringify(envelope.args || envelope.payload || {}));
    const holder = currentQueueOwner();
    await queueStore.ready?.();
    const partition = ownQueuedRows().filter((row) => row.sourceMpId === sourceMpId);
    const partitionBytes = partition.reduce((sum, row) => sum + row.bytes, 0);
    if (partition.length >= QUEUE_MAX_ENTRIES || partitionBytes + bytes > QUEUE_MAX_BYTES) {
      throw err('Offline_QueueFull', `offline queue full for mp '${sourceMpId}' (${partition.length} entries)`, { retryable: false });
    }
    const owner = holder
      ? Object.fromEntries(['tenantId', ...OWNER_FIELDS].filter((key) => known(holder[key])).map((key) => [key, holder[key]]))
      : undefined;
    try {
      return await queueStore.push({ sourceMpId, envelope, bytes, owner, ...(held ? { held } : {}) });
    } catch (cause) {
      if (cause?.name !== 'QueueNotKept') throw cause;
      throw err('Offline_QueueFull', `offline queue for mp '${sourceMpId}' could not be kept on this device`, { retryable: false, cause });
    }
  }

  // One drain at a time, so a row is never sent twice.
  let drainInFlight = null;

  const resendFailures = new Map();
  let resendTimer = null;

  function noteResendFailure(key) {
    if (key === undefined || key === null) return;
    const failures = (resendFailures.get(key)?.failures || 0) + 1;
    const waitMs = queueResendDelayMs(failures);
    resendFailures.set(key, { failures, dueAt: now() + waitMs });
    wakeDrainIn(waitMs);
  }

  function wakeDrainIn(ms) {
    if (resendTimer !== null) clearTimer(resendTimer);
    resendTimer = setTimer(() => {
      resendTimer = null;
      if (isOnline) Promise.resolve(drainOfflineQueue()).catch(() => {});
    }, Math.max(0, ms));
  }

  function drainOfflineQueue(...args) {
    if (drainInFlight) return drainInFlight;
    drainInFlight = trackWork(() => drainOfflineQueueInnerTracked(...args))
      .finally(() => { drainInFlight = null; });
    return drainInFlight;
  }

  const UNSETTLED_CODES = new Set([
    'ActivityFailed', 'Timeout', 'Offline', 'RateLimited', 'UnknownActivity', 'UnknownTrigger',
    'ACCOUNT_NOT_DISPLAYED', 'ACCOUNT_PERMISSIONS_UNKNOWN',
  ]);

  function neverReachedServer(error) {
    let cause = error;
    for (let depth = 0; cause && depth < 8; depth += 1) {
      const status = cause.status ?? cause.response?.status;
      if (status === 0) return true;
      if (Number(status) >= 100) return false;
      if (cause.name === 'TypeError' && /fetch|network|load failed/i.test(String(cause.message))) return true;
      cause = cause.cause;
    }
    return false;
  }

  function refusedForGood(error) {
    let cause = error;
    for (let depth = 0; cause && depth < 8; depth += 1) {
      const status = Number(cause.status ?? cause.response?.status);
      if (status >= 400 && status < 600) return status < 500 && ![401, 408, 429].includes(status);
      cause = cause.cause;
    }
    const own = error?.code === 'ActivityFailed' && error.cause ? error.cause : error;
    return isTommyError(own) && own.retryable === false && !UNSETTLED_CODES.has(own.code);
  }

  async function drainOfflineQueueInnerTracked() {
    await queueStore.ready?.();
    const bySource = new Map();
    for (const row of ownQueuedRows()) {
      const list = bySource.get(row.sourceMpId) || [];
      list.push(row);
      bySource.set(row.sourceMpId, list);
    }
    const results = [];
    for (const [, rows] of bySource) {
      rows.sort((a, b) => a.seq - b.seq);
      for (const row of rows) {
        if (typeof row.subject === 'string') continue;
        if (queueStore.isHeld?.(row)) break;
        if (!queueStore.all().some((queued) => queued.seq === row.seq)) { unsettled.delete(row.id); continue; }
        const envelope = row.envelope;
        const refusedBefore = row.id ? unsettled.get(row.id) : undefined;
        let outcome;
        if (refusedBefore) {
          outcome = refusedBefore;
        } else {
          const waitMs = (resendFailures.get(envelope?.idempotencyKey)?.dueAt || 0) - now();
          if (waitMs > 0) {
            wakeDrainIn(waitMs);
            break;
          }
          if (row.id) drainingRows.add(row.id);
          // eslint-disable-next-line no-await-in-loop
          outcome = await Promise.resolve().then(() => replayEnvelope(envelope)).then((restored) => (restored.trigger
            ? dispatchEmit(restored)
            : dispatchInvoke({
              ...restored, rpcDeadlineAt: undefined, restoreReplay: true, restoreDrain: true, restoreQueuedAt: row.queuedAt, idempotencyKey: envelope.idempotencyKey,
            })))
            .then((result) => ({ ok: true, result }))
            .catch((error) => ({ ok: false, error }))
            .finally(() => { if (row.id) drainingRows.delete(row.id); });
          results.push(outcome);
        }
        // Later rows of the same MP stay queued too: a clock-out never goes before its clock-in.
        if (!outcome.ok && !refusedForGood(outcome.error)) {
          await queueStore.noteAttempt?.(row.seq);
          if (neverReachedServer(outcome.error)) noteResendFailure(envelope?.idempotencyKey);
          break;
        }
        resendFailures.delete(envelope?.idempotencyKey);
        // Settled in the same commit as the removal, so a page that dies before the observer runs keeps the refusal.
        if (!outcome.ok && !envelope.trigger && typeof queueStore.settle === 'function') {
          try {
            // eslint-disable-next-line no-await-in-loop
            await queueStore.settle(row.seq, { envelope, outcome, rowId: row.id });
            if (row.id) unsettled.delete(row.id);
            if (!unsettled.size) settleRetries = 0;
          } catch (_) {
            if (row.id) unsettled.set(row.id, outcome);
            scheduleSettleRetry();
            break;
          }
        } else {
          // eslint-disable-next-line no-await-in-loop
          await queueStore.remove(row.seq);
        }
        if (typeof onOfflineOutcome === 'function') {
          try {
            Promise.resolve(onOfflineOutcome(envelope, outcome)).catch(() => {});
          } catch (_) { /* An observer cannot interrupt FIFO replay. */ }
        }
      }
    }
    return results;
  }

  return {
    registerMp(manifest, { handlers, firstParty, minHostApi = 0, invokeContext } = {}) {
      const before = mps.get(manifest.id)?.manifest;
      const conditionShapes = (m) => canonicalJson(Object.fromEntries(Object.entries(m?.conditions || {})
        .map(([name, def]) => [name, { inputSchema: def.inputSchema ?? null, returnSchema: def.returnSchema ?? null }])));
      if (before && (before.version !== manifest.version || conditionShapes(before) !== conditionShapes(manifest))) purgeConditionAnswers();
      mps.set(manifest.id, {
        manifest,
        minHostApi,
        invokeContext,
        handlers: handlers || {},
        firstParty: firstParty !== undefined ? firstParty : manifest.publisher?.type === 'first_party',
      });
      expectedMps.delete(manifest.id);
      const waiters = registrationWaiters.get(manifest.id);
      if (waiters) {
        registrationWaiters.delete(manifest.id);
        for (const done of [...waiters]) done();
      }
    },

    expectMps(mpIds = []) {
      for (const mpId of mpIds) if (mpId && !mps.has(mpId)) expectedMps.add(mpId);
    },

    stopExpecting(mpId) {
      expectedMps.delete(mpId);
      const waiters = registrationWaiters.get(mpId);
      if (waiters) {
        registrationWaiters.delete(mpId);
        for (const done of [...waiters]) done();
      }
    },

    unregisterMp(mpId) { mps.delete(mpId); },

    setActionState(tenantId, mpId, actionId, { enabled, options, scopeLocationId, inherited = false, revision }) {
      const entry = mps.get(mpId);
      const action = entry?.manifest.actions?.[actionId];
      const scoped = scopeLocationId !== undefined && scopeLocationId !== null;
      if (scoped && (!/^[1-9][0-9]*$/.test(String(scopeLocationId)) || (typeof scopeLocationId === 'number' && !Number.isSafeInteger(scopeLocationId)))) {
        throw err('InvalidPayload', 'Action scope requires a positive location identifier', { retryable: false });
      }
      if (scoped && action && action.locationOverridable !== true) {
        throw err('PermissionDenied', `action '${actionId}' does not declare location overrides`, { rule: 'actions.locationOverridable', retryable: false });
      }
      const key = actionKey(tenantId, mpId, actionId, scoped ? String(scopeLocationId) : null);
      const prev = actionState.get(key) || {};
      if (revision !== undefined && (!Number.isSafeInteger(revision) || revision < 0)) {
        throw err('InvalidPayload', 'Action revision must be a nonnegative integer', { retryable: false });
      }
      if (revision !== undefined && prev.revision !== undefined && revision < prev.revision) return;
      if (scoped && inherited === true) {
        // Keep the revision tombstone: an older concurrent list response must not resurrect the override.
        actionState.set(key, { inherited: true, revision });
        return;
      }
      if (action?.required && enabled === false) {
        throw err('PermissionDenied', `action '${actionId}' is required and cannot be disabled`, { rule: 'actions.required', retryable: false });
      }
      actionState.set(key, { enabled: enabled !== undefined ? enabled : prev.enabled,
        options: options !== undefined ? options : prev.options, revision, inherited: false });
    },

    setSettingState(tenantId, mpId, values = {}) {
      const key = `${tenantStateKey(tenantId)}:${mpId}`;
      settingState.set(key, { ...(settingState.get(key) || {}), ...values });
      invalidateConditionCache(tenantId);
    },

    settingsFor(tenantId, mpId) {
      return { ...(settingState.get(`${tenantStateKey(tenantId)}:${mpId}`) || {}) };
    },

    settingsCatalog() {
      const out = [];
      for (const [mpId, entry] of mps) {
        for (const page of entry.manifest.contributions?.settings || []) {
          out.push({ mpId, page });
        }
      }
      return out;
    },

    evaluatePredicate: evaluateDeclaredPredicate,

    subscribe(mpId, trigger, handler, { tenantId } = {}) {
      const qualified = trigger.includes('.') ? trigger : qualify(mpId, trigger);
      authorizeSubscribe(mpId, qualified, tenantId);
      const set = subscribers.get(qualified) || new Set();
      const entry = { mpId, handler, ...(tenantId !== undefined ? { tenantKey: tenantStateKey(tenantId) } : {}) };
      set.add(entry);
      subscribers.set(qualified, set);
      return () => set.delete(entry);
    },

    emit: dispatchEmit,
    query: dispatchQuery,
    invoke: dispatchInvoke,
    rollbackTransaction,

    records: {
      query: (filter) => records.query(filter),
      get: (runId) => records.get(runId),
    },

    async replay(runId, { newIdempotencyKey } = {}) {
      const record = await records.get(runId);
      if (!record || record.kind !== 'invoke') throw err('UnknownActivity', `run '${runId}' is not a replayable invoke`, { retryable: false });
      return dispatchInvoke({
        sourceMpId: record.sourceMpId,
        restoreReplay: true,
        activity: record.activityName,
        args: record.args,
        idempotencyKey: newIdempotencyKey || record.idempotencyKey,
        tenantId: record.tenantId,
        identity: { mpId: record.sourceMpId, tenantId: record.tenantId, scopes: ['*'], tokenId: `replay-${runId}` },
        chain: { rootRunId: undefined, depth: 0, chainPath: [] },
      });
    },

    suppressionTallies() {
      return [...suppressionTally.entries()].map(([key, count]) => ({ key, count }));
    },

    actionCatalog() {
      const out = [];
      for (const [mpId, entry] of mps) {
        const actions = entry.manifest.actions || {};
        for (const [actionId, action] of Object.entries(actions)) {
          out.push({
            mpId,
            actionId,
            title: action.title,
            description: action.description,
            optionsSchema: action.optionsSchema,
            optionsDefault: action.optionsDefault,
          });
        }
      }
      return out;
    },

    setOnline(value) {
      if (!isOnline && value) resendFailures.forEach((entry) => { entry.dueAt = 0; });
      isOnline = !!value;
    },
    isOnline: () => isOnline,
    drainOfflineQueue,
    onQueuedWritesChange(sourceMpId, callback) {
      if (retired || typeof callback !== 'function') return () => {};
      const captured = { ...currentQueueOwner() };
      const sameOwner = () => {
        const current = currentQueueOwner();
        return ['tenantId', ...OWNER_FIELDS].every((key) => String(current?.[key] ?? '') === String(captured?.[key] ?? ''));
      };
      let active = true;
      const offQueue = queueStore.onChange?.((rows) => {
        if (!active || retired) return;
        if (!sameOwner()) { off(); return; }
        if (rows.some((row) => row?.sourceMpId === sourceMpId && ownsQueuedRow(row, captured))) callback();
      });
      const off = () => {
        active = false;
        offQueue?.();
        queueSubscriptions.delete(off);
      };
      queueSubscriptions.add(off);
      return off;
    },

    queueStats() {
      const rows = ownQueuedRows();
      const bySource = {};
      const bytesBySource = {};
      for (const row of rows) {
        bySource[row.sourceMpId] = (bySource[row.sourceMpId] || 0) + 1;
        bytesBySource[row.sourceMpId] = (bytesBySource[row.sourceMpId] || 0) + (row.bytes || 0);
      }
      return {
        total: rows.length,
        bySource,
        bytesBySource,
        bytesCap: QUEUE_MAX_BYTES,
        entriesCap: QUEUE_MAX_ENTRIES,
        expiredOnLoad: queueStore.expiredOnLoad(),
      };
    },

    queuedWrites(sourceMpId) {
      return ownQueuedRows()
        .filter((row) => row.sourceMpId === sourceMpId && row.envelope?.activity && row.id && typeof row.subject !== 'string')
        .sort((a, b) => a.seq - b.seq)
        .map((row) => {
          const attempts = Number(row.attempts) || 0;
          let state = attempts > 0 ? 'failed' : 'queued';
          if (queueStore.isHeld?.(row) || drainingRows.has(row.id)) state = 'sending';
          return {
            id: row.id,
            activity: row.envelope.activity,
            args: JSON.parse(JSON.stringify(row.envelope.args ?? {})),
            queuedAt: row.queuedAt,
            attempts,
            state,
            idempotencyKey: typeof row.envelope.idempotencyKey === 'string' ? row.envelope.idempotencyKey : null,
          };
        });
    },

    writeOutcome(sourceMpId, activity, idempotencyKey, { tenantId } = {}) {
      const own = ownActivity(sourceMpId, activity);
      if (!own || typeof idempotencyKey !== 'string' || !idempotencyKey) return null;
      const owner = recordOwner(tenantId);
      if (!owner) return null;
      const record = outcomes.get(owner, own.qualified, idempotencyKey);
      if (!record) return null;
      return {
        state: record.state,
        at: record.at,
        rpcId: record.rpcId ?? null,
        ...(record.state === 'refused' && record.refusal ? { refusal: { ...record.refusal } } : {}),
        emitted: record.emitted === true,
        confirmable: confirmable(own.activityDef, record),
      };
    },

    async markOutcomeEmitted(sourceMpId, activity, idempotencyKey, { tenantId } = {}) {
      const own = ownActivity(sourceMpId, activity);
      if (!own) throw err('WriteNotFound', `'${activity}' is not an activity of mp '${sourceMpId}'`, { retryable: false });
      await outcomes.ready();
      const owner = recordOwner(tenantId);
      if (!owner) return false;
      const record = outcomes.get(owner, own.qualified, idempotencyKey);
      if (!record || record.state !== 'succeeded') return false;
      if (record.emitted !== true) outcomes.patch(owner, own.qualified, idempotencyKey, { emitted: true });
      return true;
    },

    async confirmWriteOutcome(sourceMpId, activity, idempotencyKey, { tenantId } = {}) {
      const own = ownActivity(sourceMpId, activity);
      if (!own) throw err('WriteNotFound', `'${activity}' is not an activity of mp '${sourceMpId}'`, { retryable: false });
      if (!confirmEligible(own.activityDef)) {
        throw notConfirmable('not_eligible', `'${own.qualified}' cannot be confirmed: only a client_key, offline-replayable write with no secret input can`);
      }
      await outcomes.ready();
      const owner = recordOwner(tenantId);
      const record = owner ? outcomes.get(owner, own.qualified, idempotencyKey) : null;
      if (!confirmOpen(record) || !record.request) {
        throw notConfirmable('no_request', `no waiting or unconfirmed request of '${own.qualified}' is recorded for this key`);
      }
      if (record.confirmSent === true) throw notConfirmable('already_confirmed', `'${own.qualified}' was already confirmed for this key`);
      if (now() - record.at > CONFIRM_WITHIN_MS) throw notConfirmable('expired', `'${own.qualified}' was recorded more than 24 hours ago`);
      const offline = (message) => ({ state: 'unconfirmed', error: { code: 'DATA_OFFLINE', status: 0, message } });
      if (!isOnline) return offline(`'${own.qualified}' was not confirmed: the device is offline`);
      outcomes.patch(owner, own.qualified, idempotencyKey, { confirmSent: true });
      const release = () => outcomes.patch(owner, own.qualified, idempotencyKey, { confirmSent: false });
      const request = JSON.parse(JSON.stringify(record.request));
      const send = { started: false };
      let restored;
      let answer;
      try {
        restored = await replayEnvelope(request);
        answer = await dispatchInvoke({
          ...restored, args: request.args, activity: request.activity, sourceMpId,
          rpcDeadlineAt: undefined, restoreReplay: true, restoreDrain: undefined, idempotencyKey: request.idempotencyKey,
          [CONFIRM_SEND]: send,
        });
      } catch (error) {
        if (neverReachedServer(error) || error?.code === 'Offline') {
          release();
          return offline(String(error?.message || 'the request did not leave the device'));
        }
        // Nothing reached the network, so the one confirm is still to come.
        if (!send.started) release();
        if (refusedForGood(error)) return { state: 'refused', refusal: refusalOf(error) };
        return { state: 'unconfirmed', error: refusalOf(error) };
      }
      if (answer?.status === 'queued_offline') {
        release();
        return offline(`'${own.qualified}' did not leave the device; it waits in the queue`);
      }
      if (answer?.status === 'succeeded') {
        const rpcId = answer.rpcId ?? record.rpcId ?? await confirmRunId(own, request, restored);
        return {
          state: 'succeeded', result: answer.result, replayed: answer.idempotentReplay === true || answer.replayed === true, rpcId,
        };
      }
      return { state: 'unconfirmed', error: { code: null, status: null, message: `'${own.qualified}' answered ${answer?.status || 'nothing'}` } };
    },

    purgeOutcomes() {
      outcomeGeneration += 1;
      outcomes.clear();
    },

    purgeConditionAnswers,
    markConditionAnswersStale,
    conditionAnswersReady() { return conditionAnswers.ready().then(() => conditionAnswers.flush()); },

    outcomesReady() { return outcomes.ready().then(() => outcomes.flush()); },

    async discardQueuedWrite(sourceMpId, id) {
      try {
        await queueStore.ready?.();
        if (typeof id !== 'string' || !id || retired) return false;
        const row = ownQueuedRows().find((queued) => queued.id === id && queued.sourceMpId === sourceMpId);
        if (!row || !row.envelope?.activity || typeof row.subject === 'string' || queueStore.isHeld?.(row) || drainingRows.has(row.id)) return false;
        const owner = recordOwner(row.envelope?.identity?.tenantId ?? row.owner?.tenantId);
        await outcomes.ready();
        const removed = (await queueStore.remove(row.seq)) === true;
        if (removed) forgetDiscardedOutcome(row, owner);
        return removed;
      } catch (_) { return false; }
    },

    heldWrite(sourceMpId, activity, keyFields) {
      const [ownerMpId, activityName] = splitQualified(activity);
      const hold = mps.get(ownerMpId)?.manifest.activities?.[activityName]?.holdUnsettled;
      if (!hold) return null;
      const subject = holdSubject(hold, keyFields);
      if (subject === null) return null;
      const row = ownQueuedRows().find((queued) => queued.sourceMpId === sourceMpId
        && queued.envelope?.activity === activity && queued.subject === subject && !appliedHolds.has(queued.id));
      return row ? heldEntry(row) : null;
    },

    heldWrites(sourceMpId = null) {
      return ownQueuedRows()
        .filter((row) => typeof row.subject === 'string' && !appliedHolds.has(row.id) && (sourceMpId === null || row.sourceMpId === sourceMpId))
        .sort((a, b) => a.seq - b.seq)
        .map((row) => {
          let subject = [];
          try { subject = JSON.parse(row.subject); } catch (_) { subject = []; }
          return { ...heldEntry(row), sourceMpId: row.sourceMpId, subject };
        });
    },

    inflightStats() {
      let waiting = 0;
      for (const entry of inflightInvokes.values()) waiting += entry.waiters.size;
      return { runs: inflightInvokes.size, waiting };
    },

    // Host retention must not retire a running action or delayed delivery.
    hasPendingWork: () => pendingWork > 0 || debouncePending.size > 0,
    async teardown(instanceId) {
      if (instanceId != null) return;
      retired = true;
      clearTimeout(settleRetryTimer);
      clearTimeout(holdCleanupTimer);
      settleRetryTimer = null;
      unsettled.clear();
      [...queueSubscriptions].forEach((off) => off());
      await queueStore.close?.();
      for (const entry of debouncePending.values()) clearTimeout(entry.timer);
      debouncePending.clear();
      subscribers.clear();
      mps.clear();
      conditionCache.clear();
      processedKeys.clear();
      invokeChains.clear();
      inflightInvokes.clear();
    },
  };
}
