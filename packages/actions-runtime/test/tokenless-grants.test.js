/**
 * tokenless-grants.test.js — the paths that carry no capability token judge an
 * MP by the grants its install holds, the same authority invoke and query read
 * off the token's `effectiveScopes`.
 *
 * Three paths carry no token: `subscribe()`, an Action's trigger binding, and
 * the identity an Action's condition gates and activity run under. When the
 * host supplies `grantedScopes(mpId)`, each of them reads it. An install can
 * hold fewer scopes than its manifest asks for (a third-party version whose
 * review approved less, a scope the tenant has not granted), and the declared
 * list must not stand in for the grant.
 */
import { describe, it, expect } from 'vitest';
import { createBroker, createFakeIssuer } from '../src/index.js';

const settle = () => new Promise((resolve) => { setTimeout(resolve, 10); });

const TENANT = 'team-1';

const trigger = () => ({ description: 't', payloadSchema: { type: 'object' }, emission: 'async' });
const condition = () => ({
  description: 'c', inputSchema: { type: 'object' }, returnSchema: { type: 'boolean' }, latencyBudgetMs: 100,
});

const timeClock = {
  id: 'time-clock',
  version: '1.0.0',
  publisher: { type: 'first_party' },
  triggers: { shift_marked_absent: trigger() },
  conditions: {},
  activities: {},
  actions: {},
};

const clients = {
  id: 'clients',
  version: '1.0.0',
  publisher: { type: 'first_party' },
  triggers: {},
  conditions: { client: condition() },
  activities: {},
  actions: {},
};

// Declares every scope it would need; what it is GRANTED is up to the test.
const consumer = ({ gate = false, bindOwnTrigger = false } = {}) => ({
  id: 'rostering',
  version: '1.0.0',
  publisher: { type: 'third_party' },
  permissions: { scopes: ['read:attendance', 'read:clients'] },
  triggers: { roster_changed: trigger() },
  conditions: {},
  activities: {
    note_absence: {
      description: 'the action target',
      inputSchema: { type: 'object' },
      resultSchema: { type: 'object' },
      sideEffect: 'local_write',
      idempotency: 'derived_from_input',
      offlineReplayable: false,
    },
  },
  actions: {
    note_absence_on_shift_absent: {
      title: 'Note an absence',
      trigger: bindOwnTrigger
        ? { mp: 'rostering', name: 'roster_changed' }
        : { mp: 'time-clock', name: 'shift_marked_absent' },
      ...(gate ? { conditions: [{ name: 'client', mp: 'clients', args: {} }] } : {}),
      activity: { name: 'note_absence', inputMap: {} },
      enabledByDefault: true,
      required: true,
      userConfigurable: false,
    },
  },
});

async function world({ granted, gate = false, bindOwnTrigger = false, hook = true } = {}) {
  const issuer = createFakeIssuer();
  const grants = new Map(Object.entries(granted || {}));
  const broker = createBroker({
    capabilityService: issuer,
    strictEmitOwnership: true,
    enforceConditionScopes: true,
    ...(hook ? { grantedScopes: (mpId) => grants.get(mpId) } : {}),
  });
  const noted = [];
  broker.registerMp(timeClock, { handlers: {} });
  broker.registerMp(clients, { handlers: { conditions: { client: () => true } } });
  broker.registerMp(consumer({ gate, bindOwnTrigger }), {
    handlers: { activities: { note_absence: (args) => { noted.push(args); return { ok: true }; } } },
  });
  const tcToken = await issuer.issue('time-clock', '1.0.0', TENANT, [], 'i-tc');
  const rosteringToken = await issuer.issue('rostering', '1.0.0', TENANT, grants.get('rostering') || [], 'i-r');
  return {
    broker,
    grants,
    noted,
    subscribeForeign: () => broker.subscribe('rostering', 'time-clock.shift_marked_absent', () => {}),
    subscribeOwn: () => broker.subscribe('rostering', 'rostering.roster_changed', () => {}),
    emitForeign: () => broker.emit({
      sourceMpId: 'time-clock',
      instanceId: 'i-tc',
      capabilityToken: tcToken,
      trigger: 'time-clock.shift_marked_absent',
      payload: {},
    }),
    emitOwn: () => broker.emit({
      sourceMpId: 'rostering',
      instanceId: 'i-r',
      capabilityToken: rosteringToken,
      trigger: 'rostering.roster_changed',
      payload: {},
    }),
  };
}

describe('subscribe() reads the install grant', () => {
  it('a scope the manifest declares but the install was not granted does not admit the subscription', async () => {
    const w = await world({ granted: { rostering: ['read:clients'] } });
    expect(() => w.subscribeForeign()).toThrow(/may not subscribe to 'time-clock.shift_marked_absent'/);
  });

  it('the granted domain scope admits it', async () => {
    const w = await world({ granted: { rostering: ['read:attendance'] } });
    expect(typeof w.subscribeForeign()).toBe('function');
  });

  it('an MP the host holds no grant for may not subscribe across MPs, but hears its own triggers', async () => {
    const w = await world({ granted: {} });
    expect(() => w.subscribeForeign()).toThrow(/PermissionDenied|may not subscribe/);
    expect(typeof w.subscribeOwn()).toBe('function');
  });

  it('with no grantedScopes hook, the declared manifest scopes decide', async () => {
    const w = await world({ hook: false });
    expect(typeof w.subscribeForeign()).toBe('function');
  });
});

describe('an Action binding reads the install grant', () => {
  it('an ungranted cross-MP binding does not run and does not keep the trigger active', async () => {
    const w = await world({ granted: { rostering: ['read:clients'] } });
    const receipt = await w.emitForeign();
    await settle();
    expect(w.noted).toHaveLength(0);
    expect(receipt.suppressed).toBe(true);
  });

  it('the same binding runs once the install is granted the read scope', async () => {
    const w = await world({ granted: { rostering: ['read:attendance'] } });
    await w.emitForeign();
    await settle();
    expect(w.noted).toHaveLength(1);
  });

  it('a grant that narrows between emits is honoured on the next emit', async () => {
    const w = await world({ granted: { rostering: ['read:attendance'] } });
    await w.emitForeign();
    await settle();
    w.grants.set('rostering', []);
    const receipt = await w.emitForeign();
    await settle();
    expect(w.noted).toHaveLength(1);
    expect(receipt.suppressed).toBe(true);
  });
});

describe("an Action's dispatches run under the install grant", () => {
  it('a condition gate the manifest declares but the install was not granted stays shut', async () => {
    const w = await world({ granted: { rostering: [] }, gate: true, bindOwnTrigger: true });
    await w.emitOwn();
    await settle();
    expect(w.noted).toHaveLength(0);
  });

  it('the granted read scope opens the gate', async () => {
    const w = await world({ granted: { rostering: ['read:clients'] }, gate: true, bindOwnTrigger: true });
    await w.emitOwn();
    await settle();
    expect(w.noted).toHaveLength(1);
  });
});

describe('grants are per tenant and per delivery', () => {
  const TENANT_B = 'team-2';

  async function twoTenants() {
    const issuer = createFakeIssuer();
    const grants = { [TENANT]: { rostering: ['read:attendance'] }, [TENANT_B]: { rostering: [] } };
    const broker = createBroker({
      capabilityService: issuer,
      strictEmitOwnership: true,
      grantedScopes: (mpId, tenantId) => grants[tenantId]?.[mpId],
    });
    const noted = [];
    broker.registerMp(timeClock, { handlers: {} });
    broker.registerMp(consumer(), {
      handlers: { activities: { note_absence: (args, { tenantId }) => { noted.push(tenantId); return { ok: true }; } } },
    });
    const tokens = {
      [TENANT]: await issuer.issue('time-clock', '1.0.0', TENANT, [], 'i-tc-a'),
      [TENANT_B]: await issuer.issue('time-clock', '1.0.0', TENANT_B, [], 'i-tc-b'),
    };
    const emitIn = (tenantId) => broker.emit({
      sourceMpId: 'time-clock',
      instanceId: tokens[tenantId].instanceId,
      capabilityToken: tokens[tenantId],
      trigger: 'time-clock.shift_marked_absent',
      payload: {},
    });
    return { broker, grants, noted, emitIn };
  }

  it("an Action binding and its dispatch are judged by the emitting tenant's grant", async () => {
    const w = await twoTenants();
    await w.emitIn(TENANT);
    const receiptB = await w.emitIn(TENANT_B);
    await settle();
    expect(w.noted).toEqual([TENANT]);
    expect(receiptB.suppressed).toBe(true);
  });

  it("a subscription registered for one tenant never hears another tenant's emits", async () => {
    const w = await twoTenants();
    w.grants[TENANT_B].rostering = ['read:attendance'];
    const heard = [];
    w.broker.subscribe('rostering', 'time-clock.shift_marked_absent', (_payload, meta) => { heard.push(meta.emitId); }, { tenantId: TENANT });
    await w.emitIn(TENANT_B);
    await settle();
    expect(heard).toHaveLength(0);
    await w.emitIn(TENANT);
    await settle();
    expect(heard).toHaveLength(1);
  });

  it('a subscription hears a payload only while its grant holds at delivery', async () => {
    const w = await twoTenants();
    const heard = [];
    w.broker.subscribe('rostering', 'time-clock.shift_marked_absent', (_payload, meta) => { heard.push(meta.emitId); }, { tenantId: TENANT });
    await w.emitIn(TENANT);
    await settle();
    expect(heard).toHaveLength(1);
    // With the grant gone, the stored subscription no longer receives the
    // payload and no longer keeps the trigger active.
    w.grants[TENANT].rostering = [];
    const receipt = await w.emitIn(TENANT);
    await settle();
    expect(heard).toHaveLength(1);
    expect(receipt.suppressed).toBe(true);
  });
});
