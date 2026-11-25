// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { createDataService, createDataStore, createMemoryStoreBackend } from '../src/index.js';

function heldScheduler() {
  const held = [];
  const raises = [];
  return {
    held,
    raises,
    request(job) { return new Promise((resolve, reject) => { held.push({ job, resolve, reject }); }); },
    raise(key, options) { raises.push({ key, ...options }); return true; },
    async run() {
      for (const { job, resolve, reject } of held.splice(0)) {
        try { resolve(await job.run(() => true)); } catch (error) { reject(error); } // eslint-disable-line no-await-in-loop
      }
    },
  };
}

function service({ foreground = () => true } = {}) {
  const scheduler = heldScheduler();
  const store = createDataStore({ name: 'holidays', backend: createMemoryStoreBackend() });
  const data = createDataService({
    resolve: (name) => (name === 'holidays' ? { store, decl: { keyPath: 'id' } } : null),
    principal: { id: 'p1' },
    foreground,
    scheduler,
  });
  const fetch = vi.fn(async () => [{ id: '1', name: 'New Year' }]);
  data.source('holidays', { fetch });
  return { data, scheduler, fetch };
}

describe('an ask joining a queued whole read', () => {
  it('raises the queued job to visible at its priority, and still reads once', async () => {
    const { data, scheduler, fetch } = service();
    const warm = data.refresh('holidays', { mode: 'silent', priority: 'normal' });
    const shown = data.refresh('holidays', { mode: 'visible', priority: 'high' });
    expect(scheduler.held).toHaveLength(1);
    expect(scheduler.held[0].job.visible).toBe(false);
    expect(scheduler.raises).toEqual([{ key: scheduler.held[0].job.key, visible: true, priority: 1 }]);
    await scheduler.run();
    await Promise.all([warm, shown]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('raises nothing for an account not in the foreground, nor once the read has settled', async () => {
    const hidden = service({ foreground: () => false });
    const first = hidden.data.refresh('holidays', { mode: 'silent' });
    const second = hidden.data.refresh('holidays', { mode: 'visible' });
    expect(hidden.scheduler.raises).toEqual([]);
    await hidden.scheduler.run();
    await Promise.all([first, second]);

    const shown = service();
    const read = shown.data.refresh('holidays', { mode: 'silent' });
    await shown.scheduler.run();
    await read;
    const again = shown.data.refresh('holidays', { mode: 'visible', maxAge: 0 });
    expect(shown.scheduler.raises).toEqual([]);
    await shown.scheduler.run();
    await again;
  });
});

describe('an ask joining a queued method read', () => {
  const methodService = () => {
    const scheduler = heldScheduler();
    const store = createDataStore({ name: 'plans', backend: createMemoryStoreBackend(), indexes: { id: 'id' } });
    const data = createDataService({
      resolve: () => ({ store, decl: { keyPath: 'id', indexes: { id: 'id' } } }), principal: { id: 'p1' }, foreground: () => true, scheduler,
    });
    const fetch = vi.fn(async () => ({ rows: [{ id: '1' }], more: false }));
    data.source('plans', { fetch: async () => [], methods: { client: { params: { client: { type: 'id' } }, fetch } } });
    return { data, scheduler, fetch };
  };
  const target = { collection: 'plans', method: 'client', params: { client: '7' } };

  it('raises the queued flight to the joining ask, and still reads once', async () => {
    const { data, scheduler, fetch } = methodService();
    const left = data.refresh(target, { mode: 'visible', priority: 'normal' });
    const shown = data.refresh(target, { mode: 'visible', priority: 'high' });
    expect(scheduler.held).toHaveLength(1);
    expect(scheduler.raises).toEqual([{ key: scheduler.held[0].job.key, visible: true, priority: 1 }]);
    await scheduler.run();
    await Promise.all([left, shown]);
    expect(fetch).toHaveBeenCalledTimes(1);
    data.dispose();
  });
});

describe('an ask joining a queued batched method read', () => {
  const batchedService = ({ foreground = () => true, fetch = vi.fn(async ({ ids }) => ({ rows: ids.map((id) => ({ id })) })) } = {}) => {
    const scheduler = heldScheduler();
    const store = createDataStore({ name: 'plans', backend: createMemoryStoreBackend(), indexes: { id: 'id' } });
    const data = createDataService({
      resolve: () => ({ store, decl: { keyPath: 'id', indexes: { id: 'id' } } }), principal: { id: 'p1' }, foreground, scheduler,
    });
    data.source('plans', { fetch: async () => [], methods: { byIds: { params: { ids: { type: 'ids' } }, batch: 'ids', field: 'id', fetch } } });
    return { data, scheduler, fetch };
  };
  const settled = () => new Promise((resolve) => { setTimeout(resolve, 0); });
  const byIds = (ids) => ({ collection: 'plans', method: 'byIds', params: { ids } });

  it('raises the queued batch when the ask waits on ids already in it, and still reads once', async () => {
    const { data, scheduler, fetch } = batchedService();
    const left = data.refresh(byIds(['1', '2']), { mode: 'visible', priority: 'normal' });
    await settled();
    expect(scheduler.raises).toEqual([]);
    const shown = data.refresh(byIds(['1', '2']), { mode: 'visible', priority: 'high' });
    await settled();
    expect(scheduler.held).toHaveLength(1);
    expect(scheduler.raises).toEqual([{ key: scheduler.held[0].job.key, visible: true, priority: 1 }]);
    await scheduler.run();
    await Promise.all([left, shown]);
    expect(fetch).toHaveBeenCalledTimes(1);
    data.dispose();
  });

  it('raises the queued batch once when the ask adds ids to it', async () => {
    const { data, scheduler, fetch } = batchedService();
    const left = data.refresh(byIds(['1']), { mode: 'visible', priority: 'normal' });
    await settled();
    const shown = data.refresh(byIds(['1', '2', '3']), { mode: 'visible', priority: 'high' });
    await settled();
    expect(scheduler.held).toHaveLength(1);
    expect(scheduler.raises).toEqual([{ key: scheduler.held[0].job.key, visible: true, priority: 1 }]);
    await scheduler.run();
    await Promise.all([left, shown]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0].ids).toEqual(['1', '2', '3']);
    data.dispose();
  });

  it('raises nothing for an account not in the foreground, nor for a batch already reading', async () => {
    const hidden = batchedService({ foreground: () => false });
    const first = hidden.data.refresh(byIds(['1']), { mode: 'visible' });
    await settled();
    const second = hidden.data.refresh(byIds(['1']), { mode: 'visible', priority: 'high' });
    await settled();
    expect(hidden.scheduler.raises).toEqual([]);
    await hidden.scheduler.run();
    await Promise.all([first, second]);
    hidden.data.dispose();

    let answer;
    const slow = vi.fn(() => new Promise((resolve) => { answer = () => resolve({ rows: [{ id: '1' }] }); }));
    const shown = batchedService({ fetch: slow });
    const reading = shown.data.refresh(byIds(['1']), { mode: 'visible' });
    await settled();
    const ran = shown.scheduler.run();
    await vi.waitFor(() => expect(slow).toHaveBeenCalledTimes(1));
    const joined = shown.data.refresh(byIds(['1']), { mode: 'visible', priority: 'high' });
    await settled();
    expect(shown.scheduler.raises).toEqual([]);
    answer();
    await ran;
    await Promise.all([reading, joined]);
    expect(slow).toHaveBeenCalledTimes(1);
    shown.data.dispose();
  });
});
