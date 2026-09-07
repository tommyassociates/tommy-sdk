/**
 * condition-unresolved-not-cached.test.js — mp-onboarding-parity-audit review
 * ONB-V3, but the defect and the fix are platform-wide.
 *
 * The estate-wide `unresolved` contract lets a condition degrade without lying:
 * instead of throwing, it RESOLVES with an empty payload plus `unresolved: true`
 * so a caller can tell "nobody is onboarding" from "we could not find out".
 *
 * ⚠ THE BROKER WAS CACHING THAT. It caches whatever resolves, and a flagged
 * answer resolves — so a known-unknown was pinned for the full cacheTtlMs. Every
 * Retry the user pressed re-read the same failure from cache without the handler
 * ever running, and surfaces stayed on their error state for up to a minute
 * after connectivity came back. It is the one case where caching makes the
 * system less CORRECT rather than merely staler: an `unresolved` payload is a
 * report about the read, not a value about the world.
 */
import { describe, it, expect } from 'vitest';
import { createBroker, createFakeIssuer } from '../src/index.js';

const TENANT = 'team-3';

function ownerWith(handler) {
  return {
    manifest: {
      id: 'demo',
      version: '1.0.0',
      publisher: { type: 'first_party' },
      triggers: {},
      activities: {},
      actions: {},
      conditions: {
        rows: {
          description: 'a cacheable read that can degrade',
          latencyBudgetMs: 3000,
          cacheable: true,
          cacheTtlMs: 60000,
          inputSchema: { type: 'object' },
          returnSchema: {
            type: 'object',
            additionalProperties: false,
            properties: { rows: { type: 'array' }, unresolved: { type: 'boolean' } },
          },
        },
      },
    },
    handlers: { conditions: { rows: handler } },
  };
}

async function world(handler) {
  const issuer = createFakeIssuer();
  const broker = createBroker({ capabilityService: issuer });
  const { manifest, handlers } = ownerWith(handler);
  broker.registerMp(manifest, { handlers });
  const token = await issuer.issue('demo', '1.0.0', TENANT, [], 'i-1');
  const query = () => broker.query({
    sourceMpId: 'demo', instanceId: 'i-1', capabilityToken: token, condition: 'demo.rows', args: {},
  });
  return { broker, query };
}

describe('a condition answer flagged unresolved', () => {
  it('is not cached, so a retry actually re-reads', async () => {
    let calls = 0;
    const { query } = await world(async () => {
      calls += 1;
      return calls === 1 ? { rows: [], unresolved: true } : { rows: ['real'] };
    });

    const first = await query();
    expect(first).toEqual({ rows: [], unresolved: true });
    expect(calls).toBe(1);

    // Without the guard this second call is served from cache: the handler is
    // never reached, and the caller sees the same flagged answer for 60s.
    const second = await query();
    expect(calls).toBe(2);
    expect(second).toEqual({ rows: ['real'] });
  });

  it('still caches a RESOLVED answer (the control)', async () => {
    let calls = 0;
    const { query } = await world(async () => {
      calls += 1;
      return { rows: ['real'] };
    });

    await query();
    await query();
    // The fix must not disable caching generally — only for known-unknowns.
    expect(calls).toBe(1);
  });

  it('does not treat a falsy `unresolved` as a known-unknown', async () => {
    let calls = 0;
    const { query } = await world(async () => {
      calls += 1;
      return { rows: ['real'], unresolved: false };
    });

    await query();
    await query();
    expect(calls).toBe(1);
  });
});
