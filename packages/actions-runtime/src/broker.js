/**
 * broker.js — the host broker (actions-runtime.md §§1-9, mode-independent).
 *
 * The trusted mediator: every cross-MP message passes through here.
 * Enforcement — capability tokens, default-deny authz, throttle profiles,
 * loop/cascade caps, schema validation, action-run records — lives HERE,
 * never in SDK code (the SDK validates for DX only).
 *
 * M1 scope (sdk-broker spec + harden round-1):
 *  - direct-adapter entry points (emit/query/invoke/rollbackTransaction/subscribe)
 *  - emission modes async/debounced/sync; condition memoisation §2.5
 *  - inputMap: base four sources + default EXECUTED; E1–E7 shapes carried in
 *    types but rejected with a named not-implemented error
 *  - Active Trigger Index (D21): emit-side short-circuit + per-(trigger,day)
 *    suppression tally; never applied to non-Action data/security signals
 *    (M1 broker carries Actions only, so the exemption is structural)
 *  - offline queue (FIFO per source MP, caps 500/5MB, original-key replay)
 *  - action-run records + the query/replay surface the inspector consumes
 *  - server_write forwards to the injected `serverInvoke` seam (the F0 typed
 *    client's invoke — contract envelope; NEVER an endpoint literal here)
 */
import { TommyError, isTommyError } from '@tommy/sdk';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import {
  DEFAULT_THROTTLE_PROFILE, QUEUE_MAX_ENTRIES, QUEUE_MAX_BYTES, SYNC_EMIT_TIMEOUT_MS, DEFAULT_RETRY,
  SENSITIVE_CONDITIONS, domainScopeForMp,
} from './constants.js';
import { createRecordStore } from './records.js';
import { createIdempotencyLedger } from './idempotency-ledger.js';
import { createDurableQueue } from './durable-queue.js';
import { validateToken } from './capability.js';
import { evaluatePredicate as evaluateDeclaredPredicate } from './predicate.js';

const err = (code, message, extra = {}) => new TommyError({ code, message, ...extra });

const dayKey = (ts) => new Date(ts).toISOString().slice(0, 10);

/** inputMap sources the M1 broker EXECUTES (harden round-1: base four + default). */
const M1_SOURCES = new Set(['trigger', 'condition', 'option']);

/**
 * Memory bounds (memory audit, 2026-08): broker-lifetime maps are CACHES, not
 * ledgers — a day-long session grew both without limit. Each carries a hard
 * cap; eviction changes cost (a recompute / a re-apply), never correctness.
 */
const CONDITION_CACHE_MAX = 500;
/** Mirrors the idempotency-ledger's DEFAULT_MAX idiom: insertion order IS
 *  eviction order (FIFO). */
const PROCESSED_KEYS_MAX = 1000;
/** Keys whose RESULT was released but whose already-applied fact must survive
 *  — far cheaper per entry, so it holds an order of magnitude more. */
const APPLIED_KEYS_OVERFLOW_MAX = 10000;

/**
 * Platform-provided triggers, available on EVERY registered MP's namespace
 * without the MP declaring them. Closed set, in-binary — the same firewall the
 * predicate operators sit behind.
 *
 * `settings.changed` — the manifest-driven settings engine fires it after a
 * setting of that MP actually moves, carrying { changedKeys }. A no-op write
 * fires nothing.
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
 * FNV-1a 32-bit over the stable form — the derived Action key must fit the
 * frozen invoke-envelope's idempotencyKey maxLength (128); raw JSON does not.
 * Same logical event ⇒ same hash; the server's (member, shift|day) upsert is
 * the true duplicate guard, the key is the exactly-once ledger handle.
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

export function createBroker({
  capabilityService,
  recordBackend,
  serverInvoke,
  now = () => Date.now(),
  online = true,
  throttleOverrides = {},
  // --- enforcement flags (Class F). Default OFF: turning one ON requires the
  // matching manifest declarations to exist first (grants / read: scopes), so
  // each flips in its own wave once the estate declares them. ---
  /**
   * F1: treat `authorizedCallers: []` as deny-all-cross-MP, not "unset".
   * Governs ONLY that legacy spelling — `callerPolicy: owner_only` says the same
   * thing unconditionally and is not gated on this flag (D.40).
   */
  strictEmptyCallers = false,
  /** F2: cross-MP condition reads require a `read:<owner>.<condition>` scope. */
  enforceConditionScopes = false,
  /** F3/F4: emit must own the trigger namespace; subscribe must be granted. */
  strictEmitOwnership = false,
  /** C1/Option B: `{ mpId: 'domain' }` overrides for read-scope derivation. */
  domainScopeOverrides = {},
  /** C1/Option B: primitives derivation must not grant (defaults to the exported set). */
  sensitiveConditions = SENSITIVE_CONDITIONS,
  /**
   * D.39 (c) — the DURABLE half of the idempotency ledger. Defaults to a
   * storage-detecting ledger, so the shell gets persistence with no wiring and
   * node/tests keep exactly today's memory-only behaviour. Injectable for tests.
   * Pass `null` to disable persistence outright.
   */
  idempotencyLedger = createIdempotencyLedger(),
  /**
   * D.43 — the offline queue's durable half. Same seam and same reasoning as
   * the ledger above: it detects storage itself, so the shell gets persistence
   * with no wiring and node/tests keep today's memory-only behaviour. Pass
   * `null` to disable persistence outright.
   */
  offlineQueue = createDurableQueue({ now }),
  /**
   * How long a dispatch waits for an EXPECTED-but-unregistered MP (see
   * `expectedMps` below) before giving up and raising the ordinary
   * Unknown{Condition,Activity}. Only ever applies to an MP the host announced
   * through `expectMps()` and only while it has not registered, so it can never
   * delay a call to an MP that is genuinely absent. Deliberately larger than a
   * condition's own `latencyBudgetMs`: this is bundle fetch + eval on a cold
   * radio, not a query.
   */
  registrationTimeoutMs = 8000,
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
  // PROVIDER READINESS — the registration race, made waitable.
  //
  // An MP registers only once its bundle has been fetched and evaluated, and the
  // host mounts each MP's surfaces AS SOON AS THAT MP registers rather than
  // blocking the route on the whole fan-out (mp-loader/index.js
  // `mountReadySurfacesFor`, the instant-boot optimisation). So a panel can be
  // live and querying while a DIFFERENT MP it consumes is still mid-fetch — and
  // the consumer sees `UnknownCondition`, which is indistinguishable from
  // "that MP is not installed" and is usually swallowed by a safeQuery default.
  // Measured on `availability/main`, 2026-08-21: all four `leave.*` reads failed
  // with `condition 'leave.leave_requests' is not registered` while the SAME
  // boot summary reported `mps: 2, mounted: 2` — leave was installed, loading,
  // and simply had not got there yet.
  //
  // `expectMps()` lets the host declare the set it is ABOUT to register, so the
  // broker can tell "not yet" from "not installed" and await the first rather
  // than failing it. Nothing waits on an MP the host never announced, so an
  // absent MP still fails fast, exactly as before.
  const expectedMps = new Set();      // announced by the host, not yet registered
  const registrationWaiters = new Map(); // mpId -> Set<resolve>
  const subscribers = new Map();      // trigger -> Set<{mpId, handler}>
  const actionState = new Map();      // `${tenantId}:${mpId}:${actionId}` -> {enabled, options}
  const settingState = new Map();     // `${tenantId}:${mpId}` -> { key: value } (manifest-driven settings projection)
  const processedKeys = new Map();    // `${tenantId}:${activity}:${idempotencyKey}` -> stored result (FIFO cap PROCESSED_KEYS_MAX)
  const appliedKeysOverflow = new Set(); // keys evicted from processedKeys — the fact survives, the result does not
  const conditionCache = new Map();   // `${tenantId}:${condition}:${argsJson}` -> {value, expiresAt} (cap CONDITION_CACHE_MAX)
  // Bumped by EVERY condition-cache invalidation. The late-value salvage runs
  // detached, long after its dispatch returned, so it must be able to tell that
  // the world moved underneath it — see `conditionCacheEpoch` at its call site.
  let conditionCacheEpoch = 0;
  const suppressionTally = new Map(); // `${tenantId}:${trigger}:${day}` -> count
  const debouncePending = new Map();  // `${trigger}:${emitterMpId}` -> {timer, resolvers}
  const invokeChains = new Map();     // sourceMpId -> tail promise (FIFO per source MP)
  const executingChains = new Map();  // sourceMpId -> depth of handler execution ON that chain (F6)
  const txnSteps = new Map();         // txnId -> [{activity, args, idempotencyKey}]
  const chainBudget = new Map();      // rootRunId -> total run count
  const buckets = new Map();          // `${mpId}:${kind}` -> {tokens, updatedAt}
  // Offline queue rows {sourceMpId, envelope, bytes, seq, queuedAt}. The store
  // owns the array and persists it (D.43); `null` opts out of persistence, and
  // gets a storage-less instance rather than a second code path.
  const queueStore = offlineQueue || createDurableQueue({ now, storage: null });
  let isOnline = online;

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

  function takeToken(mpId, kind) {
    const profile = throttleProfileFor(mpId);
    const perMin = { emit: profile.emitsPerMin, query: profile.queriesPerMin, invoke: profile.invokesPerMin }[kind];
    const key = `${mpId}:${kind}`;
    const bucket = buckets.get(key) || { tokens: profile.burst, updatedAt: now() };
    const elapsed = (now() - bucket.updatedAt) / 60000;
    bucket.tokens = Math.min(profile.burst, bucket.tokens + elapsed * perMin);
    bucket.updatedAt = now();
    if (bucket.tokens < 1) {
      buckets.set(key, bucket);
      throw err('RateLimited', `mp '${mpId}' exceeded ${kind} rate (${perMin}/min, burst ${profile.burst})`, { retryable: true });
    }
    bucket.tokens -= 1;
    buckets.set(key, bucket);
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
    // `callerPolicy` (D.40, ruled 2026-08-12) states the answer outright and is
    // AUTHORITATIVE wherever it appears. `authorizedCallers` alone can only say
    // `listed` unambiguously — its other two cases are carried by the SHAPE of
    // the value (empty array / absent field), which is indistinguishable from an
    // author who forgot. The estate's 58 owner-only activities were migrated to
    // `callerPolicy: owner_only`, so the explicit-[] branch below is legal but
    // unpopulated; it is kept so nothing that validated before stops validating.
    //
    // Three distinct cases either way (F1 — they used to be two):
    //  - non-empty list  -> that list (plus the owner itself)      = `listed`
    //  - EXPLICIT []     -> the author said "nobody may call this cross-MP";
    //                       only the owner. Gated on `strictEmptyCallers`,
    //                       which tommy-app's mp-loader sets ON. Spell this
    //                       `callerPolicy: owner_only` instead.
    //  - unset           -> first-party default (NOT default-deny: any
    //                       registered first-party MP may call it)
    //                                                              = `first_party`
    const explicitEmpty = Array.isArray(callers) && callers.length === 0;

    // ONE CODE PATH (totality step 3, ruled 2026-08-14). This used to be a
    // declared-policy table with a THREE-CASE FALLBACK beside it for activities
    // declaring no `callerPolicy`, so the same three answers were spelled twice
    // and could drift apart. Step 3 as originally filed said DELETE the
    // fallback — but `callerPolicy` is deliberately still OPTIONAL (making it
    // `required` breaks a published v1 contract, so it is deferred to the next
    // manifestVersion bump), and deleting the fallback would leave `allowed`
    // UNDEFINED for a manifest that legally omits the field: default-DENY, for
    // exactly the third-party author the deferral was protecting.
    //
    // So NORMALISE instead of deleting. The effective policy is derived once,
    // from the declared value or from what the legacy shape MEANT, and the
    // single table below decides. Same one path, no unreachable branch, and an
    // omitting manifest keeps its documented default instead of silently
    // becoming uninvokable.
    const effectivePolicy = policy
      || (Array.isArray(callers) && callers.length ? 'listed' : null)
      || ((explicitEmpty && strictEmptyCallers) ? 'owner_only' : 'first_party');
    const allowed = {
      owner_only: () => callerIsTarget,
      first_party: () => callerIsTarget || callerFirstParty,
      listed: () => callerIsTarget || (Array.isArray(callers) && callers.includes(callerMpId)),
    }[effectivePolicy]();
    if (!allowed) {
      // The rule cited stays the one the AUTHOR wrote — an activity that said
      // `listed` through a bare `authorizedCallers` must not be told it failed
      // a `callerPolicy` it never declared.
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
   * Shared read-grant test for F2 (conditions) and F4 (triggers) — council C1
   * resolved to DERIVED scopes (Option B). A read of `{owner}.{primitive}` is
   * granted by ANY of:
   *
   *   1. the explicit per-primitive scope `read:{owner}.{primitive}` — mirrors
   *      the invoke convention (`invoke:{owner}.{activity}`) and stays valid as
   *      a strict superset of the derived form;
   *   2. the owner's DOMAIN scope from the fixed catalogue (`read:shifts` for
   *      scheduling, `read:attendance` for time-clock, …) — the vocabulary the
   *      manifests already declare, so most of the estate needs no new
   *      declaration at all;
   *   3. '*', the HOST authority marker (inspector replay, txn compensation) —
   *      never issuable to an MP through a capability token.
   *
   * EXCEPT for SENSITIVE_CONDITIONS, where (2) does not apply: those demand the
   * explicit per-primitive scope. Holding `read:attendance` must not hand a
   * caller `time-clock.kiosk_pin`.
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

  /**
   * F2 — condition reads were unmediated: no authz, no scope, no equivalent of
   * `authorizeInvoke`, so any MP could read any other MP's conditions
   * (kiosk PINs, vendor settings, client records). Grant resolution per
   * `readGrant` above; the same-MP (callerIsTarget) exemption mirrors invoke.
   *
   * Gated on `enforceConditionScopes` (default OFF) until the last callers
   * declare their owner-domain scopes (HANDOFF-m1-grants.md §A).
   */
  function authorizeQuery(callerMpId, ownerMpId, conditionName, scopes) {
    if (!enforceConditionScopes) return;
    if (callerMpId === ownerMpId) return; // an MP always reads its own conditions
    const grant = readGrant(ownerMpId, conditionName);
    if (!holdsReadGrant(scopes || [], grant)) {
      throw err('PermissionDenied', grant.denialMessage, { rule: 'permissions', retryable: false });
    }
  }

  /**
   * F4 — `subscribe()` was completely unauthorized: any MP could subscribe to
   * any trigger and receive its payload (passive cross-MP exfiltration).
   * Subscription is a REGISTRATION, not an RPC — there is no envelope and no
   * capability token on this path — so the grant is read from the subscriber's
   * REGISTERED MANIFEST `permissions.scopes` — which, under council C1's
   * derived-scope resolution, is exactly the vocabulary that list already
   * speaks: the owner's catalogue DOMAIN scope grants its triggers, with the
   * explicit per-primitive form still accepted and SENSITIVE_CONDITIONS still
   * excluded from derivation. Trigger ownership is the other way through,
   * mirroring the same-MP exemption used by invoke/query.
   *
   * Shares `strictEmitOwnership` with F3: emit-side and subscribe-side trigger
   * authority land (and flip) together.
   */
  function authorizeSubscribe(subscriberMpId, triggerQualified) {
    if (!strictEmitOwnership) return;
    const [ownerMpId, triggerName] = splitQualified(triggerQualified);
    if (ownerMpId === subscriberMpId) return; // an MP always hears its own triggers
    const declared = mps.get(subscriberMpId)?.manifest.permissions?.scopes || [];
    const grant = readGrant(ownerMpId, triggerName);
    if (!holdsReadGrant(declared, grant)) {
      throw err('PermissionDenied', `mp '${subscriberMpId}' may not subscribe to '${triggerQualified}': ${grant.denialMessage}`, {
        rule: 'permissions', retryable: false,
      });
    }
  }

  // --- Active Trigger Index (D21) -------------------------------------------

  function actionKey(tenantId, mpId, actionId) { return `${tenantId}:${mpId}:${actionId}`; }

  /** Drop this tenant's memoised condition results (a settings write may change them). */
  function invalidateConditionCache(tenantId) {
    const prefix = `${tenantId}:`;
    conditionCacheEpoch += 1;
    for (const key of [...conditionCache.keys()]) {
      if (key.startsWith(prefix)) conditionCache.delete(key);
    }
  }

  /**
   * D.36 — `subscribe()` is grant-tested (F4) and the DECLARATIVE binding was
   * not, so an MP could consume another MP's trigger simply by naming it in an
   * Action. Same test, same vocabulary, same source: the consumer's registered
   * manifest scopes, since neither path carries a capability token.
   *
   * A binding that fails the test is DROPPED from the wiring rather than
   * throwing. The imperative path can reject at `subscribe()` because a caller
   * is waiting; here the caller is an unrelated MP's emit, and failing its emit
   * because a third party declared an ungranted Action would make one MP's
   * manifest able to break another's writes. Dropping also keeps
   * `triggerIsActive` honest — an ungranted binding is not a consumer, so the
   * emit suppresses exactly as it would with no binding at all.
   */
  function actionBindingAuthorized(consumerMpId, triggerQualified) {
    if (!strictEmitOwnership) return true;
    const [ownerMpId, triggerName] = splitQualified(triggerQualified);
    if (ownerMpId === consumerMpId) return true;
    const declared = mps.get(consumerMpId)?.manifest.permissions?.scopes || [];
    return holdsReadGrant(declared, readGrant(ownerMpId, triggerName));
  }

  function actionsForTrigger(tenantId, triggerQualified) {
    const wired = [];
    for (const [mpId, entry] of mps) {
      const actions = entry.manifest.actions || {};
      for (const [actionId, action] of Object.entries(actions)) {
        const srcMp = action.trigger.mp || mpId;
        if (qualify(srcMp, action.trigger.name) !== triggerQualified) continue;
        if (!actionBindingAuthorized(mpId, triggerQualified)) continue;
        const state = actionState.get(actionKey(tenantId, mpId, actionId))
          || { enabled: action.required ? true : action.enabledByDefault, options: action.optionsDefault || {} };
        if (action.required || state.enabled) wired.push({ mpId, actionId, action, options: state.options });
      }
    }
    return wired;
  }

  function triggerIsActive(tenantId, triggerQualified) {
    return (subscribers.get(triggerQualified)?.size || 0) > 0
      || actionsForTrigger(tenantId, triggerQualified).length > 0;
  }

  // --- dispatch internals ----------------------------------------------------

  /**
   * D.35 — an Action's dispatches run as the MP that OWNS the Action, not as
   * whoever emitted the trigger.
   *
   * `sourceMpId` was already the action owner, but the IDENTITY handed down was
   * the emitter's, and `identity.scopes` is what `authorizeQuery` judges. So an
   * Action owned by A, fired by B's emit, read A's cross-MP condition gates
   * with B's grants — wrongly allowing when B held a grant A does not, and
   * wrongly denying when A held one B does not. The attribution was wrong the
   * same way: the run record carried B's capability token.
   *
   * There is no capability token on this path (nobody made an RPC — the broker
   * is running a declared wiring), so the scopes come from the executing MP's
   * REGISTERED MANIFEST, exactly as `authorizeSubscribe` reads them for the
   * other tokenless path. The emitter's token id is kept as `causedByTokenId`
   * so the chain is still traceable to the emit that caused it.
   */
  function identityForAction(executingMpId, emitterIdentity) {
    return {
      mpId: executingMpId,
      tenantId: emitterIdentity?.tenantId,
      scopes: mps.get(executingMpId)?.manifest.permissions?.scopes || [],
      tokenId: undefined,
      causedByTokenId: emitterIdentity?.tokenId,
    };
  }

  async function runAction(tenantId, triggerPayload, wiredAction, chain, emitterIdentity) {
    const { mpId, actionId, action, options } = wiredAction;
    const identity = identityForAction(mpId, emitterIdentity);

    // Shared inputMap source resolver — base four (trigger/option/const/
    // condition) + default EXECUTED; E2 (transform) / E3 (template) rejected.
    // `conditionValues` grows as earlier condition gates resolve, so a later
    // gate's E1 input may reference an earlier gate's return (DAG order).
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

    // Condition gates — all must pass; returns readable for inputMap 'condition'
    // sources. Per 2.22 E1 a gate may PARAMETERIZE its condition via `input`
    // (assembled from the base-four sources); `args` remains valid for literals.
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

    // inputMap assembly — base four + default (harden round-1); E4-E7 rejected.
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
    // An Action-dispatched client_key activity has no caller to supply the
    // key — derive it DETERMINISTICALLY from (action, assembled args) so a
    // replayed emission of the same logical event (offline drain, retry)
    // carries the SAME key and the server's exactly-once ledger absorbs it.
    const targetDef = mps.get(targetMp)?.manifest.activities?.[binding.name];
    const derivedKey = targetDef?.idempotency === 'client_key'
      ? `act-${mpId}-${actionId}-${stableHash(args)}`.slice(0, 128)
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

  async function deliverEmit(record, payload, tenantId, identity) {
    const triggerQualified = record.triggerName;
    const chain = { rootRunId: record.rootRunId, depth: record.depth, chainPath: record.chainPath };
    const deliveries = [];

    for (const sub of subscribers.get(triggerQualified) || []) {
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

    for (const wired of actionsForTrigger(tenantId, triggerQualified)) {
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

    return deliveries;
  }

  async function dispatchEmit(envelope) {
    const identity = envelope.identity || authenticate(envelope);
    const tenantId = identity.tenantId;
    const [emitterMp] = [envelope.sourceMpId];
    takeToken(emitterMp, 'emit');

    const [ownerMpId, triggerName] = splitQualified(envelope.trigger.includes('.') ? envelope.trigger : qualify(emitterMp, envelope.trigger));
    const triggerQualified = qualify(ownerMpId, triggerName);
    const ownerEntry = mps.get(ownerMpId);
    const triggerDef = ownerEntry?.manifest.triggers?.[triggerName]
      // SYSTEM triggers are provided BY the platform ON every registered MP's
      // namespace, so no manifest declares them (and none should have to —
      // `<mpId>.settings.changed` fires because the host changed that MP's
      // settings, not because the MP asked). Only for a registered MP: an
      // unknown owner is still UnknownTrigger.
      || (ownerEntry && SYSTEM_TRIGGERS[triggerName]);
    if (!triggerDef) throw err('UnknownTrigger', `trigger '${triggerQualified}' is not declared by any registered MP`, { retryable: false });

    // F3 — owner assert. The owner is resolved from the trigger STRING and was
    // never checked against the emitter, so any MP could emit
    // `time-clock.shift_marked_absent` (or `scheduling.shift_assigned`) and
    // drive another MP's Actions. EXEMPT: the platform-emit / host-injection
    // intake — those envelopes are authenticated at the socket boundary and
    // carry a host-supplied `identity` with NO capability token, legitimately
    // emitting on the owning MP's behalf (tommy-app mp-loader/platform-emit.js).
    // Asserted BEFORE the offline enqueue, so a queued emit is checked once at
    // enqueue and its drain (which replays with `identity` attached) is not
    // re-judged.
    const hostOriginated = !envelope.capabilityToken && !!envelope.identity;
    if (strictEmitOwnership && ownerMpId !== emitterMp && !hostOriginated) {
      throw err('PermissionDenied', `mp '${emitterMp}' may not emit '${triggerQualified}' — the trigger is owned by '${ownerMpId}'`, {
        rule: 'triggers.owner', retryable: false,
      });
    }
    validateAgainst(triggerDef.payloadSchema, envelope.payload, 'InvalidPayload', `trigger '${triggerQualified}' payload`);

    // D21 emit-side short-circuit: no enabled consumer -> suppress (tally only).
    if (!triggerIsActive(tenantId, triggerQualified)) {
      const key = `${tenantId}:${triggerQualified}:${dayKey(now())}`;
      suppressionTally.set(key, (suppressionTally.get(key) || 0) + 1);
      return { emitId: `suppressed-${key}`, deliveredTo: 0, queuedFor: 0, suppressed: true };
    }

    // Offline: durable queue, resolve queuedFor (actions-runtime.md §1.5).
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
    // Emission modes.
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
    entry.timer = setTimeout(async () => {
      debouncePending.delete(key);
      for (const old of entry.superseded) {
        // eslint-disable-next-line no-await-in-loop
        await records.update(old.record.runId, { status: 'succeeded', result: { coalesced: true } });
      }
      await deliverEmit(entry.latest.record, entry.latest.payload, tenantId, identity);
      await records.update(entry.latest.record.runId, { status: 'succeeded' });
    }, debounceMs);
    debouncePending.set(key, entry);
    return { emitId: record.runId, deliveredTo: 0, queuedFor: 0, coalescing: true };
  }

  /**
   * Resolve an MP entry, WAITING for registration if the host has announced the
   * MP but its bundle has not finished loading. Returns the entry, or undefined
   * when the MP is absent, never announced, or failed to arrive in time — in
   * which case the caller raises exactly the error it raised before.
   *
   * ⚠ THE WAIT IS GATED ON THE MP BEING WHOLLY UNREGISTERED, deliberately. A
   * REGISTERED MP that lacks the named condition/activity is a manifest error,
   * and waiting on it would turn an instant, accurate failure into a timeout
   * that lies about the cause. Only "not here YET" waits.
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
   * Cap the condition cache (memory audit): on every set, once the cache
   * exceeds CONDITION_CACHE_MAX, drop EXPIRED entries first, then evict
   * oldest-by-expiresAt until within bound. Eviction costs a recompute on the
   * next read — never a wrong value.
   */
  function pruneConditionCache(justSetKey = null) {
    if (conditionCache.size <= CONDITION_CACHE_MAX) return;
    const t = now();
    for (const [key, entry] of conditionCache) {
      if (entry.expiresAt <= t) conditionCache.delete(key);
    }
    // Oldest-INSERTED first (Map order — the idempotency-ledger idiom), never
    // the entry this call just stored. Ranking by expiresAt instead meant a
    // short-TTL condition was deleted by the very prune its own set()
    // triggered, starving it on EVERY read for the rest of the session
    // (adversarial review 2026-08-31).
    for (const key of conditionCache.keys()) {
      if (conditionCache.size <= CONDITION_CACHE_MAX) break;
      if (key === justSetKey) continue;
      conditionCache.delete(key);
    }
  }

  async function dispatchQuery(envelope) {
    const identity = envelope.identity || authenticate(envelope);
    const tenantId = envelope.tenantId || identity.tenantId;
    takeToken(envelope.sourceMpId, 'query');

    const [ownerMpId, conditionName] = splitQualified(envelope.condition);
    const ownerEntry = await resolveMpEntry(ownerMpId);
    const conditionDef = ownerEntry?.manifest.conditions?.[conditionName];
    if (!conditionDef) throw err('UnknownCondition', `condition '${envelope.condition}' is not registered`, { retryable: false });

    authorizeQuery(envelope.sourceMpId, ownerMpId, conditionName, identity.scopes);
    validateAgainst(conditionDef.inputSchema, envelope.args, 'InvalidPayload', `condition '${envelope.condition}' args`);

    const cacheKey = `${tenantId}:${envelope.condition}:${JSON.stringify(envelope.args)}`;
    if (conditionDef.cacheable) {
      const hit = conditionCache.get(cacheKey);
      if (hit && hit.expiresAt > now()) return hit.value;
      // Expired: RECLAIM it, don't just skip it (memory audit) — a skipped
      // entry sat in the map until the next owner server_write, if ever.
      if (hit) conditionCache.delete(cacheKey);
    }

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
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        deadlinePassed = true;
        reject(err('Timeout', `condition '${envelope.condition}' exceeded latencyBudgetMs ${budget}`, { retryable: false, runId: record.runId }));
      }, budget);
    });
    // Captured BEFORE the handler runs, so any invalidation during the read is
    // visible to the detached salvage below.
    const epochAtDispatch = conditionCacheEpoch;
    const deadlineAwareResult = Promise.resolve(handler(envelope.args, { tenantId })).then(
      (late) => {
        if (!deadlinePassed) return late;
        Promise.resolve()
          .then(async () => {
            // ⚠ VALIDATE THE LATE VALUE TOO. The on-time path runs the
            // returnSchema gate BEFORE caching, and the read path serves a cache
            // hit without re-validating — so caching an unvalidated late value
            // made the schema guarantee conditional on the handler having been
            // FAST, and a handler that misbehaves only when slow could poison
            // every caller for the whole TTL (review round-1 finding F4). A late
            // value that fails its own contract is not worth healing with.
            validateAgainst(conditionDef.returnSchema, late, 'ConditionError', `condition '${envelope.condition}' late return`);
            // ⚠ THE RUN STAYS FAILED. The caller experienced a Timeout, and the
            // catch below has already recorded it; flipping the SAME runId to
            // `succeeded` erased that error, so a later triage of "the surface
            // failed to load" found a clean history — the same invisibility this
            // spec exists to end (review round-1 finding F5). Record the salvage
            // as its own outcome instead.
            // The status STAYS `failed` — a new vocabulary value would drop the
            // run out of every `status: 'failed'` filter an engineer would use to
            // find it, which is the opposite of the fix. The salvage rides its own
            // fields, so the timeout and its error are both still on the record.
            await records.update(record.runId, {
              lateResult: late,
              note: 'resolved after latency budget; the caller had already timed out',
            });
            // ⚠ ONLY IF THE WORLD DID NOT MOVE. This branch runs DETACHED, an
            // unbounded time after its dispatch returned — that is the whole
            // point of it. So a `server_write` that deleted these very rows can
            // land in between, sweep the cache, and then be undone by this write
            // putting the pre-delete value back for a full TTL: deleted rows
            // reappear on the next read and stay for a minute (round-2 finding
            // R2-F3). The epoch is bumped by every invalidation, so an unchanged
            // epoch is proof that nothing invalidated while this read was in
            // flight. If it moved, the value is stale by definition — drop it.
            if (conditionCacheEpoch !== epochAtDispatch) return;
            if (conditionDef.cacheable && conditionDef.cacheTtlMs > 0) {
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
      // A zero/absent TTL entry is born expired — the read path above can
      // never serve it, so storing it is pure retention (memory audit).
      if (conditionDef.cacheable && conditionDef.cacheTtlMs > 0) {
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

  function idempotencyKeyFor(activityDef, envelope) {
    switch (activityDef.idempotency) {
      case 'client_key': {
        if (!envelope.idempotencyKey) throw err('InvalidPayload', 'idempotency=client_key requires caller-supplied idempotencyKey', { retryable: false });
        return envelope.idempotencyKey;
      }
      case 'derived_from_input':
        return `d-${JSON.stringify(envelope.args)}`;
      case 'natural_key': {
        const field = activityDef.naturalKeyField || 'id';
        const value = dottedGet(envelope.args, field);
        // No such field ⇒ EVERY invocation would collide on 'n-undefined' and
        // the second distinct write would replay the first's stored result
        // (found at M3: set_mileage_status approve→reject swallowed). Fall
        // back to whole-args derivation — identical retries still replay,
        // distinct writes still apply.
        return value !== undefined ? `n-${value}` : `n-${JSON.stringify(envelope.args)}`;
      }
      // D.37 — `correlationKey` is what the two host-owned scheduled-write
      // system activities declare (`tommy.clock.schedule_follow_up` /
      // `cancel_follow_up`, api `Mp::Activities::SYSTEM_DEFINITIONS`). It fell
      // through to `default` and behaved EXACTLY as `none` — and because both
      // also declare `offlineReplayable: true`, that is precisely the
      // unkeyed-yet-replayable combination the schema forbids, hidden in the
      // one place the manifest checker cannot see (system activities bypass
      // it). A follow-up and its cancellation are the same FAMILY of fact, so
      // the key is the caller's correlation key, which both inputSchemas
      // REQUIRE — a replayed drain of the same scheduling carries the same key
      // and the ledger absorbs it.
      case 'correlationKey': {
        const value = envelope.args?.correlationKey;
        if (value === undefined || value === null || value === '') {
          throw err('InvalidPayload', 'idempotency=correlationKey requires args.correlationKey', { retryable: false });
        }
        // ⚠ THE KEY IS THE CORRELATION KEY *AND* THE REST OF THE ARGS, which is
        // a deliberate deviation from the parked note's "key on
        // args.correlationKey". Keying on the correlation key ALONE would make
        // `schedule_follow_up({correlationKey, fireAt})` un-rescheduable: moving
        // an existing follow-up to a new time is a distinct write that would be
        // swallowed and replay the first scheduling's stored result, silently.
        // That is the M3 `set_mileage_status` approve→reject failure exactly,
        // and it is why `natural_key` carries the same whole-args fallback a few
        // lines above. Identical retries and offline drains still carry
        // identical args, so they still collapse — which is the whole point.
        const rest = { ...envelope.args };
        delete rest.correlationKey;
        const tail = Object.keys(rest).length ? `-${JSON.stringify(rest)}` : '';
        return `c-${value}${tail}`;
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
   * F6 — re-entrancy. The chain for `mpId` is "executing" for exactly as long
   * as one of its dispatches is inside an activity handler/executor. A nested
   * invoke can only be issued from THERE (handler code calling
   * `tommy.actions.invoke` again), so an invoke that arrives while its own
   * chain is executing is a descendant of the dispatch holding the chain —
   * queueing it behind that dispatch is a guaranteed deadlock. It runs INLINE
   * on the running chain instead, which is also the correct ordering: the
   * ancestor is, by construction, still ahead of it.
   */
  function enterExecution(mpId) { executingChains.set(mpId, (executingChains.get(mpId) || 0) + 1); }
  function exitExecution(mpId) {
    const depth = (executingChains.get(mpId) || 0) - 1;
    if (depth > 0) executingChains.set(mpId, depth); else executingChains.delete(mpId);
  }

  async function dispatchInvoke(envelope) {
    const sourceMpId = envelope.sourceMpId;
    // Re-entrant (nested) dispatch: run inline, never behind our own ancestor.
    if (executingChains.has(sourceMpId)) return dispatchInvokeInner(envelope);
    // FIFO per source MP (§3.3): chain this dispatch after the previous one.
    const tail = invokeChains.get(sourceMpId) || Promise.resolve();
    const run = tail.catch(() => {}).then(() => dispatchInvokeInner(envelope));
    invokeChains.set(sourceMpId, run);
    return run;
  }

  async function dispatchInvokeInner(envelope) {
    const identity = envelope.identity || authenticate(envelope);
    const tenantId = envelope.tenantId || identity.tenantId;
    takeToken(envelope.sourceMpId, 'invoke');

    const [ownerMpId, activityName] = splitQualified(envelope.activity);
    // The WRITE half of the same race. A cross-MP write usually happens long
    // after boot, so it is far less likely to hit it than a panel's first read —
    // but "less likely" is how the read half survived unnoticed behind a
    // safeQuery default, and a half-fixed race is worse than a known one.
    const ownerEntry = await resolveMpEntry(ownerMpId);
    const activityDef = ownerEntry?.manifest.activities?.[activityName];
    if (!activityDef) throw err('UnknownActivity', `activity '${envelope.activity}' is not registered`, { retryable: false });

    authorizeInvoke(envelope.sourceMpId, ownerMpId, activityName, activityDef, identity.scopes);
    validateAgainst(activityDef.inputSchema, envelope.args, 'InvalidPayload', `activity '${envelope.activity}' args`);

    const chain = envelope.chain || { rootRunId: undefined, depth: 0, chainPath: [] };
    // A fresh caller-invoke IS its own chain root (record.rootRunId = runId);
    // loop/fan-out caps bound the causal TREE, so they apply to chained
    // dispatches only (§7.1 — "the full causal tree rooted at one ... emit").
    if (chain.rootRunId) checkChain(envelope.sourceMpId, `invoke(${envelope.activity})`, chain);

    const idempotencyKey = idempotencyKeyFor(activityDef, envelope);
    // F5 — TENANT-SCOPED. The ledger key used to be (activity, key) only, and
    // `derived_from_input` keys are a hash of the args alone, so the same
    // logical write in two tenants collided and the second replayed the
    // first tenant's stored result. Mirrors conditionCache/suppressionTally,
    // which were already tenant-scoped. `processedKeys` lives only for the
    // lifetime of this broker (no persistence, and the offline queue stores
    // ENVELOPES, not ledger keys), so the format change replays nothing.
    const processedKey = idempotencyKey && `${tenantId}:${envelope.activity}:${idempotencyKey}`;
    if (processedKey && processedKeys.has(processedKey)) {
      // Repeat key -> stored prior result, not re-applied (§3.2).
      return { ...processedKeys.get(processedKey), idempotentReplay: true };
    }
    if (processedKey && appliedKeysOverflow.has(processedKey)) {
      // Applied earlier this session; its result was released by the cap. The
      // write is still SUPPRESSED — the same degraded shape the durable-ledger
      // path returns when it knows the key but not the result.
      return { status: 'succeeded', idempotentReplay: true, resultRetained: false };
    }

    // D.39 (c) — the DURABLE half, consulted only after the in-memory Map
    // misses, so in-session behaviour (full replay, with the stored result) is
    // completely unchanged. A hit here means "this key was processed in an
    // EARLIER session", which the Map could never know: `client_key` promised
    // exactly-once and delivered it only until the next reload.
    //
    // The response is SUPPRESSION, not replay — there is no stored result to
    // return, because results are deliberately never persisted (the ledger
    // header explains why: `issue_kiosk_pin` returns a live PIN). Callers get
    // `idempotentReplay: true` as before, plus `resultRetained: false` so the
    // absence of `result` is a declared outcome rather than a surprise.
    //
    // ⚠ Scoped to `client_key` at the CALL SITE as well as inside the ledger.
    // Other strategies derive their key from the args, so persisting them would
    // put tenant data (a PIN, an id) on disk inside the key itself — and D.39
    // is about the caller-supplied-key case regardless.
    if (processedKey && activityDef.idempotency === 'client_key' && idempotencyLedger?.has(processedKey)) {
      return { status: 'succeeded', idempotentReplay: true, resultRetained: false };
    }

    // Offline (§7 + queue §3): replayable -> queue; else typed Offline reject.
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

    const retry = { ...DEFAULT_RETRY, ...(activityDef.retry || {}) };
    let attempt = 0;
    let lastError;
    while (attempt < Math.max(1, retry.maxAttempts)) {
      attempt += 1;
      await records.update(record.runId, { status: 'running', attempts: attempt });
      try {
        // The handler window IS the re-entrancy window (F6): a nested invoke
        // can only originate from inside it.
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
          // FIFO cap (memory audit): each entry holds a FULL activity result.
          // The RESULT is what is released — the KEY moves to a keys-only
          // overflow set, because dropping it outright silently RE-APPLIED the
          // write for natural_key/derived_from_input, which have no durable
          // ledger behind them (adversarial review 2026-08-31: a second PIN
          // rotation, a duplicate follow-up). Keys are small; results are not.
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
        // D.39 (c) — record the KEY durably (never `final`, which holds the
        // result). Only for client_key; see the read side above.
        if (processedKey && activityDef.idempotency === 'client_key') idempotencyLedger?.add(processedKey);
        if (envelope.txnId) {
          const steps = txnSteps.get(envelope.txnId) || [];
          steps.push({ activity: envelope.activity, args: envelope.args, idempotencyKey });
          txnSteps.set(envelope.txnId, steps);
        }
        // §2.5 cache invalidation: owner's server_write invalidates its condition cache.
        if (activityDef.sideEffect === 'server_write') {
          conditionCacheEpoch += 1;
          for (const key of conditionCache.keys()) {
            if (key.startsWith(`${tenantId}:${ownerMpId}.`)) conditionCache.delete(key);
          }
        }
        return final;
      } catch (cause) {
        lastError = isTommyError(cause) ? cause : err('ActivityFailed', String(cause && cause.message), { retryable: false, cause });
        if (!lastError.retryable) break;
      }
    }

    // Budget exhausted or non-retryable: dead-letter (§3.4).
    await records.update(record.runId, {
      status: 'dead_letter',
      error: { code: lastError.code, message: lastError.message },
      attempts: attempt,
    });
    throw err('ActivityFailed', `activity '${envelope.activity}' dead-lettered after ${attempt} attempt(s): ${lastError.message}`, {
      retryable: false, runId: record.runId, cause: lastError,
    });
  }

  async function rollbackTransaction(envelope) {
    const identity = envelope.identity || authenticate(envelope);
    const steps = txnSteps.get(envelope.txnId) || [];
    txnSteps.delete(envelope.txnId);
    // Reverse-order compensation via the undo_* convention (§4). Compensation
    // is dispatched BY THE BROKER with the OWNING MP's authority — undoing an
    // applied step is the owner's own activity, not a caller privilege, so
    // the caller's scope set is irrelevant here.
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

  function enqueueOffline(sourceMpId, envelope) {
    const bytes = JSON.stringify(envelope.args || envelope.payload || {}).length;
    const partition = queueStore.all().filter((row) => row.sourceMpId === sourceMpId);
    const partitionBytes = partition.reduce((sum, row) => sum + row.bytes, 0);
    if (partition.length >= QUEUE_MAX_ENTRIES || partitionBytes + bytes > QUEUE_MAX_BYTES) {
      throw err('Offline_QueueFull', `offline queue full for mp '${sourceMpId}' (${partition.length} entries)`, { retryable: false });
    }
    return queueStore.push({ sourceMpId, envelope, bytes });
  }

  async function drainOfflineQueue() {
    const bySource = new Map();
    for (const row of queueStore.takeAll()) {
      const list = bySource.get(row.sourceMpId) || [];
      list.push(row);
      bySource.set(row.sourceMpId, list);
    }
    const results = [];
    for (const [, rows] of bySource) {
      rows.sort((a, b) => a.seq - b.seq); // FIFO per source MP
      for (const row of rows) {
        const envelope = row.envelope;
        // eslint-disable-next-line no-await-in-loop
        const outcome = await (envelope.trigger
          ? dispatchEmit(envelope)
          : dispatchInvoke({ ...envelope, idempotencyKey: envelope.idempotencyKey })) // ORIGINAL key
          .then((result) => ({ ok: true, result }))
          .catch((error) => ({ ok: false, error }));
        results.push(outcome);
      }
    }
    return results;
  }

  // --- public surface ---------------------------------------------------------

  return {
    /** Register a VALIDATED manifest (validation is @tommy/manifest's job). */
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
     * Announce the MPs the host is ABOUT to register — the loading set, declared
     * before the fan-out that registers them. A dispatch to one of these waits
     * for it to arrive instead of failing as unknown; a dispatch to anything
     * else is unaffected and still fails immediately.
     *
     * Announcing is a promise the host must keep: an MP announced and never
     * registered costs every caller `registrationTimeoutMs` before failing, so
     * announce the set that is genuinely being loaded, and call
     * `stopExpecting()` for any that drops out (a failed bundle fetch, a flag
     * that resolves off). Ids already registered are ignored.
     */
    expectMps(mpIds = []) {
      for (const mpId of mpIds) if (mpId && !mps.has(mpId)) expectedMps.add(mpId);
    },

    /**
     * Withdraw an announcement — the MP is not coming after all. Releases every
     * waiter at once so they fail NOW with the honest "not registered" rather
     * than each burning the full timeout on an MP already known to be absent.
     */
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
    setActionState(tenantId, mpId, actionId, { enabled, options }) {
      const entry = mps.get(mpId);
      const action = entry?.manifest.actions?.[actionId];
      if (action?.required && enabled === false) {
        throw err('PermissionDenied', `action '${actionId}' is required and cannot be disabled`, { rule: 'actions.required', retryable: false });
      }
      const key = actionKey(tenantId, mpId, actionId);
      const prev = actionState.get(key) || {};
      actionState.set(key, { enabled: enabled !== undefined ? enabled : prev.enabled, options: options !== undefined ? options : prev.options });
    },

    // --- manifest-driven settings (P1 engine) --------------------------------
    // The per-tenant SETTINGS projection. The system of record is wherever the
    // field's declared `store` says it is (the existing workforce/team/vendor
    // stores at P1 — nothing migrated); this is the device-side read model the
    // renderer, `tommy.settings.get()` and `{ from: setting }` predicates all
    // share, so a write is live everywhere without a reload.
    setSettingState(tenantId, mpId, values = {}) {
      const key = `${tenantId}:${mpId}`;
      settingState.set(key, { ...(settingState.get(key) || {}), ...values });
      // A condition may read a setting, so a settings write invalidates this
      // tenant's memoised condition results — otherwise a cacheable condition
      // keeps answering from the pre-write world for its whole TTL.
      invalidateConditionCache(tenantId);
    },

    /**
     * This MP's OWN settings document (a copy — callers must not mutate the
     * projection). Cross-MP reads are NOT served here: an MP reads another
     * MP's setting only through a declared `{ from: setting, mp }` source,
     * whose dependency the manifest states, never by asking for a namespace
     * it did not declare.
     */
    settingsFor(tenantId, mpId) {
      return { ...(settingState.get(`${tenantId}:${mpId}`) || {}) };
    },

    /**
     * Declared settings PAGES from the registered manifests — the display side
     * the projection omits (titles, sections, field types, predicates). The
     * `actionCatalog()` precedent: state and declaration are joined on the
     * device, not duplicated over the wire.
     */
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
     * THE predicate evaluator (R4). Exposed on the broker so every gate in the
     * platform — Action `when`, interaction visibleWhen, settings
     * visibleWhen/readOnlyWhen — reaches the SAME implementation. Callers pass
     * a context bag of resolved source values; they never compare.
     */
    evaluatePredicate: evaluateDeclaredPredicate,

    subscribe(mpId, trigger, handler) {
      const qualified = trigger.includes('.') ? trigger : qualify(mpId, trigger);
      authorizeSubscribe(mpId, qualified);
      const set = subscribers.get(qualified) || new Set();
      const entry = { mpId, handler };
      set.add(entry);
      subscribers.set(qualified, set);
      return () => set.delete(entry);
    },

    emit: dispatchEmit,
    query: dispatchQuery,
    invoke: dispatchInvoke,
    rollbackTransaction,

    /** Inspector surface: query + replay (actions-runtime.md §5). */
    records: {
      query: (filter) => records.query(filter),
      get: (runId) => records.get(runId),
    },

    /**
     * Re-dispatch a failed/dead-lettered invoke with its original args (same
     * key to test idempotency, or a new one). HOST-initiated (the inspector) —
     * runs with host authority, attributed to the original source MP.
     */
    async replay(runId, { newIdempotencyKey } = {}) {
      const record = await records.get(runId);
      if (!record || record.kind !== 'invoke') throw err('UnknownActivity', `run '${runId}' is not a replayable invoke`, { retryable: false });
      return dispatchInvoke({
        sourceMpId: record.sourceMpId,
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
     * Registered-Action metadata for the Settings → Actions management UI
     * (actions-runtime.md §10 / W4) — a READ projection of the registered
     * manifests, keyed (mpId, actionId). The server `index_mp` payload carries
     * the per-tenant STATE (enabled/required/options/availability/usage); this
     * supplies the manifest-side DISPLAY metadata it omits (title/description/
     * optionsSchema/optionsDefault — the Configure form's schema). Read-only;
     * touches no state.
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
      const rows = queueStore.all();
      const bySource = {};
      for (const row of rows) bySource[row.sourceMpId] = (bySource[row.sourceMpId] || 0) + 1;
      // `expiredOnLoad` is reported rather than swallowed: dropping a row past
      // its TTL is the one path that discards an accepted write (D.43), so the
      // host can surface it instead of the write silently never appearing.
      return { total: rows.length, bySource, expiredOnLoad: queueStore.expiredOnLoad() };
    },

    async teardown() { /* flush semantics: nothing buffered at M1 beyond debounce */ },
  };
}
