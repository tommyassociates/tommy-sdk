// @vitest-environment node
import {
  describe, it, expect, vi,
} from 'vitest';
import {
  createDataService, createDataStore, createMemoryStoreBackend,
} from '../src/index.js';

function setup() {
  let clock = 1_000_000;
  const store = createDataStore({ name: 'plans', backend: createMemoryStoreBackend() });
  const data = createDataService({
    resolve: () => ({ store, decl: { keyPath: 'id' } }), now: () => clock, principal: { id: 'p1' },
  });
  return { data, store, advance: (ms) => { clock += ms; } };
}
const target = (client = '1') => ({ collection: 'plans', method: 'client', params: { client: String(client) } });
const source = (fetch) => ({ fetch: async () => [], methods: { client: { params: { client: { type: 'id' } }, fetch, cadenceMs: 0 } } });
const ask = (data, client = '1', options = {}) => data.refresh(target(client), { mode: 'visible', ...options }).catch((error) => error);
const outsideParams = () => Object.assign(new Error("'shiftsInRange' answered rows outside its params"), { code: 'DATA_INVALID', retryable: false });
const answer = { rows: [{ id: '1', client: '1' }], more: false };

describe('a method answer refused on this device', () => {
  it('is not read again for the same params until its hold ends, which doubles while it keeps being refused', async () => {
    const { data, advance } = setup();
    const fetch = vi.fn().mockRejectedValue(outsideParams());
    data.source('plans', source(fetch));
    expect(await ask(data)).toMatchObject({ code: 'DATA_INVALID' });
    expect(fetch).toHaveBeenCalledTimes(1);
    // Every panel asking again (and an ask after a write) is answered by the refusal.
    for (let i = 0; i < 5; i += 1) {
      advance(5000);
      expect(await ask(data, '1', { fromNow: i % 2 === 0 })).toMatchObject({ code: 'DATA_INVALID', retryable: false });
    }
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(data.status(target())).toMatchObject({ state: 'error', error: { code: 'DATA_INVALID' } });
    advance(5000);
    await ask(data);
    expect(fetch).toHaveBeenCalledTimes(2);
    // Refused again: held twice as long.
    advance(59_000);
    await ask(data);
    expect(fetch).toHaveBeenCalledTimes(2);
    advance(1000);
    await ask(data);
    expect(fetch).toHaveBeenCalledTimes(3);
    data.dispose();
  });

  it('holds only the refused params: another asker reads', async () => {
    const { data } = setup();
    const fetch = vi.fn().mockImplementation(async ({ client }) => {
      if (client === '1') throw outsideParams();
      return { rows: [{ id: '2', client }], more: false };
    });
    data.source('plans', source(fetch));
    await ask(data, '1');
    expect(await ask(data, '2')).toMatchObject({ state: 'fresh' });
    expect(await ask(data, '1')).toMatchObject({ code: 'DATA_INVALID' });
    expect(fetch.mock.calls.map(([params]) => params.client)).toEqual(['1', '2']);
    data.dispose();
  });

  it('ends once the params are answered, so a later refusal is held from the start again', async () => {
    const { data, advance } = setup();
    const fetch = vi.fn().mockRejectedValueOnce(outsideParams()).mockResolvedValueOnce(answer)
      .mockRejectedValue(outsideParams());
    data.source('plans', source(fetch));
    await ask(data);
    advance(30_000);
    expect(await ask(data)).toMatchObject({ state: 'fresh' });
    await ask(data);
    expect(fetch).toHaveBeenCalledTimes(3);
    advance(29_000);
    await ask(data);
    expect(fetch).toHaveBeenCalledTimes(3);
    advance(1000);
    await ask(data);
    expect(fetch).toHaveBeenCalledTimes(4);
    data.dispose();
  });

  it('is read again at once when a person retries', async () => {
    const { data, advance } = setup();
    const fetch = vi.fn().mockRejectedValueOnce(outsideParams()).mockResolvedValue(answer);
    data.source('plans', source(fetch));
    await ask(data);
    advance(1000);
    expect(await ask(data)).toMatchObject({ code: 'DATA_INVALID' });
    expect(await ask(data, '1', { fromNow: true, retry: true })).toMatchObject({ state: 'fresh' });
    expect(fetch).toHaveBeenCalledTimes(2);
    data.dispose();
  });

  it('never holds a failure the server may answer differently next time', async () => {
    const { data, advance } = setup();
    const fetch = vi.fn().mockRejectedValue(Object.assign(new Error('HTTP 403'), { status: 403 }));
    data.source('plans', source(fetch));
    await ask(data);
    advance(1000);
    await ask(data, '1', { fromNow: true });
    expect(fetch).toHaveBeenCalledTimes(2);
    data.dispose();
  });
});
