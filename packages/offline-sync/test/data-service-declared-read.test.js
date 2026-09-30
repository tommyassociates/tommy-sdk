// @vitest-environment node
/**
 * A source that declares its read (`read`): the service keeps the read's
 * cursor with the rows (a `~meta` row, written last and never handed to a
 * reader), asks only for what changed while the stored rows are the whole
 * set and a whole read ran within `fullEveryMs`, removes rows the server
 * marks removed, stamps the collection synced only for a read that
 * completed, purges an account's rows when the server refuses the read, and
 * never lets a read undo a change stored after it began.
 */
import { describe, it, expect } from 'vitest';
import { createDataService, createDataStore, createMemoryStoreBackend, SOURCE_META_KEY } from '../src/index.js';

const DAY = 86400000;
function service({ at = () => 1_000_000 } = {}) {
  const store = createDataStore({ name: 'members', backend: createMemoryStoreBackend() });
  const data = createDataService({ resolve: (name) => (name === 'members' ? { store, decl: { keyPath: 'id' } } : null), now: at });
  return { data, store };
}
/** A server answering from `rows`, recording the `since` each read asked with. */
function server(initial) {
  let rows = initial.map((row) => ({ ...row }));
  const asked = [];
  return {
    asked,
    set(next) { rows = next.map((row) => ({ ...row })); },
    fetch: async (_target, context) => {
      asked.push(context.since);
      if (context.since) return { rows: rows.filter((row) => row.updated > context.since), cursor: `c${rows.length}`, since: true };
      return { rows: rows.filter((row) => !row.deleted_at), cursor: `c${rows.length}` };
    },
  };
}
const ids = async (data) => (await data.read('members')).map((row) => row.id).sort();

describe('a declared read', () => {
  it('reads whole, keeps its cursor unseen by readers, then asks only for what changed', async () => {
    const { data, store } = service();
    const api = server([{ id: 'a', updated: 'c0' }, { id: 'b', updated: 'c0' }]);
    data.source('members', { fetch: api.fetch, read: { cursor: true, removedField: 'deleted_at', fullEveryMs: DAY } });
    await data.refresh('members', { mode: 'visible' });
    expect(await ids(data)).toEqual(['a', 'b']);
    expect(await store.getRaw(SOURCE_META_KEY)).toMatchObject({ cursor: 'c2', count: 2 });
    api.set([{ id: 'a', updated: 'c0' }, { id: 'b', updated: 'c3', deleted_at: '2026-09-30' }, { id: 'c', updated: 'c3' }]);
    await data.refresh('members', { mode: 'visible' });
    expect(api.asked).toEqual([null, 'c2']);
    // The removed row went, the new one came, and the cursor moved with them.
    expect(await ids(data)).toEqual(['a', 'c']);
    expect(await store.getRaw(SOURCE_META_KEY)).toMatchObject({ cursor: 'c3', count: 2 });
    expect((await data.query('members', { limit: 50 })).rows.map((row) => row.id)).toEqual(['a', 'c']);
  });

  it('reads whole again once the last whole read is older than fullEveryMs, or the stored rows are not the whole set', async () => {
    let at = 1_000_000;
    const { data, store } = service({ at: () => at });
    const api = server([{ id: 'a', updated: 'c0' }]);
    data.source('members', { fetch: api.fetch, read: { cursor: true, fullEveryMs: DAY } });
    await data.refresh('members', { mode: 'visible' });
    at += DAY + 1;
    await data.refresh('members', { mode: 'visible' });
    // A row gone from the device (evicted): the next read is whole.
    await store.delete('a');
    await data.refresh('members', { mode: 'visible' });
    // Asked for the whole collection: whole, whatever the cursor.
    await data.refresh('members', { mode: 'visible', full: true });
    expect(api.asked).toEqual([null, null, null, null]);
  });

  it('removes rows a whole read leaves out, and stamps the collection synced only when a read completed', async () => {
    const { data } = service();
    const api = server([{ id: 'a', updated: 'c0' }, { id: 'b', updated: 'c0' }]);
    let fail = false;
    data.source('members', {
      fetch: async (target, context) => { if (fail) throw Object.assign(new Error('Offline'), { status: 0 }); return api.fetch(target, context); },
      read: { cursor: false },
    });
    await data.refresh('members', { mode: 'visible' });
    api.set([{ id: 'b', updated: 'c1' }]);
    await data.refresh('members', { mode: 'visible' });
    expect(await ids(data)).toEqual(['b']);
    const synced = data.status('members').syncedAt;
    fail = true;
    await data.refresh('members');
    expect(data.status('members')).toMatchObject({ syncedAt: synced });
    expect(await ids(data)).toEqual(['b']);
  });

  it('purges the account\'s rows when the server refuses the read', async () => {
    const { data } = service();
    const api = server([{ id: 'a', updated: 'c0' }]);
    let refuse = false;
    data.source('members', {
      fetch: async (target, context) => { if (refuse) throw Object.assign(new Error('Forbidden'), { status: 403 }); return api.fetch(target, context); },
      read: { cursor: true },
    });
    await data.refresh('members', { mode: 'visible' });
    expect(await ids(data)).toEqual(['a']);
    refuse = true;
    await data.refresh('members');
    expect(await ids(data)).toEqual([]);
    expect(data.status('members').state).toBe('error');
  });

  it('never undoes a change stored after the read began: an added row stays, a removed row stays removed', async () => {
    const { data } = service();
    let answer;
    data.source('members', {
      fetch: () => new Promise((resolve) => { answer = resolve; }),
      read: { cursor: false },
    });
    await data.ingest('members', [{ id: 'a' }, { id: 'b' }], { replace: true });
    const reading = data.refresh('members', { mode: 'visible' });
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    // While the read is on its way: a member is added, and another removed.
    await data.ingest('members', [{ id: 'c' }]);
    await data.purge('members', { keys: ['b'] });
    // The read answers what the server had before both.
    answer({ rows: [{ id: 'a' }, { id: 'b' }] });
    await reading;
    expect(await ids(data)).toEqual(['a', 'c']);
  });
});
