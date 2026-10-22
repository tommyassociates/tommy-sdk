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
import { TommyError } from '@tommy/sdk';
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

  const makeBroker = async ({ online = false, queue, onOfflineOutcome } = {}) => {
    const issuer = createFakeIssuer();
    const broker = createBroker({
      capabilityService: issuer,
      online,
      onOfflineOutcome,
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

  it('reports each drained original envelope once and isolates observer failures', async () => {
    const first = await makeBroker();
    await first.call('w1', 'original-1');
    await first.call('w2', 'original-2');
    const outcomes = [];
    const second = await makeBroker({ onOfflineOutcome: (envelope, outcome) => {
      outcomes.push({ key: envelope.idempotencyKey, week: envelope.args.week, ok: outcome.ok });
      if (outcomes.length === 1) throw new Error('Observer failed');
      return Promise.reject(new Error('Async observer failed'));
    } });
    second.broker.setOnline(true);
    const results = await second.broker.drainOfflineQueue();
    expect(results.map((row) => row.ok)).toEqual([true, true]);
    expect(outcomes).toEqual([{ key: 'original-1', week: 'w1', ok: true }, { key: 'original-2', week: 'w2', ok: true }]);
    expect(applied).toEqual(['w1', 'w2']);
    expect(second.broker.queueStats().total).toBe(0);
  });

  it('never throws when storage is absent or corrupt; storage over quota refuses the new row', () => {
    expect(() => createDurableQueue({ storage: null })).not.toThrow();

    const corrupt = fakeStorage();
    corrupt.setItem('mp-offline-queue', '{not json');
    const q = createDurableQueue({ storage: corrupt });
    expect(q.all()).toEqual([]);                     // empty, not poisoned

    const full = { getItem: () => null, setItem: () => { throw new Error('QuotaExceeded'); } };
    const quota = createDurableQueue({ storage: full });
    expect(() => quota.push({ sourceMpId: 'timesheets', envelope: { a: 1 }, bytes: 2 }))
      .toThrow(expect.objectContaining({ name: 'QueueNotKept' }));
    expect(quota.all()).toHaveLength(0);             // never reported as queued
  });

  it('persistence can be turned OFF, and then a reload loses the row (the OLD behaviour)', async () => {
    const first = await makeBroker({ queue: null });
    await first.call('w1', 'k-1');
    expect(first.broker.queueStats().total).toBe(1);

    const second = await makeBroker({ queue: null });
    expect(second.broker.queueStats().total).toBe(0);
  });
});

describe('a queued row leaves the queue only once the server has answered it', () => {
  let storage;
  let applied;
  let answer;

  const makeBroker = async ({ onOfflineOutcome } = {}) => {
    const issuer = createFakeIssuer();
    const broker = createBroker({
      capabilityService: issuer,
      online: false,
      onOfflineOutcome,
      serverInvoke: async (envelope) => answer(envelope),
      offlineQueue: createDurableQueue({ storage }),
    });
    broker.registerMp(MANIFEST, { handlers: { activities: {} } });
    const token = await issuer.issue('timesheets', '1.0.0', 'team-A', [], 'i-a');
    const call = (week, key) => broker.invoke({
      sourceMpId: 'timesheets', instanceId: 'i-a', capabilityToken: token,
      activity: 'timesheets.submit_timesheet', args: { week }, idempotencyKey: key,
    });
    return { broker, call };
  };
  const stored = () => JSON.parse(storage.getItem('mp-offline-queue')).rows.map((row) => row.envelope.args.week);
  const sends = () => { answer = async (envelope) => { applied.push(envelope.args.week); return { ok: true }; }; };
  const noNetwork = () => { answer = async () => { throw new TypeError('Failed to fetch'); }; };

  beforeEach(() => { storage = fakeStorage(); applied = []; sends(); });

  it('keeps a row whose send got no answer', async () => {
    const { broker, call } = await makeBroker();
    await call('w1', 'k-1');
    noNetwork();
    broker.setOnline(true);
    await broker.drainOfflineQueue();

    expect(stored()).toEqual(['w1']);
    expect(broker.queueStats().total).toBe(1);
    sends();
    await broker.drainOfflineQueue();
    expect(applied).toEqual(['w1']);
    expect(stored()).toEqual([]);
  });

  it('keeps a row in storage while it is being sent, so a reload mid-send still has it', async () => {
    const { broker, call } = await makeBroker();
    await call('w1', 'k-1');
    let release;
    answer = (envelope) => new Promise((resolve) => { release = () => { applied.push(envelope.args.week); resolve({ ok: true }); }; });
    broker.setOnline(true);
    const draining = broker.drainOfflineQueue();
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    expect(createDurableQueue({ storage }).all()).toHaveLength(1);
    release();
    await draining;
    expect(createDurableQueue({ storage }).all()).toHaveLength(0);
  });

  it('removes a row the server refused (4xx) and reports it', async () => {
    const outcomes = [];
    const { broker, call } = await makeBroker({ onOfflineOutcome: (envelope, outcome) => outcomes.push(outcome.ok) });
    await call('w1', 'k-1');
    answer = async () => { throw Object.assign(new Error('Unprocessable'), { status: 422 }); };
    broker.setOnline(true);
    await broker.drainOfflineQueue();

    expect(stored()).toEqual([]);
    expect(outcomes).toEqual([false]);
  });

  it('removes a row the host refused for good, and keeps one it can only send later', async () => {
    const outcomes = [];
    const { broker, call } = await makeBroker({ onOfflineOutcome: (envelope, outcome) => outcomes.push(outcome.error?.cause?.code) });
    await call('w1', 'k-1');
    broker.setOnline(true);
    answer = async () => { throw new TommyError({ code: 'ACCOUNT_NOT_DISPLAYED', message: 'Not on screen', retryable: true }); };
    await broker.drainOfflineQueue();
    expect(stored()).toEqual(['w1']);

    answer = async () => { throw new TommyError({ code: 'CHAT_ACCESS_REVOKED', message: 'No access', retryable: false }); };
    await broker.drainOfflineQueue();
    expect(stored()).toEqual([]);
    expect(outcomes).toEqual(['CHAT_ACCESS_REVOKED']);
  });

  it('keeps a row the server asked to slow down (429) or failed on (5xx)', async () => {
    const { broker, call } = await makeBroker();
    await call('w1', 'k-1');
    broker.setOnline(true);
    for (const status of [429, 503]) {
      answer = async () => { throw Object.assign(new Error('Busy'), { response: { status } }); };
      // eslint-disable-next-line no-await-in-loop
      await broker.drainOfflineQueue();
      expect(stored()).toEqual(['w1']);
    }
  });

  it('holds back a Mini Program\'s later rows behind one that is kept (clock-in before clock-out)', async () => {
    const { broker, call } = await makeBroker();
    await call('w1', 'k-1');
    await call('w2', 'k-2');
    let first = true;
    answer = async (envelope) => {
      if (first) { first = false; throw new TypeError('Failed to fetch'); }
      applied.push(envelope.args.week);
      return { ok: true };
    };
    broker.setOnline(true);
    await broker.drainOfflineQueue();
    expect(applied).toEqual([]);
    expect(stored()).toEqual(['w1', 'w2']);

    await broker.drainOfflineQueue();
    expect(applied).toEqual(['w1', 'w2']);
  });

  it('sends each row once when two drains start together', async () => {
    const { broker, call } = await makeBroker();
    await call('w1', 'k-1');
    broker.setOnline(true);
    await Promise.all([broker.drainOfflineQueue(), broker.drainOfflineQueue()]);
    expect(applied).toEqual(['w1']);
  });
});

describe('a queued row is sent only by the person and account that queued it', () => {
  let storage;
  let applied;

  const owner = (person, accountId, tenantId = `team-${accountId}`) => ({ person, accountType: 'Team', accountId, tenantId });
  const makeBroker = async (queueOwner, tenantId = queueOwner?.tenantId || 'team-A') => {
    const issuer = createFakeIssuer();
    const broker = createBroker({
      capabilityService: issuer,
      online: false,
      queueOwner: queueOwner && (() => queueOwner),
      serverInvoke: async (envelope) => { applied.push(`${tenantId}:${envelope.args.week}`); return { ok: true }; },
      offlineQueue: createDurableQueue({ storage }),
    });
    broker.registerMp(MANIFEST, { handlers: { activities: {} } });
    const token = await issuer.issue('timesheets', '1.0.0', tenantId, [], 'i-a');
    const call = (week, key) => broker.invoke({
      sourceMpId: 'timesheets', instanceId: 'i-a', capabilityToken: token,
      activity: 'timesheets.submit_timesheet', args: { week }, idempotencyKey: key,
    });
    return { broker, call };
  };
  const stored = () => JSON.parse(storage.getItem('mp-offline-queue')).rows.map((row) => row.envelope.args.week);

  beforeEach(() => { storage = fakeStorage(); applied = []; });

  it('a row queued in team A is not sent by team B, and is still there when A opens', async () => {
    const a = await makeBroker(owner('1', '3'));
    await a.call('a-week', 'k-a');

    const b = await makeBroker(owner('1', '8'));
    expect(b.broker.queueStats().total).toBe(0);
    b.broker.setOnline(true);
    await b.broker.drainOfflineQueue();
    expect(applied).toEqual([]);
    expect(stored()).toEqual(['a-week']);

    const again = await makeBroker(owner('1', '3'));
    again.broker.setOnline(true);
    await again.broker.drainOfflineQueue();
    expect(applied).toEqual(['team-3:a-week']);
  });

  it('person A\'s row is not sent by person B on the same team', async () => {
    const a = await makeBroker(owner('1', '3'));
    await a.call('a-week', 'k-a');

    const b = await makeBroker(owner('2', '3'));
    b.broker.setOnline(true);
    await b.broker.drainOfflineQueue();
    expect(applied).toEqual([]);
    expect(stored()).toEqual(['a-week']);
  });

  it('a row from before stamping is adopted only by a world of the same tenant', async () => {
    const old = await makeBroker(null, 'team-3');
    await old.call('old-week', 'k-old');

    const other = await makeBroker(owner('1', '8'));
    other.broker.setOnline(true);
    await other.broker.drainOfflineQueue();
    expect(applied).toEqual([]);

    const same = await makeBroker(owner('1', '3'));
    same.broker.setOnline(true);
    await same.broker.drainOfflineQueue();
    expect(applied).toEqual(['team-3:old-week']);
  });
});
