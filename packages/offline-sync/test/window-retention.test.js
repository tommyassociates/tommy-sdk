/**
 * window-retention.test.js — mp-durable-instant-surfaces phase 2.
 *
 * Scoped reconcile leaves out-of-scope rows alone BY DESIGN, so a window-paging
 * store accumulates every window ever viewed and the row cap is the only bound.
 * In memory that lasts a session. Persisted, it is an archive on the user's disk
 * — the 50-200MB problem that made the legacy Vuex plugin refuse to persist
 * these very collections (`core/src/store/plugins/indexeddb.js`).
 *
 * These tests pin the retention pass that makes persistence safe for them.
 */
import { describe, it, expect } from 'vitest';
import { createDataStore, createMemoryStoreBackend } from '../src/data-store.js';
import { createDataManager } from '../src/manager.js';

const store = (opts = {}) => createDataStore({
  name: 'grid',
  keyPath: 'id',
  backend: createMemoryStoreBackend(),
  ...opts,
});

/** Reconcile one week's rows under its own window key. */
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

    // A fourth window pushes the oldest out — not the oldest ROWS, the oldest
    // WINDOW, which is the distinction the row cap cannot make.
    const res = await week(s, 'w4', [7, 8]);
    expect(res.windowsDropped).toBe(1);
    const ids = (await s.getAll()).map((r) => r.id).sort();
    expect(ids).toEqual(['3', '4', '5', '6', '7', '8']);
  });

  it('NEVER drops the window being viewed, even when its rows are the oldest', async () => {
    // The failure this guards: on a first visit to an old week, its rows carry
    // the oldest stamps in the store, so any recency rule that ignores "current"
    // would delete the page the user is looking at.
    const s = store({ maxWindows: 2 });
    await week(s, 'old', [1, 2]);
    await week(s, 'mid', [3, 4]);
    await week(s, 'new', [5, 6]);
    // 'old' went, 'new' (current) stayed.
    const ids = (await s.getAll()).map((r) => r.id).sort();
    expect(ids).toContain('5');
    expect(ids).toContain('6');
    expect(ids).not.toContain('1');
  });

  it('refreshes a window that is revisited rather than leaving it at the back', async () => {
    const s = store({ maxWindows: 2 });
    await week(s, 'w1', [1]);
    await week(s, 'w2', [2]);
    await week(s, 'w1', [1]); // revisit — w1 is now the most recent
    await week(s, 'w3', [3]); // pushes out the true oldest, which is now w2
    const ids = (await s.getAll()).map((r) => r.id).sort();
    expect(ids).toEqual(['1', '3']);
  });

  it('never drops an unsynced (dirty) row, whatever window it is in', async () => {
    const s = store({ maxWindows: 1 });
    await week(s, 'w1', [1]);
    await s.put({ id: '99' });            // a local write, dirty until synced
    await week(s, 'w2', [2]);
    const ids = (await s.getAll()).map((r) => r.id).sort();
    expect(ids).toContain('99');
  });

  it('is INERT for a store that passes no windowKey', async () => {
    // A whole-store cache has nothing to retain by window; the row cap is its
    // bound. Retention must not touch it.
    const s = store({ maxWindows: 1 });
    await s.reconcile([{ id: '1' }], { scope: () => true });
    await s.reconcile([{ id: '2' }], { scope: (r) => r.id === '2' });
    const ids = (await s.getAll()).map((r) => r.id).sort();
    expect(ids).toEqual(['1', '2']);
  });

  it('does not leak `_window` into the rows a surface reads', async () => {
    // `_window` is store metadata, the same class as `_updatedAt`: it must never
    // reach a recordSchema or a paint function.
    const s = store({ maxWindows: 3 });
    await week(s, 'w1', [1]);
    const [row] = await s.readWhere(() => true);
    expect(row._window).toBeUndefined();
    expect(row).toEqual({ id: '1' });
  });
});

/**
 * ⚠ AND IT MUST RUN ON THE PATH PRODUCTION ACTUALLY USES (review F2).
 *
 * Everything above drives `store.reconcile` directly with a `windowKey`. No
 * production surface does that: the instant surfaces go through
 * `liveQuery.revalidate`, which dropped the key on the floor while its sibling
 * `windowCache.sync` passed it. `enforceWindowRetention` only ever touches rows
 * carrying `_window` (data-store.js:423), so retention never ran for a single
 * shipped store — the feature was tested into existence and then bypassed.
 */
describe('window retention through liveQuery (the production path)', () => {
  const manager = () => createDataManager({
    capabilityToken: { tenantId: 'team-3', mpId: 'grid-mp' }, mpId: 'grid-mp',
    localData: { grid: { keyPath: 'id' } },
    backendFactory: () => createMemoryStoreBackend(),
  });

  /**
   * Modelled on the real shape (calendar/src/panels/CalendarMain.vue:513):
   * the scope is a CLOSURE over the surface's current window, so paging forward
   * leaves the previous window's rows in the store rather than pruning them.
   * That is what makes these caches accumulate, and therefore what retention
   * exists to bound.
   */
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
    // Untagged rows are invisible to retention, which is the whole defect.
    expect(raw.every((r) => r._window != null)).toBe(true);
  });

  it('evicts the oldest window when a fourth is visited', async () => {
    const mgr = manager();
    const state = { week: 'w1' };
    const lq = gridQuery(mgr, state);
    await visit(lq, state, 'w1');
    await visit(lq, state, 'w2');
    await visit(lq, state, 'w3');
    // Three windows have accumulated — the window-scoped prune left each alone.
    expect((await lq.store.getAll()).map((r) => r.id).sort()).toEqual(['w1-a', 'w2-a', 'w3-a']);
    await visit(lq, state, 'w4');
    const ids = (await lq.store.getAll()).map((r) => r.id).sort();
    expect(ids).toEqual(['w2-a', 'w3-a', 'w4-a']);   // maxWindows defaults to 3
  });

  it('a writer that passes no windowKey does not un-tag rows a windowed read tagged', async () => {
    // `put` spreads the caller's record over the row, and the record never
    // carries `_window` — so an untagged writer (a filtered read, an optimistic
    // form write) used to strip the tag, and the row became invisible to
    // retention. A store with mixed writers leaked out of its own bound.
    const mgr = manager();
    const state = { week: 'w1' };
    const lq = gridQuery(mgr, state);
    await visit(lq, state, 'w1');
    // A second writer on the same store, with no window of its own.
    const plain = mgr.liveQuery('grid', { scope: (r) => r.id === 'w1-a', fetch: () => [{ id: 'w1-a', week: 'w1' }] });
    await plain.revalidate();
    const [row] = await lq.store.getAll();
    expect(row._window).toBeDefined();
  });

  it('a source with NO fetch never reconciles, so its store must be tagged by its own writer', async () => {
    // The shipped scheduling shape (SchedulingMain.vue instantSources): store,
    // scope and paint, no `fetch`. `fetchAndReconcile` sees `dtos = null` and
    // reconciles NOTHING, so no `windowKey` the mixin passes can ever reach the
    // store. Declaring `instantWindow()` on such a surface is decorative — the
    // tag has to come from whoever actually writes the cache (review
    // R2-F1-VERIFY). Pinned so a future reader does not "fix" retention by
    // adding a window to a fetch-less source again.
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
