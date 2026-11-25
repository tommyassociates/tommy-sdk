import { describe, it, expect, vi } from 'vitest';
import { createBroker, createFakeIssuer, createConditionAnswers } from '../src/index.js';

const tick = () => new Promise((resolve) => { setTimeout(resolve, 0); });
const settle = async (n = 6) => { for (let i = 0; i < n; i += 1) await tick(); };
const copy = (value) => JSON.parse(JSON.stringify(value));

function deviceStore(seed = []) {
  const rows = new Map(seed.map((row) => [row.id, copy(row)]));
  return {
    rows,
    load: async () => [...rows.values()].map(copy),
    put: async (row) => { rows.set(row.id, copy(row)); },
    remove: async (id) => { rows.delete(id); },
  };
}

const conditionDef = (extra = {}) => ({
  description: 'c', inputSchema: { type: 'object' }, returnSchema: { type: 'object' }, latencyBudgetMs: 5000, heldFirst: true, ...extra,
});
const timedOut = () => Object.assign(new Error('condition timed out'), { code: 'Timeout' });
const owned = () => ({ tenantId: 'team-1' });

async function world({ store = null, def = conditionDef(), handler, version = '1.0.0' } = {}) {
  const issuer = createFakeIssuer();
  const timers = [];
  const broker = createBroker({
    capabilityService: issuer,
    conditionAnswerStore: store,
    queueOwner: owned,
    viewerFingerprint: () => 'rf-1',
    setTimer: (fn, ms) => { const timer = { fn, ms }; timers.push(timer); return timer; },
    clearTimer: () => {},
  });
  const register = (v, run) => broker.registerMp({
    id: 'scheduling', version: v, publisher: { type: 'first_party' }, triggers: {}, activities: {}, actions: {}, conditions: { c: def },
  }, { handlers: { conditions: { c: (args, ctx) => run(args, ctx) } } });
  register(version, handler);
  const token = await issuer.issue('scheduling', version, 'team-1', [], 'i-1');
  const notices = [];
  const ask = (onRead = (notice) => notices.push(notice)) => broker.query({
    sourceMpId: 'scheduling', instanceId: 'i-1', capabilityToken: token, condition: 'scheduling.c', args: {}, ...(onRead ? { onRead } : {}),
  });
  const runTimers = async () => {
    const due = timers.splice(0);
    for (const timer of due) timer.fn();
    await settle();
  };
  return { broker, ask, notices, register, runTimers };
}

async function keptBefore(answer) {
  const store = deviceStore();
  const before = await world({ store, handler: async () => answer });
  await before.ask();
  await before.broker.conditionAnswersReady();
  return store;
}

describe('a retry of a held answer is authorized against the live registration', () => {
  it('a provider unregistered while the retry waits is not called again, and no fresh answer arrives', async () => {
    const store = await keptBefore({ n: 0 });
    const handler = vi.fn(async () => { throw timedOut(); });
    const w = await world({ store, handler });
    await w.broker.conditionAnswersReady();
    expect((await w.ask()).state).toBe('held');
    await settle();
    expect(handler).toHaveBeenCalledTimes(1);
    w.broker.unregisterMp('scheduling');
    handler.mockImplementation(async () => ({ n: 1 }));
    await w.runTimers();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(w.notices.some((n) => n.state === 'fresh')).toBe(false);
  });

  it('a provider replaced by another version while the retry waits gives no fresh answer from either', async () => {
    const store = await keptBefore({ n: 0 });
    const handler = vi.fn(async () => { throw timedOut(); });
    const w = await world({ store, handler });
    await w.broker.conditionAnswersReady();
    await w.ask();
    await settle();
    const replaced = vi.fn(async () => ({ n: 2 }));
    w.register('2.0.0', replaced);
    handler.mockImplementation(async () => ({ n: 1 }));
    await w.runTimers();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(replaced).not.toHaveBeenCalled();
    expect(w.notices.some((n) => n.state === 'fresh')).toBe(false);
  });
});

describe('the TTL cache keeps the newest read', () => {
  it('an older read that finishes last never replaces the newer cached answer', async () => {
    let first;
    let reads = 0;
    const w = await world({
      def: conditionDef({ cacheable: true, cacheTtlMs: 60000 }),
      handler: () => {
        reads += 1;
        if (reads === 1) return new Promise((resolve) => { first = resolve; });
        return Promise.resolve({ n: 2 });
      },
    });
    const older = w.ask(null);
    await settle();
    await w.ask(null);
    first({ n: 1 });
    await older;
    expect(await w.ask()).toMatchObject({ state: 'fresh', answer: { n: 2 } });
  });
});

describe('a stale mark made while held answers load', () => {
  it('is kept in storage, so a restart still revalidates', async () => {
    const answers = createConditionAnswers();
    const id = answers.idFor('owner', 'rf-1', 'mp.c', 'null');
    const rows = new Map([[id, {
      id, owner: 'owner', fingerprint: 'rf-1', condition: 'mp.c', answer: { x: 1 }, at: 1, seq: 0, stale: false,
    }]]);
    let letLoad;
    const loaded = new Promise((resolve) => { letLoad = resolve; });
    const store = {
      load: async () => { await loaded; return [...rows.values()].map(copy); },
      put: async (row) => { rows.set(row.id, copy(row)); },
      remove: async (key) => { rows.delete(key); },
    };
    const loading = createConditionAnswers({ store });
    const ready = loading.ready();
    loading.markStale((condition) => condition === 'mp.c');
    letLoad();
    await ready;
    await loading.flush();
    expect(rows.get(id)).toMatchObject({ stale: true });
  });
});
