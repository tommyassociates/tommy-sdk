import { describe, it, expect } from 'vitest';
import { createBroker, createFakeIssuer } from '../src/index.js';

const tick = () => new Promise((resolve) => { setTimeout(resolve, 0); });
const settle = async (n = 6) => { for (let i = 0; i < n; i += 1) await tick(); };
const copy = (value) => JSON.parse(JSON.stringify(value));
const refused = () => Object.assign(new Error('Permission denied'), { code: 'PermissionDenied', status: 403 });

function deviceStore() {
  const rows = new Map();
  return {
    rows,
    load: async () => [...rows.values()].map(copy),
    put: async (row) => { rows.set(row.id, copy(row)); },
    remove: async (id) => { rows.delete(id); },
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

async function world({ store = null, def = {}, handler, clock = { now: 1764057600000 } } = {}) {
  const issuer = createFakeIssuer();
  const broker = createBroker({
    capabilityService: issuer,
    conditionAnswerStore: store,
    queueOwner: () => ({ tenantId: 'team-1' }),
    viewerFingerprint: () => 'rf-1',
    now: () => clock.now,
    setTimer: () => ({}),
    clearTimer: () => {},
  });
  broker.registerMp({
    id: 'scheduling', version: '1.0.0', publisher: { type: 'first_party' }, triggers: {}, activities: {}, actions: {},
    conditions: {
      c: {
        description: 'c', inputSchema: { type: 'object' }, returnSchema: { type: 'object' }, latencyBudgetMs: 5000, heldFirst: true, ...def,
      },
    },
  }, { handlers: { conditions: { c: (args, ctx) => handler(args, ctx) } } });
  const token = await issuer.issue('scheduling', '1.0.0', 'team-1', [], 'i-1');
  const ask = (onRead = () => {}) => broker.query({
    sourceMpId: 'scheduling', instanceId: 'i-1', capabilityToken: token, condition: 'scheduling.c', args: {}, ...(onRead ? { onRead } : {}),
  });
  return { broker, ask, clock };
}

async function keptBefore(answer) {
  const store = deviceStore();
  const before = await world({ store, handler: async () => answer });
  await before.ask();
  await before.broker.conditionAnswersReady();
  return store;
}

describe('a refusal fences reads already in flight', () => {
  it('an older cold read that succeeds after a newer one is refused keeps nothing in either cache', async () => {
    const older = deferred();
    let reads = 0;
    const w = await world({
      def: { cacheable: true, cacheTtlMs: 60000 },
      handler: () => {
        reads += 1;
        if (reads === 1) return older.promise;
        return Promise.reject(refused());
      },
    });
    const first = w.ask();
    await settle();
    await expect(w.ask()).rejects.toMatchObject({ code: 'PermissionDenied' });
    older.resolve({ secret: 'old' });
    await first;
    await expect(w.ask()).rejects.toMatchObject({ code: 'PermissionDenied' });
  });
});

describe('overlapping revalidations', () => {
  it('the asker whose read lost gets the winning answer and its time, not its own older value', async () => {
    const store = await keptBefore({ n: 0 });
    const reads = [deferred(), deferred()];
    let at = 0;
    const w = await world({ store, handler: () => reads[at++].promise });
    await w.broker.conditionAnswersReady();
    const firstNotices = [];
    const secondNotices = [];
    await w.ask((notice) => firstNotices.push(notice));
    await settle();
    await w.ask((notice) => secondNotices.push(notice));
    await settle();
    w.clock.now += 1000;
    reads[1].resolve({ n: 2 });
    await settle();
    w.clock.now += 1000;
    reads[0].resolve({ n: 1 });
    await settle();
    const fresh = firstNotices.find((notice) => notice.state === 'fresh');
    const winner = secondNotices.find((notice) => notice.state === 'fresh');
    expect(winner).toMatchObject({ answer: { n: 2 } });
    expect(fresh).toMatchObject({ answer: { n: 2 }, asOf: winner.asOf });
  });
});

describe('a background revalidation is pending work', () => {
  it('until its read settles and its last notice is delivered', async () => {
    const store = await keptBefore({ n: 0 });
    const read = deferred();
    const w = await world({ store, handler: () => read.promise });
    await w.broker.conditionAnswersReady();
    expect((await w.ask()).state).toBe('held');
    await settle();
    expect(w.broker.hasPendingWork()).toBe(true);
    read.resolve({ n: 1 });
    await settle();
    expect(w.broker.hasPendingWork()).toBe(false);
  });
});

describe('a TTL cache hit', () => {
  it('answers the time of the read it holds, and its age', async () => {
    const w = await world({ def: { cacheable: true, cacheTtlMs: 600000, freshness: { showAgeMs: 10000 } }, handler: async () => ({ n: 1 }) });
    const readAt = w.clock.now;
    expect(await w.ask()).toMatchObject({ state: 'fresh', asOf: readAt });
    w.clock.now += 30000;
    expect(await w.ask()).toMatchObject({ state: 'fresh', asOf: readAt, aged: true });
  });
});
