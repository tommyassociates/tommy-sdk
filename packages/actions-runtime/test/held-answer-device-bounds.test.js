import { describe, it, expect, vi } from 'vitest';
import { createBroker, createFakeIssuer, createConditionAnswers } from '../src/index.js';
import { conditionSignature } from '../src/condition-answers.js';

const TENANT = 'team-1';
const OWNER = JSON.stringify(['tenant', TENANT]);
const def = {
  description: 'c', inputSchema: { type: 'object' }, returnSchema: { type: 'object' }, latencyBudgetMs: 5000, heldFirst: true,
};

function deviceStore(seed = []) {
  const rows = new Map(seed.map((row) => [row.id, JSON.parse(JSON.stringify(row))]));
  return {
    rows,
    load: async () => [...rows.values()].map((row) => JSON.parse(JSON.stringify(row))),
    put: async (row) => { rows.set(row.id, JSON.parse(JSON.stringify(row))); },
    remove: async (id) => { rows.delete(id); },
  };
}

function entry({ fingerprint, args = {}, answer = { seen: fingerprint }, condition = 'scheduling.c' }) {
  const id = createConditionAnswers().idFor(OWNER, fingerprint, condition, JSON.stringify(args));
  return {
    id, owner: OWNER, fingerprint, condition, sig: conditionSignature('1.0.0', def), answer, at: 1, seq: 0, stale: false,
  };
}

async function world({ store, fingerprint = 'rf-now', handler, ...options }) {
  const issuer = createFakeIssuer();
  const broker = createBroker({
    capabilityService: issuer, conditionAnswerStore: store, viewerFingerprint: () => fingerprint, setTimer: () => ({}), clearTimer: () => {}, ...options,
  });
  broker.registerMp({
    id: 'scheduling', version: '1.0.0', publisher: { type: 'first_party' }, triggers: {}, conditions: { c: def }, activities: {}, actions: {},
  }, { handlers: { conditions: { c: (args) => handler(args) } } });
  const token = await issuer.issue('scheduling', '1.0.0', TENANT, [], 'i-1');
  const ask = (args = {}) => broker.query({
    sourceMpId: 'scheduling', instanceId: 'i-1', capabilityToken: token, condition: 'scheduling.c', args, onRead: () => {},
  });
  await broker.conditionAnswersReady();
  return { broker, ask };
}

describe('what a held answer leaves on the device', () => {
  it('answers kept under another fingerprint leave the device once the viewer\'s fingerprint is settled', async () => {
    const store = deviceStore([entry({ fingerprint: 'rf-before' }), entry({ fingerprint: 'rf-before', args: { week: 2 } })]);
    const w = await world({ store, viewerFingerprintSettled: () => true, handler: async () => ({ fresh: true }) });
    expect(await w.ask()).toMatchObject({ state: 'fresh' });
    await w.broker.conditionAnswersReady();
    expect([...store.rows.values()].map((row) => row.fingerprint)).toEqual(['rf-now']);
  });

  it('while the fingerprint is not settled, answers under another fingerprint stay, unserved', async () => {
    const store = deviceStore([entry({ fingerprint: 'rf-before' })]);
    const w = await world({ store, viewerFingerprintSettled: () => false, handler: async () => ({ fresh: true }) });
    expect(await w.ask()).toMatchObject({ state: 'fresh', answer: { fresh: true } });
    await w.broker.conditionAnswersReady();
    expect([...store.rows.values()].map((row) => row.fingerprint).sort()).toEqual(['rf-before', 'rf-now']);
  });

  it('the viewer\'s own held answer is served and kept by the sweep', async () => {
    const store = deviceStore([entry({ fingerprint: 'rf-now', answer: { mine: true } }), entry({ fingerprint: 'rf-before' })]);
    const w = await world({ store, viewerFingerprintSettled: () => true, handler: () => new Promise(() => {}) });
    expect(await w.ask()).toMatchObject({ state: 'held', answer: { mine: true } });
    await w.broker.conditionAnswersReady();
    expect([...store.rows.keys()]).toEqual([entry({ fingerprint: 'rf-now' }).id]);
  });

  it('where the host holds no answers (a kiosk), a heldFirst condition answers fresh and keeps nothing, in memory or on the device', async () => {
    const store = deviceStore();
    const handler = vi.fn(async () => ({ member: 'A' }));
    const w = await world({ store, holdConditionAnswers: () => false, handler });
    expect(await w.ask()).toMatchObject({ state: 'fresh', answer: { member: 'A' } });
    handler.mockImplementation(() => new Promise(() => {}));
    const second = w.ask();
    const raced = await Promise.race([second.then(() => 'answered'), new Promise((resolve) => { setTimeout(() => resolve('waiting'), 20); })]);
    expect(raced).toBe('waiting');
    await w.broker.conditionAnswersReady();
    expect(store.rows.size).toBe(0);
  });
});
