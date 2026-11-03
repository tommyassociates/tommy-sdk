/**
 * A replayable server write whose request never reached the server (no
 * connection, though the device reports itself online) is queued like an
 * offline write instead of failing, and the next drain sends it once. A
 * refusal from the server, or a write that is not replayable, still fails.
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
  offlineReplayable: true,
  retry: { maxAttempts: 2 },
  ...extra,
});

const networkDown = () => Object.assign(new Error('Network request failed'), { name: 'MpApiError', status: 0 });

async function world(activities, serverInvoke) {
  const issuer = createFakeIssuer();
  const broker = createBroker({ capabilityService: issuer, serverInvoke, sleep: async () => {} });
  broker.registerMp({
    id: 'timeclock', version: '1.0.0', publisher: { type: 'first_party' },
    triggers: {}, conditions: {}, activities, actions: {},
  }, { handlers: { activities: {} } });
  const token = await issuer.issue('timeclock', '1.0.0', TENANT, [], 'i-1');
  const invoke = (name, args = {}, extra = {}) => broker.invoke({
    sourceMpId: 'timeclock', instanceId: 'i-1', capabilityToken: token, activity: `timeclock.${name}`, args, ...extra,
  });
  return { broker, invoke };
}

describe('a write that cannot reach the server while the device reports online', () => {
  it('is queued, not failed, and the next drain sends it once', async () => {
    let up = false;
    const sent = [];
    const w = await world({ punch: activity() }, async (envelope) => {
      if (!up) throw networkDown();
      sent.push(envelope.args);
      return { status: 'succeeded', result: { ok: true } };
    });

    const outcome = await w.invoke('punch', { at: 't1' }, { idempotencyKey: 'k-1' });
    expect(outcome.status).toBe('queued_offline');
    expect(w.broker.queueStats().total).toBe(1);

    const still = await w.broker.drainOfflineQueue();
    expect(still[0].ok).toBe(false);
    expect(w.broker.queueStats().total).toBe(1);

    up = true;
    const drained = await w.broker.drainOfflineQueue();
    expect(drained).toHaveLength(1);
    expect(drained[0].ok).toBe(true);
    expect(sent).toEqual([{ at: 't1' }]);
    expect(w.broker.queueStats().total).toBe(0);
  });

  it('still fails a server refusal, and a write that is not replayable', async () => {
    const refused = Object.assign(new Error('invalid'), { name: 'MpApiError', status: 422 });
    const w = await world(
      { punch: activity(), once: activity({ offlineReplayable: false, idempotency: 'none' }) },
      async (envelope) => { throw envelope.activity.endsWith('punch') ? refused : networkDown(); },
    );
    await expect(w.invoke('punch', {}, { idempotencyKey: 'k-2' })).rejects.toMatchObject({ code: 'ActivityFailed' });
    await expect(w.invoke('once', {})).rejects.toMatchObject({ code: 'ActivityFailed' });
    expect(w.broker.queueStats().total).toBe(0);
  });

  it('does not queue a server 5xx: the server answered', async () => {
    const serverError = Object.assign(new Error('boom'), { name: 'MpApiError', status: 503 });
    const w = await world({ punch: activity() }, async () => { throw serverError; });
    await expect(w.invoke('punch', {}, { idempotencyKey: 'k-5xx' })).rejects.toMatchObject({ code: 'ActivityFailed' });
    expect(w.broker.queueStats().total).toBe(0);
  });

  it('replays the queued write with its original key, and keeps the order of writes queued after it', async () => {
    let up = false;
    const sent = [];
    const w = await world({ punch: activity() }, async (envelope) => {
      if (!up) throw networkDown();
      sent.push({ at: envelope.args.at, key: envelope.idempotencyKey });
      return { status: 'succeeded', result: { ok: true } };
    });
    expect((await w.invoke('punch', { at: 'in' }, { idempotencyKey: 'k-in' })).status).toBe('queued_offline');
    expect((await w.invoke('punch', { at: 'out' }, { idempotencyKey: 'k-out' })).status).toBe('queued_offline');
    expect(w.broker.queueStats().total).toBe(2);
    up = true;
    await w.broker.drainOfflineQueue();
    expect(sent).toEqual([{ at: 'in', key: 'k-in' }, { at: 'out', key: 'k-out' }]);
    await w.broker.drainOfflineQueue();
    expect(sent).toHaveLength(2);
    expect(w.broker.queueStats().total).toBe(0);
  });

  it('queues a write that timed out with no answer (status 0)', async () => {
    const timedOut = Object.assign(new Error('timed out'), { name: 'MpApiError', status: 0, timedOut: true });
    const w = await world({ punch: activity() }, async () => { throw timedOut; });
    expect((await w.invoke('punch', {}, { idempotencyKey: 'k-to' })).status).toBe('queued_offline');
    expect(w.broker.queueStats().total).toBe(1);
  });
});
