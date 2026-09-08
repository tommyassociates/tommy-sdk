import { describe, it, expect } from 'vitest';
import { createBroker, createFakeIssuer } from '../src/index.js';

async function world(payloadSchema = { type: 'object' }) {
  const issuer = createFakeIssuer();
  const broker = createBroker({ capabilityService: issuer, idempotencyLedger: null });
  const calls = [];
  broker.registerMp({
    id: 'notices', version: '1.0.0', publisher: { type: 'first_party' }, conditions: {},
    triggers: { assigned: { emission: 'sync', payloadSchema } },
    activities: { notify: { inputSchema: { type: 'object' }, resultSchema: { type: 'object' },
      sideEffect: 'local_write', idempotency: 'derived_from_input', retry: { maxAttempts: 1 } } },
    actions: { notice: { trigger: { name: 'assigned' }, activity: { name: 'notify', inputMap: {
      id: { from: 'trigger', path: 'id' }, message: { from: 'option', path: 'message' },
    } }, enabledByDefault: true, locationOverridable: true, optionsDefault: { message: 'default' } } },
  }, { handlers: { activities: { notify: (args) => { calls.push(args); return { ok: true }; } } } });
  const tokens = {};
  for (const tenant of ['team-1', 'team-2']) tokens[tenant] = await issuer.issue('notices', '1.0.0', tenant, [], tenant);
  let id = 0;
  const emitRaw = (payload, tenant = 'team-1') => broker.emit({
    sourceMpId: 'notices', instanceId: tenant, capabilityToken: tokens[tenant],
    trigger: 'notices.assigned', payload,
  });
  const emit = (payload = {}, tenant = 'team-1') => emitRaw({ id: ++id, ...payload }, tenant);
  return { broker, calls, emit, emitRaw };
}

describe('location-owned Action state', () => {
  it.each([null, undefined, 7, 'text', false, []])('treats accepted non-object payload %j as unscoped without rewriting it', async (payload) => {
    const w = await world({});
    w.broker.setActionState('team-1', 'notices', 'notice', { enabled: true, options: { message: 'global' } });
    w.broker.setActionState('team-1', 'notices', 'notice', { scopeLocationId: 8, enabled: false });
    await w.emitRaw(payload);
    expect(w.calls.map((row) => row.message)).toEqual(['global']);
    const [record] = await w.broker.records.query({ kind: 'emit' });
    expect(record.args).toEqual(payload);

    w.broker.setActionState('team-1', 'notices', 'notice', { enabled: false });
    expect(await w.emitRaw(payload)).toMatchObject({ suppressed: true });
    expect(w.calls).toHaveLength(1);
  });

  it('still rejects null when the declared payload schema requires an object', async () => {
    const w = await world();
    await expect(w.emitRaw(null)).rejects.toMatchObject({ code: 'InvalidPayload' });
    expect(w.calls).toHaveLength(0);
  });

  it('uses one local option set and leaves other locations/global events unchanged', async () => {
    const w = await world();
    w.broker.setActionState('team-1', 'notices', 'notice', { enabled: true, options: { message: 'global' } });
    w.broker.setActionState('team-1', 'notices', 'notice', { scopeLocationId: 8, enabled: true, options: { message: 'local' } });
    await w.emit({ locationId: '8' });
    await w.emit({ location_id: 9 });
    await w.emit();
    expect(w.calls.map((row) => row.message)).toEqual(['local', 'global', 'global']);
  });

  it('a disabled local override suppresses the enabled global Action without duplicate dispatch', async () => {
    const w = await world();
    w.broker.setActionState('team-1', 'notices', 'notice', { enabled: true });
    w.broker.setActionState('team-1', 'notices', 'notice', { scopeLocationId: 8, enabled: false });
    expect(await w.emit({ locationId: '8' })).toMatchObject({ suppressed: true });
    await w.emit({ locationId: '9' });
    expect(w.calls).toHaveLength(1);
  });

  it('an enabled local override wakes dispatch even when the global Action is disabled', async () => {
    const w = await world();
    w.broker.setActionState('team-1', 'notices', 'notice', { enabled: false });
    w.broker.setActionState('team-1', 'notices', 'notice', { scopeLocationId: 8, enabled: true, options: { message: 'local' } });
    await w.emit({ location_id: 8 });
    expect(await w.emit({ locationId: 9 })).toMatchObject({ suppressed: true });
    expect(w.calls).toHaveLength(1);
  });

  it('reset inherits the current global state and remains isolated by tenant', async () => {
    const w = await world();
    w.broker.setActionState('team-1', 'notices', 'notice', { scopeLocationId: 8, enabled: false });
    w.broker.setActionState('team-1', 'notices', 'notice', { enabled: true, options: { message: 'new global' } });
    w.broker.setActionState('team-1', 'notices', 'notice', { scopeLocationId: 8, inherited: true });
    await w.emit({ locationId: 8 });
    await w.emit({ locationId: 8 }, 'team-2');
    expect(w.calls.map((row) => row.message)).toEqual(['new global', 'default']);
  });

  it('rejects conflicting event scopes and malformed persisted local identities', async () => {
    const w = await world();
    await expect(w.emit({ locationId: 8, location_id: 9 })).rejects.toThrow(/Conflicting/);
    expect(() => w.broker.setActionState('team-1', 'notices', 'notice', { scopeLocationId: '8:other', enabled: false })).toThrow(/positive location/);
    expect(w.calls).toHaveLength(0);
  });

  it('does not resurrect a reset from an older concurrent hydration response', async () => {
    const w = await world();
    w.broker.setActionState('team-1', 'notices', 'notice', { enabled: true, options: { message: 'global' } });
    w.broker.setActionState('team-1', 'notices', 'notice', { scopeLocationId: 8, inherited: true, revision: 3 });
    w.broker.setActionState('team-1', 'notices', 'notice', { scopeLocationId: 8, enabled: false, revision: 2 });
    await w.emit({ locationId: 8 });
    expect(w.calls.map((row) => row.message)).toEqual(['global']);
  });
});
