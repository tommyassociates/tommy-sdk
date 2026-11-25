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

describe('outcomes belong to an established owner', () => {
  it('with no queue owner, each authenticated tenant reads only its own outcome', async () => {
    const serverInvoke = vi.fn(async () => { throw lostAnswer(); });
    const { broker, invoke } = await page({ serverInvoke });
    await invoke('k-1', 'team-1').catch(() => {});
    expect(broker.writeOutcome('leave', 'save', 'k-1', { tenantId: 'team-2' })).toBeNull();
    expect(broker.writeOutcome('leave', 'save', 'k-1')).toBeNull();
    expect(broker.writeOutcome('leave', 'save', 'k-1', { tenantId: 'team-1' })).toMatchObject({ state: 'unconfirmed' });
    await expect(broker.confirmWriteOutcome('leave', 'save', 'k-1', { tenantId: 'team-2' })).rejects.toMatchObject({ details: { reason: 'no_request' } });
  });

  it('when the queue owner cannot be established, nothing is kept or answered', async () => {
    const holder = { value: null };
    const serverInvoke = vi.fn(async () => { throw lostAnswer(); });
    const { broker, invoke } = await page({ serverInvoke, queueOwner: () => holder.value });
    await invoke('k-1').catch(() => {});
    holder.value = { tenantId: 'team-1' };
    expect(broker.writeOutcome('leave', 'save', 'k-1')).toBeNull();
    holder.value = null;
    expect(broker.writeOutcome('leave', 'save', 'k-1')).toBeNull();
  });
});

describe('an outcome lands with the account that sent the write', () => {
  it('an answer that arrives after an account switch is recorded for the sender', async () => {
    const holder = { value: { tenantId: 'team-1', person: 'p-1' } };
    let answer;
    const serverInvoke = vi.fn(() => new Promise((_, reject) => { answer = reject; }));
    const { broker, invoke } = await page({ serverInvoke, queueOwner: () => holder.value });
    const sent = invoke('k-1').catch(() => {});
    await vi.waitFor(() => expect(serverInvoke).toHaveBeenCalled());
    holder.value = { tenantId: 'team-1', person: 'p-2' };
    answer(lostAnswer());
    await sent;
    expect(broker.writeOutcome('leave', 'save', 'k-1')).toBeNull();
    holder.value = { tenantId: 'team-1', person: 'p-1' };
    expect(broker.writeOutcome('leave', 'save', 'k-1')).toMatchObject({ state: 'unconfirmed' });
  });

  it('an answer that arrives after a purge writes nothing back', async () => {
    const holder = { value: { tenantId: 'team-1', person: 'p-1' } };
    let answer;
    const serverInvoke = vi.fn(() => new Promise((_, reject) => { answer = reject; }));
    const { broker, invoke } = await page({ serverInvoke, queueOwner: () => holder.value });
    const sent = invoke('k-1').catch(() => {});
    await vi.waitFor(() => expect(serverInvoke).toHaveBeenCalled());
    broker.purgeOutcomes();
    answer(lostAnswer());
    await sent;
    expect(broker.writeOutcome('leave', 'save', 'k-1')).toBeNull();
  });
});
