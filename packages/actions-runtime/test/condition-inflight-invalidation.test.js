import { describe, it, expect } from 'vitest';
import { createBroker, createFakeIssuer } from '../src/index.js';

const TENANT = 'condition-race-team';
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

async function world() {
  const entered = deferred();
  const result = deferred();
  let calls = 0;
  const issuer = createFakeIssuer();
  const broker = createBroker({ capabilityService: issuer, serverInvoke: async () => ({ ok: true }) });
  broker.registerMp({
    id: 'demo', version: '1.0.0', publisher: { type: 'first_party' },
    triggers: {}, actions: {},
    conditions: {
      rows: {
        latencyBudgetMs: 5000, cacheable: true, cacheTtlMs: 60000,
        inputSchema: { type: 'object' },
        returnSchema: { type: 'object', required: ['rows'], properties: { rows: { type: 'array' } } },
      },
    },
    activities: {
      update: { inputSchema: { type: 'object' }, sideEffect: 'server_write', idempotency: 'derived_from_input', callerPolicy: 'first_party' },
    },
  }, { handlers: { activities: {}, conditions: {
    rows: () => {
      calls += 1;
      if (calls === 1) { entered.resolve(); return result.promise; }
      return { rows: ['fresh'] };
    },
  } } });
  const token = await issuer.issue('demo', '1.0.0', TENANT, [], 'instance');
  const envelope = { sourceMpId: 'demo', instanceId: 'instance', capabilityToken: token, args: {} };
  return {
    broker, entered, result, calls: () => calls,
    query: () => broker.query({ ...envelope, condition: 'demo.rows' }),
    write: () => broker.invoke({ ...envelope, activity: 'demo.update' }),
  };
}

describe('on-time condition cache publication', () => {
  for (const invalidation of ['settings', 'server write']) {
    it(`does not refill an invalidated cache after a ${invalidation}`, async () => {
      const w = await world();
      const pending = w.query();
      await w.entered.promise;
      if (invalidation === 'settings') w.broker.setSettingState(TENANT, 'demo', { changed: true });
      else await w.write();
      w.result.resolve({ rows: ['old'] });
      expect(await pending).toEqual({ rows: ['old'] });
      expect(await w.query()).toEqual({ rows: ['fresh'] });
      expect(await w.query()).toEqual({ rows: ['fresh'] });
      expect(w.calls()).toBe(2);
    });
  }

  it('retains a valid warm result when no invalidation occurred', async () => {
    const w = await world();
    const pending = w.query();
    await w.entered.promise;
    w.result.resolve({ rows: ['unchanged'] });
    expect(await pending).toEqual({ rows: ['unchanged'] });
    expect(await w.query()).toEqual({ rows: ['unchanged'] });
    expect(w.calls()).toBe(1);
  });
});
