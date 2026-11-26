/**
 * A server write that is not replayable fails offline, unless the host says
 * it keeps that write durably itself: then it runs offline, once per key.
 */
import { describe, it, expect } from 'vitest';
import { createBroker, createFakeIssuer } from '../src/index.js';

const TENANT = 'team-1';
const activity = (extra = {}) => ({
  description: 'a',
  inputSchema: { type: 'object' },
  resultSchema: { type: 'object' },
  sideEffect: 'server_write',
  idempotency: 'client_key',
  offlineReplayable: false,
  retry: { maxAttempts: 1 },
  ...extra,
});

async function world({ hostKeptOffline, activities = { send_media: activity() } } = {}) {
  const issuer = createFakeIssuer();
  const sent = [];
  const broker = createBroker({
    capabilityService: issuer, sleep: async () => {}, online: false, hostKeptOffline,
    serverInvoke: async (envelope) => { sent.push(envelope); return { status: 'succeeded', result: { status: 'pending' } }; },
  });
  broker.registerMp({
    id: 'team-comms', version: '1.0.0', publisher: { type: 'first_party' },
    triggers: {}, conditions: {}, activities, actions: {},
  }, { handlers: { activities: {} } });
  const token = await issuer.issue('team-comms', '1.0.0', TENANT, [], 'i-1');
  const invoke = (name, args = {}, key = 'k-1') => broker.invoke({
    sourceMpId: 'team-comms', instanceId: 'i-1', capabilityToken: token, activity: `team-comms.${name}`, args, idempotencyKey: key,
  });
  return { broker, invoke, sent };
}

describe('a write the host keeps itself', () => {
  it('fails offline when the host does not keep it', async () => {
    const w = await world({ hostKeptOffline: () => false });
    await expect(w.invoke('send_media', { body: 'x' })).rejects.toMatchObject({ code: 'Offline' });
    expect(w.sent).toEqual([]);
  });

  it('runs offline when the host keeps it, and a second invoke under the key does not run again', async () => {
    const asked = [];
    const w = await world({ hostKeptOffline: (envelope) => { asked.push(envelope); return true; } });
    const first = await w.invoke('send_media', { body: 'x' });
    expect(first.result).toEqual({ status: 'pending' });
    expect(asked[0]).toMatchObject({ activity: 'team-comms.send_media', args: { body: 'x' }, idempotencyKey: expect.stringContaining('k-1') });
    const again = await w.invoke('send_media', { body: 'x' });
    expect(again.idempotentReplay).toBe(true);
    expect(w.sent).toHaveLength(1);
    expect(w.broker.queueStats().total).toBe(0);
  });

  it('a host check that throws reads as not kept', async () => {
    const w = await world({ hostKeptOffline: () => { throw new Error('binding gone'); } });
    await expect(w.invoke('send_media', { body: 'x' })).rejects.toMatchObject({ code: 'Offline' });
  });

  it('never applies to a replayable write, which is queued as before', async () => {
    let asked = 0;
    const w = await world({ hostKeptOffline: () => { asked += 1; return true; },
      activities: { send_message: activity({ offlineReplayable: true, retry: { maxAttempts: 2 } }) } });
    const outcome = await w.invoke('send_message', { body: 'x' });
    expect(outcome.status).toBe('queued_offline');
    expect(asked).toBe(0);
    expect(w.sent).toEqual([]);
  });
});
