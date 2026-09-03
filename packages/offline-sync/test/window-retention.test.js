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
