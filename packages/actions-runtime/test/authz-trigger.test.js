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

async function world({ strictEmitOwnership, subscriberScopes, sensitiveConditions } = {}) {
  const issuer = createFakeIssuer();
  const broker = createBroker({ capabilityService: issuer, strictEmitOwnership, sensitiveConditions });
  broker.registerMp(mp('time-clock', { triggers: { shift_marked_absent: trigger() } }), { handlers: {} });
  broker.registerMp(mp('leave', { triggers: { leave_created: trigger() }, scopes: subscriberScopes }), { handlers: {} });
  const leaveToken = await issuer.issue('leave', '1.0.0', TENANT, [], 'i-leave');
  return {
    broker,
    emitForeign: () => broker.emit({
      sourceMpId: 'leave', instanceId: 'i-leave', capabilityToken: leaveToken, trigger: 'time-clock.shift_marked_absent', payload: {},
    }),
    emitOwn: () => broker.emit({
      sourceMpId: 'leave', instanceId: 'i-leave', capabilityToken: leaveToken, trigger: 'leave.leave_created', payload: {},
    }),
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
    expect(receipt.suppressed).toBe(true);
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

  it('flag ON: a cross-MP subscription with no read grant is PermissionDenied', async () => {
    const w = await world({ strictEmitOwnership: true });
    expect(() => w.subscribeForeign()).toThrow(/read:time-clock.shift_marked_absent/);
    expect(() => w.subscribeForeign()).toThrow(/read:attendance/);
  });

  it("flag ON: the owner's declared DOMAIN scope grants the subscription (Option B)", async () => {
    const w = await world({ strictEmitOwnership: true, subscriberScopes: ['read:attendance'] });
    expect(typeof w.subscribeForeign()).toBe('function');
  });

  it('flag ON: the explicit per-primitive scope grants the subscription (superset)', async () => {
    const w = await world({ strictEmitOwnership: true, subscriberScopes: ['read:time-clock.shift_marked_absent'] });
    expect(typeof w.subscribeForeign()).toBe('function');
  });

  it("flag ON: an unrelated owner's domain scope does not grant it", async () => {
    const w = await world({ strictEmitOwnership: true, subscriberScopes: ['read:shifts', 'read:leave'] });
    expect(() => w.subscribeForeign()).toThrow(/PermissionDenied|read:attendance/);
  });

  it('flag ON: a SENSITIVE trigger is excluded from domain derivation', async () => {
    const sensitiveConditions = new Set(['time-clock.shift_marked_absent']);
    const domainOnly = await world({ strictEmitOwnership: true, subscriberScopes: ['read:attendance'], sensitiveConditions });
    expect(() => domainOnly.subscribeForeign()).toThrow(/is sensitive/);
    const explicit = await world({
      strictEmitOwnership: true, subscriberScopes: ['read:time-clock.shift_marked_absent'], sensitiveConditions,
    });
    expect(typeof explicit.subscribeForeign()).toBe('function');
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
    expect(receipt.suppressed).toBe(true);
  });
});
