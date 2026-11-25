import { describe, it, expect, vi } from 'vitest';
import { TommyError } from '@tommy/sdk';
import { createBroker, createFakeIssuer, createDurableQueue } from '../src/index.js';

const lostAnswer = () => new TommyError({ code: 'Timeout', message: 'no answer within the deadline', retryable: false });
const copy = (value) => JSON.parse(JSON.stringify(value));

const save = (inputSchema = { type: 'object', properties: { note: { type: 'string' } } }) => ({
  description: 'a save', inputSchema, sideEffect: 'server_write', idempotency: 'client_key', offlineReplayable: true, retry: { maxAttempts: 1 },
});

function deviceStore() {
  const rows = new Map();
  return {
    rows,
    load: async () => [...rows.values()].map(copy),
    put: async (row) => { rows.set(row.id, copy(row)); },
    remove: async (id) => { rows.delete(id); },
  };
}

async function page({
  online = true, restores = true, serverInvoke = vi.fn(async () => { throw lostAnswer(); }), store = null, offlineQueue,
} = {}) {
  const issuer = createFakeIssuer();
  let identity = null;
  const broker = createBroker({
    capabilityService: issuer,
    serverInvoke,
    online,
    sleep: async () => {},
    outcomeStore: store,
    offlineQueue: offlineQueue || createDurableQueue({ storage: null, held: new Set() }),
    queueOwner: () => ({ tenantId: 'team-1' }),
    ...(restores ? { replayEnvelope: async (envelope) => ({ ...envelope, ...identity }) } : {}),
  });
  const register = (activity) => broker.registerMp({
    id: 'leave', version: '1.0.0', publisher: { type: 'first_party' }, triggers: {}, conditions: {}, activities: { save: activity }, actions: {},
  }, { handlers: { activities: {} } });
  register(save());
  const token = await issuer.issue('leave', '1.0.0', 'team-1', [], 'i-1');
  identity = { capabilityToken: token, instanceId: 'i-1' };
  const invoke = (args, key = 'k-1') => broker.invoke({ sourceMpId: 'leave', ...identity, activity: 'leave.save', args, idempotencyKey: key });
  return { broker, invoke, register, serverInvoke };
}

describe('a kept request never carries a secret the schema let through', () => {
  it('a write whose arguments hold a password is not kept for a confirm', async () => {
    const store = deviceStore();
    const { broker, invoke } = await page({ store });
    await invoke({ note: 'n', login: [{ password: 'hunter2' }] }).catch(() => {});
    await broker.outcomesReady();
    expect(broker.writeOutcome('leave', 'save', 'k-1')).toMatchObject({ state: 'unconfirmed', confirmable: false });
    expect(JSON.stringify([...store.rows.values()])).not.toContain('hunter2');
    await expect(broker.confirmWriteOutcome('leave', 'save', 'k-1')).rejects.toMatchObject({ details: { reason: 'no_request' } });
  });
});

describe('a host with no way to restore the sender', () => {
  it('never offers a confirm and keeps no request', async () => {
    const store = deviceStore();
    const { broker, invoke } = await page({ store, restores: false });
    await invoke({ note: 'n' }).catch(() => {});
    await broker.outcomesReady();
    expect(broker.writeOutcome('leave', 'save', 'k-1')).toMatchObject({ state: 'unconfirmed', confirmable: false });
    expect([...store.rows.values()].some((row) => row.request)).toBe(false);
    await expect(broker.confirmWriteOutcome('leave', 'save', 'k-1')).rejects.toMatchObject({ details: { reason: 'not_eligible' } });
  });
});

describe('a write refused for good before it runs', () => {
  const stricter = save({ type: 'object', required: ['reason'], properties: { note: { type: 'string' }, reason: { type: 'string' } } });

  it('on a queue drain, reads refused, not waiting', async () => {
    const serverInvoke = vi.fn(async () => ({ result: { ok: true } }));
    const { broker, invoke, register } = await page({ online: false, serverInvoke });
    await invoke({ note: 'n' });
    expect(broker.writeOutcome('leave', 'save', 'k-1')).toMatchObject({ state: 'queued', confirmable: true });
    register(stricter);
    broker.setOnline(true);
    await broker.drainOfflineQueue();
    expect(serverInvoke).not.toHaveBeenCalled();
    expect(broker.writeOutcome('leave', 'save', 'k-1')).toMatchObject({ state: 'refused', confirmable: false });
  });

  it('on a confirm, reads refused, not unconfirmed', async () => {
    const { broker, invoke, register, serverInvoke } = await page();
    await invoke({ note: 'n' }).catch(() => {});
    register(stricter);
    expect(await broker.confirmWriteOutcome('leave', 'save', 'k-1')).toMatchObject({ state: 'refused' });
    expect(serverInvoke).toHaveBeenCalledTimes(1);
    expect(broker.writeOutcome('leave', 'save', 'k-1')).toMatchObject({ state: 'refused', confirmable: false });
  });
});
