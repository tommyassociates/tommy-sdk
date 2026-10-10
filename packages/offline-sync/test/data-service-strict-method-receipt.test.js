// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDataService, createDataStore, createMemoryStoreBackend } from '../src/index.js';

const target = (client = '1') => ({ collection: 'plans', method: 'exact', params: { client } });
const record = (extra = {}) => ({ id: '77', client_id: '1', name: 'Server', ...extra });
const worlds = [];
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
function setup({ backend = createMemoryStoreBackend(), decorate = (store) => store, recordSchema, now, staleAfterMs } = {}) {
  const store = createDataStore({ name: 'plans', backend, ...(recordSchema ? { recordSchema } : {}) });
  const data = createDataService({
    resolve: () => ({ store: decorate(store), decl: { keyPath: 'id' } }),
    principal: { id: 'p1' },
    ...(now ? { now } : {}),
    ...(staleAfterMs !== undefined ? { staleAfterMs } : {}),
  });
  worlds.push(data);
  return { data, store };
}
function install(data, fetch, { strictReceipt = true, ...method } = {}) {
  return data.source('plans', {
    fetch: async () => [],
    methods: { exact: { params: { client: { type: 'id' } }, fetch, strictReceipt, ...method } },
  });
}
afterEach(() => { worlds.splice(0).forEach((data) => data.dispose()); });

describe('strict non-batched method commit receipts', () => {
  it.each([null, 'true', 1, {}, []])('rejects a nonboolean strictReceipt declaration%j', (flag) => {
    const { data } = setup();
    expect(() => install(data, async () => [], { strictReceipt: flag }))
      .toThrow(expect.objectContaining({ code: 'DATA_INVALID' }));
  });

  it.each([true, false])('does not add the option to a batched declaration%s', (strictReceipt) => {
    const { data } = setup();
    expect(() => data.source('plans', {
      fetch: async () => [],
      methods: {
        exact: { params: { ids: { type: 'ids' } }, batch: 'ids', fetch: async () => [], strictReceipt },
      },
    })).toThrow(expect.objectContaining({ code: 'DATA_INVALID' }));
  });

  it.each([{ rows: [] }, { rows: [record()] }])('captures the admitted collection revision for%j', async ({ rows }) => {
    const { data } = setup();
    install(data, async () => rows);
    const answer = await data.refresh(target(), { mode: 'visible' });
    expect(answer).toMatchObject({
      state: 'fresh', keys: rows.map((row) => row.id), receipt: expect.any(Number), receiptRevision: expect.any(Number),
    });
    const status = data.status(target(), { receipt: true });
    expect(status.receiptRevision).toBe(answer.receiptRevision);
    expect(status.revision).toBe(answer.receiptRevision);
    expect(data.status('plans')).toMatchObject({ state: 'stale', syncedAt: null });
  });

  it('keeps ordinary method status and admission shapes unchanged', async () => {
    const { data } = setup();
    install(data, async () => [record()], { strictReceipt: false });
    const answer = await data.refresh(target(), { mode: 'visible' });
    expect(answer).toMatchObject({ state: 'fresh', keys: ['77'] });
    expect(answer).not.toHaveProperty('receiptRevision');
    expect(data.status(target())).toEqual(answer);
    expect(await data.read('plans', '77')).toEqual(record());
  });

  it('refuses a strict fetch before issuing it when the store cannot observe changes', async () => {
    const { data } = setup({ decorate: (store) => ({ ...store, onChange: undefined }) });
    const fetch = vi.fn(async () => [record()]);
    install(data, fetch);
    await expect(data.refresh(target(), { mode: 'visible' }))
      .rejects.toMatchObject({ code: 'DATA_INCOMPLETE' });
    expect(fetch).not.toHaveBeenCalled();
    expect(data.status(target())).toMatchObject({ state: 'error', receipt: null, receiptRevision: null });
  });


  it.each([{ returned: undefined }, { returned: 17 }, { returned: {} }])
    ('refuses a strict observer without a usable disposer%j', async ({ returned }) => {
      const observe = vi.fn(() => returned);
      const { data } = setup({ decorate: (store) => ({ ...store, onChange: observe }) });
      const fetch = vi.fn(async () => [record()]);
      install(data, fetch);
      await expect(data.refresh(target(), { mode: 'visible' }))
        .rejects.toMatchObject({ code: 'DATA_INCOMPLETE' });
      expect(observe).toHaveBeenCalledTimes(1);
      expect(fetch).not.toHaveBeenCalled();
      expect(data.status(target())).toMatchObject({ state: 'error', receipt: null, receiptRevision: null });
    });

  it('still admits an ordinary method without a store observation contract', async () => {
    const { data } = setup({ decorate: (store) => ({ ...store, onChange: undefined }) });
    install(data, async () => [record()], { strictReceipt: false });
    expect(await data.refresh(target(), { mode: 'visible' })).toMatchObject({ state: 'fresh', keys: ['77'] });
    expect(data.status(target())).not.toHaveProperty('receiptRevision');
  });

  it.each([true, false])('preserves clean peer writes with strict=%s', async (strictReceipt) => {
    const { data } = setup();
    await data.ingest('plans', [record()]);
    const entered = deferred();
    const held = deferred();
    install(data, async () => { entered.resolve(); return held.promise; }, { strictReceipt });
    const reading = data.refresh(target(), { mode: 'visible' });
    const result = reading.catch((error) => error);
    await entered.promise;
    await data.replaceSyncedRow('plans', '77', record({ client_id: '8' }), { when: () => true });
    held.resolve([record()]);
    if (strictReceipt) {
      expect(await result).toMatchObject({ code: 'DATA_INCOMPLETE' });
      expect(data.status(target())).toMatchObject({ state: 'error', receipt: null, receiptRevision: null });
    } else {
      expect(await result).toMatchObject({ state: 'fresh', keys: ['77'] });
      expect(data.status(target())).not.toHaveProperty('receiptRevision');
    }
    expect(await data.read('plans', '77')).toEqual(record({ client_id: '8' }));
  });

  it('does not recapture a later row generation under an earlier strict receipt', async () => {
    const { data } = setup();
    install(data, async () => [record()]);
    const answer = await data.refresh(target(), { mode: 'visible' });
    await data.replaceSyncedRow('plans', '77', record({ client_id: '8' }), { when: () => true });
    const status = data.status(target(), { receipt: true });
    expect(status.receipt).toBe(answer.receipt);
    expect(status.receiptRevision).toBe(answer.receiptRevision);
    expect(status.revision).toBeGreaterThan(answer.receiptRevision);
  });

  it('captures its revision before a queued later collection turn changes the row', async () => {
    let data;
    let peer;
    let queued = false;
    ({ data } = setup({
      decorate: (store) => ({
        ...store,
        async reconcile(...args) {
          const answer = await store.reconcile(...args);
          if (!queued) {
            queued = true;
            queueMicrotask(() => {
              peer = data.replaceSyncedRow('plans', '77', record({ client_id: '8' }), { when: () => true });
            });
          }
          return answer;
        },
      }),
    }));
    install(data, async () => [record()]);
    const answer = await data.refresh(target(), { mode: 'visible' });
    await peer;
    const status = data.status(target(), { receipt: true });
    expect(status.receiptRevision).toBe(answer.receiptRevision);
    expect(status.revision).toBeGreaterThan(answer.receiptRevision);
    expect(await data.read('plans', '77')).toEqual(record({ client_id: '8' }));
  });

  it.each([{ rows: [] }, { rows: [record()] }])('refuses dirty covered rows without changing the authored record%j', async ({ rows }) => {
    const { data } = setup();
    install(data, async () => rows, { prunesWhere: () => true });
    await data.mutate('plans', { op: 'put', record: record({ name: 'Authored' }) });
    await expect(data.refresh(target(), { mode: 'visible' })).rejects.toMatchObject({ code: 'DATA_INCOMPLETE' });
    const raw = await data.read('plans', '77', { storageMetadata: true });
    expect(raw.name).toBe('Authored');
    expect(Reflect.get(raw, '_dirty')).toBe(true);
    expect(data.status(target())).toMatchObject({ receipt: null, receiptRevision: null });
  });

  it('refuses a validation-filtered row instead of issuing partial strict coverage', async () => {
    const { data } = setup({ recordSchema: {
      type: 'object', properties: { id: { type: 'string' }, client_id: { type: 'string' }, name: { type: 'string' } },
      required: ['id', 'name'], additionalProperties: false,
    } });
    install(data, async () => [record({ name: 42 })]);
    await expect(data.refresh(target(), { mode: 'visible' })).rejects.toMatchObject({ code: 'DATA_INCOMPLETE' });
    expect(await data.read('plans')).toEqual([]);
    expect(data.status(target())).toMatchObject({ receipt: null, receiptRevision: null });
  });

  it('refuses duplicate mapped keys without writing either answer', async () => {
    const { data } = setup();
    install(data, async () => [record(), record({ name: 'Other answer' })]);
    await expect(data.refresh(target(), { mode: 'visible' })).rejects.toMatchObject({ code: 'DATA_INCOMPLETE' });
    expect(await data.read('plans')).toEqual([]);
  });

  it('refuses device-storage admission loss while retaining the previously saved row', async () => {
    const memory = createMemoryStoreBackend();
    let refused = false;
    const backend = {
      ...memory,
      put: (...args) => (refused ? Promise.resolve({ ok: false, retained: false, reason: 'quota' }) : memory.put(...args)),
    };
    const { data } = setup({ backend });
    install(data, async () => [record()]);
    await data.refresh(target(), { mode: 'visible' });
    refused = true;
    await expect(data.refresh(target(), { mode: 'visible', fromNow: true }))
      .rejects.toMatchObject({ code: 'DATA_INCOMPLETE' });
    expect(await data.read('plans', '77')).toEqual(record());
    expect(data.status(target())).toMatchObject({ receipt: null, receiptRevision: null });
  });

  it('withdraws strict empty proof after an empty purge', async () => {
    const { data } = setup();
    install(data, async () => []);
    const answer = await data.refresh(target(), { mode: 'visible' });
    expect(Number.isSafeInteger(answer.receiptRevision)).toBe(true);
    await data.purge('plans', {});
    expect(data.status(target())).toMatchObject({ receipt: null, receiptRevision: null });
  });


  it('notifies loss of strict authority when its actual source is unregistered', async () => {
    const { data } = setup();
    const unregister = install(data, async () => [record()]);
    await data.refresh(target(), { mode: 'visible' });
    const notices = [];
    const stop = data.onStatusChange(() => {
      try { notices.push(data.status(target()).receipt); } catch (error) { notices.push(error.code); }
    });
    unregister();
    expect(() => data.status(target())).toThrow(expect.objectContaining({ code: 'DATA_INVALID' }));
    expect(notices).toContain('DATA_INVALID');
    stop();
  });

  it('withdraws a completed strict receipt when a different source replaces its declaration', async () => {
    const { data } = setup();
    install(data, async () => [record()]);
    const answer = await data.refresh(target(), { mode: 'visible' });
    const notices = [];
    const stop = data.onStatusChange(() => { notices.push(data.status(target()).receipt); });
    const fetch = vi.fn(async () => []);
    install(data, fetch);
    expect(data.status(target())).toMatchObject({ receipt: null, receiptRevision: null });
    expect(notices).toContain(null);
    expect(fetch).not.toHaveBeenCalled();
    expect(answer.receipt).not.toBeNull();
    expect(await data.read('plans', '77')).toEqual(record());
    stop();
  });

  it('retains the ordinary method cache contract during source replacement', async () => {
    const { data } = setup();
    install(data, async () => [record()], { strictReceipt: false });
    const answer = await data.refresh(target(), { mode: 'visible' });
    install(data, async () => [], { strictReceipt: false });
    expect(data.status(target())).toEqual(answer);
    expect(await data.read('plans', '77')).toEqual(record());
  });

  it('derives strict expiry metadata from the actual configured freshness duration', async () => {
    let clock = 4000;
    const { data } = setup({ now: () => clock, staleAfterMs: 321 });
    install(data, async () => []);
    const answer = await data.refresh(target(), { mode: 'visible' });
    expect(answer.syncedAt).toBe(4000);
    expect(answer.expiresAt).toBe(4321);
    clock = 4321;
    expect(data.status(target())).toMatchObject({ state: 'fresh', expiresAt: 4321 });
    clock = 4322;
    expect(data.status(target())).toMatchObject({ state: 'stale', receipt: null, receiptRevision: null, expiresAt: null });
  });

  it('does not let an older held flight overwrite a fromNow successor receipt', async () => {
    const { data } = setup();
    const entered = deferred();
    const held = deferred();
    let calls = 0;
    install(data, async () => {
      calls += 1;
      if (calls === 1) { entered.resolve(); return held.promise; }
      return [];
    });
    const older = data.refresh(target(), { mode: 'visible' }).catch((error) => error);
    await entered.promise;
    const successor = await data.refresh(target(), { mode: 'visible', fromNow: true });
    held.resolve([record()]);
    expect(await older).toMatchObject({ code: 'REFRESH_DROPPED' });
    expect(data.status(target(), { receipt: true })).toMatchObject({
      state: 'fresh', keys: [], receipt: successor.receipt, receiptRevision: successor.receiptRevision,
    });
    expect(await data.read('plans')).toEqual([]);
  });
});
