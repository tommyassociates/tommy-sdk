// @vitest-environment node
/**
 * A source that declares its read (`read`): the service keeps the read's
 * cursor in the collection's source meta (never among its rows), asks only
 * for what changed while the stored rows are still the whole set the last
 * read left (their key digest) and a whole read ran within `fullEveryMs`,
 * removes rows the server marks removed, stamps the collection synced only
 * for a read that completed, purges an account's rows when the server
 * refuses the read, and never lets a read undo a change stored after it
 * began. Writes to the collection take turns with the read's commit.
 */
import {
  describe, it, expect, vi, afterEach,
} from 'vitest';
import {
  createDataService, createDataStore, createMemoryStoreBackend, createMemorySourceMeta, createLocalStorageBackend,
} from '../src/index.js';

const DAY = 86400000;
function service({ at = () => 1_000_000, store: given = null } = {}) {
  const store = given || createDataStore({ name: 'members', backend: createMemoryStoreBackend() });
  const sourceMeta = createMemorySourceMeta();
  const data = createDataService({ resolve: (name) => (name === 'members' ? { store, decl: { keyPath: 'id' } } : null), now: at, sourceMeta });
  return { data, store, sourceMeta };
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
  it('reads whole, keeps its cursor outside the rows, then asks only for what changed', async () => {
    const { data, store, sourceMeta } = service();
    const api = server([{ id: 'a', updated: 'c0' }, { id: 'b', updated: 'c0' }]);
    data.source('members', { fetch: api.fetch, read: { cursor: true, removedField: 'deleted_at', fullEveryMs: DAY } });
    await data.refresh('members', { mode: 'visible' });
    expect(await ids(data)).toEqual(['a', 'b']);
    expect(await sourceMeta.get('members')).toMatchObject({ cursor: 'c2', count: 2 });
    expect((await store.getAllRaw()).map((row) => row.id).sort()).toEqual(['a', 'b']);
    api.set([{ id: 'a', updated: 'c0' }, { id: 'b', updated: 'c3', deleted_at: '2026-09-30' }, { id: 'c', updated: 'c3' }]);
    await data.refresh('members', { mode: 'visible' });
    expect(api.asked).toEqual([null, 'c2']);
    // The removed row went, the new one came, and the cursor moved with them.
    expect(await ids(data)).toEqual(['a', 'c']);
    expect(await sourceMeta.get('members')).toMatchObject({ cursor: 'c3', count: 2 });
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

  it('patches rows as they are now: nothing else changes, a gone row stays gone, and a read begun before never undoes it', async () => {
    const { data } = service();
    let answer;
    data.source('members', {
      fetch: () => new Promise((resolve) => { answer = resolve; }),
      read: { cursor: false },
    });
    await data.ingest('members', [{ id: 'a', name: 'Ana', member: false }, { id: 'b', name: 'Ben', member: false }], { replace: true });
    const reading = data.refresh('members', { mode: 'visible' });
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    // Renamed meanwhile; then the server's change is patched on.
    await data.ingest('members', [{ id: 'a', name: 'Ana Maria', member: false }]);
    await expect(data.patchRows('members', ['a', 'gone'], { member: true })).resolves.toEqual({
      patched: ['a'], unsaved: [], skipped: [{ key: 'gone', reason: 'gone' }], refused: [],
    });
    answer({ rows: [{ id: 'a', name: 'Ana', member: false }, { id: 'b', name: 'Ben', member: false }] });
    await reading;
    expect(await data.read('members', 'a')).toEqual({ id: 'a', name: 'Ana Maria', member: true });
    expect(await data.read('members', 'gone')).toBeNull();
    expect(await ids(data)).toEqual(['a', 'b']);
    // A row with an unsent local write keeps that write.
    await data.mutate('members', { op: 'patch', key: 'b', patch: { name: 'Benny' } });
    await expect(data.patchRows('members', ['b'], { member: true })).resolves.toEqual({
      patched: [], unsaved: [], skipped: [{ key: 'b', reason: 'unsent' }], refused: [],
    });
    expect(await data.read('members', 'b')).toEqual({ id: 'b', name: 'Benny', member: false });
    await expect(data.patchRows('members', ['a'], { id: 'z' })).rejects.toMatchObject({ code: 'DATA_INVALID' });
    await expect(data.patchRows('members', ['a'], null)).rejects.toMatchObject({ code: 'DATA_INVALID' });
  });

  it('adopts rows only into an empty collection, decided in its turn, and a read begun before replaces them', async () => {
    const { data } = service();
    let answer;
    data.source('members', {
      fetch: () => new Promise((resolve) => { answer = resolve; }),
      read: { cursor: false },
    });
    const reading = data.refresh('members', { mode: 'visible' });
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    await expect(data.ingest('members', [{ id: 'a', name: 'Old Ana' }], { ifEmpty: true })).resolves.toMatchObject({ written: 1 });
    await expect(data.ingest('members', [{ id: 'z', name: 'Old Zed' }], { ifEmpty: true })).resolves.toEqual({ written: 0 });
    answer({ rows: [{ id: 'a', name: 'Ana' }, { id: 'b', name: 'Ben' }] });
    await reading;
    expect(await data.read('members')).toEqual([{ id: 'a', name: 'Ana' }, { id: 'b', name: 'Ben' }]);
  });

  it('names a patched row its schema refuses, and never counts it patched', async () => {
    const store = createDataStore({
      name: 'members', backend: createMemoryStoreBackend(),
      recordSchema: { type: 'object', properties: { member: { type: 'boolean' } } },
    });
    const { data } = service({ store });
    await data.ingest('members', [{ id: 'a', member: false }]);
    const result = await data.patchRows('members', ['a'], { member: 'yes' });
    expect(result.patched).toEqual([]);
    expect(result.refused).toEqual([{ key: 'a', reason: expect.stringContaining('member') }]);
    expect(await data.read('members', 'a')).toEqual({ id: 'a', member: false });
  });

  it('takes no answer with an entry that is not a keyed row: nothing is removed and the collection is not fresh', async () => {
    const { data } = service();
    let answer = { rows: [null] };
    data.source('members', { fetch: async () => answer, read: { cursor: false } });
    await data.ingest('members', [{ id: 'a' }, { id: 'b' }]);
    await expect(data.refresh('members', { mode: 'visible' })).rejects.toMatchObject({ code: 'DATA_INVALID' });
    answer = { rows: [{ id: 'a' }, { name: 'no key' }] };
    await expect(data.refresh('members', { mode: 'visible' })).rejects.toMatchObject({ code: 'DATA_INVALID' });
    expect(await ids(data)).toEqual(['a', 'b']);
    expect(data.status('members').state).not.toBe('fresh');
  });

  it('writes only the rows a whole read changed, confirms rows not confirmed for a day, and removes what it left out', async () => {
    let at = Date.UTC(2026, 9, 1);
    const store = createDataStore({ name: 'members', backend: createMemoryStoreBackend(), now: () => at });
    let written = 0;
    const counted = new Proxy(store, { get(target, property) {
      if (property === 'reconcile') return (records, ...rest) => { written += records.length; return target.reconcile(records, ...rest); };
      const value = target[property];
      return typeof value === 'function' ? value.bind(target) : value;
    } });
    const data = createDataService({ resolve: (name) => (name === 'members' ? { store: counted, decl: { keyPath: 'id' } } : null), now: () => at, sourceMeta: createMemorySourceMeta() });
    let rows = Array.from({ length: 1000 }, (_, n) => ({ id: `m${n}`, name: `Member ${n}`, tags: [1, 2] }));
    data.source('members', { fetch: async () => ({ rows: rows.map((row) => ({ ...row })) }), read: { cursor: false } });
    await data.refresh('members', { mode: 'visible' });
    expect(written).toBe(1000);
    // One renamed, one gone: one row written, one removed.
    written = 0;
    at += 60 * 1000;
    rows = rows.filter((row) => row.id !== 'm5').map((row) => (row.id === 'm7' ? { ...row, name: 'Renamed' } : row));
    await data.refresh('members', { mode: 'visible' });
    expect(written).toBe(1);
    expect((await data.read('members')).length).toBe(999);
    expect((await data.read('members', 'm7')).name).toBe('Renamed');
    expect(await data.read('members', 'm5')).toBeNull();
    // Nothing changed: one row is written, which stamps the collection synced.
    written = 0;
    await data.refresh('members', { mode: 'visible' });
    expect(written).toBe(1);
    // A day on, every row is confirmed again.
    written = 0;
    at += 25 * 60 * 60 * 1000;
    await data.refresh('members', { mode: 'visible' });
    expect(written).toBe(999);
  });

  it('keys each answered row by its record, and never takes an answer with no keyed row for an empty collection', async () => {
    const { data } = service();
    let answer = { rows: [{ member_id: 'a' }, { member_id: 'b' }] };
    data.source('members', {
      fetch: async () => answer,
      toRecord: (dto) => ({ id: dto.member_id }),
      read: { cursor: false },
    });
    await data.refresh('members', { mode: 'visible' });
    expect(await ids(data)).toEqual(['a', 'b']);
    // Rows that cannot be keyed: the read fails and the stored rows stay.
    answer = { rows: [{ nothing: 1 }] };
    await expect(data.refresh('members', { mode: 'visible' })).rejects.toMatchObject({ code: 'DATA_INVALID' });
    expect(await ids(data)).toEqual(['a', 'b']);
  });

  it('drops a read\'s answer once a replacement of the collection landed after it began', async () => {
    const { data } = service();
    let answer;
    data.source('members', { fetch: () => new Promise((resolve) => { answer = resolve; }), read: { cursor: false } });
    await data.ingest('members', [{ id: 'a' }, { id: 'b' }], { replace: true });
    const reading = data.refresh('members', { mode: 'visible' });
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    // A whole answer from elsewhere replaces the set, leaving b out.
    await data.ingest('members', [{ id: 'a' }], { replace: true });
    answer({ rows: [{ id: 'a' }, { id: 'b' }] });
    await reading;
    expect(await ids(data)).toEqual(['a']);
  });

  it('keeps its cursor in a collection whose records a strict schema checks', async () => {
    const schema = { type: 'object', required: ['id', 'name'], additionalProperties: false, properties: { id: { type: 'string' }, name: { type: 'string' }, updated: { type: 'string' } } };
    const store = createDataStore({ name: 'members', backend: createMemoryStoreBackend(), recordSchema: schema });
    const { data, sourceMeta } = service({ store });
    const api = server([{ id: 'a', name: 'Ada', updated: 'c0' }]);
    data.source('members', { fetch: api.fetch, read: { cursor: true } });
    await data.refresh('members', { mode: 'visible' });
    expect(await sourceMeta.get('members')).toMatchObject({ cursor: 'c1', count: 1 });
    await data.refresh('members', { mode: 'visible' });
    expect(api.asked).toEqual([null, 'c1']);
  });

  it('reads whole after a row was swapped out of the set, though the count is unchanged', async () => {
    const { data, store } = service();
    const api = server([{ id: 'a', updated: 'c0' }, { id: 'b', updated: 'c0' }]);
    data.source('members', { fetch: api.fetch, read: { cursor: true } });
    await data.refresh('members', { mode: 'visible' });
    // The device dropped a (an eviction) and holds c from elsewhere: still two rows.
    await store.delete('a');
    await store.put({ id: 'c', updated: 'c0' });
    await store.markSynced('c');
    await data.refresh('members', { mode: 'visible' });
    expect(api.asked).toEqual([null, null]);
    expect(await ids(data)).toEqual(['a', 'b']);
  });

  it('keeps asking only for what changed after its own writes: a small ingest and a purge of keys', async () => {
    const { data } = service();
    const api = server([{ id: 'a', updated: 'c0' }, { id: 'b', updated: 'c0' }]);
    data.source('members', { fetch: api.fetch, read: { cursor: true } });
    await data.refresh('members', { mode: 'visible' });
    // A write-back adds a member and removes another.
    await data.ingest('members', [{ id: 'c', updated: 'c0' }]);
    await data.purge('members', { keys: ['b'] });
    await data.refresh('members', { mode: 'visible' });
    expect(api.asked).toEqual([null, 'c2']);
  });

  it('hands query predicates and pages only records', async () => {
    const { data } = service();
    const api = server([{ id: 'a', name: 'Ada', updated: 'c0' }, { id: 'b', name: 'Ben', updated: 'c0' }]);
    data.source('members', { fetch: api.fetch, read: { cursor: true } });
    await data.refresh('members', { mode: 'visible' });
    const page = await data.query('members', { where: (row) => row.name.startsWith('A'), limit: 1 });
    expect(page.rows.map((row) => row.id)).toEqual(['a']);
    const all = await data.query('members', { limit: 2 });
    expect(all).toMatchObject({ complete: true });
    expect(all.rows.map((row) => row.id)).toEqual(['a', 'b']);
  });

  it('keeps an ingest asked while a large read commits: it waits its turn, and the read never prunes it', async () => {
    const { data, store } = service();
    const rows = Array.from({ length: 501 }, (_, at) => ({ id: `m${String(at).padStart(3, '0')}`, updated: 'c0' }));
    data.source('members', { fetch: async () => ({ rows }), read: { cursor: false } });
    // The first chunk's commit waits until the ingest has been asked.
    const reconcile = store.reconcile.bind(store);
    let release;
    const held = new Promise((resolve) => { release = resolve; });
    let first = true;
    store.reconcile = async (...args) => {
      if (first) { first = false; await held; }
      return reconcile(...args);
    };
    const reading = data.refresh('members', { mode: 'visible' });
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    const ingesting = data.ingest('members', [{ id: 'added', updated: 'c1' }]);
    release();
    await Promise.all([reading, ingesting]);
    const stored = await ids(data);
    expect(stored).toContain('added');
    expect(stored.length).toBe(502);
  });

  it('keeps the fields a thin answer leaves out, from the row it replaces', async () => {
    const { data } = service();
    await data.ingest('members', [{ id: 'a', name: 'Ada', detail: 'rich' }], { replace: true });
    data.source('members', {
      fetch: async () => ({ rows: [{ id: 'a', name: 'Ada Lovelace' }] }),
      toRecord: (dto, prev) => ({ ...(prev || {}), ...dto }),
      read: { cursor: false },
    });
    await data.refresh('members', { mode: 'visible' });
    expect(await data.read('members', 'a')).toEqual({ id: 'a', name: 'Ada Lovelace', detail: 'rich' });
  });

  it('never lets a read overwrite a newer change, however many keys were touched while it ran: it reads again', async () => {
    const { data } = service();
    await data.ingest('members', [{ id: 'x', v: 1 }], { replace: true });
    const answers = [];
    data.source('members', { fetch: () => new Promise((resolve) => { answers.push(resolve); }), read: { cursor: false } });
    const reading = data.refresh('members', { mode: 'visible' });
    await vi.waitFor(() => expect(answers).toHaveLength(1));
    // x changes on the device, then more keys are touched than are kept.
    await data.ingest('members', [{ id: 'x', v: 2 }]);
    await data.ingest('members', Array.from({ length: 5000 }, (_, at) => ({ id: `t${at}`, v: 1 })));
    // The read answers what the server had before x changed.
    answers[0]({ rows: [{ id: 'x', v: 1 }] });
    await vi.waitFor(() => expect(answers).toHaveLength(2));
    expect((await data.read('members', 'x')).v).toBe(2);
    answers[1]({ rows: [{ id: 'x', v: 2 }] });
    await reading;
    expect((await data.read('members', 'x')).v).toBe(2);
  });
});

describe('writes that land while a declared read is on its way', () => {
  it('keeps a row a keyed refresh stored, and a row a trim removed, after the read began', async () => {
    const store = createDataStore({ name: 'members', backend: createMemoryStoreBackend(), indexes: { bySeq: 'seq' } });
    const sourceMeta = createMemorySourceMeta();
    const data = createDataService({
      resolve: (name) => (name === 'members' ? { store, decl: { keyPath: 'id', indexes: { bySeq: 'seq' } } } : null), sourceMeta,
    });
    await data.ingest('members', [{ id: 'a', seq: 1, v: 1 }, { id: 'b', seq: 2, v: 1 }, { id: 'c', seq: 3, v: 1 }], { replace: true });
    let answer;
    const fetch = vi.fn((target) => {
      if (target.key === 'a') return Promise.resolve({ id: 'a', seq: 1, v: 2 });
      return new Promise((resolve) => { answer = resolve; });
    });
    data.source('members', { fetch, read: { cursor: false } });
    const reading = data.refresh('members', { mode: 'visible' });
    await vi.waitFor(() => expect(answer).toBeTypeOf('function'));
    // A keyed refresh stores a newer a; a trim removes the oldest (a) of the range.
    await data.refresh({ collection: 'members', key: 'a' }, { mode: 'visible' });
    expect((await data.read('members', 'a')).v).toBe(2);
    await data.trim('members', { index: 'bySeq', keep: 2 });
    // The read answers what the server had before both.
    answer({ rows: [{ id: 'a', seq: 1, v: 1 }, { id: 'b', seq: 2, v: 1 }, { id: 'c', seq: 3, v: 1 }] });
    await reading;
    expect(await ids(data)).toEqual(['b', 'c']);
  });
});

describe('a read that answers no list', () => {
  it('removes nothing and leaves the collection not fresh, declared or not', async () => {
    const { data } = service();
    await data.ingest('members', [{ id: 'a' }, { id: 'b' }], { replace: true });
    data.source('members', { fetch: async () => null, read: { cursor: false } });
    await data.refresh('members', { mode: 'visible' });
    expect(await ids(data)).toEqual(['a', 'b']);
    expect(data.status('members').state).not.toBe('fresh');
    // A source with no declared read, answering nothing.
    const plain = service();
    await plain.data.ingest('members', [{ id: 'a' }], { replace: true });
    plain.data.source('members', { fetch: async () => undefined });
    await plain.data.refresh('members', { mode: 'visible' });
    expect(await ids(plain.data)).toEqual(['a']);
    expect(plain.data.status('members').state).not.toBe('fresh');
  });
});

describe('a read of changes that only removes', () => {
  it('tells its subscribers, even when it removes the only row', async () => {
    const { data } = service();
    const api = server([{ id: 'a', updated: 'c0' }]);
    data.source('members', { fetch: api.fetch, read: { cursor: true, removedField: 'deleted_at' } });
    await data.refresh('members', { mode: 'visible' });
    const seen = [];
    data.subscribe('members', (rows) => seen.push(rows.map((row) => row.id)));
    await vi.waitFor(() => expect(seen).toEqual([['a']]));
    api.set([{ id: 'a', updated: 'c2', deleted_at: '2026-10-01' }]);
    await data.refresh('members', { mode: 'visible' });
    expect(api.asked).toEqual([null, 'c1']);
    await vi.waitFor(() => expect(seen.at(-1)).toEqual([]));
  });
});

describe('a declared read\'s reads of the stored rows', () => {
  it('reads the collection once when nothing changed it before the commit, and again when something did', async () => {
    const store = createDataStore({ name: 'members', backend: createMemoryStoreBackend() });
    let reads = 0;
    const counted = new Proxy(store, { get(target, property) {
      if (property === 'getAllRaw') return (...args) => { reads += 1; return target.getAllRaw(...args); };
      const value = target[property];
      return typeof value === 'function' ? value.bind(target) : value;
    } });
    const data = createDataService({ resolve: (name) => (name === 'members' ? { store: counted, decl: { keyPath: 'id' } } : null), sourceMeta: createMemorySourceMeta() });
    const api = server([{ id: 'a', updated: 'c0' }]);
    let during = null;
    data.source('members', {
      fetch: async (target, context) => { if (during) await during(); return api.fetch(target, context); },
      read: { cursor: true },
    });
    await data.refresh('members', { mode: 'visible' });
    reads = 0;
    await data.refresh('members', { mode: 'visible' });
    expect(reads).toBe(1);
    // A row arrives while the next read is on its way: the commit reads again.
    reads = 0;
    during = () => data.ingest('members', [{ id: 'b', updated: 'c0' }]);
    await data.refresh('members', { mode: 'visible' });
    expect(reads).toBe(2);
    expect(await ids(data)).toEqual(['a', 'b']);
  });
});

describe('a source\'s budget', () => {
  it('runs its refreshes in the budget and circuit it names, and refuses a budget that is not a name', async () => {
    const store = createDataStore({ name: 'members', backend: createMemoryStoreBackend() });
    const asked = [];
    const scheduler = { request: (job) => { asked.push(job.budgetKey); return Promise.resolve().then(() => job.run(() => true)); } };
    const data = createDataService({ resolve: (name) => (name === 'members' ? { store, decl: { keyPath: 'id' } } : null), scheduler, budgetKey: 'host' });
    expect(() => data.source('members', { fetch: async () => [], budgetKey: '' })).toThrow(expect.objectContaining({ code: 'DATA_INVALID' }));
    data.source('members', { fetch: async () => ({ rows: [{ id: 'a' }] }), read: { cursor: false }, budgetKey: 'host.members' });
    await data.refresh('members', { mode: 'visible' });
    expect(asked).toEqual(['host.members']);
  });
});

describe('a declared read on a store that cannot keep a row', () => {
  const storage = new Map();
  afterEach(() => { storage.clear(); delete globalThis.localStorage; });

  it('keeps the old cursor when the store refused a changed row, so the next read asks for it again', async () => {
    globalThis.localStorage = {
      getItem: (key) => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => { storage.set(key, String(value)); },
      removeItem: (key) => { storage.delete(key); },
    };
    // A store that never evicts, with room for a few small rows.
    const store = createDataStore({
      name: 'members', backend: createLocalStorageBackend('declared-read', 'members', { maxBytes: 1200, evict: false }), syncStrategy: 'last_write_wins',
    });
    const { data, sourceMeta } = service({ store });
    const api = server([{ id: 'a', updated: 'c0' }, { id: 'b', updated: 'c0' }]);
    data.source('members', { fetch: api.fetch, read: { cursor: true } });
    await data.refresh('members', { mode: 'visible' });
    expect(await sourceMeta.get('members')).toMatchObject({ cursor: 'c2' });
    // b grows past what the store can hold (the store refuses it), and c is added.
    api.set([{ id: 'a', updated: 'c0' }, { id: 'b', updated: 'c3', note: 'x'.repeat(2000) }, { id: 'c', updated: 'c3' }]);
    await data.refresh('members', { mode: 'visible' });
    expect(api.asked).toEqual([null, 'c2']);
    expect(await sourceMeta.get('members')).toMatchObject({ cursor: 'c2' });
    await data.refresh('members', { mode: 'visible' });
    expect(api.asked).toEqual([null, 'c2', 'c2']);
  });
});

