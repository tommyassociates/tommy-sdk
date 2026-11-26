import { describe, it, expect } from 'vitest';
import { createDataStore, createMemoryStoreBackend } from '../src/data-store.js';
import { createDataManager } from '../src/manager.js';

const store = (opts = {}) => createDataStore({
  name: 'grid',
  keyPath: 'id',
  backend: createMemoryStoreBackend(),
  ...opts,
});

const week = async (s, key, ids) => s.reconcile(ids.map((id) => ({ id: String(id) })), {
  scope: (row) => ids.map(String).includes(String(row.id)),
  windowKey: key,
});

describe('window retention', () => {
  it('keeps the K most recent windows and drops the rest', async () => {
    const s = store({ maxWindows: 3 });
    await week(s, 'w1', [1, 2]);
    await week(s, 'w2', [3, 4]);
    await week(s, 'w3', [5, 6]);
    expect((await s.getAll()).length).toBe(6);

    const res = await week(s, 'w4', [7, 8]);
    expect(res.windowsDropped).toBe(1);
    const ids = (await s.getAll()).map((r) => r.id).sort();
    expect(ids).toEqual(['3', '4', '5', '6', '7', '8']);
  });

  it('NEVER drops the window being viewed, even when its rows are the oldest', async () => {
    const s = store({ maxWindows: 2 });
    await week(s, 'old', [1, 2]);
    await week(s, 'mid', [3, 4]);
    await week(s, 'new', [5, 6]);
    const ids = (await s.getAll()).map((r) => r.id).sort();
    expect(ids).toContain('5');
    expect(ids).toContain('6');
    expect(ids).not.toContain('1');
  });

  it('refreshes a window that is revisited rather than leaving it at the back', async () => {
    const s = store({ maxWindows: 2 });
    await week(s, 'w1', [1]);
    await week(s, 'w2', [2]);
    await week(s, 'w1', [1]);
    await week(s, 'w3', [3]);
    const ids = (await s.getAll()).map((r) => r.id).sort();
    expect(ids).toEqual(['1', '3']);
  });

  it('never drops an unsynced (dirty) row, whatever window it is in', async () => {
    const s = store({ maxWindows: 1 });
    await week(s, 'w1', [1]);
    await s.put({ id: '99' });
    await week(s, 'w2', [2]);
    const ids = (await s.getAll()).map((r) => r.id).sort();
    expect(ids).toContain('99');
  });

  it('is INERT for a store that passes no windowKey', async () => {
    const s = store({ maxWindows: 1 });
    await s.reconcile([{ id: '1' }], { scope: () => true });
    await s.reconcile([{ id: '2' }], { scope: (r) => r.id === '2' });
    const ids = (await s.getAll()).map((r) => r.id).sort();
    expect(ids).toEqual(['1', '2']);
  });

  it('does not leak `_window` into the rows a surface reads', async () => {
    const s = store({ maxWindows: 3 });
    await week(s, 'w1', [1]);
    const [row] = await s.readWhere(() => true);
    expect(row._window).toBeUndefined();
    expect(row).toEqual({ id: '1' });
  });
});

describe('window retention through liveQuery (the production path)', () => {
  const manager = () => createDataManager({
    capabilityToken: { tenantId: 'team-3', mpId: 'grid-mp' }, mpId: 'grid-mp',
    localData: { grid: { keyPath: 'id' } },
    backendFactory: () => createMemoryStoreBackend(),
  });

  const gridQuery = (mgr, state) => mgr.liveQuery('grid', {
    scope: (row) => row.week === state.week,
    fetch: (window) => [{ id: `${window.week}-a`, week: window.week }],
  });
  const visit = async (lq, state, week) => { state.week = week; await lq.revalidate({ week }); };

  it('tags rows with the window the surface fetched them for', async () => {
    const mgr = manager();
    const state = { week: 'w1' };
    const lq = gridQuery(mgr, state);
    await visit(lq, state, 'w1');
    const raw = await lq.store.getAll();
    expect(raw.length).toBe(1);
    expect(raw.every((r) => r._window != null)).toBe(true);
  });

  it('evicts the oldest window when a fourth is visited', async () => {
    const mgr = manager();
    const state = { week: 'w1' };
    const lq = gridQuery(mgr, state);
    await visit(lq, state, 'w1');
    await visit(lq, state, 'w2');
    await visit(lq, state, 'w3');
    expect((await lq.store.getAll()).map((r) => r.id).sort()).toEqual(['w1-a', 'w2-a', 'w3-a']);
    await visit(lq, state, 'w4');
    const ids = (await lq.store.getAll()).map((r) => r.id).sort();
    expect(ids).toEqual(['w2-a', 'w3-a', 'w4-a']);
  });

  it('a writer that passes no windowKey does not un-tag rows a windowed read tagged', async () => {
    const mgr = manager();
    const state = { week: 'w1' };
    const lq = gridQuery(mgr, state);
    await visit(lq, state, 'w1');
    const plain = mgr.liveQuery('grid', { scope: (r) => r.id === 'w1-a', fetch: () => [{ id: 'w1-a', week: 'w1' }] });
    await plain.revalidate();
    const [row] = await lq.store.getAll();
    expect(row._window).toBeDefined();
  });

  it('a source with NO fetch never reconciles, so its store must be tagged by its own writer', async () => {
    const mgr = manager();
    const lq = mgr.liveQuery('grid', { scope: () => true });
    await lq.revalidate({ week: 'w1' });
    expect(await lq.store.getAll()).toEqual([]);
  });

  it('stays inert for a whole-store liveQuery that passes no window', async () => {
    const mgr = manager();
    const lq = mgr.liveQuery('grid', { scope: () => true, fetch: () => [{ id: 'only' }] });
    await lq.revalidate();
    await lq.revalidate();
    const raw = await lq.store.getAll();
    expect(raw.length).toBe(1);
    expect(raw[0]._window).toBeUndefined();
  });
});
