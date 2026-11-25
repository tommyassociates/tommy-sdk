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
          latencyBudgetMs: 30,
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

    const second = await query();
    expect(calls).toBe(2);
    expect(second).toEqual({ rows: ['real'] });
  });

  it('is not salvaged into the cache by the late-value path either', async () => {
    let calls = 0;
    let releaseSlow;
    const slow = new Promise((resolve) => { releaseSlow = resolve; });
    const { query } = await world(async () => {
      calls += 1;
      if (calls === 1) { await slow; return { rows: [], unresolved: true }; }
      return { rows: ['real'] };
    });

    await expect(query()).rejects.toThrow();
    releaseSlow();
    await new Promise((r) => { setTimeout(r, 20); });

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
