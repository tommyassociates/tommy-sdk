/**
 * D.43 — the durable offline queue.
 *
 * The test that matters is `SURVIVES A RELOAD`: it queues a write offline,
 * throws the broker away, builds a SECOND one over the SAME storage, and drains
 * it. That is what a reload actually is, and before this the row simply
 * evaporated while the MP's promise had already resolved as queued.
 *
 * The rest pin the ruled trade: rows carry tenant payloads, so the bound (they
 * are deleted as they drain) and the TTL (a stale row is DROPPED, not replayed)
 * are the price the ruling was given at, not incidental hygiene.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createBroker, createFakeIssuer, createDurableQueue } from '../src/index.js';

/** A localStorage stand-in that PERSISTS across broker instances, like the real one. */
function fakeStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    _raw: data,
  };
}

const MANIFEST = {
  id: 'timesheets',
  version: '1.0.0',
  publisher: { type: 'first_party' },
  triggers: {},
  conditions: {},
  activities: {
    submit_timesheet: {
      description: 'a',
      inputSchema: { type: 'object' },
      sideEffect: 'server_write',
      offlineReplayable: true,
      idempotency: 'client_key',
      retry: { maxAttempts: 1 },
    },
  },
  actions: {},
};

describe('D.43 — the offline queue survives a reload', () => {
  let storage;
  let applied;

  const makeBroker = async ({ online = false, queue } = {}) => {
    const issuer = createFakeIssuer();
    const broker = createBroker({
      capabilityService: issuer,
      online,
      // `submit_timesheet` is a `server_write`, so the write lands HERE, not in a
      // local handler — which is the whole point: the row being replayed is a
      // pending call to the server, and losing it loses the user's submission.
      serverInvoke: async (envelope) => { applied.push(envelope.args.week); return { ok: true }; },
      offlineQueue: queue === undefined ? createDurableQueue({ storage }) : queue,
    });
    broker.registerMp(MANIFEST, { handlers: { activities: {} } });
    const token = await issuer.issue('timesheets', '1.0.0', 'team-A', [], 'i-a');
    const call = (week, key) => broker.invoke({
      sourceMpId: 'timesheets', instanceId: 'i-a', capabilityToken: token,
      activity: 'timesheets.submit_timesheet', args: { week }, idempotencyKey: key,
    });
    return { broker, call };
  };

  beforeEach(() => { storage = fakeStorage(); applied = []; });

  it('SURVIVES A RELOAD — a write queued offline drains on a SECOND broker', async () => {
    const first = await makeBroker();
    const queued = await first.call('w1', 'k-1');
    expect(queued.status).toBe('queued_offline');
    expect(applied).toEqual([]);                     // nothing applied yet — it is offline

    // The reload: brand-new broker, brand-new in-memory array, SAME storage.
    const second = await makeBroker();
    expect(second.broker.queueStats().total).toBe(1); // the row came back

    second.broker.setOnline(true);
    await second.broker.drainOfflineQueue();
    expect(applied).toEqual(['w1']);                 // the write the MP was promised
  });

  it('a drained row is GONE from storage — the resting set is pending writes, not history', async () => {
    const first = await makeBroker();
    await first.call('w1', 'k-1');
    first.broker.setOnline(true);
    await first.broker.drainOfflineQueue();

    const second = await makeBroker();
    expect(second.broker.queueStats().total).toBe(0);
    expect(JSON.parse(storage.getItem('mp-offline-queue')).rows).toEqual([]);
  });

  it('DROPS a row past its TTL rather than replaying it — and reports the drop', async () => {
    let clock = 1_000_000;
    const first = await makeBroker({ queue: createDurableQueue({ storage, now: () => clock }) });
    await first.call('w1', 'k-1');

    clock += 8 * 24 * 60 * 60 * 1000;                // eight days later
    const stale = createDurableQueue({ storage, now: () => clock });
    expect(stale.all()).toEqual([]);
    expect(stale.expiredOnLoad()).toBe(1);           // surfaced, not silently swallowed

    const second = await makeBroker({ queue: stale });
    second.broker.setOnline(true);
    await second.broker.drainOfflineQueue();
    expect(applied).toEqual([]);                     // a three-week-old edit is NOT applied over later truth
  });

  it('a row INSIDE the TTL still replays — the drop is bounded by time, not by reload', async () => {
    let clock = 1_000_000;
    const first = await makeBroker({ queue: createDurableQueue({ storage, now: () => clock }) });
    await first.call('w1', 'k-1');

    clock += 6 * 24 * 60 * 60 * 1000;                // six days — inside the 7-day bound
    const second = await makeBroker({ queue: createDurableQueue({ storage, now: () => clock }) });
    second.broker.setOnline(true);
    await second.broker.drainOfflineQueue();
    expect(applied).toEqual(['w1']);
  });

  it('FIFO order is preserved across the reload, not just within a session', async () => {
    const first = await makeBroker();
    await first.call('w1', 'k-1');
    await first.call('w2', 'k-2');
    await first.call('w3', 'k-3');

    const second = await makeBroker();
    second.broker.setOnline(true);
    await second.broker.drainOfflineQueue();
    expect(applied).toEqual(['w1', 'w2', 'w3']);
  });

  it('NEVER throws when storage is absent, corrupt or over quota — it degrades to memory', () => {
    expect(() => createDurableQueue({ storage: null })).not.toThrow();

    const corrupt = fakeStorage();
    corrupt.setItem('mp-offline-queue', '{not json');
    const q = createDurableQueue({ storage: corrupt });
    expect(q.all()).toEqual([]);                     // empty, not poisoned

    const full = { getItem: () => null, setItem: () => { throw new Error('QuotaExceeded'); } };
    const quota = createDurableQueue({ storage: full });
    expect(() => quota.push({ sourceMpId: 'timesheets', envelope: { a: 1 }, bytes: 2 })).not.toThrow();
    expect(quota.all()).toHaveLength(1);             // still queued IN MEMORY — today's behaviour
  });

  it('persistence can be turned OFF, and then a reload loses the row (the OLD behaviour)', async () => {
    const first = await makeBroker({ queue: null });
    await first.call('w1', 'k-1');
    expect(first.broker.queueStats().total).toBe(1);

    const second = await makeBroker({ queue: null });
    expect(second.broker.queueStats().total).toBe(0);
  });
});
