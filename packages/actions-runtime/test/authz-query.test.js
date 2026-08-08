/**
 * authz-query.test.js (F2) — cross-MP condition reads need a `read:` scope.
 *
 * Gap register Class F/F2: `dispatchQuery` had no `authorizeInvoke` equivalent,
 * so any MP could read `time-clock.kiosk_pin`, `clients.client`, etc. The scope
 * name mirrors the invoke convention exactly (`read:owner.condition` against
 * `invoke:owner.activity`), including the '*' host marker and the same-MP
 * exemption. Gated on `enforceConditionScopes` (default OFF) until the
 * manifests declare the scopes.
 */
import { describe, it, expect } from 'vitest';
import { createBroker, createFakeIssuer } from '../src/index.js';

const TENANT = 'team-1';

const owner = {
  id: 'time-clock',
  version: '1.0.0',
  publisher: { type: 'first_party' },
  triggers: {},
  conditions: {
    kiosk_pin: {
      description: 'c', inputSchema: { type: 'object' }, returnSchema: { type: 'string' }, latencyBudgetMs: 100,
    },
  },
  activities: {},
  actions: {},
};

const caller = {
  id: 'timesheets', version: '1.0.0', publisher: { type: 'first_party' }, triggers: {}, activities: {}, actions: {},
  conditions: {
    own_read: {
      description: 'c', inputSchema: { type: 'object' }, returnSchema: { type: 'string' }, latencyBudgetMs: 100,
    },
  },
};

async function world({ enforceConditionScopes, scopes = [] } = {}) {
  const issuer = createFakeIssuer();
  const broker = createBroker({ capabilityService: issuer, enforceConditionScopes });
  broker.registerMp(owner, { handlers: { conditions: { kiosk_pin: () => '1234' } } });
  broker.registerMp(caller, { handlers: { conditions: { own_read: () => 'mine' } } });
  const token = await issuer.issue('timesheets', '1.0.0', TENANT, scopes, 'i-ts');
  return {
    broker,
    query: (condition) => broker.query({
      sourceMpId: 'timesheets', instanceId: 'i-ts', capabilityToken: token, condition, args: {},
    }),
  };
}

describe('dispatchQuery — condition read scopes (F2)', () => {
  it('flag OFF (default): a cross-MP read with no read: scope still succeeds', async () => {
    const w = await world();
    expect(await w.query('time-clock.kiosk_pin')).toBe('1234');
  });

  it('flag ON: a cross-MP read without the read: scope is PermissionDenied', async () => {
    const w = await world({ enforceConditionScopes: true });
    const rejection = await w.query('time-clock.kiosk_pin').catch((e) => e);
    expect(rejection.code).toBe('PermissionDenied');
    expect(rejection.message).toContain("lacks scope 'read:time-clock.kiosk_pin'");
    expect(rejection.rule).toBe('permissions');
    expect(rejection.retryable).toBe(false);
  });

  it('flag ON: the read: scope grants the cross-MP read', async () => {
    const w = await world({ enforceConditionScopes: true, scopes: ['read:time-clock.kiosk_pin'] });
    expect(await w.query('time-clock.kiosk_pin')).toBe('1234');
  });

  it('flag ON: a same-MP read is exempt (mirrors callerIsTarget on invoke)', async () => {
    const w = await world({ enforceConditionScopes: true });
    expect(await w.query('timesheets.own_read')).toBe('mine');
  });

  it("flag ON: the host authority marker '*' passes (inspector replay / Action gates)", async () => {
    const w = await world({ enforceConditionScopes: true, scopes: ['*'] });
    expect(await w.query('time-clock.kiosk_pin')).toBe('1234');
  });

  it('flag ON: an unrelated read: scope does not grant a different condition', async () => {
    const w = await world({ enforceConditionScopes: true, scopes: ['read:time-clock.something_else'] });
    const rejection = await w.query('time-clock.kiosk_pin').catch((e) => e);
    expect(rejection.code).toBe('PermissionDenied');
  });

  it('an unknown condition still fails as UnknownCondition, not PermissionDenied', async () => {
    const w = await world({ enforceConditionScopes: true });
    const rejection = await w.query('time-clock.nope').catch((e) => e);
    expect(rejection.code).toBe('UnknownCondition');
  });
});
