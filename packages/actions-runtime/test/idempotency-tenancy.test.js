/**
 * idempotency-tenancy.test.js (F5) — the processed-key ledger is per TENANT.
 *
 * Gap register Class F/F5: the key was `activity:idempotencyKey`, and a
 * `derived_from_input` key is a hash of the args alone — so the same write in
 * two tenants collided and the second caller was handed the FIRST tenant's
 * stored result instead of its own.
 */
import { describe, it, expect } from 'vitest';
import { createBroker, createFakeIssuer } from '../src/index.js';

const activity = (extra = {}) => ({
  description: 'a',
  inputSchema: { type: 'object' },
  sideEffect: 'local_write',
  offlineReplayable: false,
  retry: { maxAttempts: 1 },
  ...extra,
});

const manifest = {
  id: 'timesheets',
  version: '1.0.0',
  publisher: { type: 'first_party' },
  triggers: {},
  conditions: {},
  activities: {
    upsert_derived: activity({ idempotency: 'derived_from_input' }),
    upsert_client_key: activity({ idempotency: 'client_key' }),
  },
  actions: {},
};

async function world() {
  const issuer = createFakeIssuer();
  const broker = createBroker({ capabilityService: issuer });
  const applied = [];
  broker.registerMp(manifest, {
    handlers: {
      activities: {
        // The result is TENANT-derived: a leaked replay is visible in the value.
        upsert_derived: (args, ctx) => { applied.push(ctx.tenantId); return { tenantId: ctx.tenantId, ...args }; },
        upsert_client_key: (args, ctx) => { applied.push(ctx.tenantId); return { tenantId: ctx.tenantId, ...args }; },
      },
    },
  });
  const tokenA = await issuer.issue('timesheets', '1.0.0', 'team-A', [], 'i-a');
  const tokenB = await issuer.issue('timesheets', '1.0.0', 'team-B', [], 'i-b');
  const call = (token, instanceId, name, args, idempotencyKey) => broker.invoke({
    sourceMpId: 'timesheets', instanceId, capabilityToken: token, activity: `timesheets.${name}`, args, idempotencyKey,
  });
  return {
    asA: (name, args, key) => call(tokenA, 'i-a', name, args, key),
    asB: (name, args, key) => call(tokenB, 'i-b', name, args, key),
    applied,
  };
}

describe('processedKeys tenancy (F5)', () => {
  it('two tenants writing the same derived_from_input args each get their OWN result', async () => {
    const w = await world();
    const args = { shiftId: 's-1', hours: 8 };
    const a = await w.asA('upsert_derived', args);
    const b = await w.asB('upsert_derived', args);
    expect(a.result).toEqual({ tenantId: 'team-A', ...args });
    expect(b.result).toEqual({ tenantId: 'team-B', ...args });
    expect(b.idempotentReplay).toBeUndefined();
    expect(w.applied).toEqual(['team-A', 'team-B']); // both actually applied
  });

  it('two tenants reusing the same client_key are not confused with each other', async () => {
    const w = await world();
    const a = await w.asA('upsert_client_key', { n: 1 }, 'k-shared');
    const b = await w.asB('upsert_client_key', { n: 2 }, 'k-shared');
    expect(a.result).toEqual({ tenantId: 'team-A', n: 1 });
    expect(b.result).toEqual({ tenantId: 'team-B', n: 2 });
  });

  it('within ONE tenant the repeat key still replays the stored result (§3.2)', async () => {
    const w = await world();
    const args = { shiftId: 's-1', hours: 8 };
    const first = await w.asA('upsert_derived', args);
    const repeat = await w.asA('upsert_derived', args);
    expect(repeat.idempotentReplay).toBe(true);
    expect(repeat.result).toEqual(first.result);
    expect(w.applied).toEqual(['team-A']); // applied ONCE
  });
});
