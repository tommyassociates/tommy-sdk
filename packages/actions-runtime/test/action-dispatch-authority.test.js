/**
 * action-dispatch-authority.test.js — the three parked broker debts (D.35,
 * D.36, D.37), all of which are about an Action running with an authority that
 * was never its own.
 *
 * D.35 — an Action's dispatches carried the EMITTER's identity. `sourceMpId`
 *   was already the action owner, but `identity.scopes` is what
 *   `authorizeQuery` judges, so an Action owned by A and fired by B's emit read
 *   A's cross-MP condition gates with B's grants. That is wrong in BOTH
 *   directions, and both are pinned here.
 *
 * D.36 — `subscribe()` is grant-tested (F4) and the DECLARATIVE binding was
 *   not, so an MP could consume another MP's trigger just by naming it in an
 *   Action. That is how leave's `create_leave_on_shift_absent` consumed
 *   `time-clock.shift_marked_absent` with no `read:attendance` declaration.
 *
 * D.37 — `correlationKey` fell through `idempotencyKeyFor`'s switch to
 *   `default: undefined`, i.e. it behaved exactly as `none`. The two host-owned
 *   `tommy.clock.*` scheduled writes declare it AND `offlineReplayable: true`,
 *   which is the combination the schema forbids — hidden in the one place the
 *   manifest checker cannot see, because system activities bypass it.
 */
import { describe, it, expect } from 'vitest';
import { createBroker, createFakeIssuer } from '../src/index.js';

// An async emission returns its receipt before the deliveries settle, so every
// assertion about what an Action DID has to let them land first — the same
// wait `action-run-records.test.js` uses.
const settle = () => new Promise((resolve) => { setTimeout(resolve, 10); });

const TENANT = 'team-1';

const trigger = () => ({ description: 't', payloadSchema: { type: 'object' }, emission: 'async' });
const condition = () => ({
  description: 'c', inputSchema: { type: 'object' }, returnSchema: { type: 'boolean' }, latencyBudgetMs: 100,
});

/* =============================================== D.35 — whose authority runs */

// clients owns a gated read; time-clock owns the trigger; leave owns the Action
// and is the MP whose grants must decide the gate.
const clients = {
  id: 'clients',
  version: '1.0.0',
  publisher: { type: 'first_party' },
  triggers: {},
  conditions: { client: condition() },
  activities: {},
  actions: {},
};

const timeClock = {
  id: 'time-clock',
  version: '1.0.0',
  publisher: { type: 'first_party' },
  triggers: { shift_marked_absent: trigger() },
  conditions: {},
  activities: {},
  actions: {},
};

const leaveWith = ({ scopes = [], bindOwnTrigger = false } = {}) => ({
  id: 'leave',
  version: '1.0.0',
  publisher: { type: 'first_party' },
  permissions: { scopes },
  triggers: { leave_created: trigger() },
  conditions: {},
  activities: {
    create_leave: {
      description: 'the action target',
      inputSchema: { type: 'object' },
      resultSchema: { type: 'object' },
      sideEffect: 'local_write',
      idempotency: 'derived_from_input',
      offlineReplayable: false,
    },
  },
  actions: {
    create_leave_on_shift_absent: {
      title: 'Create leave when a shift is marked absent',
      trigger: bindOwnTrigger
        ? { mp: 'leave', name: 'leave_created' }
        : { mp: 'time-clock', name: 'shift_marked_absent' },
      conditions: [{ name: 'client', mp: 'clients', args: {} }],
      activity: { name: 'create_leave', inputMap: {} },
      enabledByDefault: true,
      required: true,
      userConfigurable: false,
    },
  },
});

async function actionWorld({ leaveScopes = [], emitterScopes = [], enforceConditionScopes = true, strictEmitOwnership = false } = {}) {
  const issuer = createFakeIssuer();
  const broker = createBroker({ capabilityService: issuer, enforceConditionScopes, strictEmitOwnership });
  const created = [];
  broker.registerMp(clients, { handlers: { conditions: { client: () => true } } });
  broker.registerMp(timeClock, { handlers: {} });
  broker.registerMp(leaveWith({ scopes: leaveScopes }), {
    handlers: { activities: { create_leave: (args) => { created.push(args); return { ok: true }; } } },
  });
  // The EMITTER's token. Its scopes are deliberately different from the action
  // owner's — that difference is the whole subject of D.35.
  const token = await issuer.issue('time-clock', '1.0.0', TENANT, emitterScopes, 'i-tc');
  return {
    broker,
    created,
    emit: () => broker.emit({
      sourceMpId: 'time-clock', instanceId: 'i-tc', capabilityToken: token,
      trigger: 'time-clock.shift_marked_absent', payload: {},
    }),
  };
}

describe('D.35 — an Action runs as the MP that owns it', () => {
  it('the ACTION OWNER\'s grant admits the gate, even though the emitter has none', async () => {
    const w = await actionWorld({ leaveScopes: ['read:clients'], emitterScopes: [] });
    await w.emit();
    await settle();
    expect(w.created).toHaveLength(1);
    const [query] = await w.broker.records.query({ kind: 'query' });
    expect(query.sourceMpId).toBe('leave');
  });

  it('the EMITTER\'s grant does NOT admit it — the borrowed authority is gone', async () => {
    // Before the fix this passed on the emitter's scopes: `identity.scopes`
    // reached authorizeQuery unchanged, so time-clock's grant opened leave's
    // gate. Now the gate is judged on leave's own (empty) declaration.
    const w = await actionWorld({ leaveScopes: [], emitterScopes: ['read:clients'] });
    await w.emit();
    await settle();
    expect(w.created).toHaveLength(0);
    const [invokeRecord] = await w.broker.records.query({ kind: 'invoke' });
    expect(invokeRecord).toBeUndefined();
  });

  it('attributes the run to the executing MP and keeps the causing token traceable', async () => {
    const w = await actionWorld({ leaveScopes: ['read:clients'] });
    await w.emit();
    await settle();
    const [invokeRecord] = await w.broker.records.query({ kind: 'invoke' });
    expect(invokeRecord.sourceMpId).toBe('leave');
    // The emit is still the cause and still recorded under the emitter.
    const [emitRecord] = await w.broker.records.query({ kind: 'emit' });
    expect(emitRecord.sourceMpId).toBe('time-clock');
    expect(emitRecord.capabilityTokenId).toBeTruthy();
    // …but the Action's own dispatch carries no borrowed capability token.
    expect(invokeRecord.capabilityTokenId).toBeUndefined();
  });
});

/* ============================== D.36 — the declarative binding needs a grant */

async function bindingWorld({ leaveScopes = [], strictEmitOwnership = true, bindOwnTrigger = false } = {}) {
  const issuer = createFakeIssuer();
  const broker = createBroker({ capabilityService: issuer, strictEmitOwnership, enforceConditionScopes: false });
  const created = [];
  broker.registerMp(clients, { handlers: { conditions: { client: () => true } } });
  broker.registerMp(timeClock, { handlers: {} });
  broker.registerMp(leaveWith({ scopes: leaveScopes, bindOwnTrigger }), {
    handlers: { activities: { create_leave: (args) => { created.push(args); return { ok: true }; } } },
  });
  const tcToken = await issuer.issue('time-clock', '1.0.0', TENANT, [], 'i-tc');
  const leaveToken = await issuer.issue('leave', '1.0.0', TENANT, [], 'i-leave');
  return {
    broker,
    created,
    emitForeign: () => broker.emit({
      sourceMpId: 'time-clock', instanceId: 'i-tc', capabilityToken: tcToken,
      trigger: 'time-clock.shift_marked_absent', payload: {},
    }),
    emitOwn: () => broker.emit({
      sourceMpId: 'leave', instanceId: 'i-leave', capabilityToken: leaveToken,
      trigger: 'leave.leave_created', payload: {},
    }),
  };
}

describe('D.36 — declarative trigger binding is grant-tested like subscribe()', () => {
  it('an ungranted cross-MP binding does not run', async () => {
    const w = await bindingWorld({ leaveScopes: [] });
    const receipt = await w.emitForeign();
    await settle();
    expect(w.created).toHaveLength(0);
    // …and it is not a consumer at all, so the emit suppresses exactly as it
    // would with no binding declared. An ungranted wiring must not keep a
    // trigger "active".
    expect(receipt.suppressed).toBe(true);
  });

  it('the same binding runs once the consumer declares the read grant', async () => {
    const w = await bindingWorld({ leaveScopes: ['read:attendance'] });
    await w.emitForeign();
    await settle();
    expect(w.created).toHaveLength(1);
  });

  it('the explicit per-primitive scope works too, mirroring subscribe()', async () => {
    const w = await bindingWorld({ leaveScopes: ['read:time-clock.shift_marked_absent'] });
    await w.emitForeign();
    await settle();
    expect(w.created).toHaveLength(1);
  });

  it('an MP binding its OWN trigger needs no grant', async () => {
    const w = await bindingWorld({ leaveScopes: [], bindOwnTrigger: true });
    await w.emitOwn();
    await settle();
    expect(w.created).toHaveLength(1);
  });

  it('flag OFF: the binding is ungated, as it was before', async () => {
    const w = await bindingWorld({ leaveScopes: [], strictEmitOwnership: false });
    await w.emitForeign();
    await settle();
    expect(w.created).toHaveLength(1);
  });

  it('an ungranted binding does NOT break the emitting MP\'s own emit', async () => {
    // The imperative path can reject, because a caller is waiting. Here the
    // caller is an unrelated MP; failing its emit because a third party
    // declared an ungranted Action would let one manifest break another's
    // writes.
    const w = await bindingWorld({ leaveScopes: [] });
    await expect(w.emitForeign()).resolves.toBeTruthy();
  });
});

/* ================================================ D.37 — correlationKey keys */

const clockOwner = (idempotency = 'correlationKey') => ({
  id: 'clock',
  version: '1.0.0',
  publisher: { type: 'first_party' },
  triggers: {},
  conditions: {},
  activities: {
    schedule_follow_up: {
      description: 'the host-owned scheduled write',
      inputSchema: {
        type: 'object',
        required: ['correlationKey', 'fireAt'],
        properties: { correlationKey: { type: 'string' }, fireAt: { type: 'string' } },
      },
      resultSchema: { type: 'object' },
      sideEffect: 'local_write',
      idempotency,
      offlineReplayable: true,
    },
    cancel_follow_up: {
      description: 'its cancellation',
      inputSchema: {
        type: 'object',
        required: ['correlationKey'],
        properties: { correlationKey: { type: 'string' } },
      },
      resultSchema: { type: 'object' },
      sideEffect: 'local_write',
      idempotency,
      offlineReplayable: true,
    },
  },
  actions: {},
});

async function clockWorld({ idempotency } = {}) {
  const issuer = createFakeIssuer();
  const broker = createBroker({ capabilityService: issuer });
  const applied = [];
  broker.registerMp(clockOwner(idempotency), {
    handlers: {
      activities: {
        schedule_follow_up: (args) => { applied.push(args); return { scheduled: applied.length }; },
        cancel_follow_up: (args) => { applied.push(args); return { cancelled: applied.length }; },
      },
    },
  });
  const token = await issuer.issue('clock', '1.0.0', TENANT, [], 'i-clock');
  return {
    applied,
    invoke: (activity, args) => broker.invoke({
      sourceMpId: 'clock', instanceId: 'i-clock', capabilityToken: token, activity: `clock.${activity}`, args,
    }),
  };
}

describe('D.37 — correlationKey is a real idempotency strategy', () => {
  it('collapses an identical replay instead of applying it twice', async () => {
    const w = await clockWorld();
    const args = { correlationKey: 'follow-up-9', fireAt: '2026-04-01T09:00:00Z' };
    const first = await w.invoke('schedule_follow_up', args);
    const second = await w.invoke('schedule_follow_up', { ...args });
    expect(w.applied).toHaveLength(1);
    expect(second.idempotentReplay).toBe(true);
    expect(second.scheduled).toBe(first.scheduled);
  });

  // The deliberate deviation from the parked note's "key on args.correlationKey":
  // keying on the correlation key ALONE makes a follow-up un-rescheduable, and a
  // swallowed reschedule is silent. This is the M3 set_mileage_status failure.
  it('does NOT swallow a re-scheduling of the same family to a new time', async () => {
    const w = await clockWorld();
    await w.invoke('schedule_follow_up', { correlationKey: 'follow-up-9', fireAt: '2026-04-01T09:00:00Z' });
    const moved = await w.invoke('schedule_follow_up', { correlationKey: 'follow-up-9', fireAt: '2026-04-02T09:00:00Z' });
    expect(w.applied).toHaveLength(2);
    expect(moved.idempotentReplay).toBeUndefined();
  });

  it('keys the cancellation separately from the scheduling it cancels', async () => {
    const w = await clockWorld();
    await w.invoke('schedule_follow_up', { correlationKey: 'follow-up-9', fireAt: '2026-04-01T09:00:00Z' });
    const cancel = await w.invoke('cancel_follow_up', { correlationKey: 'follow-up-9' });
    expect(w.applied).toHaveLength(2);
    expect(cancel.idempotentReplay).toBeUndefined();
  });

  it('rejects an invocation with no correlation key rather than falling through to none', async () => {
    const w = await clockWorld();
    const rejection = await w.invoke('cancel_follow_up', { correlationKey: '' }).catch(e => e);
    expect(rejection.code).toBe('InvalidPayload');
    expect(rejection.message).toContain('args.correlationKey');
  });

  it('and the old behaviour is what `none` still does — nothing is keyed', async () => {
    const w = await clockWorld({ idempotency: 'none' });
    const args = { correlationKey: 'follow-up-9', fireAt: '2026-04-01T09:00:00Z' };
    await w.invoke('schedule_follow_up', args);
    await w.invoke('schedule_follow_up', { ...args });
    expect(w.applied).toHaveLength(2);
  });
});
