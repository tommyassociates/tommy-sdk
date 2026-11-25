import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createBroker, createFakeIssuer, createDurableQueue } from '../src/index.js';

const TENANT = 'team-1';
const FIXTURE = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/hds-contract/J4-receipts-with-key.json', import.meta.url)), 'utf8'));

function fakeStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

const writeActivity = (idempotency = 'client_key') => ({
  description: 'a',
  inputSchema: { type: 'object' },
  sideEffect: 'server_write',
  idempotency,
  offlineReplayable: true,
  retry: { maxAttempts: 1 },
});

async function offlinePage(storage) {
  const issuer = createFakeIssuer();
  const broker = createBroker({
    capabilityService: issuer,
    serverInvoke: async () => ({ ok: true }),
    online: false,
    offlineQueue: createDurableQueue({ storage }),
    queueOwner: () => ({ tenantId: TENANT, person: '5', accountType: 'Team', accountId: '3' }),
    sleep: async () => {},
  });
  broker.registerMp({
    id: 'leave', version: '1.0.0', publisher: { type: 'first_party' }, triggers: {}, conditions: {},
    activities: { reject_leave_request: writeActivity(), touch: writeActivity('derived_from_input') }, actions: {},
  }, { handlers: { activities: {} } });
  const token = await issuer.issue('leave', '1.0.0', TENANT, [], 'i-l');
  const invoke = (activity, args, idempotencyKey) => broker.invoke({
    sourceMpId: 'leave', instanceId: 'i-l', capabilityToken: token, activity, args, ...(idempotencyKey ? { idempotencyKey } : {}),
  });
  return { broker, invoke };
}

describe('queued write receipts carry their idempotency key (J4-receipts-with-key)', () => {
  it('lists the fixture\'s queued write with its key, after a reload too', async () => {
    const storage = fakeStorage();
    const [queued] = FIXTURE.given.queue;
    const first = await offlinePage(storage);
    const answer = await first.invoke(queued.activity, queued.args, queued.idempotencyKey);
    expect(answer.status).toBe('queued_offline');

    const [expected] = FIXTURE.timeline[0].payload.receipts;
    for (const broker of [first.broker, (await offlinePage(storage)).broker]) {
      const [receipt] = broker.queuedWrites('leave');
      expect(receipt).toMatchObject({
        activity: expected.activity, args: expected.args, attempts: expected.attempts, state: expected.state, idempotencyKey: expected.idempotencyKey,
      });
      expect(Object.keys(receipt).sort()).toEqual(Object.keys(expected).sort());
    }
  });

  it('a derived key travels on the receipt too', async () => {
    const { broker, invoke } = await offlinePage(fakeStorage());
    await invoke('leave.touch', { id: 'x' });
    const [receipt] = broker.queuedWrites('leave');
    expect(typeof receipt.idempotencyKey).toBe('string');
    expect(receipt.idempotencyKey.length).toBeGreaterThan(0);
  });
});
