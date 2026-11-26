import { describe, it, expect } from 'vitest';
import { createBroker, createFakeIssuer } from '../src/index.js';

const TENANT = 'team-1';
const def = {
  description: 'c', inputSchema: { type: 'object' }, returnSchema: { type: 'object' }, latencyBudgetMs: 5000, heldFirst: true,
  cacheable: true, cacheTtlMs: 60000,
};

function deviceStore() {
  const rows = new Map();
  return {
    rows,
    load: async () => [...rows.values()],
    put: async (row) => { rows.set(row.id, JSON.parse(JSON.stringify(row))); },
    remove: async (id) => { rows.delete(id); },
  };
}

async function world(handler) {
  const issuer = createFakeIssuer();
  const store = deviceStore();
  const broker = createBroker({
    capabilityService: issuer, conditionAnswerStore: store, viewerFingerprint: () => 'rf', setTimer: () => ({}), clearTimer: () => {},
  });
  broker.registerMp({
    id: 'scheduling', version: '1.0.0', publisher: { type: 'first_party' }, triggers: {}, conditions: { c: def }, activities: {}, actions: {},
  }, { handlers: { conditions: { c: (args) => handler(args) } } });
  const token = await issuer.issue('scheduling', '1.0.0', TENANT, [], 'i-1');
  const ask = (onRead) => broker.query({
    sourceMpId: 'scheduling', instanceId: 'i-1', capabilityToken: token, condition: 'scheduling.c', args: {}, ...(onRead ? { onRead } : {}),
  });
  await broker.conditionAnswersReady();
  return { broker, ask, store };
}

describe('a stale answer is not a held answer', () => {
  it('an answer marked stale is neither kept on the device nor cached as fresh', async () => {
    let calls = 0;
    const w = await world(async () => { calls += 1; return { rows: [{ id: 1 }], stale: true }; });
    expect(await w.ask(() => {})).toMatchObject({ state: 'fresh', answer: { stale: true } });
    await w.broker.conditionAnswersReady();
    expect(w.store.rows.size).toBe(0);
    await w.ask();
    expect(calls).toBe(2);
  });

  it('an answered read is kept and served held', async () => {
    const w = await world(async () => ({ rows: [{ id: 1 }] }));
    await w.ask(() => {});
    await w.broker.conditionAnswersReady();
    expect(w.store.rows.size).toBe(1);
  });
});
