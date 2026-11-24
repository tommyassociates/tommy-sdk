/**
 * A drain that loses the connection part way keeps every row it has not sent
 * where it is: a queued write is never queued again beside itself, so a full
 * queue can never turn it into a refusal that removes it unsent.
 */
import { describe, it, expect } from 'vitest';
import { createBroker, createFakeIssuer, createDurableQueue } from '../src/index.js';

const ACTIVITY = {
  description: 'save', inputSchema: { type: 'object' }, resultSchema: { type: 'object' }, sideEffect: 'server_write',
  idempotency: 'client_key', offlineReplayable: true, retry: { maxAttempts: 1 },
};

describe('a drain that goes offline part way', () => {
  it('keeps the next queued write as it was, once, for the reconnect', async () => {
    const issuer = createFakeIssuer();
    const sent = [];
    const queue = createDurableQueue({ storage: null });
    let broker;
    broker = createBroker({
      capabilityService: issuer, offlineQueue: queue, online: false, idempotencyLedger: null,
      serverInvoke: async (envelope) => { sent.push(envelope.idempotencyKey); return { status: 'succeeded', result: {} }; },
      // The connection drops once the first write is answered, before the next is sent.
      onOfflineOutcome: () => { broker.setOnline(false); },
      replayEnvelope: async (envelope) => ({ ...envelope, instanceId: 'live', capabilityToken: token }),
    });
    broker.registerMp({ id: 'forms', version: '1.0.0', publisher: { type: 'first_party' }, activities: { save: ACTIVITY } });
    const token = await issuer.issue('forms', '1.0.0', 'team-3', [], 'live');
    const invoke = (n) => broker.invoke({
      sourceMpId: 'forms', activity: 'forms.save', args: { n }, idempotencyKey: `k-${n}`, instanceId: 'live', capabilityToken: token,
    });
    await invoke(1);
    await invoke(2);
    const second = queue.all().find((row) => row.envelope.idempotencyKey === 'k-2');
    broker.setOnline(true);
    await broker.drainOfflineQueue();
    expect(sent).toEqual(['k-1']);
    // The same row, once: not removed, not copied.
    expect(queue.all().map((row) => [row.envelope.idempotencyKey, row.seq])).toEqual([['k-2', second.seq]]);
  });
});
