/**
 * authz-invoke.test.js (F1) — `authorizedCallers: []` means DENY ALL cross-MP,
 * not "unset". Gap register Class F/F1: the authz ternary collapsed the empty
 * array into the unset branch, so 52 activities that declare `[]` (all of
 * time-clock's, timesheets', scheduling's) were callable by any first-party MP.
 *
 * The strict reading lands behind `strictEmptyCallers` (default OFF) because
 * the live estate has cross-MP callers that must first be granted explicitly.
 * Both flag states are asserted here, plus the first-party default path the
 * register flags as untested.
 */
import { describe, it, expect } from 'vitest';
import { createBroker, createFakeIssuer } from '../src/index.js';

const TENANT = 'team-1';

const activity = (extra = {}) => ({
  description: 'a',
  inputSchema: { type: 'object' },
  sideEffect: 'local_write',
  idempotency: 'none',
  offlineReplayable: false,
  retry: { maxAttempts: 1 },
  ...extra,
});

const manifest = (id, publisherType, activities) => ({
  id,
  version: '1.0.0',
  publisher: { type: publisherType },
  triggers: {},
  conditions: {},
  activities,
  actions: {},
});

/**
 * time-clock owns three activities: one with an EXPLICIT empty caller list,
 * one with no list at all, one with a non-empty list. timesheets (first party)
 * and acme (third party) are the callers.
 */
async function world({ strictEmptyCallers } = {}) {
  const issuer = createFakeIssuer();
  const broker = createBroker({ capabilityService: issuer, strictEmptyCallers });
  broker.registerMp(manifest('time-clock', 'first_party', {
    delete_attendance: activity({ authorizedCallers: [] }),
    touch_attendance: activity(),
    record_view: activity({ authorizedCallers: ['timesheets'] }),
  }), {
    handlers: {
      activities: {
        delete_attendance: () => ({ deleted: true }),
        touch_attendance: () => ({ touched: true }),
        record_view: () => ({ recorded: true }),
      },
    },
  });
  broker.registerMp(manifest('timesheets', 'first_party', {}), { handlers: {} });
  broker.registerMp(manifest('acme-reporting', 'third_party', {}), { handlers: {} });

  const scopes = ['invoke:time-clock.delete_attendance', 'invoke:time-clock.touch_attendance', 'invoke:time-clock.record_view'];
  const firstPartyToken = await issuer.issue('timesheets', '1.0.0', TENANT, scopes, 'i-ts');
  const thirdPartyToken = await issuer.issue('acme-reporting', '1.0.0', TENANT, scopes, 'i-acme');
  const ownerToken = await issuer.issue('time-clock', '1.0.0', TENANT, [], 'i-tc');

  const call = (mpId, instanceId, capabilityToken, name) => broker.invoke({
    sourceMpId: mpId, instanceId, capabilityToken, activity: `time-clock.${name}`, args: {},
  });
  return {
    broker,
    asFirstParty: (name) => call('timesheets', 'i-ts', firstPartyToken, name),
    asThirdParty: (name) => call('acme-reporting', 'i-acme', thirdPartyToken, name),
    asOwner: (name) => call('time-clock', 'i-tc', ownerToken, name),
  };
}

describe('authorizeInvoke — empty vs unset authorizedCallers (F1)', () => {
  it('strictEmptyCallers ON: [] denies a FIRST-PARTY cross-MP caller', async () => {
    const w = await world({ strictEmptyCallers: true });
    const rejection = await w.asFirstParty('delete_attendance').catch((e) => e);
    expect(rejection.code).toBe('PermissionDenied');
    expect(rejection.rule).toBe('activities.delete_attendance.authorizedCallers');
  });

  it('strictEmptyCallers ON: [] still allows the OWNING MP (callerIsTarget)', async () => {
    const w = await world({ strictEmptyCallers: true });
    const receipt = await w.asOwner('delete_attendance');
    expect(receipt.result).toEqual({ deleted: true });
  });

  it('strictEmptyCallers OFF (default): [] preserves the current first-party allow', async () => {
    const w = await world();
    const receipt = await w.asFirstParty('delete_attendance');
    expect(receipt.result).toEqual({ deleted: true });
  });

  it('UNSET authorizedCallers is unchanged by the flag — first-party default allow', async () => {
    const off = await world();
    const on = await world({ strictEmptyCallers: true });
    expect((await off.asFirstParty('touch_attendance')).result).toEqual({ touched: true });
    expect((await on.asFirstParty('touch_attendance')).result).toEqual({ touched: true });
  });

  it('UNSET authorizedCallers denies a THIRD-PARTY caller under both flag states', async () => {
    for (const w of [await world(), await world({ strictEmptyCallers: true })]) {
      // eslint-disable-next-line no-await-in-loop
      const rejection = await w.asThirdParty('touch_attendance').catch((e) => e);
      expect(rejection.code).toBe('PermissionDenied');
      expect(rejection.rule).toBe('activities.touch_attendance.authorizedCallers');
    }
  });

  it('a NON-EMPTY list is unchanged by the flag (listed allowed, unlisted denied)', async () => {
    const w = await world({ strictEmptyCallers: true });
    expect((await w.asFirstParty('record_view')).result).toEqual({ recorded: true });
    const rejection = await w.asThirdParty('record_view').catch((e) => e);
    expect(rejection.code).toBe('PermissionDenied');
  });

  it('an authorised caller still needs the invoke: scope', async () => {
    const issuer = createFakeIssuer();
    const broker = createBroker({ capabilityService: issuer, strictEmptyCallers: true });
    broker.registerMp(manifest('time-clock', 'first_party', { record_view: activity({ authorizedCallers: ['timesheets'] }) }), {
      handlers: { activities: { record_view: () => ({ recorded: true }) } },
    });
    broker.registerMp(manifest('timesheets', 'first_party', {}), { handlers: {} });
    const scopeless = await issuer.issue('timesheets', '1.0.0', TENANT, [], 'i-ts');
    const rejection = await broker.invoke({
      sourceMpId: 'timesheets', instanceId: 'i-ts', capabilityToken: scopeless, activity: 'time-clock.record_view', args: {},
    }).catch((e) => e);
    expect(rejection.code).toBe('PermissionDenied');
    expect(rejection.message).toContain("lacks scope 'invoke:time-clock.record_view'");
  });
});
