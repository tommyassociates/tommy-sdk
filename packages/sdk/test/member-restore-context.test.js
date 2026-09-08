import { describe, it, expect, vi } from 'vitest';
import { createBroker, createFakeIssuer } from '@tommy/actions-runtime';
import { buildSdk, createDirectAdapter } from '../src/index.js';

async function boot() {
  const issuer = createFakeIssuer();
  const serverInvoke = vi.fn(async () => ({ status: 'succeeded', result: { memberId: '320' } }));
  const broker = createBroker({ capabilityService: issuer, serverInvoke });
  broker.registerMp({
    id: 'team', version: '1.0.0', publisher: { type: 'first_party' },
    activities: { update_member: {
      callerPolicy: 'owner_only', sideEffect: 'server_write', idempotency: 'derived_from_input', offlineReplayable: true,
      inputSchema: { type: 'object' }, resultSchema: { type: 'object' },
    } }, triggers: {}, conditions: {}, actions: {},
  }, { handlers: {} });
  const token = await issuer.issue('team', '1.0.0', 'team-7', [], 'instance-7');
  const init = { mpId: 'team', instanceId: 'instance-7', capabilityToken: token, tenant: { tenantId: 'team-7' } };
  const adapter = createDirectAdapter({ broker, init, rpcTimeoutMs: 10000 });
  const sdk = buildSdk({ adapter, init });
  return { broker, serverInvoke, sdk, adapter };
}
describe('trusted member restore invocation context', () => {
  it('forwards authenticated caller and adapter deadline, never fields from the update payload', async () => {
    const w = await boot(); const before = Date.now();
    await w.sdk.actions.invoke('team.update_member', { memberId: '9320', restoreContext: { mpId: 'forged', deadlineAt: Infinity } });
    expect(w.serverInvoke.mock.calls[0][0].restoreContext).toMatchObject({ mpId: 'team', instanceId: 'instance-7', tenantId: 'team-7', replayed: false });
    expect(w.serverInvoke.mock.calls[0][0].restoreContext.deadlineAt).toBeGreaterThanOrEqual(before + 10000);
  });
  it('a new opaque consent distinguishes a later restore from a cached identical earlier update', async () => {
    const w = await boot(); const args = { memberId: '9320', data: { archived: false }, restoreConfirmation: 'one' };
    await w.sdk.actions.invoke('team.update_member', args); await w.sdk.actions.invoke('team.update_member', args);
    expect(w.serverInvoke).toHaveBeenCalledTimes(1);
    await w.sdk.actions.invoke('team.update_member', { ...args, restoreConfirmation: 'two' });
    expect(w.serverInvoke).toHaveBeenCalledTimes(2);
  });
  it('marks offline drain as replay, preserving ordinary activity queuing', async () => {
    const w = await boot(); w.broker.setOnline(false);
    expect(await w.sdk.actions.invoke('team.update_member', { memberId: '9320' })).toMatchObject({ status: 'queued_offline' });
    expect(w.serverInvoke).not.toHaveBeenCalled(); w.broker.setOnline(true); await w.broker.drainOfflineQueue();
    expect(w.serverInvoke.mock.calls[0][0].restoreContext.replayed).toBe(true);
  });
});
