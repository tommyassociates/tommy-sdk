import { describe, it, expect } from 'vitest';
import { createBroker, createFakeIssuer, createRecordStore, createMemoryBackend } from '../src/index.js';

const TENANT = 'team-1';

const CONDITION_CACHE_MAX = 500;
const PROCESSED_KEYS_MAX = 1000;

const activity = (extra = {}) => ({
  description: 'a',
  inputSchema: { type: 'object' },
  resultSchema: { type: 'object' },
  sideEffect: 'local_write',
  offlineReplayable: false,
  retry: { maxAttempts: 1 },
  ...extra,
});

const ticker = (from = 1_000_000) => {
  let t = from;
  return () => (t += 1);
};

describe('run records — the full-fidelity window is bounded, the history is not', () => {
  const makeStore = (opts) => createRecordStore({ backend: createMemoryBackend(), now: ticker(), ...opts });

  async function runOnce(store, i) {
    const record = await store.open({
      kind: 'invoke', activityName: `a${i}`, sourceMpId: 'timesheets', tenantId: TENANT, args: { shiftId: `s-${i}` },
    });
    await store.update(record.runId, { status: 'succeeded', result: { total: i }, payload: { note: `p-${i}` } });
    return record;
  }

  it('the NEWEST records keep args/result; one pushed out is STILL THERE, redacted', async () => {
    const store = makeStore({ fullFidelityMax: 3 });
    const runs = [];
    for (let i = 0; i < 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      runs.push(await runOnce(store, i));
    }

    for (const i of [2, 3, 4]) {
      // eslint-disable-next-line no-await-in-loop
      const kept = await store.get(runs[i].runId);
      expect(kept.args).toEqual({ shiftId: `s-${i}` });
      expect(kept.result).toEqual({ total: i });
      expect(kept.payload).toEqual({ note: `p-${i}` });
    }

    for (const i of [0, 1]) {
      // eslint-disable-next-line no-await-in-loop
      const fallen = await store.get(runs[i].runId);
      expect(fallen).toBeDefined();
      expect(fallen.runId).toBe(runs[i].runId);
      expect(fallen.activityName).toBe(`a${i}`);
      expect(fallen.status).toBe('succeeded');
      expect(fallen.durationMs).toBeGreaterThanOrEqual(0);
      expect(fallen).not.toHaveProperty('result');
      expect(fallen).not.toHaveProperty('payload');
      expect(fallen.args).toEqual({ shiftId: `s-${i}` });
    }

    expect(await store.query({})).toHaveLength(5);
    expect((await store.query({ status: 'succeeded' })).map((r) => r.activityName))
      .toEqual(['a4', 'a3', 'a2', 'a1', 'a0']);
  });

  it('retentionMax still caps the record COUNT — oldest first out (unchanged)', async () => {
    const store = makeStore({ retentionMax: 4, fullFidelityMax: 2 });
    const runs = [];
    for (let i = 0; i < 10; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      runs.push(await runOnce(store, i));
    }

    const all = await store.query({});
    expect(all).toHaveLength(4);
    expect(all.map((r) => r.activityName)).toEqual(['a9', 'a8', 'a7', 'a6']);
    expect(await store.get(runs[0].runId)).toBeUndefined();
    const redacted = await store.get(runs[7].runId);
    expect(redacted).toBeDefined();
    expect(redacted).not.toHaveProperty('result');
    expect(redacted.args).toEqual({ shiftId: 's-7' });
  });
});

const cacheOwner = {
  id: 'timesheets',
  version: '1.0.0',
  publisher: { type: 'first_party' },
  triggers: {},
  conditions: {
    hours_for: {
      description: 'c',
      inputSchema: { type: 'object' },
      returnSchema: { type: 'number' },
      latencyBudgetMs: 100,
      cacheable: true,
      cacheTtlMs: 600000,
    },
  },
  activities: {},
  actions: {},
};

describe('broker conditionCache — bounded, and the bound costs a recompute', () => {
  async function world() {
    const issuer = createFakeIssuer();
    const broker = createBroker({
      capabilityService: issuer,
      now: ticker(),
      throttleOverrides: { timesheets: { burst: 5000, queriesPerMin: 5000 } },
    });
    let evals = 0;
    broker.registerMp(cacheOwner, { handlers: { conditions: { hours_for: () => { evals += 1; return 8; } } } });
    const token = await issuer.issue('timesheets', '1.0.0', TENANT, [], 'i-1');
    const query = (shiftId) => broker.query({
      sourceMpId: 'timesheets', instanceId: 'i-1', capabilityToken: token, condition: 'timesheets.hours_for', args: { shiftId },
    });
    return { query, evalCount: () => evals };
  }

  it('does not grow past its cap — the oldest entry is recomputed, the newest still answers from cache', async () => {
    const w = await world();
    const OLDEST = 'k-0';

    for (let i = 0; i < CONDITION_CACHE_MAX; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await w.query(`k-${i}`);
    }
    expect(w.evalCount()).toBe(CONDITION_CACHE_MAX);
    await w.query(OLDEST);
    expect(w.evalCount()).toBe(CONDITION_CACHE_MAX);

    const NEWEST = `k-${CONDITION_CACHE_MAX}`;
    await w.query(NEWEST);
    expect(w.evalCount()).toBe(CONDITION_CACHE_MAX + 1);

    await w.query(NEWEST);
    expect(w.evalCount()).toBe(CONDITION_CACHE_MAX + 1);
    await w.query(OLDEST);
    expect(w.evalCount()).toBe(CONDITION_CACHE_MAX + 2);
  });
});

const keyedOwner = {
  id: 'time-clock',
  version: '1.0.0',
  publisher: { type: 'first_party' },
  triggers: {},
  conditions: {},
  activities: { issue_pin: activity({ idempotency: 'client_key' }) },
  actions: {},
};

describe('broker processedKeys — the in-memory replay tier is bounded', () => {
  async function world() {
    const issuer = createFakeIssuer();
    const broker = createBroker({
      capabilityService: issuer,
      now: ticker(2_000_000),
      idempotencyLedger: null,
      throttleOverrides: { 'time-clock': { burst: 5000, invokesPerMin: 5000 } },
    });
    let applies = 0;
    broker.registerMp(keyedOwner, {
      handlers: { activities: { issue_pin: () => ({ pin: `p${(applies += 1)}` }) } },
    });
    const token = await issuer.issue('time-clock', '1.0.0', TENANT, [], 'i-1');
    const invoke = (idempotencyKey) => broker.invoke({
      sourceMpId: 'time-clock', instanceId: 'i-1', capabilityToken: token, activity: 'time-clock.issue_pin', args: {}, idempotencyKey,
    });
    return { invoke, applyCount: () => applies };
  }

  it('within the cap a repeated key still replays the STORED result, unapplied (§3.2)', async () => {
    const w = await world();
    const first = await w.invoke('K-PIN');
    const repeat = await w.invoke('K-PIN');

    expect(repeat.idempotentReplay).toBe(true);
    expect(repeat.rpcId).toBe(first.rpcId);
    expect(repeat.result).toEqual(first.result);
    expect(w.applyCount()).toBe(1);
  });

  it('past the cap the OLDEST key is no longer served from the Map', async () => {
    const w = await world();
    const first = await w.invoke('K-PIN');

    let newest;
    for (let i = 0; i < PROCESSED_KEYS_MAX; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      newest = await w.invoke(`k-${i}`);
    }

    const newestRepeat = await w.invoke(`k-${PROCESSED_KEYS_MAX - 1}`);
    expect(newestRepeat.idempotentReplay).toBe(true);
    expect(newestRepeat.rpcId).toBe(newest.rpcId);

    const oldestRepeat = await w.invoke('K-PIN');
    expect(oldestRepeat.rpcId).not.toBe(first.rpcId);
  });
});
