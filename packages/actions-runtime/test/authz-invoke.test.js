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

async function world({ strictEmptyCallers } = {}) {
  const issuer = createFakeIssuer();
  const broker = createBroker({ capabilityService: issuer, strictEmptyCallers });
  broker.registerMp(manifest('time-clock', 'first_party', {
    delete_attendance: activity({ authorizedCallers: [] }),
    touch_attendance: activity(),
    record_view: activity({ authorizedCallers: ['timesheets'] }),
    purge_attendance: activity({ callerPolicy: 'owner_only' }),
    open_attendance: activity({ callerPolicy: 'first_party' }),
    sync_attendance: activity({ callerPolicy: 'listed', authorizedCallers: ['acme-reporting'] }),
  }), {
    handlers: {
      activities: {
        delete_attendance: () => ({ deleted: true }),
        touch_attendance: () => ({ touched: true }),
        record_view: () => ({ recorded: true }),
        purge_attendance: () => ({ purged: true }),
        open_attendance: () => ({ opened: true }),
        sync_attendance: () => ({ synced: true }),
      },
    },
  });
  broker.registerMp(manifest('timesheets', 'first_party', {}), { handlers: {} });
  broker.registerMp(manifest('acme-reporting', 'third_party', {}), { handlers: {} });

  const scopes = [
    'invoke:time-clock.delete_attendance', 'invoke:time-clock.touch_attendance', 'invoke:time-clock.record_view',
    'invoke:time-clock.purge_attendance', 'invoke:time-clock.open_attendance', 'invoke:time-clock.sync_attendance',
  ];
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

describe('authorizeInvoke — callerPolicy says the case outright (D.40)', () => {
  it('owner_only denies a FIRST-PARTY caller under BOTH flag states', async () => {
    for (const w of [await world(), await world({ strictEmptyCallers: true })]) {
      // eslint-disable-next-line no-await-in-loop
      const rejection = await w.asFirstParty('purge_attendance').catch((e) => e);
      expect(rejection.code).toBe('PermissionDenied');
      expect(rejection.rule).toBe('activities.purge_attendance.callerPolicy');
      expect(rejection.message).toContain("declares callerPolicy 'owner_only'");
    }
  });

  it('owner_only still allows the OWNING MP', async () => {
    const w = await world();
    expect((await w.asOwner('purge_attendance')).result).toEqual({ purged: true });
  });

  it('first_party allows a first-party caller and denies a third-party one', async () => {
    const w = await world({ strictEmptyCallers: true });
    expect((await w.asFirstParty('open_attendance')).result).toEqual({ opened: true });
    const rejection = await w.asThirdParty('open_attendance').catch((e) => e);
    expect(rejection.code).toBe('PermissionDenied');
    expect(rejection.rule).toBe('activities.open_attendance.callerPolicy');
  });

  it('listed overrides BOTH defaults: the listed third party is in, the unlisted first party is out', async () => {
    const w = await world({ strictEmptyCallers: true });
    expect((await w.asThirdParty('sync_attendance')).result).toEqual({ synced: true });
    const rejection = await w.asFirstParty('sync_attendance').catch((e) => e);
    expect(rejection.code).toBe('PermissionDenied');
    expect(rejection.rule).toBe('activities.sync_attendance.callerPolicy');
  });

  it('callerPolicy is AUTHORITATIVE over a contradicting authorizedCallers', async () => {
    const issuer = createFakeIssuer();
    const broker = createBroker({ capabilityService: issuer });
    broker.registerMp(manifest('time-clock', 'first_party', {
      purge_attendance: activity({ callerPolicy: 'owner_only', authorizedCallers: ['timesheets'] }),
    }), { handlers: { activities: { purge_attendance: () => ({ purged: true }) } } });
    broker.registerMp(manifest('timesheets', 'first_party', {}), { handlers: {} });
    const token = await issuer.issue('timesheets', '1.0.0', TENANT, ['invoke:time-clock.purge_attendance'], 'i-ts');
    const rejection = await broker.invoke({
      sourceMpId: 'timesheets', instanceId: 'i-ts', capabilityToken: token, activity: 'time-clock.purge_attendance', args: {},
    }).catch((e) => e);
    expect(rejection.code).toBe('PermissionDenied');
    expect(rejection.rule).toBe('activities.purge_attendance.callerPolicy');
  });
});
