// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDataService, createDataStore, createMemoryStoreBackend } from '../src/index';
import { StorageReadError } from '../src/transactional-store';

const stopped = [];
afterEach(() => stopped.splice(0).forEach((stop) => stop()));
const owner = JSON.stringify(['https://api.example.test', '31', 'Team', '44', null]);
const MINUTE = 60000;

function fixture({ strictReceipt = false } = {}) {
  const store = createDataStore({ name: 'shifts', backend: createMemoryStoreBackend() });
  let clock = 1000;
  const data = createDataService({
    resolve: (name) => (name === 'shifts' ? { store, decl: { keyPath: 'id' } } : null),
    feed: { subscribe: () => () => {} },
    changeOwner: owner,
    now: () => clock,
  });
  stopped.push(() => data.dispose());
  const answers = new Map();
  const byDay = vi.fn(async ({ day }) => answers.get(day) || []);
  data.source('shifts', {
    fetch: async () => [],
    read: {},
    methods: {
      byDay: {
        params: { day: { type: 'id' } },
        fetch: byDay,
        prunesWhere: (row, { day }) => row.day === day,
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
  return { store, day, answers, pastWholeRead, later, asked };
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

  it('keeps a strict-receipt method refusing, since it needs every held row', async () => {
    const f = fixture({ strictReceipt: true });
    f.pastWholeRead();
    f.answers.set('d1', [{ id: 'a', day: 'd1' }]);
    await expect(f.day('d1')).rejects.toMatchObject({ name: 'StorageReadError' });
  });
});
