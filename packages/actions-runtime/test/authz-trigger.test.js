/**
 * authz-trigger.test.js (F3 + F4) — trigger authority, both directions.
 *
 * F3: the emitter must own the trigger namespace. The broker resolved the
 *     owner from the trigger string and never asserted it, so any MP could
 *     emit `time-clock.shift_marked_absent` and drive another MP's Action.
 *     The platform-emit / host-injection intake is exempt.
 * F4: subscribing was entirely unauthorized — passive cross-MP exfiltration.
 *     A cross-MP subscription now needs the trigger owner's `read:` scope in
 *     the subscriber's declared manifest permissions.
 *
 * Both ride `strictEmitOwnership` (default OFF) — the manifests declare no
 * `read:` trigger scopes yet.
 */
import { describe, it, expect } from 'vitest';
import { createBroker, createFakeIssuer } from '../src/index.js';

const TENANT = 'team-1';

const trigger = () => ({ description: 't', payloadSchema: { type: 'object' }, emission: 'async' });

const mp = (id, { triggers = {}, scopes } = {}) => ({
  id,
  version: '1.0.0',
  publisher: { type: 'first_party' },
  triggers,
  conditions: {},
  activities: {},
  actions: {},
  ...(scopes ? { permissions: { scopes } } : {}),
});

async function world({ strictEmitOwnership, subscriberScopes } = {}) {
  const issuer = createFakeIssuer();
  const broker = createBroker({ capabilityService: issuer, strictEmitOwnership });
  broker.registerMp(mp('time-clock', { triggers: { shift_marked_absent: trigger() } }), { handlers: {} });
  broker.registerMp(mp('leave', { triggers: { leave_created: trigger() }, scopes: subscriberScopes }), { handlers: {} });
  const leaveToken = await issuer.issue('leave', '1.0.0', TENANT, [], 'i-leave');
  return {
    broker,
    // 'leave' is the impostor: it emits a trigger that time-clock owns.
    emitForeign: () => broker.emit({
      sourceMpId: 'leave', instanceId: 'i-leave', capabilityToken: leaveToken, trigger: 'time-clock.shift_marked_absent', payload: {},
    }),
    emitOwn: () => broker.emit({
      sourceMpId: 'leave', instanceId: 'i-leave', capabilityToken: leaveToken, trigger: 'leave.leave_created', payload: {},
    }),
    // What tommy-app's platform-emit intake sends: host identity, no token.
    emitFromPlatform: () => broker.emit({
      sourceMpId: 'leave',
      trigger: 'time-clock.shift_marked_absent',
      payload: {},
      identity: { mpId: 'leave', tenantId: TENANT, scopes: [], tokenId: 'platform-e-1' },
    }),
    subscribeForeign: () => broker.subscribe('leave', 'time-clock.shift_marked_absent', () => {}),
    subscribeOwn: () => broker.subscribe('leave', 'leave.leave_created', () => {}),
    subscribeOwnUnqualified: () => broker.subscribe('leave', 'leave_created', () => {}),
  };
}

describe('dispatchEmit — trigger owner assert (F3)', () => {
  it('flag OFF (default): a foreign-namespace emit still goes through', async () => {
    const w = await world();
    const receipt = await w.emitForeign();
    expect(receipt.suppressed).toBe(true); // no consumer wired — D21 short-circuit
  });

  it('flag ON: emitting another MP\'s trigger is PermissionDenied', async () => {
    const w = await world({ strictEmitOwnership: true });
    const rejection = await w.emitForeign().catch((e) => e);
    expect(rejection.code).toBe('PermissionDenied');
    expect(rejection.rule).toBe('triggers.owner');
    expect(rejection.message).toContain("owned by 'time-clock'");
  });

  it('flag ON: emitting your OWN trigger is unaffected', async () => {
    const w = await world({ strictEmitOwnership: true });
    const receipt = await w.emitOwn();
    expect(receipt.suppressed).toBe(true);
  });

  it('flag ON: the platform-emit / host-injection intake is EXEMPT', async () => {
    const w = await world({ strictEmitOwnership: true });
    const receipt = await w.emitFromPlatform();
    expect(receipt.suppressed).toBe(true);
    expect(receipt.emitId).toBeTruthy();
  });

  it('flag ON: the assert runs BEFORE the offline queue (a bad emit never queues)', async () => {
    const w = await world({ strictEmitOwnership: true });
    w.broker.setOnline(false);
    const rejection = await w.emitForeign().catch((e) => e);
    expect(rejection.code).toBe('PermissionDenied');
    expect(w.broker.queueStats().total).toBe(0);
  });
});

describe('subscribe — trigger read grant (F4)', () => {
  it('flag OFF (default): a cross-MP subscription is accepted', async () => {
    const w = await world();
    expect(typeof w.subscribeForeign()).toBe('function');
  });

  it('flag ON: a cross-MP subscription without the read: scope is PermissionDenied', async () => {
    const w = await world({ strictEmitOwnership: true });
    expect(() => w.subscribeForeign()).toThrow(/lacks scope 'read:time-clock.shift_marked_absent'/);
  });

  it('flag ON: the declared read: scope grants the subscription', async () => {
    const w = await world({ strictEmitOwnership: true, subscriberScopes: ['read:time-clock.shift_marked_absent'] });
    expect(typeof w.subscribeForeign()).toBe('function');
  });

  it('flag ON: subscribing to your OWN trigger needs no scope (qualified or not)', async () => {
    const w = await world({ strictEmitOwnership: true });
    expect(typeof w.subscribeOwn()).toBe('function');
    expect(typeof w.subscribeOwnUnqualified()).toBe('function');
  });

  it('flag ON: a denied subscription registers no subscriber (payload never delivered)', async () => {
    const w = await world({ strictEmitOwnership: true });
    expect(() => w.subscribeForeign()).toThrow();
    const receipt = await w.emitFromPlatform();
    expect(receipt.suppressed).toBe(true); // still no consumer
  });
});
