/**
 * condition-late-value.test.js — mp-slow-read-blanks-surface review findings
 * F4 and F5.
 *
 * The broker salvages a condition value that lands after `latencyBudgetMs`: the
 * caller has already been rejected with a Timeout, but the value is cached so the
 * NEXT read is warm. Two things about that path were wrong, and both were
 * invisible — it skipped the returnSchema gate the on-time path runs, and it
 * flipped the failed run record to `succeeded`, erasing the error a later triage
 * would look for.
 */
import { describe, it, expect } from 'vitest';
import { createBroker, createFakeIssuer } from '../src/index.js';

const TENANT = 'team-3';

const ownerWith = (handler, { cacheable = true } = {}) => ({
  manifest: {
    id: 'demo',
    version: '1.0.0',
    publisher: { type: 'first_party' },
    triggers: {},
    activities: {},
    actions: {},
    conditions: {
      slow: {
        description: 'a read that overruns its budget',
        latencyBudgetMs: 30,
        cacheable,
        cacheTtlMs: cacheable ? 60000 : 0,
        inputSchema: { type: 'object' },
        returnSchema: {
          type: 'object', required: ['rows'], additionalProperties: false, properties: { rows: { type: 'array' } },
        },
      },
    },
  },
  handlers: { conditions: { slow: handler } },
});

async function world(handler, opts) {
  const issuer = createFakeIssuer();
  const broker = createBroker({ capabilityService: issuer });
  const { manifest, handlers } = ownerWith(handler, opts);
  broker.registerMp(manifest, { handlers });
  const token = await issuer.issue('demo', '1.0.0', TENANT, [], 'i-1');
  const query = () => broker.query({
    sourceMpId: 'demo', instanceId: 'i-1', capabilityToken: token, condition: 'demo.slow', args: {},
  });
  return { broker, query };
}

const tick = (ms) => new Promise((r) => { setTimeout(r, ms); });

describe('a condition value that lands after the budget', () => {
  it('does NOT erase the timeout the caller experienced', async () => {
    let resolveLate;
    const { broker, query } = await world(() => new Promise((r) => { resolveLate = r; }));
    await expect(query()).rejects.toThrow(/exceeded latencyBudgetMs/);
    const [failed] = await broker.records.query({ status: 'failed' });
    expect(failed).toBeTruthy();

    resolveLate({ rows: [1, 2] });
    await tick(20);
    const after = (await broker.records.query({ kind: 'query' })).find((r) => r.runId === failed.runId);
    // Still discoverable as a failure — an engineer filtering `failed` has to
    // find it — with the salvage recorded alongside the error, not instead of it.
    expect(after.status).toBe('failed');
    expect(after.error).toBeTruthy();
    expect(after.lateResult).toEqual({ rows: [1, 2] });
  });

  it('caches a VALID late value, so the next read is warm', async () => {
    let resolveLate;
    const { query } = await world(() => new Promise((r) => { resolveLate = r; }));
    await expect(query()).rejects.toThrow();
    resolveLate({ rows: ['a'] });
    await tick(20);
    expect(await query()).toEqual({ rows: ['a'] });   // served from the cache
  });

  it('refuses to cache a late value that fails its own returnSchema', async () => {
    // The on-time path validates before caching and the cache READ path does not
    // re-validate, so an unvalidated late value would be served to every caller
    // for the whole TTL — the schema guarantee would hold only while the handler
    // was fast.
    let resolveLate;
    let calls = 0;
    const { query } = await world(() => {
      calls += 1;
      if (calls === 1) return new Promise((r) => { resolveLate = r; });
      return { rows: ['fresh'] };
    });
    await expect(query()).rejects.toThrow();
    resolveLate({ nonsense: true });                  // violates the returnSchema
    await tick(20);
    // Nothing poisoned: the next read runs the handler again.
    expect(await query()).toEqual({ rows: ['fresh'] });
  });
});
