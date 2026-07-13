/**
 * replay.test.js (ac4) — the offline contract: 3 queued triggers replay in
 * FIFO order; a duplicated clock-out-style client_key produces NO second
 * side effect (offline-sync.md §3; actions-runtime.md §3.2).
 */
import { describe, it, expect } from 'vitest';
import { createBroker, createFakeIssuer, QUEUE_MAX_ENTRIES } from '@tommy/actions-runtime';
import { createReplayCoordinator } from '../src/index.js';

const TENANT = 'team-5';

const timeClock = {
  id: 'time-clock',
  version: '1.0.0',
  publisher: { type: 'first_party' },
  triggers: {
    clock_out: { description: 't', payloadSchema: { type: 'object', required: ['seq'] }, emission: 'async' },
  },
  conditions: {},
  activities: {},
  actions: {},
};

const timesheets = {
  id: 'timesheets',
  version: '1.0.0',
  publisher: { type: 'first_party' },
  triggers: {},
  conditions: {},
  activities: {
    upsert_timesheet: {
      description: 'a',
      inputSchema: { type: 'object' },
      sideEffect: 'server_write',
      idempotency: 'client_key',
      offlineReplayable: true,
      authorizedCallers: ['time-clock'],
    },
  },
  actions: {},
};

async function world({ throttleOverrides } = {}) {
  const issuer = createFakeIssuer();
  const applied = [];
  const serverSeenKeys = new Set();
  const serverInvoke = async (envelope) => {
    // The schema-version-aware executor keeps its own processed-key set too —
    // simulate a server that already saw a key (the "reached the server
    // before the connection dropped" case).
    if (serverSeenKeys.has(envelope.idempotencyKey)) {
      return { rpcId: envelope.rpcId, status: 'succeeded', result: { entryId: 'stored-prior' }, replayed: true };
    }
    serverSeenKeys.add(envelope.idempotencyKey);
    applied.push(envelope);
    return { rpcId: envelope.rpcId, status: 'succeeded', result: { entryId: `entry-${applied.length}` } };
  };
  const broker = createBroker({ capabilityService: issuer, serverInvoke, throttleOverrides });
  broker.registerMp(timeClock, { handlers: {} });
  broker.registerMp(timesheets, { handlers: {} });
  const received = [];
  broker.subscribe('timesheets', 'time-clock.clock_out', (payload) => received.push(payload.seq));
  const token = await issuer.issue('time-clock', '1.0.0', TENANT, ['invoke:timesheets.upsert_timesheet'], 'i-1');
  return { broker, token, applied, received, serverSeenKeys, issuer, makeBroker: (opts) => {
    const b = createBroker({ capabilityService: issuer, serverInvoke, ...opts });
    b.registerMp(timeClock, { handlers: {} });
    b.registerMp(timesheets, { handlers: {} });
    return b;
  } };
}

const emitEnv = (w, seq) => ({
  sourceMpId: 'time-clock', instanceId: 'i-1', capabilityToken: w.token,
  trigger: 'time-clock.clock_out', payload: { seq },
});
const invokeEnv = (w, key, seq) => ({
  sourceMpId: 'time-clock', instanceId: 'i-1', capabilityToken: w.token,
  activity: 'timesheets.upsert_timesheet', args: { seq }, idempotencyKey: key,
});

describe('offline replay', () => {
  it('3 queued triggers replay FIFO in emission order on reconnect', async () => {
    const w = await world();
    w.broker.setOnline(false);
    for (const seq of [1, 2, 3]) {
      // eslint-disable-next-line no-await-in-loop
      const receipt = await w.broker.emit(emitEnv(w, seq));
      expect(receipt.queuedFor).toBe(1);
    }
    expect(w.received).toEqual([]);

    const coordinator = createReplayCoordinator({ broker: w.broker, addOnlineListener: () => () => {} });
    await coordinator.drain();
    expect(w.received).toEqual([1, 2, 3]); // FIFO per source MP
    expect(w.broker.queueStats().total).toBe(0);
  });

  it('a duplicated clock-out client_key produces NO second side effect (broker-side de-dup)', async () => {
    const w = await world();
    const KEY = 'tc-clockout-shift-129-tm-8842';
    await w.broker.invoke(invokeEnv(w, KEY, 1));
    expect(w.applied).toHaveLength(1);

    // Same key again — even OFFLINE, a repeat key answers with the stored
    // prior result instead of queuing a second application (§3.2).
    w.broker.setOnline(false);
    const repeat = await w.broker.invoke(invokeEnv(w, KEY, 1));
    expect(repeat.idempotentReplay).toBe(true);
    expect(w.applied).toHaveLength(1);
    expect(w.broker.queueStats().total).toBe(0);
  });

  it('a duplicated client_key across a device restart is de-duped by the SERVER on replay', async () => {
    const w = await world();
    const KEY = 'tc-clockout-shift-129-tm-8842';
    // Reached the server; connection dropped before the app knew.
    await w.broker.invoke(invokeEnv(w, KEY, 1));
    expect(w.applied).toHaveLength(1);

    // Device restart: fresh broker, empty processed-key set — the queued
    // duplicate replays with the ORIGINAL key and the executor de-dups.
    const rebooted = w.makeBroker({ online: false });
    const queued = await rebooted.invoke(invokeEnv(w, KEY, 1));
    expect(queued.status).toBe('queued_offline');
    const coordinator = createReplayCoordinator({ broker: rebooted, addOnlineListener: () => () => {} });
    const results = await coordinator.drain();
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(true);
    expect(w.applied).toHaveLength(1); // server answered stored-prior, not re-applied
  });

  it('replay carries the ORIGINAL idempotency key (server-side de-dup holds too)', async () => {
    const w = await world();
    const KEY = 'tc-clockout-shift-77';
    w.broker.setOnline(false);
    await w.broker.invoke(invokeEnv(w, KEY, 7));
    const coordinator = createReplayCoordinator({ broker: w.broker, addOnlineListener: () => () => {} });
    await coordinator.drain();
    expect(w.applied).toHaveLength(1);
    expect(w.applied[0].idempotencyKey).toBe(KEY);
  });

  it('rejects new queue entries past the per-MP cap with Offline_QueueFull', async () => {
    // Rate limits stay out of the way: this probes the QUEUE cap, not the throttle.
    const w = await world({ throttleOverrides: { 'time-clock': { burst: 1000, invokesPerMin: 100000 } } });
    w.broker.setOnline(false);
    for (let i = 0; i < QUEUE_MAX_ENTRIES; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await w.broker.invoke(invokeEnv(w, `k-${i}`, i));
    }
    const rejection = await w.broker.invoke(invokeEnv(w, 'k-over', 0)).catch((e) => e);
    expect(rejection.code).toBe('Offline_QueueFull');
  }, 30000);

  it('the online listener drains automatically', async () => {
    const w = await world();
    w.broker.setOnline(false);
    await w.broker.emit(emitEnv(w, 9));
    let fire;
    const coordinator = createReplayCoordinator({ broker: w.broker, addOnlineListener: (fn) => { fire = fn; return () => {}; } });
    coordinator.start();
    fire();
    await new Promise((resolve) => { setTimeout(resolve, 10); });
    expect(w.received).toEqual([9]);
    coordinator.stop();
  });
});
