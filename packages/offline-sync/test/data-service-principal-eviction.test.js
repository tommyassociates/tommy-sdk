// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDataService, createDataStore, createMemoryStoreBackend, createMemorySourceMeta } from '../src/index.js';

const services = [];
afterEach(() => services.splice(0).forEach((data) => data.dispose()));

function fixture() {
  let principal = { accountType: 'Team', accountId: 'A' };
  const store = createDataStore({ name: 'products', backend: createMemoryStoreBackend(), maxRows: 2 });
  const sourceMeta = createMemorySourceMeta();
  const fetch = vi.fn(async () => [{ id: '1' }, { id: '2' }]);
  const open = (declared = false) => {
    const data = createDataService({
      resolve: () => ({ store, decl: { keyPath: 'id' } }),
      principal: () => principal,
      sourceMeta,
      now: () => 1000,
    });
    data.source('products', { fetch, ...(declared ? { read: {} } : {}) });
    services.push(data);
    return data;
  };
  return { store, fetch, open, switchPrincipal(accountId = 'B') { principal = { accountType: 'Team', accountId }; } };
}

const refresh = (data) => data.refresh('products', { mode: 'visible', maxAge: 60000 });

describe('collection freshness ownership and retention', () => {
  it.each([false, true])('reads for a replacement principal despite the previous principal freshness (declared: %s)', async (declared) => {
    const f = fixture();
    const data = f.open(declared);
    await refresh(data);
    expect(f.fetch).toHaveBeenCalledTimes(1);
    f.switchPrincipal();
    expect(data.status('products').syncedAt).toBeNull();
    await refresh(data);
    expect(f.fetch).toHaveBeenCalledTimes(2);
  });

  it('does not reuse another principal stored whole-read timestamp after reopening', async () => {
    const f = fixture();
    const data = f.open(true);
    await refresh(data);
    data.dispose();
    f.switchPrincipal();
    await refresh(f.open(true));
    expect(f.fetch).toHaveBeenCalledTimes(2);
  });

  it('does not answer a keyed method from whole freshness belonging to a different principal', async () => {
    const f = fixture();
    const data = f.open();
    const keyed = vi.fn(async () => [{ id: '1' }]);
    data.source('products', {
      fetch: f.fetch,
      methods: { byIds: { params: { ids: { type: 'ids' } }, batch: 'ids', field: 'id', fetch: keyed } },
    });
    await refresh(data);
    f.switchPrincipal();
    await refresh(data);
    f.switchPrincipal('A');
    await data.refresh({ collection: 'products', method: 'byIds', params: { ids: ['1'] } }, { mode: 'visible', maxAge: 60000 });
    expect(keyed).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])('reads again after the normal row cap evicts whole-read rows (declared: %s)', async (declared) => {
    const f = fixture();
    const data = f.open(declared);
    await refresh(data);
    expect(data.status('products').state).toBe('fresh');
    await f.store.put({ id: '3' }, { server: true });
    const retained = await f.store.getAllRaw();
    expect(retained).toHaveLength(2);
    expect(retained.some((row) => row.id === '3')).toBe(true);
    expect(retained.filter((row) => ['1', '2'].includes(row.id))).toHaveLength(1);
    await refresh(data);
    expect(f.fetch).toHaveBeenCalledTimes(2);
    expect((await f.store.getAllRaw()).map((row) => row.id).sort()).toEqual(['1', '2']);
  });
});
