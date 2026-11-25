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

describe('a request authenticated for another tenant than the queue owner\'s', () => {
  it('records no outcome for the owner', async () => {
    const holder = { value: { tenantId: 'team-1' } };
    const { broker, invoke } = await page({ holder });
    await invoke('k-1', 'team-2').catch(() => {});
    expect(broker.writeOutcome('leave', 'save', 'k-1')).toBeNull();
  });

  it('neither keeps nor reads the owner\'s held answers', async () => {
    const holder = { value: { tenantId: 'team-1' } };
    const { ask } = await page({ holder, condition: { handler: async (_, { tenantId }) => ({ tenant: tenantId }) } });
    expect(await ask('team-2')).toMatchObject({ state: 'fresh', answer: { tenant: 'team-2' } });
    expect(await ask('team-1')).toMatchObject({ state: 'fresh', answer: { tenant: 'team-1' } });
  });

  it('matches a tenant spelled differently through tenantStateKey', async () => {
    const issuer = createFakeIssuer();
    const broker = createBroker({
      capabilityService: issuer,
      serverInvoke: vi.fn(async () => { throw lostAnswer(); }),
      sleep: async () => {},
      offlineQueue: createDurableQueue({ storage: null, held: new Set() }),
      queueOwner: () => ({ tenantId: '1' }),
      tenantStateKey: (value) => (String(value).replace(/^team-/, '') === '1' ? 'team-1' : value),
      replayEnvelope: async (envelope) => envelope,
    });
    broker.registerMp({
      id: 'leave', version: '1.0.0', publisher: { type: 'first_party' }, triggers: {}, conditions: {}, activities: { save }, actions: {},
    }, { handlers: { activities: {} } });
    const token = await issuer.issue('leave', '1.0.0', 'team-1', [], 'i-1');
    await broker.invoke({
      sourceMpId: 'leave', capabilityToken: token, instanceId: 'i-1', activity: 'leave.save', args: { note: 'n' }, idempotencyKey: 'k-1',
    }).catch(() => {});
    expect(broker.writeOutcome('leave', 'save', 'k-1')).toMatchObject({ state: 'unconfirmed' });
  });
});

describe('the TTL cache of a held-first condition uses the full owner', () => {
  it('another person of the same tenant, with the same fingerprint, is not answered from the cache', async () => {
    const holder = { value: { tenantId: 'team-1', person: 'p-1' } };
    let answer = { person: 'p-1' };
    const { ask } = await page({ holder, condition: { def: { cacheable: true, cacheTtlMs: 60000 }, handler: async () => answer } });
    await ask();
    holder.value = { tenantId: 'team-1', person: 'p-2' };
    answer = { person: 'p-2' };
    expect(await ask()).toMatchObject({ state: 'fresh', answer: { person: 'p-2' } });
  });

  it('with no established owner nothing is answered from the cache', async () => {
    const holder = { value: { tenantId: 'team-1', person: 'p-1' } };
    let answer = { n: 1 };
    const { ask } = await page({ holder, condition: { def: { cacheable: true, cacheTtlMs: 60000 }, handler: async () => answer } });
    await ask();
    holder.value = null;
    answer = { n: 2 };
    expect(await ask()).toMatchObject({ state: 'fresh', answer: { n: 2 } });
  });
});
