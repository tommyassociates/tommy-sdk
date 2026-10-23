/**
 * query-rate-queue.test.js — a query that finds its MP's bucket empty waits
 * for the next token (up to QUERY_RATE_WAIT_MAX_MS) instead of failing at
 * once; past that it is refused with `retryAfterMs`; and an answer the broker
 * already holds in its condition cache spends no token.
 *
 * The clock and `sleep` are injected: `sleep` records what was asked and
 * moves the clock to the end of the wait on the next task (after every caller
 * asked together has reserved its token), so the schedule is asserted rather
 * than waited out.
 */
import { describe, it, expect } from 'vitest';
import { createBroker, createFakeIssuer, QUERY_RATE_WAIT_MAX_MS } from '../src/index.js';

const TENANT = 'team-1';

const owner = {
  id: 'timesheets',
  version: '1.0.0',
  publisher: { type: 'first_party' },
  triggers: { submitted: { description: 't', payloadSchema: { type: 'object' }, emission: 'async' } },
  conditions: {
    hours_for: {
      description: 'cached read',
      inputSchema: { type: 'object' },
      returnSchema: { type: 'number' },
      latencyBudgetMs: 100,
      cacheable: true,
      cacheTtlMs: 60000,
    },
    live_hours: {
      description: 'uncached read',
      inputSchema: { type: 'object' },
      returnSchema: { type: 'number' },
      latencyBudgetMs: 100,
      cacheable: false,
    },
  },
  activities: {},
  actions: {},
};

async function world(profile = { burst: 2, queriesPerMin: 120 }) {
  let clock = 1_700_000_000_000;
  const waited = [];
  const issuer = createFakeIssuer();
  const broker = createBroker({
    capabilityService: issuer,
    now: () => clock,
    sleep: (ms) => {
      waited.push(ms);
      const until = clock + ms;
      return new Promise((resolve) => { setTimeout(() => { clock = Math.max(clock, until); resolve(); }, 0); });
    },
    throttleOverrides: { timesheets: profile, 'acme-reporting': { burst: 1, emitsPerMin: 60 } },
  });
  let evals = 0;
  broker.registerMp(owner, {
    handlers: {
      conditions: {
        hours_for: () => { evals += 1; return 8; },
        live_hours: () => { evals += 1; return 7; },
      },
      activities: {},
    },
  });
  broker.registerMp({
    id: 'acme-reporting', version: '2.0.0', publisher: { type: 'third_party' },
    triggers: { ping: { description: 't', payloadSchema: { type: 'object' }, emission: 'async' } },
    conditions: {}, activities: {}, actions: {},
  }, { handlers: {} });
  const token = await issuer.issue('timesheets', '1.0.0', TENANT, [], 'i-1');
  const acmeToken = await issuer.issue('acme-reporting', '2.0.0', TENANT, [], 'i-2');
  const query = (condition, args = {}) => broker.query({
    sourceMpId: 'timesheets', instanceId: 'i-1', capabilityToken: token, condition: `timesheets.${condition}`, args,
  });
  const emit = () => broker.emit({
    sourceMpId: 'acme-reporting', instanceId: 'i-2', capabilityToken: acmeToken, trigger: 'acme-reporting.ping', payload: {},
  });
  return {
    broker, query, emit, waited, evalCount: () => evals, now: () => clock, setClock: (t) => { clock = t; },
  };
}

describe('query rate limit: queue briefly, then refuse with retryAfterMs', () => {
  it('waits for the next token and then answers, instead of refusing at once', async () => {
    const w = await world();
    expect(await w.query('live_hours')).toBe(7);
    expect(await w.query('live_hours')).toBe(7);
    expect(w.waited).toEqual([]);
    // The burst is spent: at 120/min the next token is 500 ms away.
    expect(await w.query('live_hours')).toBe(7);
    expect(w.waited).toEqual([500]);
    expect(w.evalCount()).toBe(3);
  });

  it('queues callers behind each other, each on its own token', async () => {
    const w = await world({ burst: 1, queriesPerMin: 120 });
    // Asked together: the first takes the token in hand, the next two take
    // the tokens 500 ms and 1000 ms away rather than the same one.
    const sleeps = [];
    const answers = await Promise.all([w.query('live_hours'), w.query('live_hours'), w.query('live_hours')]);
    sleeps.push(...w.waited);
    expect(answers).toEqual([7, 7, 7]);
    expect(sleeps).toEqual([500, 1000]);
  });

  it('refuses with retryAfterMs once the wait would pass the cap, and reserves nothing', async () => {
    // 30/min: a token every 2000 ms, so the second queued caller would wait 4000 ms.
    const w = await world({ burst: 1, queriesPerMin: 30 });
    expect(QUERY_RATE_WAIT_MAX_MS).toBe(2000);
    const refusedAt = w.now();
    const [first, second, third] = await Promise.allSettled([
      w.query('live_hours'), w.query('live_hours'), w.query('live_hours'),
    ]);
    expect(first).toMatchObject({ status: 'fulfilled', value: 7 });
    expect(second).toMatchObject({ status: 'fulfilled', value: 7 });
    expect(third.status).toBe('rejected');
    expect(third.reason).toMatchObject({ name: 'TommyError', code: 'RateLimited', retryable: true, retryAfterMs: 4000 });
    expect(third.reason.message).toBe("mp 'timesheets' exceeded query rate (30/min, burst 1)");
    expect(w.evalCount()).toBe(2);
    // Waiting out retryAfterMs is enough: the refusal took no token.
    w.setClock(refusedAt + third.reason.retryAfterMs);
    w.waited.length = 0;
    expect(await w.query('live_hours')).toBe(7);
    expect(w.waited).toEqual([]);
  });

  it('serves a condition-cache hit without spending a token', async () => {
    const w = await world({ burst: 1, queriesPerMin: 120 });
    expect(await w.query('hours_for', { day: 1 })).toBe(8); // the one token, fills the cache
    for (let i = 0; i < 50; i += 1) expect(await w.query('hours_for', { day: 1 })).toBe(8);
    expect(w.waited).toEqual([]);
    expect(w.evalCount()).toBe(1);
    // A read that runs its handler still pays: the bucket is where the first read left it.
    expect(await w.query('live_hours')).toBe(7);
    expect(w.waited).toEqual([500]);
  });

  it('does not queue an emit: it is refused at once, with retryAfterMs', async () => {
    const w = await world();
    await w.emit();
    const refused = await w.emit().catch((e) => e);
    expect(refused).toMatchObject({ code: 'RateLimited', retryable: true, retryAfterMs: 1000 });
    expect(w.waited).toEqual([]);
  });

  it('a read waiting for its token fails cleanly when the runtime is torn down meanwhile', async () => {
    let clock = 0;
    let release;
    const issuer = createFakeIssuer();
    const broker = createBroker({
      capabilityService: issuer,
      now: () => clock,
      sleep: (ms) => new Promise((resolve) => { release = () => { clock += ms; resolve(); }; }),
      throttleOverrides: { timesheets: { burst: 1, queriesPerMin: 120 } },
    });
    broker.registerMp(owner, { handlers: { conditions: { live_hours: () => 7, hours_for: () => 8 }, activities: {} } });
    const token = await issuer.issue('timesheets', '1.0.0', TENANT, [], 'i-1');
    const query = () => broker.query({ sourceMpId: 'timesheets', instanceId: 'i-1', capabilityToken: token, condition: 'timesheets.live_hours', args: {} });
    expect(await query()).toBe(7);
    const waiting = query();
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    expect(broker.hasPendingWork()).toBe(true);
    await broker.teardown();
    release();
    await expect(waiting).rejects.toMatchObject({ code: 'ActivityFailed', message: 'MP runtime retired' });
  });
});
