/**
 * Scope 11 D23 — replay provenance for `time-clock.record_attendance`.
 *
 * An offline punch is scrutinised like a manual entry (owner ruling R6): the
 * server honours the CAPTURED time only when it can tell the write is a drained
 * replay, and it records when the punch was queued. Both facts must come from
 * the runtime, never from MP args — an MP that could set them could back-date
 * its own punches. So the drain stamps `restoreReplay` + `restoreQueuedAt`, and
 * `executeInvoke` forwards them as `restoreContext` for exactly the activities
 * in RESTORE_CONTEXT_ACTIVITIES.
 *
 * Three things are pinned:
 *  1. a drained `record_attendance` carries { replayed: true, queuedAt };
 *  2. a LIVE `record_attendance` (online, never queued) carries NO restoreContext —
 *     the marker cannot be present on a write that did not wait;
 *  3. an activity outside the set gets exactly today's envelope (additive change).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createBroker, createFakeIssuer, createDurableQueue } from '../src/index.js';

function fakeStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

const serverWrite = {
  description: 'a',
  inputSchema: { type: 'object' },
  sideEffect: 'server_write',
  offlineReplayable: true,
  idempotency: 'client_key',
  retry: { maxAttempts: 1 },
};

const TIME_CLOCK = {
  id: 'time-clock', version: '1.0.0', publisher: { type: 'first_party' },
  triggers: {}, conditions: {}, actions: {},
  activities: { record_attendance: serverWrite },
};

const TIMESHEETS = {
  id: 'timesheets', version: '1.0.0', publisher: { type: 'first_party' },
  triggers: {}, conditions: {}, actions: {},
  activities: { submit_timesheet: serverWrite },
};

describe('D23 — record_attendance replay provenance', () => {
  let storage;
  let seen;
  const T0 = 1_700_000_000_000;
  let clock;

  const makeBroker = async ({ online = false } = {}) => {
    const issuer = createFakeIssuer();
    const broker = createBroker({
      capabilityService: issuer,
      online,
      now: () => clock,
      serverInvoke: async (envelope) => { seen.push(envelope); return { ok: true }; },
      offlineQueue: createDurableQueue({ storage, now: () => clock }),
    });
    broker.registerMp(TIME_CLOCK, { handlers: { activities: {} } });
    broker.registerMp(TIMESHEETS, { handlers: { activities: {} } });
    const tc = await issuer.issue('time-clock', '1.0.0', 'team-A', [], 'i-tc');
    const ts = await issuer.issue('timesheets', '1.0.0', 'team-A', [], 'i-ts');
    return {
      broker,
      punch: (key) => broker.invoke({
        sourceMpId: 'time-clock', instanceId: 'i-tc', capabilityToken: tc,
        activity: 'time-clock.record_attendance', args: { status: 'start' }, idempotencyKey: key,
      }),
      timesheet: (key) => broker.invoke({
        sourceMpId: 'timesheets', instanceId: 'i-ts', capabilityToken: ts,
        activity: 'timesheets.submit_timesheet', args: { week: 'w1' }, idempotencyKey: key,
      }),
    };
  };

  beforeEach(() => { storage = fakeStorage(); seen = []; clock = T0; });

  it('a DRAINED punch carries replayed:true and the moment it was queued', async () => {
    const offline = await makeBroker();
    const queued = await offline.punch('k-1');
    expect(queued.status).toBe('queued_offline');
    expect(seen).toEqual([]);

    clock = T0 + 90 * 60 * 1000; // reconnects ninety minutes later
    const online = await makeBroker();
    online.broker.setOnline(true);
    await online.broker.drainOfflineQueue();

    expect(seen).toHaveLength(1);
    const env = seen[0];
    expect(env.activity).toBe('time-clock.record_attendance');
    expect(env.restoreContext).toMatchObject({ replayed: true, tenantId: 'team-A', mpId: 'time-clock' });
    expect(env.restoreContext.queuedAt).toBe(T0);          // set by the drain from the row, not by args
    expect(env.idempotencyKey).toBe('k-1');                // ORIGINAL key survives the replay
    expect(env.args).toEqual({ status: 'start' });         // args are untouched — the marker is beside them
  });

  it('a LIVE punch carries no restoreContext at all', async () => {
    const live = await makeBroker({ online: true });
    await live.punch('k-2');
    expect(seen).toHaveLength(1);
    expect(seen[0].restoreContext).toBeUndefined();
  });

  it('an activity outside the set is untouched — additive, not a global envelope change', async () => {
    const offline = await makeBroker();
    await offline.timesheet('k-3');
    const online = await makeBroker();
    online.broker.setOnline(true);
    await online.broker.drainOfflineQueue();
    expect(seen).toHaveLength(1);
    expect(seen[0].activity).toBe('timesheets.submit_timesheet');
    expect(seen[0].restoreContext).toBeUndefined();
  });
});
