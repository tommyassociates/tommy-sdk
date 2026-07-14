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
import { DEFAULT_THROTTLE_PROFILE, QUEUE_MAX_ENTRIES, QUEUE_MAX_BYTES, SYNC_EMIT_TIMEOUT_MS, DEFAULT_RETRY } from './constants.js';
import { createRecordStore } from './records.js';
import { validateToken } from './capability.js';

const err = (code, message, extra = {}) => new TommyError({ code, message, ...extra });

const dayKey = (ts) => new Date(ts).toISOString().slice(0, 10);

/** inputMap sources the M1 broker EXECUTES (harden round-1: base four + default). */
const M1_SOURCES = new Set(['trigger', 'condition', 'option']);

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
  const subscribers = new Map();      // trigger -> Set<{mpId, handler}>
  const actionState = new Map();      // `${tenantId}:${mpId}:${actionId}` -> {enabled, options}
  const processedKeys = new Map();    // `${activity}:${idempotencyKey}` -> stored result
  const conditionCache = new Map();   // `${tenantId}:${condition}:${argsJson}` -> {value, expiresAt}
  const suppressionTally = new Map(); // `${tenantId}:${trigger}:${day}` -> count
  const debouncePending = new Map();  // `${trigger}:${emitterMpId}` -> {timer, resolvers}
  const invokeChains = new Map();     // sourceMpId -> tail promise (FIFO per source MP)
  const txnSteps = new Map();         // txnId -> [{activity, args, idempotencyKey}]
  const chainBudget = new Map();      // rootRunId -> total run count
  const buckets = new Map();          // `${mpId}:${kind}` -> {tokens, updatedAt}
  const queue = [];                   // offline queue rows {sourceMpId, envelope, bytes, seq}
  let queueSeq = 0;
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
    const callerIsTarget = callerMpId === targetMpId;
    const callerFirstParty = mps.get(callerMpId)?.firstParty === true;
    const allowed = Array.isArray(callers) && callers.length
      ? callers.includes(callerMpId) || callerIsTarget
      : callerIsTarget || callerFirstParty; // default-deny: first-party + same-MP only
    if (!allowed) {
      throw err('PermissionDenied', `activity '${qualify(targetMpId, activityName)}' does not list '${callerMpId}' in authorizedCallers`, {
        rule: `activities.${activityName}.authorizedCallers`,
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

  // --- Active Trigger Index (D21) -------------------------------------------

  function actionKey(tenantId, mpId, actionId) { return `${tenantId}:${mpId}:${actionId}`; }

  function actionsForTrigger(tenantId, triggerQualified) {
    const wired = [];
    for (const [mpId, entry] of mps) {
      const actions = entry.manifest.actions || {};
      for (const [actionId, action] of Object.entries(actions)) {
        const srcMp = action.trigger.mp || mpId;
        if (qualify(srcMp, action.trigger.name) !== triggerQualified) continue;
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

  async function runAction(tenantId, triggerPayload, wiredAction, chain, identity) {
    const { mpId, actionId, action, options } = wiredAction;

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
    const triggerDef = ownerEntry?.manifest.triggers?.[triggerName];
    if (!triggerDef) throw err('UnknownTrigger', `trigger '${triggerQualified}' is not declared by any registered MP`, { retryable: false });
    validateAgainst(triggerDef.payloadSchema, envelope.payload, 'InvalidPayload', `trigger '${triggerQualified}' payload`);

    // D21 emit-side short-circuit: no enabled consumer -> suppress (tally only).
    if (!triggerIsActive(tenantId, triggerQualified)) {
      const key = `${tenantId}:${triggerQualified}:${dayKey(now())}`;
      suppressionTally.set(key, (suppressionTally.get(key) || 0) + 1);
      return { emitId: `suppressed-${key}`, deliveredTo: 0, queuedFor: 0, suppressed: true };
    }

    // Offline: durable queue, resolve queuedFor (actions-runtime.md §1.5).
    if (!isOnline) {
      enqueueOffline(emitterMp, { ...envelope, identity });
      return { emitId: `queued-${queueSeq}`, deliveredTo: 0, queuedFor: 1 };
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

  async function dispatchQuery(envelope) {
    const identity = envelope.identity || authenticate(envelope);
    const tenantId = envelope.tenantId || identity.tenantId;
    takeToken(envelope.sourceMpId, 'query');

    const [ownerMpId, conditionName] = splitQualified(envelope.condition);
    const ownerEntry = mps.get(ownerMpId);
    const conditionDef = ownerEntry?.manifest.conditions?.[conditionName];
    if (!conditionDef) throw err('UnknownCondition', `condition '${envelope.condition}' is not registered`, { retryable: false });
    validateAgainst(conditionDef.inputSchema, envelope.args, 'InvalidPayload', `condition '${envelope.condition}' args`);

    const cacheKey = `${tenantId}:${envelope.condition}:${JSON.stringify(envelope.args)}`;
    if (conditionDef.cacheable) {
      const hit = conditionCache.get(cacheKey);
      if (hit && hit.expiresAt > now()) return hit.value;
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
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(err('Timeout', `condition '${envelope.condition}' exceeded latencyBudgetMs ${budget}`, { retryable: false, runId: record.runId })), budget);
    });
    try {
      const value = await Promise.race([Promise.resolve(handler(envelope.args, { tenantId })), timeout]);
      validateAgainst(conditionDef.returnSchema, value, 'ConditionError', `condition '${envelope.condition}' return`);
      await records.update(record.runId, { status: 'succeeded', result: value });
      if (conditionDef.cacheable) {
        conditionCache.set(cacheKey, { value, expiresAt: now() + (conditionDef.cacheTtlMs || 0) });
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

  async function dispatchInvoke(envelope) {
    const sourceMpId = envelope.sourceMpId;
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
    const ownerEntry = mps.get(ownerMpId);
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
    const processedKey = idempotencyKey && `${envelope.activity}:${idempotencyKey}`;
    if (processedKey && processedKeys.has(processedKey)) {
      // Repeat key -> stored prior result, not re-applied (§3.2).
      return { ...processedKeys.get(processedKey), idempotentReplay: true };
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
        const result = await executeInvoke(envelope, activityDef, ownerEntry, ownerMpId, activityName, record);
        if (result.status && result.status === 'failed') throw err('ActivityFailed', result.error?.message || 'executor reported failure', { retryable: false });
        validateAgainst(activityDef.resultSchema, result.result, 'ActivityFailed', `activity '${envelope.activity}' result`);
        const final = { rpcId: record.runId, status: 'succeeded', result: result.result };
        await records.update(record.runId, { status: 'succeeded', result: result.result });
        if (processedKey) processedKeys.set(processedKey, final);
        if (envelope.txnId) {
          const steps = txnSteps.get(envelope.txnId) || [];
          steps.push({ activity: envelope.activity, args: envelope.args, idempotencyKey });
          txnSteps.set(envelope.txnId, steps);
        }
        // §2.5 cache invalidation: owner's server_write invalidates its condition cache.
        if (activityDef.sideEffect === 'server_write') {
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
    const partition = queue.filter((row) => row.sourceMpId === sourceMpId);
    const partitionBytes = partition.reduce((sum, row) => sum + row.bytes, 0);
    if (partition.length >= QUEUE_MAX_ENTRIES || partitionBytes + bytes > QUEUE_MAX_BYTES) {
      throw err('Offline_QueueFull', `offline queue full for mp '${sourceMpId}' (${partition.length} entries)`, { retryable: false });
    }
    queueSeq += 1;
    queue.push({ sourceMpId, envelope, bytes, seq: queueSeq });
  }

  async function drainOfflineQueue() {
    const bySource = new Map();
    for (const row of queue.splice(0)) {
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

    subscribe(mpId, trigger, handler) {
      const qualified = trigger.includes('.') ? trigger : qualify(mpId, trigger);
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

    setOnline(value) { isOnline = !!value; },
    isOnline: () => isOnline,
    drainOfflineQueue,
    queueStats() {
      const bySource = {};
      for (const row of queue) bySource[row.sourceMpId] = (bySource[row.sourceMpId] || 0) + 1;
      return { total: queue.length, bySource };
    },

    async teardown() { /* flush semantics: nothing buffered at M1 beyond debounce */ },
  };
}
