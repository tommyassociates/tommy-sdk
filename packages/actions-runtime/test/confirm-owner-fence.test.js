import { describe, it, expect, vi } from 'vitest';
import { TommyError } from '@tommy/sdk';
import { createBroker, createFakeIssuer, createDurableQueue } from '../src/index.js';

const lostAnswer = () => new TommyError({ code: 'Timeout', message: 'no answer within the deadline', retryable: false });

const save = {
  description: 'a save',
  inputSchema: { type: 'object', properties: { note: { type: 'string' } } },
  sideEffect: 'server_write',
  idempotency: 'client_key',
  offlineReplayable: true,
  retry: { maxAttempts: 1 },
};

async function page({ holder, serverInvoke = vi.fn(async () => { throw lostAnswer(); }), replayEnvelope, condition } = {}) {
  const issuer = createFakeIssuer();
  let identities = {};
  const broker = createBroker({
    capabilityService: issuer,
    serverInvoke,
    sleep: async () => {},
    offlineQueue: createDurableQueue({ storage: null, held: new Set() }),
    queueOwner: () => holder.value,
    viewerFingerprint: () => '',
    replayEnvelope: replayEnvelope || (async (envelope) => ({ ...envelope, ...identities.leave })),
  });
  broker.registerMp({
    id: 'leave', version: '1.0.0', publisher: { type: 'first_party' }, triggers: {}, actions: {},
    activities: { save },
    conditions: {
      c: {
        description: 'c', inputSchema: { type: 'object' }, returnSchema: { type: 'object' }, latencyBudgetMs: 5000, heldFirst: true, ...(condition?.def || {}),
      },
    },
  }, { handlers: { activities: {}, conditions: { c: (args, ctx) => condition.handler(args, ctx) } } });
  const tokens = {
    'team-1': await issuer.issue('leave', '1.0.0', 'team-1', [], 'i-1'),
    'team-2': await issuer.issue('leave', '1.0.0', 'team-2', [], 'i-2'),
  };
  identities = { leave: { capabilityToken: tokens['team-1'], instanceId: 'i-1' } };
  const as = (tenant) => ({ sourceMpId: 'leave', capabilityToken: tokens[tenant], instanceId: tenant === 'team-1' ? 'i-1' : 'i-2' });
  const invoke = (key, tenant = 'team-1') => broker.invoke({ ...as(tenant), activity: 'leave.save', args: { note: 'n' }, idempotencyKey: key });
  const ask = (tenant = 'team-1', onRead = () => {}) => broker.query({ ...as(tenant), condition: 'leave.c', args: {}, ...(onRead ? { onRead } : {}) });
  return { broker, invoke, ask, serverInvoke, tokens };
}

describe('a confirm whose account changes while its sender is restored', () => {
  it('sends nothing after an account switch', async () => {
    const holder = { value: { tenantId: 'team-1', person: 'p-1' } };
    let duringRestore = null;
    const { broker, invoke, serverInvoke, tokens } = await page({
      holder,
      replayEnvelope: async (envelope) => {
        duringRestore?.();
        return { ...envelope, capabilityToken: tokens['team-1'], instanceId: 'i-1' };
      },
    });
    await invoke('k-1').catch(() => {});
    expect(serverInvoke).toHaveBeenCalledTimes(1);
    duringRestore = () => { holder.value = { tenantId: 'team-1', person: 'p-2' }; };
    await expect(broker.confirmWriteOutcome('leave', 'save', 'k-1')).rejects.toMatchObject({ code: 'WriteNotConfirmable', details: { reason: 'no_request' } });
    expect(serverInvoke).toHaveBeenCalledTimes(1);
  });

  it('sends nothing after a purge', async () => {
    const holder = { value: { tenantId: 'team-1' } };
    let duringRestore = null;
    const { broker, invoke, serverInvoke, tokens } = await page({
      holder,
      replayEnvelope: async (envelope) => {
        duringRestore?.();
        return { ...envelope, capabilityToken: tokens['team-1'], instanceId: 'i-1' };
      },
    });
    await invoke('k-1').catch(() => {});
    duringRestore = () => broker.purgeOutcomes();
    await expect(broker.confirmWriteOutcome('leave', 'save', 'k-1')).rejects.toMatchObject({ details: { reason: 'no_request' } });
    expect(serverInvoke).toHaveBeenCalledTimes(1);
  });

  it('sends nothing when the restored sender belongs to another tenant', async () => {
    const holder = { value: { tenantId: 'team-1' } };
    let tokensRef;
    const { broker, invoke, serverInvoke, tokens } = await page({
      holder,
      replayEnvelope: async (envelope) => ({ ...envelope, capabilityToken: tokensRef['team-2'], instanceId: 'i-2' }),
    });
    tokensRef = tokens;
    await broker.invoke({
      sourceMpId: 'leave', capabilityToken: tokens['team-1'], instanceId: 'i-1', activity: 'leave.save', args: { note: 'n' }, idempotencyKey: 'k-1',
    }).catch(() => {});
    await expect(broker.confirmWriteOutcome('leave', 'save', 'k-1')).rejects.toMatchObject({ details: { reason: 'no_request' } });
    expect(serverInvoke).toHaveBeenCalledTimes(1);
  });
});
