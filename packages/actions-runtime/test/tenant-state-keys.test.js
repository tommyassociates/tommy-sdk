import { describe, expect, it } from 'vitest';
import { createBroker, createFakeIssuer } from '../src/index.js';

// A host may alias its own world ID to its issued-token ID, never other teams.
const boundTeamKey = (value) => ([3, '3', 'team-3'].includes(value) ? 'team-3' : value);

async function world(tenantStateKey) {
  const issuer = createFakeIssuer();
  let serverValue = false;
  let reads = 0;
  const broker = createBroker({ capabilityService: issuer, tenantStateKey, idempotencyLedger: null,
    serverInvoke: async () => { serverValue = true; return { result: {} }; } });
  const calls = [];
  broker.registerMp({
    id: 'notices', version: '1.0.0', publisher: { type: 'first_party' },
    triggers: { assigned: { emission: 'sync', payloadSchema: { type: 'object' } } },
    conditions: { allowed: { inputSchema: { type: 'object' }, returnSchema: { type: 'boolean' },
      cacheable: true, cacheTtlMs: 60000 } },
    activities: {
      notify: { inputSchema: { type: 'object' }, resultSchema: { type: 'object' },
        sideEffect: 'local_write', idempotency: 'derived_from_input', retry: { maxAttempts: 1 } },
      update: { inputSchema: { type: 'object' }, resultSchema: { type: 'object' },
        sideEffect: 'server_write', idempotency: 'derived_from_input', retry: { maxAttempts: 1 } },
    },
    actions: { notice: { trigger: { name: 'assigned' }, activity: { name: 'notify' },
      enabledByDefault: true, locationOverridable: true } },
  }, { handlers: {
    activities: { notify: (args) => { calls.push(args); return {}; } },
    conditions: { allowed: (_args, { tenantId }) => {
      reads += 1;
      return serverValue || broker.evaluatePredicate({ source: { from: 'setting', path: 'enabled' },
        op: 'equals', operand: true }, { mpId: 'notices', setting: { notices: broker.settingsFor(tenantId, 'notices') } });
    } },
  } });
  const identities = new Map();
  for (const tenantId of ['3', 'team-3', '9', 'team-9']) {
    identities.set(tenantId, { sourceMpId: 'notices', instanceId: tenantId,
      capabilityToken: await issuer.issue('notices', '1.0.0', tenantId, [], tenantId) });
  }
  let sequence = 0;
  return { broker, calls, reads: () => reads,
    emit: (tenant = 'team-3', payload = {}) => broker.emit({ ...identities.get(tenant),
      trigger: 'notices.assigned', payload: { sequence: ++sequence, ...payload } }),
    query: (tenant = 'team-3') => broker.query({ ...identities.get(tenant), condition: 'notices.allowed', args: {} }),
    update: (tenant) => broker.invoke({ ...identities.get(tenant), activity: 'notices.update', args: {} }),
  };
}

describe('host-supplied in-memory tenant state keys', () => {
  it('keeps generic SDK tenant spellings distinct by default', async () => {
    const w = await world();
    w.broker.setActionState(3, 'notices', 'notice', { enabled: false });
    expect(await w.emit('3')).toMatchObject({ suppressed: true });
    await w.emit('team-3');
    w.broker.setSettingState(3, 'notices', { enabled: true });
    expect(w.broker.settingsFor('team-3', 'notices')).toEqual({});
    expect(w.calls).toHaveLength(1);
  });

  it('uses raw host global/local overrides for verified prefixed SDK calls, preserving foreign tenants', async () => {
    const w = await world(boundTeamKey);
    w.broker.setActionState(3, 'notices', 'notice', { enabled: false });
    expect(await w.emit()).toMatchObject({ suppressed: true });
    w.broker.setActionState('3', 'notices', 'notice', { scopeLocationId: 8, enabled: true });
    await w.emit('team-3', { locationId: 8 });
    expect(await w.emit('team-3', { locationId: 9 })).toMatchObject({ suppressed: true });
    w.broker.setActionState(3, 'notices', 'notice', { scopeLocationId: 8, inherited: true });
    expect(await w.emit('team-3', { locationId: 8 })).toMatchObject({ suppressed: true });
    w.broker.setActionState(9, 'notices', 'notice', { enabled: false });
    expect(await w.emit('9')).toMatchObject({ suppressed: true });
    await w.emit('team-9');
    expect(w.calls).toHaveLength(2);
    const records = await w.broker.records.query({ kind: 'invoke' });
    expect(records.map((row) => row.tenantId).sort()).toEqual(['team-3', 'team-9']);
  });

  it('refreshes cached setting predicates across the bound aliases and keeps foreign projections distinct', async () => {
    const w = await world(boundTeamKey);
    w.broker.setSettingState(3, 'notices', { enabled: false });
    expect(await w.query()).toBe(false);
    expect(await w.query('3')).toBe(false);
    expect(w.reads()).toBe(1);
    w.broker.setSettingState('3', 'notices', { enabled: true });
    expect(await w.query()).toBe(true);
    expect(w.reads()).toBe(2);
    expect(w.broker.settingsFor('team-3', 'notices')).toEqual({ enabled: true });
    w.broker.setSettingState(9, 'notices', { enabled: true });
    expect(w.broker.settingsFor('team-9', 'notices')).toEqual({});
  });

  it('invalidates the aliased owner condition cache after a raw-tenant server write without rewriting its record', async () => {
    const w = await world(boundTeamKey);
    expect(await w.query()).toBe(false);
    await w.update('3');
    expect(await w.query()).toBe(true);
    expect(w.reads()).toBe(2);
    const [record] = await w.broker.records.query({ kind: 'invoke' });
    expect(record.tenantId).toBe('3');
  });
});
