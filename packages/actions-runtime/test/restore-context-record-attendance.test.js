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

    clock = T0 + 90 * 60 * 1000;
    const online = await makeBroker();
    online.broker.setOnline(true);
    await online.broker.drainOfflineQueue();

    expect(seen).toHaveLength(1);
    const env = seen[0];
    expect(env.activity).toBe('time-clock.record_attendance');
    expect(env.restoreContext).toMatchObject({ replayed: true, tenantId: 'team-A', mpId: 'time-clock' });
    expect(env.restoreContext.queuedAt).toBe(T0);
    expect(env.idempotencyKey).toBe('k-1');
    expect(env.args).toEqual({ status: 'start' });
  });

  it('a LIVE punch carries no restoreContext at all', async () => {
    const live = await makeBroker({ online: true });
    await live.punch('k-2');
    expect(seen).toHaveLength(1);
    expect(seen[0].restoreContext).toBeUndefined();
  });

  it('an INSPECTOR replay of a live failed punch is NOT a drain — no restoreContext (Codex P1)', async () => {
    let fail = true;
    const issuer = createFakeIssuer();
    const broker = createBroker({
      capabilityService: issuer,
      online: true,
      now: () => clock,
      serverInvoke: async (envelope) => { seen.push(envelope); if (fail) throw new Error('500'); return { ok: true }; },
      offlineQueue: createDurableQueue({ storage, now: () => clock }),
    });
    broker.registerMp(TIME_CLOCK, { handlers: { activities: {} } });
    const tc = await issuer.issue('time-clock', '1.0.0', 'team-A', [], 'i-tc');
    await broker.invoke({
      sourceMpId: 'time-clock', instanceId: 'i-tc', capabilityToken: tc,
      activity: 'time-clock.record_attendance', args: { status: 'start' }, idempotencyKey: 'k-4',
    }).catch(() => {});
    expect(seen).toHaveLength(1);
    const [dead] = await broker.records.query({ kind: 'invoke', status: 'dead_letter' });
    expect(dead).toBeDefined();

    fail = false;
    seen = [];
    await broker.replay(dead.runId);
    expect(seen).toHaveLength(1);
    expect(seen[0].restoreContext).toBeUndefined();
  });

  it('a drained team.update_member keeps its pre-existing restoreContext shape — no queuedAt (Codex P2)', async () => {
    const TEAM = {
      id: 'team', version: '1.0.0', publisher: { type: 'first_party' },
      triggers: {}, conditions: {}, actions: {},
      activities: { update_member: serverWrite },
    };
    const mk = async (online) => {
      const issuer = createFakeIssuer();
      const broker = createBroker({
        capabilityService: issuer, online, now: () => clock,
        serverInvoke: async (envelope) => { seen.push(envelope); return { ok: true }; },
        offlineQueue: createDurableQueue({ storage, now: () => clock }),
      });
      broker.registerMp(TEAM, { handlers: { activities: {} } });
      const tok = await issuer.issue('team', '1.0.0', 'team-A', [], 'i-team');
      return { broker, tok };
    };
    const off = await mk(false);
    await off.broker.invoke({
      sourceMpId: 'team', instanceId: 'i-team', capabilityToken: off.tok,
      activity: 'team.update_member', args: { id: 1 }, idempotencyKey: 'k-5',
    });
    const on = await mk(true);
    on.broker.setOnline(true);
    await on.broker.drainOfflineQueue();
    expect(seen).toHaveLength(1);
    expect(seen[0].restoreContext).toBeDefined();
    expect(seen[0].restoreContext.replayed).toBe(true);
    expect(Object.keys(seen[0].restoreContext).sort()).toEqual(['deadlineAt', 'instanceId', 'mpId', 'replayed', 'tenantId']);
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
