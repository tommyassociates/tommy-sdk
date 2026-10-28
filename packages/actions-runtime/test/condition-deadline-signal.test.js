/**
 * condition-deadline-signal.test.js — a condition handler is told when its
 * caller has been answered with a Timeout, through the `signal` in its
 * context, so a read nobody waits for can stop.
 */
import { describe, it, expect } from 'vitest';
import { createBroker, createFakeIssuer } from '../src/index.js';

const TENANT = 'team-3';

async function world(handler, latencyBudgetMs = 30) {
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
        latencyBudgetMs,
        cacheable: false,
        inputSchema: { type: 'object' },
        returnSchema: { type: 'object' },
      },
    },
  }, { handlers: { conditions: { read: handler } } });
  const token = await issuer.issue('demo', '1.0.0', TENANT, [], 'i-1');
  return () => broker.query({
    sourceMpId: 'demo', instanceId: 'i-1', capabilityToken: token, condition: 'demo.read', args: {},
  });
}

const tick = (ms) => new Promise((r) => { setTimeout(r, ms); });

describe('the condition deadline signal', () => {
  it('aborts when the caller is answered with a Timeout', async () => {
    let seen;
    const query = await world((args, ctx) => { seen = ctx.signal; return new Promise(() => {}); });
    await expect(query()).rejects.toMatchObject({ code: 'Timeout' });
    expect(seen).toBeInstanceOf(AbortSignal);
    expect(seen.aborted).toBe(true);
  });

  it('stays live while the caller waits and after an on-time answer', async () => {
    let seen;
    let abortedDuringRead;
    const query = await world(async (args, ctx) => {
      seen = ctx.signal;
      await tick(5);
      abortedDuringRead = ctx.signal.aborted;
      return { ok: true };
    }, 200);
    await expect(query()).resolves.toEqual({ ok: true });
    await tick(250);
    expect(abortedDuringRead).toBe(false);
    expect(seen.aborted).toBe(false);
  });

  it('keeps the tenant beside the signal', async () => {
    let ctx;
    const query = await world(async (args, context) => { ctx = context; return {}; }, 200);
    await query();
    expect(ctx.tenantId).toBe(TENANT);
  });
});
