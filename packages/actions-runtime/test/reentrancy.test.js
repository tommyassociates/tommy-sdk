/**
 * reentrancy.test.js (F6) — the per-source-MP FIFO invoke chain must not
 * deadlock a NESTED invoke issued from inside a handler the same chain is
 * currently executing, while still serialising genuinely concurrent callers.
 *
 * Gap register Class F / F6: `broker.js` chained EVERY invoke per sourceMpId,
 * so an activity handler invoking another of its own MP's activities queued
 * behind its own ancestor and never resolved. That deadlock is the documented
 * reason two cross-MP writes (availability lock, leave-on-shift) went off-bus.
 */
import { describe, it, expect } from 'vitest';
import { createBroker, createFakeIssuer } from '../src/index.js';

const TENANT = 'team-1';

/** Fails fast instead of hanging the suite when the chain deadlocks. */
function withTimeout(promise, ms, what) {
  let timer;
  const guard = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`DEADLOCK: ${what} did not settle within ${ms}ms`)), ms);
  });
  return Promise.race([promise, guard]).finally(() => clearTimeout(timer));
}

const deferred = () => {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
};

const activity = (extra = {}) => ({
  description: 'a',
  inputSchema: { type: 'object' },
  sideEffect: 'local_write',
  idempotency: 'none',
  offlineReplayable: false,
  retry: { maxAttempts: 1 },
  ...extra,
});

const manifest = (id, activities) => ({
  id,
  version: '1.0.0',
  publisher: { type: 'first_party' },
  triggers: {},
  conditions: {},
  activities,
  actions: {},
});

describe('broker invoke re-entrancy (F6)', () => {
  it('runs a same-MP nested invoke inline on the running chain', async () => {
    const issuer = createFakeIssuer();
    const broker = createBroker({ capabilityService: issuer });
    const token = await issuer.issue('availability', '1.0.0', TENANT, [], 'i-1');
    const env = (name, args = {}) => ({
      sourceMpId: 'availability', instanceId: 'i-1', capabilityToken: token, activity: name, args,
    });

    broker.registerMp(manifest('availability', {
      lock_window: activity(),
      write_lock: activity(),
    }), {
      handlers: {
        activities: {
          // The outer handler invokes another of its OWN activities — the F6 case.
          lock_window: async (args) => {
            const nested = await broker.invoke(env('availability.write_lock', args));
            return { nested: nested.result };
          },
          write_lock: async () => ({ locked: true }),
        },
      },
    });

    const receipt = await withTimeout(
      broker.invoke(env('availability.lock_window', { date: '2026-08-08' })),
      1500,
      'nested same-MP invoke',
    );
    expect(receipt.status).toBe('succeeded');
    expect(receipt.result).toEqual({ nested: { locked: true } });
  });

  it('still serialises two genuinely concurrent top-level invokes from one MP (FIFO §3.3)', async () => {
    const issuer = createFakeIssuer();
    const broker = createBroker({ capabilityService: issuer });
    const token = await issuer.issue('availability', '1.0.0', TENANT, [], 'i-1');
    const order = [];
    const gates = { 1: deferred(), 2: deferred() };

    broker.registerMp(manifest('availability', { slow: activity() }), {
      handlers: {
        activities: {
          slow: async ({ n }) => {
            order.push(`enter${n}`);
            await gates[n].promise;
            order.push(`exit${n}`);
            return { n };
          },
        },
      },
    });

    const call = (n) => broker.invoke({
      sourceMpId: 'availability', instanceId: 'i-1', capabilityToken: token, activity: 'availability.slow', args: { n },
    });
    const first = call(1);
    const second = call(2);

    // Let the first dispatch reach its handler; the second must still be queued.
    await new Promise((r) => { setTimeout(r, 10); });
    expect(order).toEqual(['enter1']);

    gates[1].resolve();
    await withTimeout(first, 1500, 'first concurrent invoke');
    await new Promise((r) => { setTimeout(r, 10); });
    expect(order).toEqual(['enter1', 'exit1', 'enter2']);

    gates[2].resolve();
    await withTimeout(second, 1500, 'second concurrent invoke');
    expect(order).toEqual(['enter1', 'exit1', 'enter2', 'exit2']);
  });

  it('leaves cross-MP nesting unaffected (target MP nests on its OWN chain)', async () => {
    const issuer = createFakeIssuer();
    const broker = createBroker({ capabilityService: issuer });
    const callerToken = await issuer.issue('time-clock', '1.0.0', TENANT, ['invoke:timesheets.submit'], 'i-tc');
    const ownerToken = await issuer.issue('timesheets', '1.0.0', TENANT, [], 'i-ts');

    broker.registerMp(manifest('time-clock', {}), { handlers: {} });
    broker.registerMp(manifest('timesheets', {
      submit: activity({ authorizedCallers: ['time-clock'] }),
      recalc: activity(),
    }), {
      handlers: {
        activities: {
          submit: async () => {
            const nested = await broker.invoke({
              sourceMpId: 'timesheets', instanceId: 'i-ts', capabilityToken: ownerToken, activity: 'timesheets.recalc', args: {},
            });
            return { nested: nested.result };
          },
          recalc: async () => ({ hours: 8 }),
        },
      },
    });

    const receipt = await withTimeout(broker.invoke({
      sourceMpId: 'time-clock', instanceId: 'i-tc', capabilityToken: callerToken, activity: 'timesheets.submit', args: {},
    }), 1500, 'cross-MP nested invoke');
    expect(receipt.result).toEqual({ nested: { hours: 8 } });
  });
});
