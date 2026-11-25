import { describe, it, expect, vi } from 'vitest';
import { createBroker, createFakeIssuer, createDurableQueue } from '../src/index.js';

const copy = (value) => JSON.parse(JSON.stringify(value));
const tick = () => new Promise((resolve) => { setTimeout(resolve, 0); });
const settle = async (n = 6) => { for (let i = 0; i < n; i += 1) await tick(); };
const conflict = () => Object.assign(new Error('the invoice changed'), { status: 409, code: 'Conflict' });

const activity = (extra = {}) => ({
  description: 'a', inputSchema: { type: 'object' }, sideEffect: 'server_write', idempotency: 'client_key', offlineReplayable: true, retry: { maxAttempts: 1 }, ...extra,
});

async function page({ serverInvoke, outcomeStore = null, offlineQueue = createDurableQueue({ storage: null, held: new Set() }) }) {
  const issuer = createFakeIssuer();
  const broker = createBroker({
    capabilityService: issuer,
    serverInvoke,
    online: false,
    offlineQueue,
    outcomeStore,
    queueOwner: () => ({ tenantId: 'team-1' }),
    replayEnvelope: async (envelope) => envelope,
    sleep: async () => {},
  });
  broker.registerMp({
    id: 'invoicing', version: '1.0.0', publisher: { type: 'first_party' }, triggers: {}, conditions: {},
    activities: { update_invoice: activity({ keepRefused: true }) }, actions: {},
  }, { handlers: { activities: {} } });
  const token = await issuer.issue('invoicing', '1.0.0', 'team-1', [], 'i-1');
  const invoke = (args, key) => broker.invoke({
    sourceMpId: 'invoicing', instanceId: 'i-1', capabilityToken: token, activity: 'invoicing.update_invoice', args, idempotencyKey: key,
  });
  return { broker, invoke };
}

describe('a discard and a drain never both claim a row', () => {
  it('a discard waiting on stored outcomes does not remove a row a drain started sending meanwhile', async () => {
    let letLoad;
    const loaded = new Promise((resolve) => { letLoad = resolve; });
    const outcomeStore = { load: async () => { await loaded; return []; }, put: async () => {}, remove: async () => {} };
    let answer;
    const serverInvoke = vi.fn(() => new Promise((resolve) => { answer = resolve; }));
    const { broker, invoke } = await page({ serverInvoke, outcomeStore });
    await invoke({ invoiceId: '7' }, 'k-7');
    const [row] = broker.queuedWrites('invoicing');
    const discarding = broker.discardQueuedWrite('invoicing', row.id);
    await settle();
    broker.setOnline(true);
    const draining = broker.drainOfflineQueue();
    await vi.waitFor(() => expect(serverInvoke).toHaveBeenCalledTimes(1));
    letLoad();
    expect(await discarding).toBe(false);
    answer({ result: { ok: true } });
    await draining;
  });
});

describe('a refused receipt that storage cannot mark', () => {
  it('is kept for a later drain, never removed and never sent again', async () => {
    const queue = createDurableQueue({ storage: null, held: new Set() });
    const markRefused = queue.markRefused;
    let failNext = true;
    queue.markRefused = (...args) => {
      if (failNext) { failNext = false; return false; }
      return markRefused(...args);
    };
    const serverInvoke = vi.fn(async () => { throw conflict(); });
    const { broker, invoke } = await page({ serverInvoke, offlineQueue: queue });
    await invoke({ invoiceId: '7' }, 'k-7');
    broker.setOnline(true);
    await broker.drainOfflineQueue();
    expect(queue.all().map((row) => row.envelope.idempotencyKey)).toEqual(['k-7']);
    await broker.drainOfflineQueue();
    expect(broker.queuedWrites('invoicing')).toMatchObject([{ state: 'refused', idempotencyKey: 'k-7' }]);
    expect(serverInvoke).toHaveBeenCalledTimes(1);
    await broker.teardown();
  });
});
