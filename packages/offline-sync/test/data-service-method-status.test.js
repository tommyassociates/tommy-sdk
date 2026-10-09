// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { createDataService, createDataStore, createMemoryStoreBackend } from '../src/index.js';

const setup = () => {
  const store = createDataStore({ name: 'plans', backend: createMemoryStoreBackend(), indexes: { id: 'id' } });
  const data = createDataService({ resolve: () => ({ store, decl: { keyPath: 'id', indexes: { id: 'id' } } }), principal: { id: 'p1' } });
  return { data, store };
};
const target = (client) => ({ collection: 'plans', method: 'client', params: { client: String(client) } });
const source = (fetch) => ({ fetch: async () => [], methods: { client: { params: { client: { type: 'id' } }, fetch } } });

describe('canonical non-batched method status receipts', () => {
  it('reports the exact empty query without granting whole-collection coverage', async () => {
    const { data } = setup();
    data.source('plans', source(async () => ({ rows: [], more: false })));
    const answer = await data.refresh(target(1), { mode: 'visible' });
    expect(answer).toMatchObject({ state: 'fresh', keys: [], more: false, receipt: expect.any(Number) });
    expect(data.status(target(1))).toEqual(answer);
    expect(data.status('plans')).toEqual({ state: 'stale', syncedAt: null, error: null });
    expect(data.status(target(2))).toMatchObject({ state: 'stale', keys: null, receipt: null });
    data.dispose();
  });
  it('withdraws an empty receipt after purge and trim, even when no row is removed', async () => {
    const { data } = setup();
    data.source('plans', source(async () => ({ rows: [], more: false })));
    const first = await data.refresh(target(1), { mode: 'visible' });
    await data.purge('plans', {});
    expect(data.status(target(1))).toMatchObject({ receipt: null, syncedAt: null });
    const second = await data.refresh(target(1), { mode: 'visible' });
    expect(second.receipt).toBeGreaterThan(first.receipt);
    await data.trim('plans', { index: 'id', keep: 0 });
    expect(data.status(target(1))).toMatchObject({ receipt: null, syncedAt: null });
    data.dispose();
  });
  it('supersedes the same query receipt while keeping distinct target receipts independent', async () => {
    const { data } = setup();
    let release;
    let calls = 0;
    data.source('plans', source(async () => {
      calls += 1;
      if (calls === 3) await new Promise((resolve) => { release = resolve; });
      return { rows: [], more: false };
    }));
    const first = await data.refresh(target(1), { mode: 'visible' });
    const other = await data.refresh(target(2), { mode: 'visible' });
    const overlap = data.refresh(target(1), { mode: 'visible', fromNow: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(data.status(target(1))).toMatchObject({ state: 'refreshing', receipt: null });
    expect(data.status(target(2))).toEqual(other);
    release();
    const later = await overlap;
    expect(later.receipt).toBeGreaterThan(first.receipt);
    expect(data.status(target(1))).toEqual(later);
    data.dispose();
  });
  it('proves empty whole coverage across same-millisecond reads and an empty purge', async () => {
    const { data } = setup();
    data.source('plans', source(async () => ({ rows: [], more: false })));
    expect(await data.refresh('plans', { mode: 'visible', full: true })).toBeUndefined();
    const first = data.status('plans', { receipt: true });
    expect(first).toMatchObject({ state: 'fresh', receipt: expect.any(String) });
    expect(data.status('plans')).not.toHaveProperty('receipt');
    await data.refresh('plans', { mode: 'visible', full: true, fromNow: true });
    const next = data.status('plans', { receipt: true });
    expect(next.receipt).not.toEqual(first.receipt);
    await data.purge('plans', {});
    expect(data.status('plans', { receipt: true }).receipt).toBeNull();
    data.dispose();
  });

  it('notifies an empty method invalidation and exposes changes during a metadata read barrier', async () => {
    const { data } = setup();
    data.source('plans', source(async () => ({ rows: [], more: false })));
    await data.refresh(target(1), { mode: 'visible' });
    const notices = [];
    const off = data.onStatusChange(() => notices.push(data.status(target(1)).receipt));
    const before = data.status(target(1), { receipt: true }).revision;
    await data.ingest('plans', [{ id: '1' }]);
    expect(data.status(target(1), { receipt: true }).revision).toBeGreaterThan(before);
    await data.purge('plans', {});
    expect(notices).toContain(null);
    off();
    data.dispose();
  });
  it('does not allocate or evict method groups for arbitrary unseen status requests', async () => {
    const { data } = setup();
    data.source('plans', source(async () => ({ rows: [], more: false })));
    const first = await data.refresh(target(1), { mode: 'visible' });
    for (let client = 2; client < 1000; client += 1) expect(data.status(target(client)).receipt).toBeNull();
    expect(data.status(target(1))).toEqual(first);
    data.dispose();
  });

});
