import { describe, it, expect, vi } from 'vitest';
import { createBroker, createFakeIssuer } from '../src/index.js';

const tick = () => new Promise((resolve) => { setTimeout(resolve, 0); });
const settle = async (n = 6) => { for (let i = 0; i < n; i += 1) await tick(); };

function deviceStore(seed = []) {
  const rows = new Map(seed.map((row) => [row.id, JSON.parse(JSON.stringify(row))]));
  return {
    rows,
    load: async () => [...rows.values()].map((row) => JSON.parse(JSON.stringify(row))),
    put: async (row) => { rows.set(row.id, JSON.parse(JSON.stringify(row))); },
    remove: async (id) => { rows.delete(id); },
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function world({
  def = {}, handler, store = null, queueOwner, fingerprint = { value: 'rf-1' }, version = '1.0.0',
} = {}) {
  const issuer = createFakeIssuer();
  const broker = createBroker({
    capabilityService: issuer,
    conditionAnswerStore: store,
    viewerFingerprint: () => fingerprint.value,
    ...(queueOwner ? { queueOwner } : {}),
    setTimer: () => ({}),
    clearTimer: () => {},
  });
  broker.registerMp({
    id: 'scheduling', version, publisher: { type: 'first_party' }, triggers: {}, activities: {}, actions: {},
    conditions: {
      c: {
        description: 'c', inputSchema: { type: 'object' }, returnSchema: { type: 'object' }, latencyBudgetMs: 5000, heldFirst: true, ...def,
      },
    },
  }, { handlers: { conditions: { c: (args, ctx) => handler(args, ctx) } } });
  const tokens = {
    'team-1': await issuer.issue('scheduling', version, 'team-1', [], 'i-1'),
    'team-2': await issuer.issue('scheduling', version, 'team-2', [], 'i-2'),
  };
  const notices = [];
  const ask = (args, { tenant = 'team-1', onRead = (notice) => notices.push(notice), signal } = {}) => broker.query({
    sourceMpId: 'scheduling', instanceId: tenant === 'team-1' ? 'i-1' : 'i-2', capabilityToken: tokens[tenant], condition: 'scheduling.c', args,
    ...(onRead ? { onRead } : {}), ...(signal ? { signal } : {}),
  });
  return { broker, ask, notices, fingerprint };
}

const owned = () => ({ tenantId: 'team-1' });

// A store holding the answer an earlier session kept for these args.
async function keptBefore(answer, { version = '1.0.0' } = {}) {
  const store = deviceStore();
  const before = await world({ store, queueOwner: owned, version, handler: async () => answer });
  await before.ask({});
  await before.broker.conditionAnswersReady();
  return store;
}

describe('held answers belong to the authenticated tenant', () => {
  it('with no queue owner, one tenant never receives another tenant\'s held answer', async () => {
    const w = await world({ handler: async (_, { tenantId }) => ({ tenant: tenantId }) });
    expect(await w.ask({})).toMatchObject({ state: 'fresh', answer: { tenant: 'team-1' } });
    expect(await w.ask({}, { tenant: 'team-2' })).toMatchObject({ state: 'fresh', answer: { tenant: 'team-2' } });
  });
});

describe('the TTL cache follows the held answers', () => {
  it('a purge on a role change is not answered from the cache', async () => {
    let answer = { role: 'manager' };
    const w = await world({ def: { cacheable: true, cacheTtlMs: 60000 }, handler: async () => answer });
    expect(await w.ask({})).toMatchObject({ state: 'fresh', answer: { role: 'manager' } });
    w.fingerprint.value = 'rf-2';
    w.broker.purgeConditionAnswers();
    answer = { role: 'member' };
    expect(await w.ask({})).toMatchObject({ state: 'fresh', answer: { role: 'member' } });
  });

  it('a purge with an unchanged fingerprint is not answered from the cache', async () => {
    let answer = { count: 1 };
    const w = await world({ def: { cacheable: true, cacheTtlMs: 60000 }, handler: async () => answer });
    await w.ask({});
    w.broker.purgeConditionAnswers();
    answer = { count: 2 };
    expect(await w.ask({})).toMatchObject({ state: 'fresh', answer: { count: 2 } });
  });

  it('a landed write on a source forces a read instead of a cached fresh answer', async () => {
    const handler = vi.fn(async () => ({ count: 1 }));
    const w = await world({ def: { cacheable: true, cacheTtlMs: 60000, freshness: { sources: ['workforce.shifts'] } }, handler });
    await w.ask({});
    w.broker.markConditionAnswersStale(['workforce.shifts']);
    expect(await w.ask({})).toMatchObject({ state: 'held' });
    await settle();
    expect(handler).toHaveBeenCalledTimes(2);
  });
});

describe('a read in flight across a purge or a landed write', () => {
  it('a read begun before a purge does not keep its answer', async () => {
    const gate = deferred();
    const handler = vi.fn(async () => { await gate.promise; return { count: 1 }; });
    const w = await world({ handler });
    const first = w.ask({});
    await settle();
    w.broker.purgeConditionAnswers();
    gate.resolve();
    await first;
    handler.mockImplementation(async () => ({ count: 2 }));
    expect(await w.ask({})).toMatchObject({ state: 'fresh', answer: { count: 2 } });
  });

  it('a read begun before a landed write does not keep its answer as fresh', async () => {
    const gate = deferred();
    const handler = vi.fn(async () => { await gate.promise; return { count: 1 }; });
    const w = await world({ def: { freshness: { sources: ['workforce.shifts'] } }, handler });
    const first = w.ask({});
    await settle();
    w.broker.markConditionAnswersStale(['workforce.shifts']);
    gate.resolve();
    await first;
    handler.mockImplementation(async () => ({ count: 2 }));
    expect(await w.ask({})).toMatchObject({ state: 'fresh', answer: { count: 2 } });
  });

  it('a revalidation purged mid-read reads again and delivers the new answer', async () => {
    const store = await keptBefore({ count: 0 });
    const gate = deferred();
    let reads = 0;
    const handler = vi.fn(async () => {
      reads += 1;
      if (reads === 1) { await gate.promise; return { count: 1 }; }
      return { count: 2 };
    });
    const w = await world({ store, queueOwner: owned, handler });
    await w.broker.conditionAnswersReady();
    const held = await w.ask({});
    expect(held.state).toBe('held');
    await settle();
    w.broker.purgeConditionAnswers();
    gate.resolve();
    await settle();
    expect(handler).toHaveBeenCalledTimes(2);
    expect(w.notices.filter((n) => n.state === 'fresh')).toEqual([expect.objectContaining({ answer: { count: 2 } })]);
  });
});

describe('a held answer kept by another definition', () => {
  it('is not served after a restart with a new version', async () => {
    const store = await keptBefore({ shape: 'old' });
    const w = await world({ store, queueOwner: owned, version: '2.0.0', handler: async () => ({ shape: 'new' }) });
    await w.broker.conditionAnswersReady();
    expect(await w.ask({})).toMatchObject({ state: 'fresh', answer: { shape: 'new' } });
  });
});

describe('a caller that aborts after its held answer', () => {
  it('gets no further notice', async () => {
    const store = await keptBefore({ count: 0 });
    const gate = deferred();
    const w = await world({ store, queueOwner: owned, handler: async () => { await gate.promise; return { count: 1 }; } });
    await w.broker.conditionAnswersReady();
    const controller = new AbortController();
    const held = await w.ask({}, { signal: controller.signal });
    expect(held.state).toBe('held');
    controller.abort();
    gate.resolve();
    await settle();
    expect(w.notices).toEqual([]);
  });
});
