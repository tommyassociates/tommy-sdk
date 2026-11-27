// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDataService, createDataStore, createMemoryStoreBackend } from '../src/index';
import { StorageReadError } from '../src/transactional-store';

const stopped = [];
afterEach(() => stopped.splice(0).forEach((stop) => stop()));
const owner = JSON.stringify(['https://api.example.test', '31', 'Team', '44', null]);
const MINUTE = 60000;

function fixture({ strictReceipt = false, indexed = false } = {}) {
  const store = createDataStore({ name: 'shifts', backend: createMemoryStoreBackend() });
  const allRows = store.getAllRaw.bind(store);
  const query = vi.fn(async (_index, { equals }) => ({
    rows: (await allRows()).filter((row) => row.day === equals[0]),
    nextCursor: null,
  }));
  if (indexed) {
    store.hasIndex = (index) => index === 'byDay';
    store.query = query;
  }
  let clock = 1000;
  const data = createDataService({
    resolve: (name) => (name === 'shifts' ? { store, decl: { keyPath: 'id' } } : null),
    feed: { subscribe: () => () => {} },
    changeOwner: owner,
    now: () => clock,
  });
  stopped.push(() => data.dispose());
  const answers = new Map();
  const byMembers = new Map();
  const byMember = vi.fn(async ({ day, member }) => byMembers.get(`${day}:${member}`) || []);
  const byDay = vi.fn(async ({ day }) => answers.get(day) || []);
  data.source('shifts', {
    fetch: async () => [],
    read: {},
    methods: {
      byMember: {
        params: { day: { type: 'id' }, member: { type: 'id' } },
        fetch: byMember,
        prunesWhere: (row, { day, member }) => row.day === day && row.member === member,
      },
      byDay: {
        params: { day: { type: 'id' } },
        fetch: byDay,
        prunesWhere: (row, { day }) => row.day === day,
        ...(indexed ? { pruneQuery: ({ day }) => ({ index: 'byDay', equals: [day] }) } : {}),
        cadenceMs: MINUTE,
        ...(strictReceipt ? { strictReceipt: true } : {}),
      },
    },
  });
  const day = (d) => data.refresh({ collection: 'shifts', method: 'byDay', params: { day: d } }, { mode: 'visible', maxAge: MINUTE });
  const pastWholeRead = () => {
    const refuse = async () => { throw new StorageReadError('scan-required'); };
    store.getAllRaw = refuse;
    store.getAll = refuse;
  };
  const later = () => { clock += 2 * MINUTE; };
  const asked = (d) => byDay.mock.calls.filter(([params]) => params.day === d).length;
  const member = (d, id) => data.refresh({
    collection: 'shifts', method: 'byMember', params: { day: d, member: id },
  }, { mode: 'visible' });
  return {
    data, store, day, member, byMembers, answers, pastWholeRead, later, asked, query,
  };
}

describe('a method read past the store\'s whole-read bound', () => {
  it('answers fresh on its first read and is not asked again within its cadence', async () => {
    const f = fixture();
    f.pastWholeRead();
    f.answers.set('d1', [{ id: 'a', day: 'd1' }, { id: 'b', day: 'd1' }]);
    const answer = await f.day('d1');
    expect(answer.state).toBe('fresh');
    await f.day('d1');
    expect(f.asked('d1')).toBe(1);
    expect(await f.store.getRaw('a')).toMatchObject({ id: 'a' });
  });

  it('prunes a row its own last answer held when the next answer leaves it out', async () => {
    const f = fixture();
    f.answers.set('d1', [{ id: 'a', day: 'd1' }, { id: 'b', day: 'd1' }]);
    await f.day('d1');
    f.pastWholeRead();
    f.later();
    f.answers.set('d1', [{ id: 'a', day: 'd1' }]);
    const answer = await f.day('d1');
    expect(answer.state).toBe('fresh');
    expect(await f.store.getRaw('b')).toBeUndefined();
    expect(await f.store.getRaw('a')).toMatchObject({ id: 'a' });
  });

  it('prunes a synced row held by an overlapping method and leaves both draft and neighboring day', async () => {
    const f = fixture({ indexed: true });
    const kept = { id: 'a', day: 'd1', member: 'm1' };
    const deleted = { id: 'b', day: 'd1', member: 'm2' };
    const draft = { id: 'draft', day: 'd1', member: 'm2' };
    const neighbor = { id: 'c', day: 'd2', member: 'm2' };
    f.answers.set('d1', [kept]);
    await f.day('d1');
    f.byMembers.set('d1:m2', [deleted, draft]);
    await f.member('d1', 'm2');
    await f.data.ingest('shifts', [neighbor]);
    await f.data.mutate('shifts', { op: 'put', record: { ...draft, note: 'Edited on device' } });
    expect(await f.store.getRaw('b')).toMatchObject(deleted);

    f.pastWholeRead();
    f.later();
    await expect(f.day('d1')).resolves.toMatchObject({ state: 'fresh', keys: ['a'] });

    expect(await f.store.getRaw('a')).toMatchObject(kept);
    expect(await f.store.getRaw('draft')).toMatchObject({ ...draft, _dirty: true, note: 'Edited on device' });
    expect(await f.store.getRaw('c')).toMatchObject(neighbor);
    expect(await f.store.getRaw('b')).toBeUndefined();
    expect(f.query).toHaveBeenLastCalledWith('byDay', { equals: ['d1'] }, { limit: 100, cursor: null, raw: true });
  });

  it('preserves a candidate that moved to another day after the index read', async () => {
    const f = fixture({ indexed: true });
    const previous = { id: 'moved', day: 'd1' };
    f.answers.set('d1', [previous]);
    await f.day('d1');
    f.later();
    f.answers.set('d1', []);
    const indexed = f.query.getMockImplementation();
    f.query.mockImplementationOnce(async (...args) => {
      const snapshot = await indexed(...args);
      await f.store.reconcile([{ ...previous, day: 'd2' }], { prune: false });
      return snapshot;
    });
    await f.day('d1');
    expect(await f.store.getRaw('moved')).toMatchObject({ day: 'd2' });
  });

  it('keeps a same-day row refreshed by another writer after the request began', async () => {
    const f = fixture({ indexed: true });
    const prior = { id: 'shift', day: 'd1', note: 'old answer' };
    f.answers.set('d1', [prior]);
    await f.day('d1');
    const version = (await f.store.getRaw('shift'))._rev;
    f.store.readRevision = async () => version;
    f.later();
    f.answers.set('d1', []);
    const query = f.query.getMockImplementation();
    f.query.mockImplementationOnce(async (...args) => {
      const snapshot = await query(...args);
      await f.store.reconcile([{ ...prior, note: 'new answer' }], { prune: false });
      return snapshot;
    });
    await f.day('d1');
    expect(await f.store.getRaw('shift')).toMatchObject({ note: 'new answer' });
  });

  it('keeps a strict-receipt method refusing, since it needs every held row', async () => {
    const f = fixture({ strictReceipt: true });
    f.pastWholeRead();
    f.answers.set('d1', [{ id: 'a', day: 'd1' }]);
    await expect(f.day('d1')).rejects.toMatchObject({ name: 'StorageReadError' });
  });
});
