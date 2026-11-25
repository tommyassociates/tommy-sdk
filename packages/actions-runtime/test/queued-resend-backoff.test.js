import { describe, it, expect } from 'vitest';
import { TommyError } from '@tommy/sdk';
import { createBroker, createFakeIssuer } from '../src/index.js';
import { queueResendDelayMs } from '../src/constants.js';

const TENANT = 'team-1';

const punch = {
  description: 'a',
  inputSchema: { type: 'object' },
  resultSchema: { type: 'object' },
  sideEffect: 'server_write',
  idempotency: 'client_key',
  offlineReplayable: true,
  retry: { maxAttempts: 3 },
};

const cut = () => Object.assign(new TommyError({ code: 'Offline', message: 'Network request failed', retryable: true }), { status: 0 });

async function world() {
  const clock = { t: 1000000 };
  const timers = [];
  const sent = [];
  const link = { up: false };
  const issuer = createFakeIssuer();
  const broker = createBroker({
    capabilityService: issuer,
    sleep: async () => {},
    now: () => clock.t,
    setTimer: (fn, ms) => { const timer = { fn, ms }; timers.push(timer); return timer; },
    clearTimer: (timer) => { const at = timers.indexOf(timer); if (at >= 0) timers.splice(at, 1); },
    serverInvoke: async (envelope) => {
      sent.push(envelope.args.at);
      if (!link.up) throw cut();
      return { status: 'succeeded', result: { ok: true } };
    },
  });
  broker.registerMp({
    id: 'timeclock', version: '1.0.0', publisher: { type: 'first_party' },
    triggers: {}, conditions: {}, activities: { punch }, actions: {},
  }, { handlers: { activities: {} } });
  const token = await issuer.issue('timeclock', '1.0.0', TENANT, [], 'i-1');
  const invoke = (at, key) => broker.invoke({
    sourceMpId: 'timeclock', instanceId: 'i-1', capabilityToken: token, activity: 'timeclock.punch', args: { at }, idempotencyKey: key,
  });
  return { broker, invoke, clock, timers, sent, link };
}

describe('a queued write whose sends never reach the server (F8)', () => {
  it('is sent once per try, not again at once on the same link', async () => {
    const w = await world();
    expect((await w.invoke('in', 'k-1')).status).toBe('queued_offline');
    expect(w.sent).toEqual(['in']);
  });

  it('waits before each resend, longer each time, and a drain asked for sooner sends nothing', async () => {
    const w = await world();
    await w.invoke('in', 'k-1');
    expect(await w.broker.drainOfflineQueue()).toEqual([]);
    expect(w.sent).toEqual(['in']);

    w.clock.t += queueResendDelayMs(1);
    await w.broker.drainOfflineQueue();
    expect(w.sent).toEqual(['in', 'in']);

    w.clock.t += queueResendDelayMs(1);
    expect(await w.broker.drainOfflineQueue()).toEqual([]);
    w.clock.t += queueResendDelayMs(2) - queueResendDelayMs(1);
    w.link.up = true;
    const drained = await w.broker.drainOfflineQueue();
    expect(drained).toHaveLength(1);
    expect(drained[0].ok).toBe(true);
    expect(w.sent).toEqual(['in', 'in', 'in']);
    expect(w.broker.queueStats().total).toBe(0);
  });

  it('wakes a drain when the row is due, so it never waits for a trigger that does not come', async () => {
    const w = await world();
    await w.invoke('in', 'k-1');
    expect(w.timers).toHaveLength(1);
    expect(w.timers[0].ms).toBe(queueResendDelayMs(1));

    w.link.up = true;
    w.clock.t += w.timers[0].ms;
    w.timers.shift().fn();
    await w.broker.drainOfflineQueue();
    expect(w.sent).toEqual(['in', 'in']);
    expect(w.broker.queueStats().total).toBe(0);
  });

  it('holds the Mini Program\'s later rows behind a waiting one (clock-in before clock-out)', async () => {
    const w = await world();
    await w.invoke('in', 'k-in');
    await w.invoke('out', 'k-out');
    w.link.up = true;
    expect(await w.broker.drainOfflineQueue()).toEqual([]);
    w.clock.t += queueResendDelayMs(1);
    await w.broker.drainOfflineQueue();
    expect(w.sent).toEqual(['in', 'out', 'in', 'out']);
  });

  it('is sent at once when the device comes back from offline', async () => {
    const w = await world();
    await w.invoke('in', 'k-1');
    w.broker.setOnline(false);
    w.broker.setOnline(true);
    w.link.up = true;
    const drained = await w.broker.drainOfflineQueue();
    expect(drained).toHaveLength(1);
    expect(w.sent).toEqual(['in', 'in']);
  });

  it('caps the wait at two minutes', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 20].map(queueResendDelayMs)).toEqual([5000, 10000, 20000, 40000, 80000, 120000, 120000, 120000]);
  });
});
