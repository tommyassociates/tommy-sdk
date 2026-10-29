/**
 * The host broker: the trusted mediator every cross-MP message passes through.
 * Enforcement (capability tokens, default-deny authz, throttles, loop/cascade
 * caps, schema validation, action-run records) lives here, never in SDK code;
 * the SDK validates for DX only. server_write goes through the injected
 * `serverInvoke` seam, never an endpoint literal.
 */
import { TommyError, isTommyError, DEFAULT_RPC_TIMEOUT_MS } from '@tommy/sdk';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import {
  DEFAULT_THROTTLE_PROFILE, QUERY_RATE_WAIT_MAX_MS, QUEUE_MAX_ENTRIES, QUEUE_MAX_BYTES, SYNC_EMIT_TIMEOUT_MS, DEFAULT_RETRY,
  retryDelayMs,
  SENSITIVE_CONDITIONS, domainScopeForMp,
} from './constants.js';
import { createRecordStore } from './records.js';
import { createIdempotencyLedger, createInvalidationEpochs } from './idempotency-ledger.js';
import { createDurableQueue } from './durable-queue.js';
import { validateToken } from './capability.js';
import { evaluatePredicate as evaluateDeclaredPredicate } from './predicate.js';

const err = (code, message, extra = {}) => new TommyError({ code, message, ...extra });

const dayKey = (ts) => new Date(ts).toISOString().slice(0, 10);

/** inputMap sources the broker executes (plus the default). */
const M1_SOURCES = new Set(['trigger', 'condition', 'option']);

/**
 * Broker-lifetime maps are caches, not ledgers, so each has a hard cap;
 * eviction costs a recompute or re-apply, never correctness.
 */
const CONDITION_CACHE_MAX = 500;
/** Insertion order is eviction order (FIFO). */
const PROCESSED_KEYS_MAX = 1000;
/** Keys whose RESULT was released but whose already-applied fact must survive
 *  — far cheaper per entry, so it holds an order of magnitude more. */
const APPLIED_KEYS_OVERFLOW_MAX = 10000;
/** Idempotent runs that may be in flight at once. Past it a new keyed invoke
 *  is refused (`RateLimited`) rather than admitted, so every running key stays
 *  joinable and a stuck MP cannot pile up work without limit. */
const INFLIGHT_RUNS_MAX = 500;

// Server-write activities whose host adapter gets replay provenance (see
// executeInvoke). `team.update_member` always gets it: the member-restore gate
// reads deadlineAt on live calls too.
const RESTORE_CONTEXT_ALWAYS = new Set(['team.update_member']);
// These get it only on a durable-queue drain (`restoreDrain`), so the server can
// read "restoreContext present" as "this write waited in the queue" and honour
// its captured time. An inspector replay sets `restoreReplay` but never waited.
const RESTORE_CONTEXT_ON_DRAIN = new Set(['time-clock.record_attendance']);
const wantsRestoreContext = (envelope) => RESTORE_CONTEXT_ALWAYS.has(envelope.activity)
  || (RESTORE_CONTEXT_ON_DRAIN.has(envelope.activity) && envelope.restoreDrain === true);
// `queuedAt` is part of the drain-only context; the member-restore wire shape is unchanged.
const wantsQueuedAt = (envelope) => RESTORE_CONTEXT_ON_DRAIN.has(envelope.activity) && envelope.restoreDrain === true;

/**
 * Platform triggers on every registered MP's namespace, undeclared; a closed,
 * in-binary set. `settings.changed` fires only when a setting actually moves.
 */
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

/** Key-order-independent stringify (deterministic Action idempotency keys). */
function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().filter((k) => value[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

/**
 * FNV-1a 32-bit over the stable form, so a derived Action key fits the
 * envelope's idempotencyKey maxLength (128). The server's upsert is the real
 * duplicate guard; the key is the exactly-once ledger handle.
 */
function stableHash(value) {
  const text = stableStringify(value);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

// A text's size in UTF-16 code units, as Web Storage quotas charge it.
const utf16Units = (text) => String(text).length;

export function createBroker({
  capabilityService,
  recordBackend,
  serverInvoke,
  // Host-only outcome observation; the broker remains the sole replay owner.
  onOfflineOutcome,
  now = () => Date.now(),
  online = true,
  throttleOverrides = {},
  // Trusted host aliases for in-memory configuration only; wire and durable
  // identities retain the tenant identifier supplied by the authenticated call.
  tenantStateKey = (tenantId) => tenantId,
  // Enforcement flags, default off: turning one on needs the matching manifest
  // declarations (grants / read: scopes) to exist first.
  /**
   * Treat `authorizedCallers: []` as deny-all-cross-MP, not "unset".
   * `callerPolicy: owner_only` says the same thing and is not gated on this.
   */
  strictEmptyCallers = false,
  /** Cross-MP condition reads require a `read:<owner>.<condition>` scope. */
  enforceConditionScopes = false,
  /** Emit must own the trigger namespace; subscribe must be granted. */
  strictEmitOwnership = false,
  /**
   * `(mpId, tenantId) => string[]`: the scopes that MP's install holds in that
   * tenant (its token's `effectiveScopes`), for the paths that carry no token:
   * `subscribe()` and its deliveries, Action trigger bindings and Action
   * dispatches. No array means no scopes; omitted, the manifest's declared
   * `permissions.scopes` are used.
   */
  grantedScopes,
  /** `{ mpId: 'domain' }` overrides for read-scope derivation. */
  domainScopeOverrides = {},
  /** Conditions the primitives derivation must not grant. */
  sensitiveConditions = SENSITIVE_CONDITIONS,
  /**
   * The durable half of the idempotency ledger. It detects storage itself, so
   * node/tests stay memory-only; `null` disables persistence.
   */
  idempotencyLedger = createIdempotencyLedger(),
  invalidationEpochs = createInvalidationEpochs(),
  /** The offline queue's durable half; same seam as the ledger above. */
  offlineQueue = createDurableQueue({ now }),
  /**
   * `() => ({ person, accountType, accountId, tenantId })`: who this broker
   * queues and sends offline writes for. The queue is one store per device, so
   * only a broker of the same owner sends a row (see `ownsQueuedRow`); an
   * unstamped row goes to a broker of its tenant. Without it every row is ours.
   */
  queueOwner = null,
  /**
   * How long a dispatch waits for an MP announced through `expectMps()` but not
   * yet registered before raising Unknown{Condition,Activity}. Larger than a
   * condition's `latencyBudgetMs`: it covers bundle fetch + eval on a cold radio.
   */
  registrationTimeoutMs = 8000,
  /**
   * How long an invoke joining an in-flight run with the same idempotency key
   * waits before a non-retryable `Timeout`. With `rpcDeadlineAt` it gives up just
   * before that deadline, so the caller gets this error, not the adapter's. It
   * also ends a handler invoking its own activity with its own key.
   */
  inflightJoinTimeoutMs = DEFAULT_RPC_TIMEOUT_MS,
  /** Injectable so a test asserts the retry schedule instead of waiting it out. */
  sleep = (ms) => (ms > 0 ? new Promise((resolve) => { setTimeout(resolve, ms); }) : Promise.resolve()),
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

  // --- registries -----------------------------------------------------------
  const mps = new Map();              // mpId -> { manifest, handlers, firstParty }
  // The host mounts each MP's surfaces as soon as that MP registers, so a panel
  // can query an MP that is still loading and get `UnknownCondition`, which looks
  // like "not installed". `expectMps()` declares the set about to register so
  // the broker awaits "not yet"; an MP never announced still fails fast.
  const expectedMps = new Set();      // announced by the host, not yet registered
  const registrationWaiters = new Map(); // mpId -> Set<resolve>
  const subscribers = new Map();      // trigger -> Set<{mpId, handler}>
  const actionState = new Map();      // tenant / MP / Action / optional location -> {enabled, options}
  const settingState = new Map();     // `${tenantId}:${mpId}` -> { key: value } (manifest-driven settings projection)
  const processedKeys = new Map();    // `${tenantId}:${activity}:${idempotencyKey}` -> stored result (FIFO cap PROCESSED_KEYS_MAX)

  const appliedKeysOverflow = new Set(); // keys evicted from processedKeys — the fact survives, the result does not
  const conditionCache = new Map();   // `${tenantId}:${condition}:${argsJson}` -> {value, expiresAt} (cap CONDITION_CACHE_MAX)
  // Bumped by every condition-cache invalidation, so the detached late-value
  // salvage can tell the cache moved after its dispatch returned.
  let conditionCacheEpoch = 0;
  const suppressionTally = new Map(); // `${tenantId}:${trigger}:${day}` -> count
  const debouncePending = new Map();  // `${trigger}:${emitterMpId}` -> {timer, resolvers}
  const invokeChains = new Map();     // sourceMpId -> tail promise (FIFO per source MP)
  const inflightInvokes = new Map();  // processedKey -> { deadlineAt, waiters } of the run applying it
  // A join rejects this long before the caller's `rpcDeadlineAt` at most, and
  // never more than a fifth of the time the caller has left.
  const JOIN_DEADLINE_MARGIN_MS = 250;
  const executingChains = new Map();  // sourceMpId -> depth of handler execution ON that chain (F6)
  const txnSteps = new Map();         // txnId -> [{activity, args, idempotencyKey}]
  const chainBudget = new Map();      // rootRunId -> total run count
  const buckets = new Map();          // `${mpId}:${kind}` -> {tokens, updatedAt}
  // Offline queue rows {sourceMpId, envelope, bytes, seq, queuedAt}. The store
  // owns the array and persists it (D.43); `null` opts out of persistence, and
  // gets a storage-less instance rather than a second code path.
  const queueStore = offlineQueue || createDurableQueue({ now, storage: null });
  // Ids of the queued rows a drain of this broker is sending now: their
  // receipts read `sending`, and they cannot be discarded meanwhile.
  const drainingRows = new Set();
  let isOnline = online;
  let pendingWork = 0;
  let retired = false;
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

  // --- enforcement helpers --------------------------------------------------

  function authenticate(envelope) {
    const issued = envelope.capabilityToken;
    const identity = capabilityService.validate(issued, { mpId: envelope.sourceMpId, instanceId: envelope.instanceId });
    return identity; // { mpId, tenantId, scopes, tokenId }
  }

  function throttleProfileFor(mpId) {
    return { ...DEFAULT_THROTTLE_PROFILE, ...(throttleOverrides[mpId] || {}) };
  }

  /**
   * Take one of `mpId`'s `kind` tokens; returns how long to wait before running.
   * A future token is reserved by taking the bucket below zero, so the next
   * caller queues behind this one. Past `maxWaitMs` nothing is reserved and the
   * call is refused with `retryAfterMs`.
   */
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

  /** A query's token: waits for the next one up to QUERY_RATE_WAIT_MAX_MS. */
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
    // A declared `callerPolicy` is authoritative. Without one, the shape of
    // `authorizedCallers` decides: a non-empty list is `listed`, an explicit []
    // is `owner_only` under `strictEmptyCallers`, and an absent field is
    // `first_party` (not default-deny). `callerPolicy` stays optional in v1, so
    // a manifest omitting it must keep that default rather than become uninvokable.
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
      // Cite the field the author wrote, not a `callerPolicy` it never declared.
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
    // '*' is the HOST authority marker (inspector replay, txn compensation) —
    // never issuable through a capability token (tokens carry catalogue scopes).
    if (!scopes.includes(scope) && !scopes.includes('*') && !callerIsTarget) {
      throw err('PermissionDenied', `caller lacks scope '${scope}'`, { rule: 'permissions', retryable: false });
    }
  }

  const isSensitive = (qualified) => (typeof sensitiveConditions?.has === 'function'
    ? sensitiveConditions.has(qualified)
    : (sensitiveConditions || []).includes(qualified));

  /**
   * Read grant for a condition or trigger `{owner}.{primitive}`: the explicit
   * `read:{owner}.{primitive}`, the owner's catalogue domain scope
   * (`read:shifts`, …), or the host's '*'. Sensitive conditions accept only the
   * explicit scope: `read:attendance` must not hand out `time-clock.kiosk_pin`.
   */
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
      // The scopes that would grant this read, most specific first.
      accepts: sensitive ? [explicit] : [explicit, domain],
      denialMessage: sensitive
        ? `caller lacks scope '${explicit}' ('${qualified}' is sensitive — the '${domain}' domain scope does not grant it)`
        : `caller lacks scope '${explicit}' or '${domain}'`,
    };
  }

  const holdsReadGrant = (held, grant) => grant.accepts.some((s) => held.includes(s)) || held.includes('*');

  /** The scopes a tokenless path judges `mpId` by in `tenantId` — see `grantedScopes`. */
  function tokenlessScopes(mpId, tenantId) {
    if (typeof grantedScopes !== 'function') return mps.get(mpId)?.manifest.permissions?.scopes || [];
    const held = grantedScopes(mpId, tenantId);
    return Array.isArray(held) ? held : [];
  }

  /** Cross-MP condition reads need a `readGrant`; gated on `enforceConditionScopes`. */
  function authorizeQuery(callerMpId, ownerMpId, conditionName, scopes) {
    if (!enforceConditionScopes) return;
    if (callerMpId === ownerMpId) return; // an MP always reads its own conditions
    const grant = readGrant(ownerMpId, conditionName);
    if (!holdsReadGrant(scopes || [], grant)) {
      throw err('PermissionDenied', grant.denialMessage, { rule: 'permissions', retryable: false });
    }
  }

  /**
   * Registration check for `subscribe()`. It carries no capability token, so
   * the grant comes from `tokenlessScopes`. Every delivery re-tests it
   * (`subscriberHears`), so a grant that narrows later stops the payloads.
   */
  function authorizeSubscribe(subscriberMpId, triggerQualified, tenantId) {
    if (triggerGranted(subscriberMpId, triggerQualified, tenantId)) return;
    const [ownerMpId, triggerName] = splitQualified(triggerQualified);
    const grant = readGrant(ownerMpId, triggerName);
    throw err('PermissionDenied', `mp '${subscriberMpId}' may not subscribe to '${triggerQualified}': ${grant.denialMessage}`, {
      rule: 'permissions', retryable: false,
    });
  }

  // --- Active Trigger Index ---------------------------------------------------

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

  /** Drop this tenant's memoised condition results (a settings write may change them). */
  function invalidateConditionCache(tenantId) {
    const prefix = `${tenantStateKey(tenantId)}:`;
    conditionCacheEpoch += 1;
    for (const key of [...conditionCache.keys()]) {
      if (key.startsWith(prefix)) conditionCache.delete(key);
    }
  }

  /**
   * Whether `mpId` may hear `triggerQualified` in `tenantId`, for `subscribe()`
   * and Action trigger bindings alike. An ungranted binding is dropped, not
   * thrown: the emit belongs to an unrelated MP, and one MP's manifest must not
   * break another's writes.
   */
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

  /**
   * Whether a stored subscription receives an emit in `tenantId`: one
   * registered for a tenant hears only that tenant, and the subscriber must
   * still hold the grant there.
   */
  function subscriberHears(sub, triggerQualified, tenantId) {
    if (sub.tenantKey !== undefined && sub.tenantKey !== tenantStateKey(tenantId)) return false;
    return triggerGranted(sub.mpId, triggerQualified, tenantId);
  }

  function triggerIsActive(tenantId, triggerQualified, payload) {
    return [...(subscribers.get(triggerQualified) || [])].some((sub) => subscriberHears(sub, triggerQualified, tenantId))
      || actionsForTrigger(tenantId, triggerQualified, payload).length > 0;
  }

  // --- dispatch internals ----------------------------------------------------

  /**
   * An Action's dispatches run as the MP that owns the Action, not the emitter,
   * so its condition gates are judged by the owner's grants. No RPC carries a
   * token here, so scopes are the owner's `tokenlessScopes`; the emitter's token
   * id stays as `causedByTokenId` for tracing.
   */
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

    // inputMap source resolver: trigger/option/const/condition plus default;
    // transforms and templates are rejected. `conditionValues` grows gate by
    // gate, so a later gate's input may read an earlier gate's return.
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

    // Every condition gate must pass. A gate parameterises its condition via
    // `input` (resolved sources) or literal `args`.
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
    // A client_key activity dispatched by an Action has no caller to supply the
    // key, so derive it from (action, trigger payload, args): a replay of the
    // same event carries the same key. The payload is in it because args alone
    // can repeat across distinct events.
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
      // System triggers exist on every registered MP undeclared; an unknown
      // owner is still UnknownTrigger.
      || (ownerEntry && SYSTEM_TRIGGERS[triggerName]);
    if (!triggerDef) throw err('UnknownTrigger', `trigger '${triggerQualified}' is not declared by any registered MP`, { retryable: false });

    // Only the owner may emit its trigger, or one MP could drive another's
    // Actions. Host-originated emits (a host `identity`, no token) act for the
    // owner and are exempt. Checked before the offline enqueue, so a drain
    // (which replays with `identity`) is not re-judged.
    const hostOriginated = !envelope.capabilityToken && !!envelope.identity;
    if (strictEmitOwnership && ownerMpId !== emitterMp && !hostOriginated) {
      throw err('PermissionDenied', `mp '${emitterMp}' may not emit '${triggerQualified}' — the trigger is owned by '${ownerMpId}'`, {
        rule: 'triggers.owner', retryable: false,
      });
    }
    validateAgainst(triggerDef.payloadSchema, envelope.payload, 'InvalidPayload', `trigger '${triggerQualified}' payload`);

    // No enabled consumer: suppress, tally only.
    if (!triggerIsActive(tenantId, triggerQualified, envelope.payload)) {
      const key = `${tenantId}:${triggerQualified}:${dayKey(now())}`;
      suppressionTally.set(key, (suppressionTally.get(key) || 0) + 1);
      return { emitId: `suppressed-${key}`, deliveredTo: 0, queuedFor: 0, suppressed: true };
    }

    if (!isOnline) {
      const queuedSeq = enqueueOffline(emitterMp, { ...envelope, identity });
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
      // Resolve after FIRST-PARTY subscribers acknowledge, capped at 3s.
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

  /**
   * An MP's entry, waiting for registration if the host announced it; undefined
   * if absent, unannounced or late. Only a wholly unregistered MP waits: a
   * registered one missing the named primitive is a manifest error, failed at once.
   */
  async function resolveMpEntry(mpId) {
    const entry = mps.get(mpId);
    if (entry) return entry;
    if (!expectedMps.has(mpId)) return undefined;

    let waiters = registrationWaiters.get(mpId);
    if (!waiters) { waiters = new Set(); registrationWaiters.set(mpId, waiters); }

    await new Promise((resolve) => {
      const done = () => { clearTimeout(timer); waiters.delete(done); resolve(); };
      const timer = setTimeout(done, registrationTimeoutMs);
      // Never hold a process open on a wait nobody is watching (node/tests).
      if (typeof timer?.unref === 'function') timer.unref();
      waiters.add(done);
    });

    return mps.get(mpId);
  }

  /**
   * An `unresolved` answer reports on the read, not the world. Caching it would
   * pin the failure for the whole TTL, so neither cache write in `query` does.
   */
  function isKnownUnknown(value) {
    return !!(value && typeof value === 'object' && value.unresolved);
  }

  /** Over CONDITION_CACHE_MAX: drop expired entries, then the oldest inserted. */
  function pruneConditionCache(justSetKey = null) {
    if (conditionCache.size <= CONDITION_CACHE_MAX) return;
    const t = now();
    for (const [key, entry] of conditionCache) {
      if (entry.expiresAt <= t) conditionCache.delete(key);
    }
    // Never the entry just stored, or a short-TTL condition evicts itself on
    // every read.
    for (const key of conditionCache.keys()) {
      if (conditionCache.size <= CONDITION_CACHE_MAX) break;
      if (key === justSetKey) continue;
      conditionCache.delete(key);
    }
  }

  function dispatchQuery(...args) { return trackWork(() => dispatchQueryInnerTracked(...args)); }

  async function dispatchQueryInnerTracked(envelope) {
    const identity = envelope.identity || authenticate(envelope);
    const tenantId = envelope.tenantId || identity.tenantId;

    const [ownerMpId, conditionName] = splitQualified(envelope.condition);
    const ownerEntry = await resolveMpEntry(ownerMpId);
    const conditionDef = ownerEntry?.manifest.conditions?.[conditionName];
    if (!conditionDef) throw err('UnknownCondition', `condition '${envelope.condition}' is not registered`, { retryable: false });

    authorizeQuery(envelope.sourceMpId, ownerMpId, conditionName, identity.scopes);
    validateAgainst(conditionDef.inputSchema, envelope.args, 'InvalidPayload', `condition '${envelope.condition}' args`);

    const cacheKey = `${tenantStateKey(tenantId)}:${envelope.condition}:${JSON.stringify(envelope.args)}`;
    if (conditionDef.cacheable) {
      const hit = conditionCache.get(cacheKey);
      if (hit && hit.expiresAt > now()) return hit.value;
      // Reclaim an expired entry rather than skip it.
      if (hit) conditionCache.delete(cacheKey);
    }

    // The rate token is taken here, after the cache: an answer the broker
    // already holds runs nothing, so it is not throttled. A read that runs
    // the handler waits briefly for a token rather than failing at once.
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
    // The handler's `signal` aborts when the caller is answered with a
    // Timeout. A handler whose late value only warms the cache may ignore it;
    // one that is not cacheable can stop reading for nobody.
    const deadline = new AbortController();
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        deadlinePassed = true;
        deadline.abort();
        reject(err('Timeout', `condition '${envelope.condition}' exceeded latencyBudgetMs ${budget}`, { retryable: false, runId: record.runId }));
      }, budget);
    });
    // Captured BEFORE the handler runs, so any invalidation during the read is
    // visible to the detached salvage below.
    const epochAtDispatch = conditionCacheEpoch;
    const deadlineAwareResult = Promise.resolve(handler(envelope.args, { tenantId, signal: deadline.signal })).then(
      (late) => {
        if (!deadlinePassed) return late;
        Promise.resolve()
          .then(async () => {
            // A cache hit is served unvalidated, so a late value must pass
            // returnSchema before it may warm the cache.
            validateAgainst(conditionDef.returnSchema, late, 'ConditionError', `condition '${envelope.condition}' late return`);
            // The run stays `failed` (the caller saw a Timeout); the salvage
            // rides its own fields so status filters still find the run.
            await records.update(record.runId, {
              lateResult: late,
              note: 'resolved after latency budget; the caller had already timed out',
            });
            // A moved epoch means an invalidation (say a delete) landed during
            // the read, so this value is stale and must not refill the cache.
            if (conditionCacheEpoch !== epochAtDispatch) return;
            if (conditionDef.cacheable && conditionDef.cacheTtlMs > 0 && !isKnownUnknown(late)) {
              conditionCache.set(cacheKey, { value: late, expiresAt: now() + conditionDef.cacheTtlMs });
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
      // A zero TTL entry could never be served, and a known-unknown must not be
      // cached. An invalidation during the read or record write also skips it.
      if (conditionCacheEpoch === epochAtDispatch && conditionDef.cacheable && conditionDef.cacheTtlMs > 0 && !isKnownUnknown(value)) {
        conditionCache.set(cacheKey, { value, expiresAt: now() + conditionDef.cacheTtlMs });
        pruneConditionCache(cacheKey);
      }
      return value;
    } catch (cause) {
      const wrapped = isTommyError(cause) ? cause
        : err('ConditionError', `condition '${envelope.condition}' threw: ${String(cause && cause.message)}`, { retryable: false, cause });
      await records.update(record.runId, { status: 'failed', error: { code: wrapped.code, message: wrapped.message } });
      throw wrapped;
    } finally {
      clearTimeout(timer);
    }
  }

  function idempotencyKeyFor(activityDef, envelope, epoch = 0) {
    // The invalidation epoch is folded into every broker-derived key, never a
    // `client_key`: the caller owns that one and the server's ledger is keyed on
    // it. At epoch 0 keys carry no stamp, so an install that never invalidated
    // keeps its keys.
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
        // Without the field every call would collide on 'n-undefined' and a
        // distinct write would replay the first's result, so fall back to the
        // whole args.
        return value !== undefined ? `${stamp}n-${value}` : `${stamp}n-${JSON.stringify(envelope.args)}`;
      }
      // Declared by the host's scheduled-write system activities
      // (`tommy.clock.schedule_follow_up` / `cancel_follow_up`), which are
      // offline-replayable, so a replayed drain must carry the same key.
      case 'correlationKey': {
        const value = envelope.args?.correlationKey;
        if (value === undefined || value === null || value === '') {
          throw err('InvalidPayload', 'idempotency=correlationKey requires args.correlationKey', { retryable: false });
        }
        // The key includes the rest of the args: on the correlation key alone,
        // rescheduling a follow-up to a new time would replay the first result.
        const rest = { ...envelope.args };
        delete rest.correlationKey;
        const tail = Object.keys(rest).length ? `-${JSON.stringify(rest)}` : '';
        return `${stamp}c-${value}${tail}`;
      }
      default:
        return undefined; // 'none' — forbidden with offlineReplayable (validator-enforced)
    }
  }

  async function executeInvoke(envelope, activityDef, ownerEntry, ownerMpId, activityName, record) {
    const handler = ownerEntry.handlers?.activities?.[activityName];
    if (activityDef.sideEffect === 'server_write') {
      if (!serverInvoke) throw err('ActivityFailed', `server_write activity '${envelope.activity}' has no server executor wired`, { retryable: true });
      return serverInvoke({
        rpcId: record.runId,
        kind: 'invoke',
        activity: envelope.activity,
        args: envelope.args,
        // Replay provenance, set by the runtime and never by MP args: the server
        // honours a queued punch's captured time only with this marker.
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
    const result = await handler(envelope.args, { tenantId: record.tenantId, txnId: envelope.txnId });
    return { rpcId: record.runId, status: 'succeeded', result };
  }

  /**
   * Re-entrancy: while one of `mpId`'s dispatches is inside a handler, its new
   * invokes run inline, since queueing a nested invoke behind its own ancestor
   * would deadlock. An unrelated invoke in that window also runs inline; one
   * repeating the running key joins it (`joinInflightInvoke`).
   */
  function enterExecution(mpId) { executingChains.set(mpId, (executingChains.get(mpId) || 0) + 1); }
  function exitExecution(mpId) {
    const depth = (executingChains.get(mpId) || 0) - 1;
    if (depth > 0) executingChains.set(mpId, depth); else executingChains.delete(mpId);
  }

  function dispatchInvoke(...args) { return trackWork(() => dispatchInvokeInnerTracked(...args)); }

  async function dispatchInvokeInnerTracked(envelope) {
    const sourceMpId = envelope.sourceMpId;
    // Re-entrant (nested) dispatch: run inline, never behind our own ancestor.
    if (executingChains.has(sourceMpId)) return dispatchInvokeInner(envelope);
    // FIFO per source MP.
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
    takeToken(envelope.sourceMpId, 'invoke');

    const [ownerMpId, activityName] = splitQualified(envelope.activity);
    // Writes wait for an announced MP's registration too.
    const ownerEntry = await resolveMpEntry(ownerMpId);
    const activityDef = ownerEntry?.manifest.activities?.[activityName];
    if (!activityDef) throw err('UnknownActivity', `activity '${envelope.activity}' is not registered`, { retryable: false });

    authorizeInvoke(envelope.sourceMpId, ownerMpId, activityName, activityDef, identity.scopes);
    validateAgainst(activityDef.inputSchema, envelope.args, 'InvalidPayload', `activity '${envelope.activity}' args`);

    const chain = envelope.chain || { rootRunId: undefined, depth: 0, chainPath: [] };
    // A fresh caller-invoke is its own chain root; loop/fan-out caps bound the
    // causal tree, so they apply to chained dispatches only.
    if (chain.rootRunId) checkChain(envelope.sourceMpId, `invoke(${envelope.activity})`, chain);

    const idempotencyKey = idempotencyKeyFor(
      activityDef, envelope, invalidationEpochs.get(`${tenantId}:${envelope.activity}`),
    );
    // Tenant-scoped: `derived_from_input` keys hash the args alone, so the same
    // write in two tenants would otherwise replay the other's result.
    const processedKey = idempotencyKey && `${tenantId}:${envelope.activity}:${idempotencyKey}`;
    if (processedKey && processedKeys.has(processedKey)) {
      // A repeat key replays the stored result, not re-applied.
      return { ...processedKeys.get(processedKey), idempotentReplay: true };
    }
    if (processedKey && appliedKeysOverflow.has(processedKey)) {
      // Applied this session but its result was released by the cap: still
      // suppressed, in the durable-ledger hit's shape.
      return { status: 'succeeded', idempotentReplay: true, resultRetained: false };
    }

    // The durable ledger catches a `client_key` processed in an earlier session.
    // Results are never persisted (one may be a live PIN), so a hit suppresses
    // with `resultRetained: false`. Only `client_key`: other keys derive from
    // the args and would put tenant data on disk.
    if (processedKey && activityDef.idempotency === 'client_key' && idempotencyLedger?.has(processedKey)) {
      return { status: 'succeeded', idempotentReplay: true, resultRetained: false };
    }

    // Offline: a replayable write queues; anything else is a typed Offline reject.
    if (!isOnline && activityDef.sideEffect !== 'local_write') {
      if (activityDef.offlineReplayable) {
        enqueueOffline(envelope.sourceMpId, { ...envelope, identity, idempotencyKey });
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
        return { rpcId: queuedRecord.runId, status: 'queued_offline' };
      }
      throw err('Offline', `activity '${envelope.activity}' is not offlineReplayable and the device is offline`, { retryable: false });
    }

    const admitted = {
      envelope, identity, tenantId, ownerEntry, ownerMpId, activityName, activityDef, chain, idempotencyKey, processedKey,
    };
    if (!processedKey) return runAdmittedInvoke(admitted);
    // Same key still running (possible via inline re-entrant invokes): join it
    // rather than apply the write twice.
    const running = inflightInvokes.get(processedKey);
    if (running) return joinInflightInvoke(running, envelope);
    if (inflightInvokes.size >= INFLIGHT_RUNS_MAX) {
      throw err('RateLimited', `${INFLIGHT_RUNS_MAX} idempotent invokes are already in flight; '${envelope.activity}' was not started`, {
        rule: 'idempotency.inflight_capacity', retryable: true,
      });
    }
    const run = runAdmittedInvoke(admitted);
    // Joins wait on the entry, not on `run`: one reaction on the run settles
    // them all, and a join that times out removes itself.
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

  /**
   * How long a join may wait: until just before the earlier of its own and the
   * running call's deadline (the latter bounds a handler joining itself).
   * `rpcDeadlineAt` is wall-clock time, so this reads Date.now(), not `now`.
   */
  function joinWaitMs(envelope, running) {
    const deadlines = [envelope.rpcDeadlineAt, running.deadlineAt].filter(Number.isFinite);
    if (!deadlines.length) return inflightJoinTimeoutMs;
    const remaining = Math.min(...deadlines) - Date.now();
    const margin = Math.min(JOIN_DEADLINE_MARGIN_MS, remaining / 5);
    return Math.max(0, Math.min(inflightJoinTimeoutMs, remaining - margin));
  }

  /** Wait for the run in flight with this key: its result (as a replay) or its error, within the join bound. */
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

  /** Record, execute (with retries) and settle one admitted invoke. */
  async function runAdmittedInvoke({
    envelope, identity, tenantId, ownerEntry, ownerMpId, activityName, activityDef, chain, idempotencyKey, processedKey,
  }) {
    // A replayable server write is queued on the device before its request
    // goes, since a hung request neither answers nor fails and closing the app
    // would lose it. The row is held (no drain here sends it, a restart replays
    // it with its key); an answered write removes it. If it cannot be kept the
    // write still runs. A drained replay is its own row already.
    const heldSeq = activityDef.sideEffect === 'server_write' && activityDef.offlineReplayable
      && !envelope.restoreDrain && typeof queueStore.isHeld === 'function'
      ? holdInQueue(envelope.sourceMpId, { ...envelope, identity, idempotencyKey })
      : null;
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
      return await attemptAdmittedInvoke({
        envelope, identity, tenantId, ownerEntry, ownerMpId, activityName, activityDef, idempotencyKey, processedKey, record, heldSeq,
      });
    } finally {
      // Whatever ended the run, its row (if it is still queued) is a waiting write now.
      if (heldSeq !== null) queueStore.release(heldSeq);
    }
  }

  /**
   * Keep a running write's row in the durable queue; null when it cannot be
   * kept, or when a row of this write (same activity and key) is queued
   * already, which a restart replays in its place.
   */
  function holdInQueue(sourceMpId, envelope) {
    const queued = ownQueuedRows().some((row) => row.sourceMpId === sourceMpId
      && row.envelope?.activity === envelope.activity && row.envelope?.idempotencyKey === envelope.idempotencyKey);
    if (queued) return null;
    try {
      return enqueueOffline(sourceMpId, envelope, { held: true });
    } catch (_) {
      return null;
    }
  }

  async function attemptAdmittedInvoke({
    envelope, identity, tenantId, ownerMpId, ownerEntry, activityName, activityDef, idempotencyKey, processedKey, record, heldSeq,
  }) {
    const retry = { ...DEFAULT_RETRY, ...(activityDef.retry || {}) };
    let attempt = 0;
    let lastError;
    while (attempt < Math.max(1, retry.maxAttempts)) {
      attempt += 1;
      // The declared backoff, capped in constants.js so a dead-letter still
      // lands well inside a second.
      // eslint-disable-next-line no-await-in-loop
      if (attempt > 1) await sleep(retryDelayMs(retry.backoff, attempt));
      await records.update(record.runId, { status: 'running', attempts: attempt });
      try {
        // The handler window is the re-entrancy window.
        enterExecution(envelope.sourceMpId);
        let result;
        try {
          result = await executeInvoke(envelope, activityDef, ownerEntry, ownerMpId, activityName, record);
        } finally {
          exitExecution(envelope.sourceMpId);
        }
        if (result.status && result.status === 'failed') throw err('ActivityFailed', result.error?.message || 'executor reported failure', { retryable: false });
        validateAgainst(activityDef.resultSchema, result.result, 'ActivityFailed', `activity '${envelope.activity}' result`);
        const final = { rpcId: record.runId, status: 'succeeded', result: result.result };
        await records.update(record.runId, { status: 'succeeded', result: result.result });
        if (processedKey) {
          processedKeys.set(processedKey, final);
          // A recorded result outlives the state it describes once a sibling
          // activity undoes it (lock vs unlock). The MP names those siblings in
          // `invalidatesIdempotency`; the broker cannot know inverses, and
          // clearing every key on any write would break fan-out de-duplication.
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
          // FIFO cap: release the result but keep the key in the overflow set,
          // or a natural_key/derived_from_input write (no durable ledger) would
          // re-apply.
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
        // Record the key durably, never the result; client_key only.
        if (processedKey && activityDef.idempotency === 'client_key') idempotencyLedger?.add(processedKey);
        // Applied: its held row goes (after the ledger has the key, so a restart
        // in between suppresses the replay rather than sending it again).
        if (heldSeq !== null) queueStore.remove(heldSeq);
        if (envelope.txnId) {
          const steps = txnSteps.get(envelope.txnId) || [];
          steps.push({ activity: envelope.activity, args: envelope.args, idempotencyKey });
          txnSteps.set(envelope.txnId, steps);
        }
        // The owner's server_write invalidates its condition cache.
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
      }
    }

    // A replayable server write whose request never reached the server waits
    // in the offline queue, as it would had the device reported itself
    // offline. A drained replay is still in the queue, so it just fails here
    // and stays there.
    if (activityDef.sideEffect === 'server_write' && activityDef.offlineReplayable
      && !envelope.restoreDrain && neverReachedServer(lastError)) {
      // Its held row is already queued; the caller releases it.
      if (heldSeq === null) enqueueOffline(envelope.sourceMpId, { ...envelope, identity, idempotencyKey });
      await records.update(record.runId, { status: 'queued_offline', attempts: attempt });
      return { rpcId: record.runId, status: 'queued_offline' };
    }

    // Budget exhausted or non-retryable: dead-letter. The server
    // answered (or the write failed for good), so its held row goes.
    if (heldSeq !== null) queueStore.remove(heldSeq);
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
    // Reverse-order compensation via `undo_*`, run with the owning MP's
    // authority: undoing a step is the owner's activity, not a caller privilege.
    for (const step of steps.reverse()) {
      const [ownerMpId, name] = splitQualified(step.activity);
      const undoName = `undo_${name}`;
      if (!mps.get(ownerMpId)?.manifest.activities?.[undoName]) continue; // best-effort-no-rollback
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

  // --- offline queue (broker-owned store; FIFO per source MP) ----------------

  function currentQueueOwner() {
    try { return typeof queueOwner === 'function' ? queueOwner() || null : null; } catch (_) { return null; }
  }

  const OWNER_FIELDS = ['person', 'accountType', 'accountId'];
  const known = (value) => value !== undefined && value !== null && value !== '';

  /**
   * Whether this broker may send a queued row (see `queueOwner`): the row's
   * tenant is this broker's, and every person or account field the row was
   * stamped with is this broker's too. A broker that does not know one of
   * them sends no row stamped with it.
   */
  function ownsQueuedRow(row, holder) {
    if (typeof queueOwner !== 'function') return true;
    if (!holder || !known(holder.tenantId)) return false;
    const stamp = row.owner || {};
    const tenant = known(stamp.tenantId) ? stamp.tenantId : row.envelope?.identity?.tenantId;
    if (String(tenant) !== String(holder.tenantId)) return false;
    return OWNER_FIELDS.every((key) => !known(stamp[key]) || (known(holder[key]) && String(stamp[key]) === String(holder[key])));
  }

  function ownQueuedRows() {
    const holder = currentQueueOwner();
    return queueStore.all().filter((row) => ownsQueuedRow(row, holder));
  }

  function enqueueOffline(sourceMpId, envelope, { held = false } = {}) {
    // The queue is kept in Web Storage, whose quota the browser charges in
    // UTF-16 code units: its caps count those, not UTF-8 bytes.
    const bytes = utf16Units(JSON.stringify(envelope.args || envelope.payload || {}));
    const holder = currentQueueOwner();
    const partition = ownQueuedRows().filter((row) => row.sourceMpId === sourceMpId);
    const partitionBytes = partition.reduce((sum, row) => sum + row.bytes, 0);
    if (partition.length >= QUEUE_MAX_ENTRIES || partitionBytes + bytes > QUEUE_MAX_BYTES) {
      throw err('Offline_QueueFull', `offline queue full for mp '${sourceMpId}' (${partition.length} entries)`, { retryable: false });
    }
    const owner = holder
      ? Object.fromEntries(['tenantId', ...OWNER_FIELDS].filter((key) => known(holder[key])).map((key) => [key, holder[key]]))
      : undefined;
    try {
      return queueStore.push({ sourceMpId, envelope, bytes, owner, ...(held ? { held } : {}) });
    } catch (cause) {
      if (cause?.name !== 'QueueNotKept') throw cause;
      throw err('Offline_QueueFull', `offline queue for mp '${sourceMpId}' could not be kept on this device`, { retryable: false, cause });
    }
  }

  // One drain at a time: a drain asked for while one runs joins it, so a row
  // is never sent twice by two drains.
  let drainInFlight = null;

  function drainOfflineQueue(...args) {
    if (drainInFlight) return drainInFlight;
    drainInFlight = trackWork(() => drainOfflineQueueInnerTracked(...args))
      .finally(() => { drainInFlight = null; });
    return drainInFlight;
  }

  // Codes that mean "not yet", never "no": the row is sent again later.
  const UNSETTLED_CODES = new Set([
    'ActivityFailed', 'Timeout', 'Offline', 'RateLimited', 'UnknownActivity', 'UnknownTrigger',
    'ACCOUNT_NOT_DISPLAYED', 'ACCOUNT_PERMISSIONS_UNKNOWN',
  ]);

  // No answer came back at all: status 0, or the fetch itself threw. Any HTTP
  // status means the server answered.
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

  /**
   * A queued row is settled when the server answered a 4xx other than 401, 408
   * and 429, or, with no HTTP answer, the activity's own error is final (not
   * retryable and not in UNSETTLED_CODES). Anything else is sent again.
   */
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
    const bySource = new Map();
    for (const row of ownQueuedRows()) {
      const list = bySource.get(row.sourceMpId) || [];
      list.push(row);
      bySource.set(row.sourceMpId, list);
    }
    const results = [];
    for (const [, rows] of bySource) {
      rows.sort((a, b) => a.seq - b.seq); // FIFO per source MP
      for (const row of rows) {
        // A write still running in this page holds its row: it is not sent a
        // second time alongside itself, and its Mini Program's later rows wait.
        if (queueStore.isHeld?.(row)) break;
        // Its write was answered while this drain sent the rows before it.
        if (!queueStore.all().some((queued) => queued.seq === row.seq)) continue;
        const envelope = row.envelope;
        if (row.id) drainingRows.add(row.id);
        // eslint-disable-next-line no-await-in-loop
        const outcome = await (envelope.trigger
          ? dispatchEmit(envelope)
          // ORIGINAL key. `restoreQueuedAt` is the moment the row entered the
          // durable queue (recorded by durable-queue.js on push) — the one fact a
          // replayed write can carry about how long it waited, and the runtime
          // sets it here so no MP can forge it.
          : dispatchInvoke({
            ...envelope, rpcDeadlineAt: undefined, restoreReplay: true, restoreDrain: true, restoreQueuedAt: row.queuedAt, idempotencyKey: envelope.idempotencyKey,
          }))
          .then((result) => ({ ok: true, result }))
          .catch((error) => ({ ok: false, error }))
          .finally(() => { if (row.id) drainingRows.delete(row.id); });
        results.push(outcome);
        // A row not settled stays queued, and so do the rows its Mini Program
        // queued after it (a clock-out never goes before its clock-in). Its
        // receipt reads as tried and not sent.
        if (!outcome.ok && !refusedForGood(outcome.error)) {
          queueStore.noteAttempt?.(row.seq);
          break;
        }
        queueStore.remove(row.seq);
        if (typeof onOfflineOutcome === 'function') {
          try {
            Promise.resolve(onOfflineOutcome(envelope, outcome)).catch(() => {});
          } catch (_) { /* An observer cannot interrupt FIFO replay. */ }
        }
      }
    }
    return results;
  }

  // --- public surface ---------------------------------------------------------

  return {
    /** Register a manifest already validated by @tommy/manifest. */
    registerMp(manifest, { handlers, firstParty } = {}) {
      mps.set(manifest.id, {
        manifest,
        handlers: handlers || {},
        firstParty: firstParty !== undefined ? firstParty : manifest.publisher?.type === 'first_party',
      });
      // Release anything waiting on this MP to arrive (see `expectedMps`).
      expectedMps.delete(manifest.id);
      const waiters = registrationWaiters.get(manifest.id);
      if (waiters) {
        registrationWaiters.delete(manifest.id);
        for (const done of [...waiters]) done();
      }
    },

    /**
     * Announce the MPs the host is about to register; a dispatch to one waits
     * for it instead of failing as unknown. An MP announced and never registered
     * costs every caller `registrationTimeoutMs`, so call `stopExpecting()` for
     * any that drops out.
     */
    expectMps(mpIds = []) {
      for (const mpId of mpIds) if (mpId && !mps.has(mpId)) expectedMps.add(mpId);
    },

    /** Withdraw an announcement, releasing its waiters to fail now as not registered. */
    stopExpecting(mpId) {
      expectedMps.delete(mpId);
      const waiters = registrationWaiters.get(mpId);
      if (waiters) {
        registrationWaiters.delete(mpId);
        for (const done of [...waiters]) done();
      }
    },

    unregisterMp(mpId) { mps.delete(mpId); },

    /** Per-tenant Action state (server is system of record; this is the device projection). */
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
        // Keep the revision tombstone: an older concurrent list response must
        // not resurrect the override after a reset has committed.
        actionState.set(key, { inherited: true, revision });
        return;
      }
      if (action?.required && enabled === false) {
        throw err('PermissionDenied', `action '${actionId}' is required and cannot be disabled`, { rule: 'actions.required', retryable: false });
      }
      actionState.set(key, { enabled: enabled !== undefined ? enabled : prev.enabled,
        options: options !== undefined ? options : prev.options, revision, inherited: false });
    },

    // --- manifest-driven settings ---------------------------------------------
    // The device-side per-tenant settings read model shared by the renderer,
    // `tommy.settings.get()` and `{ from: setting }` predicates; the system of
    // record is each field's declared `store`.
    setSettingState(tenantId, mpId, values = {}) {
      const key = `${tenantStateKey(tenantId)}:${mpId}`;
      settingState.set(key, { ...(settingState.get(key) || {}), ...values });
      // A condition may read a setting.
      invalidateConditionCache(tenantId);
    },

    /**
     * A copy of this MP's own settings. Another MP's settings are read only
     * through a declared `{ from: setting, mp }` source.
     */
    settingsFor(tenantId, mpId) {
      return { ...(settingState.get(`${tenantStateKey(tenantId)}:${mpId}`) || {}) };
    },

    /** Declared settings pages: the display side the projection omits. */
    settingsCatalog() {
      const out = [];
      for (const [mpId, entry] of mps) {
        for (const page of entry.manifest.contributions?.settings || []) {
          out.push({ mpId, page });
        }
      }
      return out;
    },

    /**
     * The one predicate evaluator every platform gate uses. Callers pass
     * resolved source values; they never compare.
     */
    evaluatePredicate: evaluateDeclaredPredicate,

    /**
     * `tenantId`: the subscribing instance's tenant. The subscription then
     * hears only that tenant's emits; without it, every tenant's.
     */
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

    /** Inspector surface: query + replay. */
    records: {
      query: (filter) => records.query(filter),
      get: (runId) => records.get(runId),
    },

    /**
     * Re-dispatch a failed invoke with its original args (same key or a new
     * one), with host authority, attributed to the original source MP.
     */
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

    /**
     * Manifest-side display metadata for each registered Action, which the
     * server's per-tenant state payload omits. Read-only.
     */
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

    setOnline(value) { isOnline = !!value; },
    isOnline: () => isOnline,
    drainOfflineQueue,
    queueStats() {
      const rows = ownQueuedRows();
      const bySource = {};
      const bytesBySource = {};
      for (const row of rows) {
        bySource[row.sourceMpId] = (bySource[row.sourceMpId] || 0) + 1;
        bytesBySource[row.sourceMpId] = (bytesBySource[row.sourceMpId] || 0) + (row.bytes || 0);
      }
      // `expiredOnLoad` is the one path that discards an accepted write, so it
      // is reported for the host to surface.
      return {
        total: rows.length,
        bySource,
        bytesBySource,
        bytesCap: QUEUE_MAX_BYTES,
        entriesCap: QUEUE_MAX_ENTRIES,
        expiredOnLoad: queueStore.expiredOnLoad(),
      };
    },

    /**
     * One Mini Program's waiting writes, as receipts its own surface can show
     * after a reload (the queue's own receipts, never a second draft
     * list): `[{ id, activity, args, queuedAt, attempts, state }]` in the
     * order they will be sent. `state` is `sending` (on its way now),
     * `failed` (sent and not settled; it is sent again) or `queued`. Only
     * rows of this broker's person and account; `args` are a copy.
     */
    queuedWrites(sourceMpId) {
      return ownQueuedRows()
        .filter((row) => row.sourceMpId === sourceMpId && row.envelope?.activity && row.id)
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
          };
        });
    },

    /**
     * Discard one of this Mini Program's waiting writes by its receipt id, so
     * it is never sent. False, and nothing changes, for a row on its way
     * (held by its running write, or being sent by a drain), another Mini
     * Program's, another person's or account's, or one that has left the queue.
     */
    discardQueuedWrite(sourceMpId, id) {
      if (typeof id !== 'string' || !id) return false;
      const row = ownQueuedRows().find((queued) => queued.id === id && queued.sourceMpId === sourceMpId);
      if (!row || !row.envelope?.activity || queueStore.isHeld?.(row) || drainingRows.has(row.id)) return false;
      return queueStore.remove(row.seq);
    },

    /** Diagnostics: idempotent runs in flight, and the joins waiting on them. */
    inflightStats() {
      let waiting = 0;
      for (const entry of inflightInvokes.values()) waiting += entry.waiters.size;
      return { runs: inflightInvokes.size, waiting };
    },

    /** Host retention must not retire a running action or delayed delivery. */
    hasPendingWork: () => pendingWork > 0 || debouncePending.size > 0,
    async teardown(instanceId) {
      if (instanceId != null) return;
      retired = true;
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
