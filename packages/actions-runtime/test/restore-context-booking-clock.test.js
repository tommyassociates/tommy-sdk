import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBroker, createDurableQueue, createFakeIssuer } from '../src/index.js';

const QUEUED_AT = 1_700_000_000_000;
const ARGS = { parentShiftId: '1', childShiftId: '2', direction: 'in', at: '2023-11-14T22:13:20Z' };
const KEY = '31bf2317-c8dd-49b0-a0a2-cd7568a35f40';
const MANIFEST = {
  id: 'time-clock', version: '1.0.0', publisher: { type: 'first_party' },
  triggers: {}, conditions: {}, actions: {},
  activities: {
    record_booking_clock: {
      inputSchema: { type: 'object' }, sideEffect: 'server_write',
      offlineReplayable: true, idempotency: 'client_key', retry: { maxAttempts: 1 },
    },
  },
};

describe('booking clock drain provenance', () => {
  let storage;
  let now;
  let serverInvoke;

  beforeEach(() => {
    const rows = new Map();
    storage = {
      getItem: (key) => rows.get(key) ?? null,
      setItem: (key, value) => rows.set(key, String(value)),
      removeItem: (key) => rows.delete(key),
    };
    now = QUEUED_AT;
    serverInvoke = vi.fn(async () => ({ ok: true }));
  });

  async function runtime(online) {
    const issuer = createFakeIssuer({ now: () => now });
    const queue = createDurableQueue({ storage, now: () => now, held: new Set() });
    const broker = createBroker({ capabilityService: issuer, online, now: () => now, serverInvoke, offlineQueue: queue });
    broker.registerMp(MANIFEST);
    const capabilityToken = await issuer.issue('time-clock', '1.0.0', 'team-A', [], 'clock-instance');
    return {
      broker, queue,
      clock: (args = ARGS) => broker.invoke({
        sourceMpId: 'time-clock', instanceId: 'clock-instance', capabilityToken,
        activity: 'time-clock.record_booking_clock', args, idempotencyKey: KEY,
      }),
    };
  }

  it('restores one paired booking write with its original queue time and UUID', async () => {
    const args = { ...ARGS, offline_replay: false, queued_at: 1, offlineReplay: false, queuedAt: 2 };
    const offline = await runtime(false);
    expect((await offline.clock(args)).status).toBe('queued_offline');
    expect(serverInvoke).not.toHaveBeenCalled();
    expect(offline.queue.all()).toHaveLength(1);

    now += 90 * 60 * 1000;
    const restarted = await runtime(true);
    expect(restarted.queue.all()).toHaveLength(1);
    const outcomes = await restarted.broker.drainOfflineQueue();
    expect(outcomes).toEqual([expect.objectContaining({ ok: true })]);
    expect(serverInvoke).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      activity: 'time-clock.record_booking_clock', args, idempotencyKey: KEY,
      restoreContext: expect.objectContaining({
        replayed: true, queuedAt: QUEUED_AT, tenantId: 'team-A', mpId: 'time-clock', instanceId: 'clock-instance',
      }),
    }));
    expect(restarted.queue.all()).toEqual([]);
  });

  it('does not give live calls provenance even when MP args forge it', async () => {
    const live = await runtime(true);
    await live.clock({ ...ARGS, offline_replay: true, queued_at: QUEUED_AT, offlineReplay: true, queuedAt: QUEUED_AT });
    expect(serverInvoke).toHaveBeenCalledTimes(1);
    expect(serverInvoke.mock.calls[0][0]).not.toHaveProperty('restoreContext');
    expect(live.queue.all()).toEqual([]);
  });

  it('does not give an inspector replay of a live failure offline provenance', async () => {
    serverInvoke.mockRejectedValueOnce(new Error('server failure'));
    const live = await runtime(true);
    await expect(live.clock()).rejects.toMatchObject({ code: 'ActivityFailed' });
    const [failed] = await live.broker.records.query({ kind: 'invoke', status: 'dead_letter' });
    expect(failed).toBeDefined();
    now += 90 * 60 * 1000;
    await live.broker.replay(failed.runId);
    expect(serverInvoke).toHaveBeenCalledTimes(2);
    for (const [envelope] of serverInvoke.mock.calls) expect(envelope).not.toHaveProperty('restoreContext');
    expect(live.queue.all()).toEqual([]);
  });
});
