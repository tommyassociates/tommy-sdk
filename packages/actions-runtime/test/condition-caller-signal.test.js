/**
 * condition-caller-signal.test.js — a query's own `signal` (the asking
 * surface's shown signal) reaches the condition handler's `signal`, so a read
 * still waiting when the person leaves the page can stop.
 */
import { describe, it, expect } from 'vitest';
import { createBroker, createFakeIssuer } from '../src/index.js';

const TENANT = 'team-3';

async function world(handler) {
  const issuer = createFakeIssuer();
  const broker = createBroker({ capabilityService: issuer });
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
        latencyBudgetMs: 500,
        cacheable: false,
        inputSchema: { type: 'object' },
        returnSchema: { type: 'object' },
      },
    },
  }, { handlers: { conditions: { read: handler } } });
  const token = await issuer.issue('demo', '1.0.0', TENANT, [], 'i-1');
  return (signal) => broker.query({
    sourceMpId: 'demo', instanceId: 'i-1', capabilityToken: token, condition: 'demo.read', args: {},
    ...(signal ? { signal } : {}),
  });
}

const tick = (ms) => new Promise((r) => { setTimeout(r, ms); });

describe('the caller signal on a query', () => {
  it('aborts the handler signal when the caller signal aborts mid-read', async () => {
    let seen;
    let release;
    const query = await world((args, ctx) => {
      seen = ctx.signal;
      return new Promise((resolve) => { release = () => resolve({ ok: !ctx.signal.aborted }); });
    });
    const caller = new AbortController();
    const answer = query(caller.signal);
    await tick(5);
    expect(seen.aborted).toBe(false);
    caller.abort();
    expect(seen.aborted).toBe(true);
    release();
    await expect(answer).resolves.toEqual({ ok: false });
  });

  it('hands an already aborted caller signal to the handler as aborted', async () => {
    let abortedAtStart;
    const query = await world((args, ctx) => { abortedAtStart = ctx.signal.aborted; return {}; });
    const caller = new AbortController();
    caller.abort();
    await query(caller.signal);
    expect(abortedAtStart).toBe(true);
  });

  it('stops listening once the query settles', async () => {
    let seen;
    const query = await world((args, ctx) => { seen = ctx.signal; return {}; });
    const caller = new AbortController();
    await query(caller.signal);
    caller.abort();
    expect(seen.aborted).toBe(false);
  });

  it('leaves a query without a caller signal on the deadline alone', async () => {
    let seen;
    const query = await world(async (args, ctx) => { seen = ctx.signal; await tick(5); return {}; });
    await query();
    expect(seen.aborted).toBe(false);
  });
});
