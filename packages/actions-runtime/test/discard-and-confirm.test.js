import { describe, it, expect, vi } from 'vitest';
import { TommyError } from '@tommy/sdk';
import { createBroker, createFakeIssuer, createDurableQueue } from '../src/index.js';

const save = (retry = { maxAttempts: 1 }) => ({
  description: 'a save',
  inputSchema: { type: 'object', properties: { note: { type: 'string' } } },
  sideEffect: 'server_write',
  idempotency: 'client_key',
  offlineReplayable: true,
  retry,
});

const lostAnswer = () => new TommyError({ code: 'Timeout', message: 'no answer within the deadline', retryable: false });

async function page({
  queueOwner, online = true, serverInvoke = vi.fn(async () => ({ result: { ok: true } })), retry, throttleOverrides, idempotencyLedger, clock = { now: 1764057600000 },
} = {}) {
  const issuer = createFakeIssuer();
  let identities = {};
  const broker = createBroker({
    capabilityService: issuer,
    serverInvoke,
    online,
    now: () => clock.now,
    sleep: async () => {},
    offlineQueue: createDurableQueue({ storage: null, held: new Set(), now: () => clock.now }),
    ...(queueOwner ? { queueOwner } : {}),
    ...(throttleOverrides ? { throttleOverrides } : {}),
    ...(idempotencyLedger ? { idempotencyLedger } : {}),
    replayEnvelope: async (envelope) => ({ ...envelope, ...identities[`${envelope.sourceMpId}`] }),
  });
  broker.registerMp({
    id: 'leave', version: '1.0.0', publisher: { type: 'first_party' }, triggers: {}, conditions: {},
    activities: { save: save(retry) }, actions: {},
  }, { handlers: { activities: {} } });
  const tokens = {
    'team-1': await issuer.issue('leave', '1.0.0', 'team-1', [], 'i-1'),
    'team-2': await issuer.issue('leave', '1.0.0', 'team-2', [], 'i-2'),
  };
  identities = { leave: { capabilityToken: tokens['team-1'], instanceId: 'i-1' } };
  const invoke = (key, tenant = 'team-1') => broker.invoke({
    sourceMpId: 'leave', capabilityToken: tokens[tenant], instanceId: tenant === 'team-1' ? 'i-1' : 'i-2', activity: 'leave.save', args: { note: 'n' }, idempotencyKey: key,
  });
  return { broker, invoke, serverInvoke, clock };
}

describe('a discarded queued write', () => {
  it('is no longer waiting and can never be confirmed', async () => {
    const serverInvoke = vi.fn(async () => ({ result: { ok: true } }));
    const { broker, invoke } = await page({ online: false, serverInvoke, queueOwner: () => ({ tenantId: 'team-1' }) });
    await invoke('k-1');
    expect(broker.writeOutcome('leave', 'save', 'k-1')).toMatchObject({ state: 'queued', confirmable: true });
    const [row] = broker.queuedWrites('leave');
    expect(await broker.discardQueuedWrite('leave', row.id)).toBe(true);
    expect(broker.writeOutcome('leave', 'save', 'k-1')).toBeNull();
    broker.setOnline(true);
    await expect(broker.confirmWriteOutcome('leave', 'save', 'k-1')).rejects.toMatchObject({ details: { reason: 'no_request' } });
    expect(serverInvoke).not.toHaveBeenCalled();
  });
});

describe('the one confirm per key', () => {
  it('is not spent when the confirm is stopped on the device before it is sent', async () => {
    const clock = { now: 1764057600000 };
    const serverInvoke = vi.fn(async () => { throw lostAnswer(); });
    const { broker, invoke } = await page({
      clock, serverInvoke, queueOwner: () => ({ tenantId: 'team-1' }), throttleOverrides: { leave: { burst: 1, invokesPerMin: 1 } },
    });
    await invoke('k-1').catch(() => {});
    expect(await broker.confirmWriteOutcome('leave', 'save', 'k-1')).toMatchObject({ state: 'unconfirmed', error: { code: 'RateLimited' } });
    expect(serverInvoke).toHaveBeenCalledTimes(1);
    clock.now += 120000;
    serverInvoke.mockImplementation(async () => ({ result: { ok: true }, replayed: true }));
    expect(await broker.confirmWriteOutcome('leave', 'save', 'k-1')).toMatchObject({ state: 'succeeded' });
    expect(serverInvoke).toHaveBeenCalledTimes(2);
  });

  it('sends its request once, even for an activity that retries', async () => {
    const serverInvoke = vi.fn(async () => { throw lostAnswer(); });
    const { broker, invoke } = await page({ serverInvoke, retry: { maxAttempts: 3 }, queueOwner: () => ({ tenantId: 'team-1' }) });
    await invoke('k-1').catch(() => {});
    expect(serverInvoke).toHaveBeenCalledTimes(1);
    serverInvoke.mockImplementation(async () => { throw Object.assign(new TommyError({ code: 'ActivityFailed', message: 'busy', retryable: true }), { status: 503 }); });
    expect(await broker.confirmWriteOutcome('leave', 'save', 'k-1')).toMatchObject({ state: 'unconfirmed' });
    expect(serverInvoke).toHaveBeenCalledTimes(2);
  });

  it('answers a run id when the idempotency ledger answers the confirm', async () => {
    const known = new Set();
    let ledgerAnswers = false;
    const idempotencyLedger = { has: (key) => ledgerAnswers && known.has(key), add: (key) => known.add(key) };
    const serverInvoke = vi.fn(async () => ({ result: { ok: true } }));
    const { broker, invoke } = await page({ online: false, serverInvoke, idempotencyLedger, queueOwner: () => ({ tenantId: 'team-1' }) });
    await invoke('k-1');
    known.add('team-1:leave.save:k-1');
    ledgerAnswers = true;
    broker.setOnline(true);
    const confirmed = await broker.confirmWriteOutcome('leave', 'save', 'k-1');
    expect(confirmed).toMatchObject({ state: 'succeeded', replayed: true });
    expect(typeof confirmed.rpcId).toBe('string');
    expect(confirmed.rpcId.length).toBeGreaterThan(0);
  });
});
