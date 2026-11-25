import { describe, it, expect, vi } from 'vitest';
import { createBroker, createFakeIssuer, createDurableQueue } from '../src/index.js';

const TENANT = 'team-1';

function fakeStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

const activity = (extra = {}) => ({
  description: 'a',
  inputSchema: { type: 'object' },
  sideEffect: 'server_write',
  idempotency: 'client_key',
  offlineReplayable: true,
  retry: { maxAttempts: 1 },
  ...extra,
});

const conflict = () => Object.assign(new Error('the invoice changed'), { status: 409, code: 'Conflict' });

async function page({ storage, serverInvoke }) {
  const issuer = createFakeIssuer();
  const broker = createBroker({
    capabilityService: issuer,
    serverInvoke,
    online: false,
    offlineQueue: createDurableQueue({ storage, held: new Set() }),
    queueOwner: () => ({ tenantId: TENANT }),
    sleep: async () => {},
  });
  broker.registerMp({
    id: 'invoicing', version: '1.0.0', publisher: { type: 'first_party' }, triggers: {}, conditions: {},
    activities: { update_invoice: activity({ keepRefused: true }), note: activity() }, actions: {},
  }, { handlers: { activities: {} } });
  const token = await issuer.issue('invoicing', '1.0.0', TENANT, [], 'i-1');
  const invoke = (name, args, key) => broker.invoke({
    sourceMpId: 'invoicing', instanceId: 'i-1', capabilityToken: token, activity: `invoicing.${name}`, args, idempotencyKey: key,
  });
  return { broker, invoke };
}

describe('keepRefused in the default queue', () => {
  it('a declared write refused on its replay stays as a refused receipt with its key, and is not sent again', async () => {
    const storage = fakeStorage();
    const serverInvoke = vi.fn(async () => { throw conflict(); });
    const { broker, invoke } = await page({ storage, serverInvoke });
    await invoke('update_invoice', { invoiceId: '7', total: 10 }, 'k-inv-7');
    await invoke('note', { text: 'x' }, 'k-note');
    broker.setOnline(true);
    await broker.drainOfflineQueue();

    const [receipt, ...others] = broker.queuedWrites('invoicing');
    expect(others).toEqual([]);
    expect(receipt).toMatchObject({
      activity: 'invoicing.update_invoice', args: { invoiceId: '7', total: 10 }, state: 'refused', idempotencyKey: 'k-inv-7',
      refusal: { code: 'Conflict', status: 409, message: 'the invoice changed' },
    });
    expect(typeof receipt.refusedAt).toBe('number');

    const sends = serverInvoke.mock.calls.length;
    await broker.drainOfflineQueue();
    expect(serverInvoke).toHaveBeenCalledTimes(sends);

    const reloaded = await page({ storage, serverInvoke });
    expect(reloaded.broker.queuedWrites('invoicing')).toMatchObject([{ state: 'refused', idempotencyKey: 'k-inv-7' }]);
    expect(await reloaded.broker.discardQueuedWrite('invoicing', receipt.id)).toBe(true);
    expect(reloaded.broker.queuedWrites('invoicing')).toEqual([]);
  });
});
