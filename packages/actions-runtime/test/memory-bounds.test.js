/**
 * memory-bounds.test.js (memory audit, 2026-08) — the three broker-lifetime
 * stores that used to grow for as long as the tab was open are now CAPPED, and
 * each cap has a declared price:
 *
 *   - records.js  full-fidelity window — an old record keeps its diagnostics,
 *                 loses its payload. The record COUNT is untouched.
 *   - records.js  retentionMax          — the pre-existing COUNT cap, unchanged.
 *   - broker.js   conditionCache        — eviction costs a recompute.
 *   - broker.js   processedKeys         — eviction drops a very old key's
 *                 stored response out of the in-memory replay tier.
 *
 * These pin the BOUNDS (a cap that is not observed is a cap that regresses to
 * "unbounded" on the next refactor), not that every consequence of a bound is
 * desirable — see the ⚠ notes, which name the live findings each pin sits next
 * to so a fix is not mistaken for a regression.
 */
import { describe, it, expect } from 'vitest';
import { createBroker, createFakeIssuer, createRecordStore, createMemoryBackend } from '../src/index.js';

const TENANT = 'team-1';

// broker.js keeps these module-private (they are not tuning knobs the host
// sets). Mirrored here so the drive-past-the-cap loops are honest about what
// they are driving past.
const CONDITION_CACHE_MAX = 500;
const PROCESSED_KEYS_MAX = 1000;

/** Same shape as reentrancy.test.js / idempotency-tenancy.test.js. */
const activity = (extra = {}) => ({
  description: 'a',
  inputSchema: { type: 'object' },
  resultSchema: { type: 'object' },
  sideEffect: 'local_write',
  offlineReplayable: false,
  retry: { maxAttempts: 1 },
  ...extra,
});

/** A clock that ADVANCES on every read — expiries and startedAt never tie, so
 *  "oldest" is a fact rather than a sort-stability accident. */
const ticker = (from = 1_000_000) => {
  let t = from;
  return () => (t += 1);
};

// ---------------------------------------------------------------------------
// records.js — the full-fidelity window
// ---------------------------------------------------------------------------

describe('run records — the full-fidelity window is bounded, the history is not', () => {
  const makeStore = (opts) => createRecordStore({ backend: createMemoryBackend(), now: ticker(), ...opts });

  /** Open + finish one run, the way every dispatch path in broker.js does. */
  async function runOnce(store, i) {
    const record = await store.open({
      kind: 'invoke', activityName: `a${i}`, sourceMpId: 'timesheets', tenantId: TENANT, args: { shiftId: `s-${i}` },
    });
    // ⚠ the RETURN of update() is deliberately not asserted anywhere here: what
    // it hands back outside the window is a live finding (it returns the
    // redacted object, not the record it just computed). Reads go through
    // get()/query(), which is what the inspector actually uses.
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

    // The window: the newest three still answer with the full payload.
    for (const i of [2, 3, 4]) {
      // eslint-disable-next-line no-await-in-loop
      const kept = await store.get(runs[i].runId);
      expect(kept.args).toEqual({ shiftId: `s-${i}` });
      expect(kept.result).toEqual({ total: i });
      expect(kept.payload).toEqual({ note: `p-${i}` });
    }

    // Out of the window: NOT LOST — the same record, minus the tenant payload,
    // which is the persisted tier's projection applied to memory.
    for (const i of [0, 1]) {
      // eslint-disable-next-line no-await-in-loop
      const fallen = await store.get(runs[i].runId);
      expect(fallen).toBeDefined();
      expect(fallen.runId).toBe(runs[i].runId);
      expect(fallen.activityName).toBe(`a${i}`);
      expect(fallen.status).toBe('succeeded');            // what ran, and did it fail
      expect(fallen.durationMs).toBeGreaterThanOrEqual(0);
      expect(fallen).not.toHaveProperty('result');
      expect(fallen).not.toHaveProperty('payload');
      // `args` SURVIVE the window on purpose: broker.replay() re-dispatches
      // from record.args, so releasing them made older runs unreplayable —
      // and, on a permissive inputSchema, would have re-dispatched a real
      // write with args undefined (adversarial review 2026-08-31).
      expect(fallen.args).toEqual({ shiftId: `s-${i}` });
    }

    expect(await store.query({})).toHaveLength(5);        // nothing evicted from the history
    expect((await store.query({ status: 'succeeded' })).map((r) => r.activityName))
      .toEqual(['a4', 'a3', 'a2', 'a1', 'a0']);           // still queryable, newest first
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
    expect(await store.get(runs[0].runId)).toBeUndefined();  // dropped outright, not redacted
    // The two caps are INDEPENDENT: inside a retained-but-not-full window the
    // record is present and redacted, not missing.
    const redacted = await store.get(runs[7].runId);
    expect(redacted).toBeDefined();
    expect(redacted).not.toHaveProperty('result');
    expect(redacted.args).toEqual({ shiftId: 's-7' }); // replayable, still
  });
});

// ---------------------------------------------------------------------------
// broker.js — conditionCache
// ---------------------------------------------------------------------------

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
      cacheTtlMs: 600000,   // ONE ttl across the estate under test — see ⚠ below
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
      // The cap is 500 entries; the default burst is 30, so the throttle would
      // trip long before the cache filled. Raised for this probe only.
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

  // Memoisation WITHIN the ttl is already pinned by enforcement.test.js
  // ("memoises cacheable conditions per (condition,args) within cacheTtlMs") —
  // not repeated here. This is the other half: what happens at the cap.
  it('does not grow past its cap — the oldest entry is recomputed, the newest still answers from cache', async () => {
    const w = await world();
    const OLDEST = 'k-0';

    // Fill it to exactly the cap with distinct args.
    for (let i = 0; i < CONDITION_CACHE_MAX; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await w.query(`k-${i}`);
    }
    expect(w.evalCount()).toBe(CONDITION_CACHE_MAX);      // each computed once
    await w.query(OLDEST);
    expect(w.evalCount()).toBe(CONDITION_CACHE_MAX);      // at the cap, nothing evicted yet

    // One distinct arg beyond the cap. ⚠ ONE ttl is used throughout: eviction
    // is by smallest expiresAt, which is only "oldest" while every entry shares
    // a ttl. The mixed-ttl behaviour is a separate live finding and is
    // deliberately NOT pinned here.
    const NEWEST = `k-${CONDITION_CACHE_MAX}`;
    await w.query(NEWEST);
    expect(w.evalCount()).toBe(CONDITION_CACHE_MAX + 1);

    // The bound is observable from both ends: the newest entry is resident...
    await w.query(NEWEST);
    expect(w.evalCount()).toBe(CONDITION_CACHE_MAX + 1);
    // ...and the oldest is gone, so the read costs a recompute — the declared
    // price of the cap, and the reason it is a cache and not a ledger.
    await w.query(OLDEST);
    expect(w.evalCount()).toBe(CONDITION_CACHE_MAX + 2);
  });
});

// ---------------------------------------------------------------------------
// broker.js — processedKeys
// ---------------------------------------------------------------------------

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
  /**
   * ⚠ THE LEDGER IS OUT ON PURPOSE. `processedKeys` is one of TWO dedupe tiers;
   * the durable idempotency ledger is consulted right after the Map misses, so
   * with it wired a Map eviction can be masked by a ledger hit and the cap
   * becomes unobservable. (In node it happens to retain nothing anyway — no Web
   * Storage — so passing `null` makes the isolation explicit rather than
   * incidental, and keeps the probe honest if these tests ever run in jsdom.)
   */
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
    expect(w.applyCount()).toBe(1);            // the write happened once
  });

  it('past the cap the OLDEST key is no longer served from the Map', async () => {
    const w = await world();
    const first = await w.invoke('K-PIN');

    // PROCESSED_KEYS_MAX further distinct keys — 'K-PIN' is entry 1 of 1001.
    let newest;
    for (let i = 0; i < PROCESSED_KEYS_MAX; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      newest = await w.invoke(`k-${i}`);
    }

    // A key still inside the cap is untouched — the Map is bounded, not broken.
    const newestRepeat = await w.invoke(`k-${PROCESSED_KEYS_MAX - 1}`);
    expect(newestRepeat.idempotentReplay).toBe(true);
    expect(newestRepeat.rpcId).toBe(newest.rpcId);

    // The oldest key's stored response is GONE from the Map: the repeat no
    // longer comes back as that first run.
    //
    // ⚠ WHAT SHOULD HAPPEN INSTEAD IS AN OPEN QUESTION, so it is not pinned.
    // With no durable backstop the write is re-applied and the caller cannot
    // tell (no `idempotentReplay`), which is a live finding against `client_key`
    // exactly-once — this asserts only that the MAP released the entry, which
    // stays true under a fix that suppresses or re-dedupes the repeat somewhere
    // else. What must NOT happen is the Map holding every key forever.
    const oldestRepeat = await w.invoke('K-PIN');
    expect(oldestRepeat.rpcId).not.toBe(first.rpcId);
  });
});
