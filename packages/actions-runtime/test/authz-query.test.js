/**
 * authz-query.test.js (F2) — cross-MP condition reads need a read grant.
 *
 * Gap register Class F/F2: `dispatchQuery` had no `authorizeInvoke` equivalent,
 * so any MP could read `time-clock.kiosk_pin`, `clients.client`, etc.
 *
 * Council C1 resolved the grant vocabulary to Option B — DERIVED scopes:
 *   - the owner's catalogue DOMAIN scope (`read:attendance` for time-clock,
 *     `read:shifts` for scheduling) grants that owner's conditions;
 *   - the explicit per-primitive `read:{owner}.{condition}` still works
 *     (a strict superset, mirroring `invoke:{owner}.{activity}`);
 *   - SENSITIVE_CONDITIONS are excluded from derivation — the domain scope
 *     does NOT grant them, only the explicit per-primitive scope does.
 * Gated on `enforceConditionScopes` (default OFF).
 */
import { describe, it, expect } from 'vitest';
import { createBroker, createFakeIssuer, SENSITIVE_CONDITIONS, DOMAIN_SCOPE_BY_MP, domainScopeForMp } from '../src/index.js';

const TENANT = 'team-1';

const condition = () => ({
  description: 'c', inputSchema: { type: 'object' }, returnSchema: { type: 'string' }, latencyBudgetMs: 100,
});

// time-clock's catalogue domain is `attendance`, NOT its own id — the case the
// derivation map exists for.
const owner = {
  id: 'time-clock',
  version: '1.0.0',
  publisher: { type: 'first_party' },
  triggers: {},
  conditions: { attendance_history: condition(), kiosk_pin: condition() },
  activities: {},
  actions: {},
};

const otherOwner = {
  id: 'invoicing',
  version: '1.0.0',
  publisher: { type: 'first_party' },
  triggers: {},
  conditions: { invoices_list: condition(), vendor_settings: condition() },
  activities: {},
  actions: {},
};

const caller = {
  id: 'timesheets', version: '1.0.0', publisher: { type: 'first_party' }, triggers: {}, activities: {}, actions: {},
  conditions: { own_read: condition() },
};

async function world({ enforceConditionScopes, scopes = [], sensitiveConditions, domainScopeOverrides } = {}) {
  const issuer = createFakeIssuer();
  const broker = createBroker({
    capabilityService: issuer, enforceConditionScopes, sensitiveConditions, domainScopeOverrides,
  });
  broker.registerMp(owner, { handlers: { conditions: { attendance_history: () => 'hours', kiosk_pin: () => '1234' } } });
  broker.registerMp(otherOwner, { handlers: { conditions: { invoices_list: () => 'invoices', vendor_settings: () => 'iban' } } });
  broker.registerMp(caller, { handlers: { conditions: { own_read: () => 'mine' } } });
  const token = await issuer.issue('timesheets', '1.0.0', TENANT, scopes, 'i-ts');
  return {
    broker,
    query: (cond) => broker.query({
      sourceMpId: 'timesheets', instanceId: 'i-ts', capabilityToken: token, condition: cond, args: {},
    }),
  };
}

describe('dispatchQuery — condition read scopes (F2)', () => {
  it('flag OFF (default): a cross-MP read with no scope at all still succeeds', async () => {
    const w = await world();
    expect(await w.query('time-clock.attendance_history')).toBe('hours');
    expect(await w.query('time-clock.kiosk_pin')).toBe('1234');
  });

  it('flag ON: a cross-MP read with neither scope is PermissionDenied', async () => {
    const w = await world({ enforceConditionScopes: true });
    const rejection = await w.query('time-clock.attendance_history').catch((e) => e);
    expect(rejection.code).toBe('PermissionDenied');
    expect(rejection.message).toContain("'read:time-clock.attendance_history'");
    expect(rejection.message).toContain("'read:attendance'"); // names the derived route too
    expect(rejection.rule).toBe('permissions');
    expect(rejection.retryable).toBe(false);
  });

  it('flag ON: the owner DOMAIN scope grants the read (Option B derivation)', async () => {
    const w = await world({ enforceConditionScopes: true, scopes: ['read:attendance'] });
    expect(await w.query('time-clock.attendance_history')).toBe('hours');
  });

  it('flag ON: the explicit per-primitive scope still grants the read (superset)', async () => {
    const w = await world({ enforceConditionScopes: true, scopes: ['read:time-clock.attendance_history'] });
    expect(await w.query('time-clock.attendance_history')).toBe('hours');
  });

  it("flag ON: another owner's domain scope does not leak across owners", async () => {
    const w = await world({ enforceConditionScopes: true, scopes: ['read:attendance'] });
    const rejection = await w.query('invoicing.invoices_list').catch((e) => e);
    expect(rejection.code).toBe('PermissionDenied');
    expect(rejection.message).toContain("'read:invoices'");
  });

  it('flag ON: a same-MP read is exempt (mirrors callerIsTarget on invoke)', async () => {
    const w = await world({ enforceConditionScopes: true });
    expect(await w.query('timesheets.own_read')).toBe('mine');
  });

  it("flag ON: the host authority marker '*' passes, sensitive or not", async () => {
    const w = await world({ enforceConditionScopes: true, scopes: ['*'] });
    expect(await w.query('time-clock.attendance_history')).toBe('hours');
    expect(await w.query('time-clock.kiosk_pin')).toBe('1234');
  });

  it('an unknown condition still fails as UnknownCondition, not PermissionDenied', async () => {
    const w = await world({ enforceConditionScopes: true });
    const rejection = await w.query('time-clock.nope').catch((e) => e);
    expect(rejection.code).toBe('UnknownCondition');
  });
});

describe('SENSITIVE_CONDITIONS — derivation does not reach them (C1 part 2)', () => {
  it('exports the reviewed set for tooling', () => {
    expect(SENSITIVE_CONDITIONS.has('time-clock.kiosk_pin')).toBe(true);
    expect(SENSITIVE_CONDITIONS.has('invoicing.vendor_settings')).toBe(true);
    expect(SENSITIVE_CONDITIONS.has('time-clock.attendance_history')).toBe(false);
  });

  it('the DOMAIN scope does NOT grant a sensitive condition', async () => {
    const w = await world({ enforceConditionScopes: true, scopes: ['read:attendance'] });
    const rejection = await w.query('time-clock.kiosk_pin').catch((e) => e);
    expect(rejection.code).toBe('PermissionDenied');
    expect(rejection.message).toContain('is sensitive');
    expect(rejection.message).toContain("'read:time-clock.kiosk_pin'");
    // ...while the same scope still grants the non-sensitive sibling.
    expect(await w.query('time-clock.attendance_history')).toBe('hours');
  });

  it('the EXPLICIT per-primitive scope does grant a sensitive condition', async () => {
    const w = await world({ enforceConditionScopes: true, scopes: ['read:time-clock.kiosk_pin'] });
    expect(await w.query('time-clock.kiosk_pin')).toBe('1234');
  });

  it('covers the second seeded entry (invoicing.vendor_settings)', async () => {
    const domainOnly = await world({ enforceConditionScopes: true, scopes: ['read:invoices'] });
    expect(await domainOnly.query('invoicing.invoices_list')).toBe('invoices');
    const rejection = await domainOnly.query('invoicing.vendor_settings').catch((e) => e);
    expect(rejection.code).toBe('PermissionDenied');
    const explicit = await world({ enforceConditionScopes: true, scopes: ['read:invoicing.vendor_settings'] });
    expect(await explicit.query('invoicing.vendor_settings')).toBe('iban');
  });

  it('the set is overridable per broker (review tooling / host policy)', async () => {
    const w = await world({
      enforceConditionScopes: true,
      scopes: ['read:attendance'],
      sensitiveConditions: new Set(['time-clock.attendance_history']),
    });
    expect(await w.query('time-clock.kiosk_pin')).toBe('1234');   // no longer sensitive
    const rejection = await w.query('time-clock.attendance_history').catch((e) => e);
    expect(rejection.code).toBe('PermissionDenied');              // now sensitive
  });
});

describe('domain-scope derivation map', () => {
  it('maps the MPs whose catalogue domain differs from their id', () => {
    expect(DOMAIN_SCOPE_BY_MP.scheduling).toBe('shifts');
    expect(DOMAIN_SCOPE_BY_MP['time-clock']).toBe('attendance');
    expect(domainScopeForMp('scheduling')).toBe('read:shifts');
    expect(domainScopeForMp('time-clock')).toBe('read:attendance');
  });

  it('falls back to the MP id (dashes normalised) when unmapped', () => {
    expect(domainScopeForMp('leave')).toBe('read:leave');
    expect(domainScopeForMp('care-plans')).toBe('read:care_plans');
  });

  it('accepts host overrides', async () => {
    expect(domainScopeForMp('calendar', { calendar: 'shifts' })).toBe('read:shifts');
    const w = await world({
      enforceConditionScopes: true, scopes: ['read:timekeeping'], domainScopeOverrides: { 'time-clock': 'timekeeping' },
    });
    expect(await w.query('time-clock.attendance_history')).toBe('hours');
  });
});
