// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDataService, createDataStore, createMemoryStoreBackend } from '../src/index';

const stopped = [];
afterEach(() => stopped.splice(0).forEach((stop) => stop()));
const owner = JSON.stringify(['https://api.example.test', '31', 'Team', '44', null]);
const principal = JSON.stringify(['https://api.example.test', '31']);
function fixture(options = {}) {
  const listeners = new Set();
  const feed = { subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); } };
  const store = createDataStore({ name: 'products', backend: createMemoryStoreBackend() });
  const data = createDataService({
    resolve: (name) => (name === 'products' ? { store, decl: { keyPath: 'id' } } : null),
    feed,
    changeOwner: owner,
    now: () => 1000,
    ...options,
  });
  stopped.push(() => data.dispose());
  const loss = (extra = {}) => [...listeners].forEach((fn) => fn({ type: 'evict', owner, principal, labels: ['products'], keys: ['1'], ...extra }));
  const whole = vi.fn(async () => [{ id: '1', title: 'Product' }]);
  const keyed = vi.fn(async () => [{ id: '1', title: 'Recovered' }]);
  data.source('products', {
    fetch: whole,
    read: {},
    methods: {
      byIds: {
        params: { ids: { type: 'ids' } }, batch: 'ids', field: 'id', cadenceMs: 60000, fetch: keyed,
      },
    },
  });
  const lookup = () => data.refresh({ collection: 'products', method: 'byIds', params: { ids: ['1'] } }, { mode: 'visible' });
  return { data, store, loss, whole, keyed, lookup, listeners };
}

function holdRetainedSnapshot(store) {
  let entered;
  let release;
  const ready = new Promise((resolve) => { entered = resolve; });
  const gate = new Promise((resolve) => { release = resolve; });
  const read = store.getAllRaw.bind(store);
  store.getAllRaw = async () => {
    const rows = await read();
    store.getAllRaw = read;
    entered();
    await gate;
    return rows;
  };
  return { ready, release };
}

describe('canonical coverage after row loss', () => {
  it('invalidates whole freshness and cadence after eviction without automatically reading', async () => {
    const f = fixture();
    await f.data.refresh('products', { mode: 'visible' });
    await f.store.delete('1');
    f.loss();
    expect(f.data.status('products')).toMatchObject({ state: 'stale', syncedAt: null });
    expect(f.whole).toHaveBeenCalledTimes(1);
    await f.data.refresh('products', { mode: 'visible', maxAge: 60000 });
    expect(f.whole).toHaveBeenCalledTimes(2);
    expect(await f.data.read('products', '1')).toMatchObject({ title: 'Product' });
  });

  it('does not use lost complete-ingest coverage to answer a keyed lookup', async () => {
    const f = fixture();
    await f.data.ingest('products', [{ id: '1' }], { complete: true });
    await f.store.delete('1');
    f.loss();
    await f.lookup();
    expect(f.keyed).toHaveBeenCalledTimes(1);
    expect(await f.data.read('products', '1')).toMatchObject({ title: 'Recovered' });
    expect(f.data.status('products').syncedAt).toBeNull();
  });

  it.each([{ complete: true }, { replace: true }])('does not stamp an ingest whose retained snapshot predates a purge: %j', async (options) => {
    const f = fixture();
    const held = holdRetainedSnapshot(f.store);
    const ingest = f.data.ingest('products', [{ id: '1' }, { id: '2' }], options);
    await held.ready;
    expect(await f.store.get('1')).toMatchObject({ id: '1' });
    await f.store.delete('1');
    f.loss({ type: 'purge', keys: undefined });
    held.release();
    await ingest;
    expect(f.data.status('products').syncedAt).toBeNull();
    expect(f.whole).not.toHaveBeenCalled();
    expect(f.keyed).not.toHaveBeenCalled();
    await f.lookup();
    expect(f.keyed).toHaveBeenCalledTimes(1);
    expect(await f.data.read('products', '1')).toMatchObject({ title: 'Recovered' });
  });

  it('does not transfer a late complete ingest into a replacement request form', async () => {
    let request = { accountType: 'Team', accountId: '44', subject: 'client:1' };
    const f = fixture({ principal: () => request });
    const held = holdRetainedSnapshot(f.store);
    const ingest = f.data.ingest('products', [{ id: '1', title: 'Original form' }], { complete: true });
    await held.ready;
    request = { accountType: 'Team', accountId: '44', subject: 'client:2' };
    held.release();
    await ingest;
    expect(f.data.status('products').syncedAt).toBeNull();
    expect(f.keyed).not.toHaveBeenCalled();
    await f.lookup();
    expect(f.keyed).toHaveBeenCalledTimes(1);
    expect(await f.data.read('products', '1')).toMatchObject({ title: 'Recovered' });
  });

  it('finishes a held ingest after disposal without publishing status or starting reads', async () => {
    const f = fixture();
    const status = vi.fn();
    f.data.onStatusChange(status);
    const held = holdRetainedSnapshot(f.store);
    const ingest = f.data.ingest('products', [{ id: '1' }], { complete: true });
    await held.ready;
    f.data.dispose();
    status.mockClear();
    held.release();
    expect(await ingest).toMatchObject({ written: 1 });
    expect(status).not.toHaveBeenCalled();
    expect(f.listeners.size).toBe(0);
    expect(f.whole).not.toHaveBeenCalled();
    expect(f.keyed).not.toHaveBeenCalled();
    expect(f.lookup).toThrow(expect.objectContaining({ code: 'DATA_RETIRED' }));
    await expect(f.data.read('products')).rejects.toMatchObject({ code: 'DATA_RETIRED' });
  });

  it('invalidates every known collection for the original principal when a purge has only an opaque store name', async () => {
    const listeners = new Set();
    const feed = { subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); } };
    const stores = new Map(['products', 'orders'].map((name) => [name, createDataStore({ name, backend: createMemoryStoreBackend() })]));
    const data = createDataService({
      resolve: (name) => ({ store: stores.get(name), decl: { keyPath: 'id' } }),
      feed,
      changeOwner: owner,
      labelOf: (name) => `mp.invoicing.${name}`,
      now: () => 1000,
    });
    stopped.push(() => data.dispose());
    const fetches = new Map();
    await Promise.all([...stores.keys()].map(async (name) => {
      const fetch = vi.fn(async () => [{ id: '1' }]);
      fetches.set(name, fetch);
      data.source(name, { fetch, read: {} });
      await data.refresh(name, { mode: 'visible' });
      await stores.get(name).delete('1');
    }));
    [...listeners].forEach((fn) => fn({ type: 'purge', principal, store: 'host_records_opaque_7' }));
    await Promise.all([...stores.keys()].map(async (name) => {
      expect(data.status(name)).toMatchObject({ state: 'stale', syncedAt: null });
      expect(fetches.get(name)).toHaveBeenCalledTimes(1);
      await data.refresh(name, { mode: 'visible', maxAge: 60000 });
      expect(fetches.get(name)).toHaveBeenCalledTimes(2);
      expect(await data.read(name, '1')).toMatchObject({ id: '1' });
    }));
  });

  it.each([
    JSON.stringify(['https://api.example.test', '32']),
    JSON.stringify(['https://elsewhere.example.test', '31']),
  ])('preserves coverage for an opaque purge owned by a different principal: %s', async (other) => {
    const f = fixture();
    await f.data.refresh('products', { mode: 'visible' });
    f.loss({ type: 'purge', owner: undefined, principal: other, labels: undefined, keys: undefined, store: 'host_records_opaque_7' });
    expect(f.data.status('products')).toMatchObject({ state: 'fresh', syncedAt: 1000 });
    await f.lookup();
    expect(f.keyed).not.toHaveBeenCalled();
  });

  it.each([
    { owner: JSON.stringify(['https://api.example.test', '32', 'Team', '44', null]) },
    { owner: JSON.stringify(['https://api.example.test', '31', 'Team', '45', null]) },
    { owner: JSON.stringify(['https://api.example.test', '31', 'TeamMember', '44', null]) },
    { owner: JSON.stringify(['https://api.example.test', '31', 'Team', '44', 'client:9']) },
    { owner: JSON.stringify(['https://elsewhere.example.test', '31', 'Team', '44', null]) },
    { labels: ['orders'] },
  ])('preserves coverage for an unrelated owner or collection: %j', async (other) => {
    const f = fixture();
    await f.data.refresh('products', { mode: 'visible' });
    f.loss(other);
    expect(f.data.status('products')).toMatchObject({ state: 'fresh', syncedAt: 1000 });
    await f.lookup();
    expect(f.keyed).not.toHaveBeenCalled();
  });

  it('invalidates truncated remote eviction by label even without victim keys', async () => {
    const f = fixture();
    await f.data.refresh('products', { mode: 'visible' });
    await f.store.delete('1');
    f.loss({ keys: undefined, truncated: true, remote: true });
    await f.lookup();
    expect(f.keyed).toHaveBeenCalledTimes(1);
  });

  it('does not invalidate coverage on a successful non-evicting commit notice', async () => {
    const f = fixture();
    await f.data.refresh('products', { mode: 'visible' });
    f.loss({ type: 'commit' });
    expect(f.data.status('products')).toMatchObject({ state: 'fresh', syncedAt: 1000 });
    await f.lookup();
    expect(f.keyed).not.toHaveBeenCalled();
  });

  it('keeps surviving offline rows readable while refusing fresh complete coverage', async () => {
    let online = true;
    const f = fixture({ isOnline: () => online });
    await f.data.ingest('products', [{ id: '1' }, { id: '2' }], { complete: true });
    await f.store.delete('1');
    online = false;
    f.loss();
    await expect(f.data.refresh('products', { mode: 'visible', maxAge: 60000 })).rejects.toMatchObject({ code: 'DATA_OFFLINE' });
    expect(f.data.status('products').syncedAt).toBeNull();
    expect(await f.data.read('products')).toEqual([{ id: '2' }]);
  });

  it('a whole read overtaken by loss cannot restore coverage; a joined method reads its own key', async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const f = fixture();
    const held = vi.fn(async () => { await gate; return [{ id: '1' }]; });
    f.data.source('products', {
      fetch: held,
      read: {},
      methods: {
        byIds: {
          params: { ids: { type: 'ids' } }, batch: 'ids', field: 'id', cadenceMs: 60000, fetch: f.keyed,
        },
      },
    });
    const full = f.data.refresh('products', { mode: 'visible' });
    const result = full.catch((error) => error);
    await vi.waitFor(() => expect(held).toHaveBeenCalledTimes(1));
    const partial = f.lookup();
    f.loss();
    release();
    expect(await result).toMatchObject({ code: 'DATA_INCOMPLETE' });
    await partial;
    expect(f.keyed).toHaveBeenCalledTimes(1);
    expect(f.data.status('products').syncedAt).toBeNull();
    await f.data.refresh('products', { mode: 'visible', maxAge: 60000 });
    expect(held).toHaveBeenCalledTimes(2);
    expect(f.data.status('products')).toMatchObject({ state: 'fresh', syncedAt: 1000 });
  });

  it('has no feed subscription or status callback after disposal, even if a queued listener runs', async () => {
    const f = fixture();
    await f.data.refresh('products', { mode: 'visible' });
    const callbacks = [...f.listeners];
    const status = vi.fn();
    f.data.onStatusChange(status);
    f.data.dispose();
    status.mockClear();
    expect(f.listeners.size).toBe(0);
    callbacks.forEach((fn) => fn({ type: 'evict', owner, principal, labels: ['products'] }));
    expect(status).not.toHaveBeenCalled();
    expect(f.lookup).toThrow(expect.objectContaining({ code: 'DATA_RETIRED' }));
  });
});
