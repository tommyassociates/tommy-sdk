// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDataService, createDataStore, createMemoryStoreBackend } from '../src/index';

const stopped = [];
afterEach(() => stopped.splice(0).forEach((stop) => stop()));
const owner = JSON.stringify(['https://api.example.test', '31', 'Team', '44', null]);
const principal = JSON.stringify(['https://api.example.test', '31']);
const MINUTE = 60000;

function fixture() {
  const listeners = new Set();
  const feed = { subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); } };
  const store = createDataStore({ name: 'shifts', backend: createMemoryStoreBackend() });
  const data = createDataService({
    resolve: (name) => (name === 'shifts' ? { store, decl: { keyPath: 'id' } } : null),
    feed,
    changeOwner: owner,
    now: () => 1000,
  });
  stopped.push(() => data.dispose());
  const gates = new Map();
  const byDay = vi.fn(async ({ day }) => {
    await gates.get(day);
    return [{ id: `${day}-1`, day }, { id: `${day}-2`, day }];
  });
  data.source('shifts', {
    fetch: async () => [],
    read: {},
    methods: { byDay: { params: { day: { type: 'id' } }, fetch: byDay, cadenceMs: MINUTE } },
  });
  const day = (d) => data.refresh({ collection: 'shifts', method: 'byDay', params: { day: d } }, { mode: 'visible', maxAge: MINUTE });
  const evict = (keys) => [...listeners].forEach((fn) => fn({
    type: 'evict', owner, principal, labels: ['shifts'], keys, ...(keys ? { keysByLabel: { shifts: keys } } : {}),
  }));
  const asked = (d) => byDay.mock.calls.filter(([params]) => params.day === d).length;
  const hold = (d) => { let release; gates.set(d, new Promise((resolve) => { release = resolve; })); return () => release(); };
  return { data, store, day, evict, asked, hold };
}

describe('an eviction voids only the reads that lost rows', () => {
  it('re-reads the day whose row was evicted and keeps every other day fresh', async () => {
    const f = fixture();
    await f.day('d1');
    await f.day('d2');
    await f.store.delete('d2-1');
    f.evict(['d2-1']);
    await f.day('d1');
    await f.day('d2');
    expect(f.asked('d1')).toBe(1);
    expect(f.asked('d2')).toBe(2);
  });

  it('lets a read in flight finish fresh when the eviction took another day', async () => {
    const f = fixture();
    await f.day('d2');
    const release = f.hold('d1');
    const reading = f.day('d1');
    await vi.waitFor(() => expect(f.asked('d1')).toBe(1));
    await f.store.delete('d2-1');
    f.evict(['d2-1']);
    release();
    await reading;
    await f.day('d1');
    expect(f.asked('d1')).toBe(1);
    expect(f.asked('d2')).toBe(1);
  });

  it('never stamps a read fresh when its own rows are evicted while it commits', async () => {
    const f = fixture();
    const getRaw = f.store.getRaw.bind(f.store);
    let calls = 0;
    f.store.getRaw = async (key) => {
      calls += 1;
      if (calls === 3) {
        await f.store.delete('d1-1');
        f.evict(['d1-1']);
      }
      return getRaw(key);
    };
    await f.day('d1').catch(() => {});
    f.store.getRaw = getRaw;
    await f.day('d1');
    expect(f.asked('d1')).toBe(2);
  });

  it('still voids every day when the eviction names no keys', async () => {
    const f = fixture();
    await f.day('d1');
    await f.day('d2');
    f.evict(undefined);
    await f.day('d1');
    await f.day('d2');
    expect(f.asked('d1')).toBe(2);
    expect(f.asked('d2')).toBe(2);
  });

  it('still loses whole-collection coverage on a keyed eviction', async () => {
    const f = fixture();
    await f.data.refresh('shifts', { mode: 'visible' });
    expect(f.data.status('shifts')).toMatchObject({ state: 'fresh' });
    f.evict(['x']);
    expect(f.data.status('shifts')).toMatchObject({ state: 'stale', syncedAt: null });
  });
});
