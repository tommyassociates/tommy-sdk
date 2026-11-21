/**
 * condition-sync-throw.test.js — a condition handler that throws before it
 * returns a promise is treated like one that rejects: the caller gets a
 * ConditionError, the run is recorded as failed, the deadline timer is
 * cleared and the caller's signal is let go.
 */
import { describe, it, expect } from 'vitest';
import { createBroker, createFakeIssuer } from '../src/index.js';

const TENANT = 'team-3';
const BUDGET_MS = 30;

async function world(handler, options = {}) {
  const issuer = createFakeIssuer();
  const broker = createBroker({ capabilityService: issuer, ...options });
  broker.registerMp({
    id: 'demo',
    version: '1.0.0',
    publisher: { type: 'first_party' },
    triggers: {},
    activities: {},
    actions: {},
    conditions: {
      read: {
        description: 'a read',
        latencyBudgetMs: BUDGET_MS,
        cacheable: false,
        inputSchema: { type: 'object' },
        returnSchema: { type: 'object' },
      },
    },
  }, { handlers: { conditions: { read: handler } } });
  const token = await issuer.issue('demo', '1.0.0', TENANT, [], 'i-1');
  const query = (signal) => broker.query({
    sourceMpId: 'demo', instanceId: 'i-1', capabilityToken: token, condition: 'demo.read', args: {},
    ...(signal ? { signal } : {}),
  });
  return { broker, query };
}

const tick = (ms) => new Promise((r) => { setTimeout(r, ms); });

describe('a condition handler that throws synchronously', () => {
  it('answers the caller with a ConditionError and records the run as failed', async () => {
    const { broker, query } = await world(() => { throw new Error('boom'); });
    await expect(query()).rejects.toMatchObject({ code: 'ConditionError', message: expect.stringContaining('boom') });
    const runs = await broker.records.query({ kind: 'query' });
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ status: 'failed', error: { code: 'ConditionError' } });
  });

  it('clears the deadline timer, so the handler signal never aborts and nothing rejects later', async () => {
    const unhandled = [];
    const onUnhandled = (reason) => { unhandled.push(reason); };
    process.on('unhandledRejection', onUnhandled);
    try {
      let seen;
      const { query } = await world((args, ctx) => { seen = ctx.signal; throw new Error('boom'); });
      await expect(query()).rejects.toMatchObject({ code: 'ConditionError' });
      await tick(BUDGET_MS * 3);
      expect(seen.aborted).toBe(false);
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  it('lets go of the caller signal', async () => {
    let seen;
    const { query } = await world((args, ctx) => { seen = ctx.signal; throw new Error('boom'); }, { callerLinkAfterAnswerMs: 0 });
    const caller = new AbortController();
    await expect(query(caller.signal)).rejects.toMatchObject({ code: 'ConditionError' });
    caller.abort();
    expect(seen.aborted).toBe(false);
  });
});
