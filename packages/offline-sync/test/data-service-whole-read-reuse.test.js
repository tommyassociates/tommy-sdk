// @vitest-environment node
/**
 * With `wholeReadReuseMs` (the host sets it on a phone), a whole read of a
 * collection nothing changed is answered again without reading the store
 * (there, several native SQLite calls each): only by a service that hears
 * other tabs' changes (its feed), only while no change was heard, and only
 * for that long. Without it every read reads the store.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDataService, createDataStore, createMemoryStoreBackend } from '../src/index';

const stopped = [];
afterEach(() => stopped.splice(0).forEach((stop) => stop()));
const owner = JSON.stringify(['https://api.example.test', '31', 'Team', '44', null]);
function fixture({ withFeed = true, scheduler, wholeReadReuseMs = 15000 } = {}) {
  const listeners = new Set();
  const feed = { subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); } };
  const store = createDataStore({ name: 'products', backend: createMemoryStoreBackend() });
  const clock = { at: 1000 };
  const data = createDataService({
    resolve: (name) => (name === 'products' ? { store, decl: { keyPath: 'id' } } : null),
    ...(withFeed ? { feed, changeOwner: owner } : {}),
    ...(scheduler ? { scheduler } : {}),
    wholeReadReuseMs,
    now: () => clock.at,
  });
  stopped.push(() => data.dispose());
  const getAll = vi.spyOn(store, 'getAll');
  const elsewhere = () => [...listeners].forEach((fn) => fn({ type: 'put', owner, labels: ['products'], keys: ['9'] }));
  return { data, store, getAll, clock, elsewhere };
}

describe('a whole read of an unchanged collection', () => {
  it('is answered again until a change is heard, here or from another tab', async () => {
    const { data, getAll, elsewhere } = fixture();
    await data.ingest('products', [{ id: '1', title: 'One' }]);
    expect((await data.read('products')).map((row) => row.title)).toEqual(['One']);
    expect((await data.read('products')).map((row) => row.title)).toEqual(['One']);
    expect(getAll).toHaveBeenCalledTimes(1);
    // Each caller gets its own copy.
    (await data.read('products'))[0].title = 'Mutated';
    expect((await data.read('products'))[0].title).toBe('One');
    // This page's own write.
    await data.ingest('products', [{ id: '2', title: 'Two' }]);
    expect((await data.read('products')).map((row) => row.title).sort()).toEqual(['One', 'Two']);
    expect(getAll).toHaveBeenCalledTimes(2);
    // Another tab's.
    elsewhere();
    await data.read('products');
    expect(getAll).toHaveBeenCalledTimes(3);
  });

  it('is read again once its time has passed', async () => {
    const { data, getAll, clock } = fixture();
    await data.ingest('products', [{ id: '1', title: 'One' }]);
    await data.read('products');
    clock.at += 15000;
    await data.read('products');
    expect(getAll).toHaveBeenCalledTimes(2);
  });

  it.each([['cannot hear other tabs', { withFeed: false }], ['was not asked to keep reads', { wholeReadReuseMs: 0 }]])(
    'is read every time by a service that %s',
    async (_, options) => {
      const { data, getAll } = fixture(options);
      await data.ingest('products', [{ id: '1', title: 'One' }]);
      await data.read('products');
      await data.read('products');
      expect(getAll).toHaveBeenCalledTimes(2);
    }
  );
});
