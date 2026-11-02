// @vitest-environment node
/**
 * An ask that joins a whole read still queued in the scheduler (a silent
 * boot warm-up) raises that queued job to the ask's own visibility and
 * priority, so a screen waiting on it is not held at the warm-up's rank. An
 * account not in the foreground raises nothing.
 */
import { describe, it, expect, vi } from 'vitest';
import { createDataService, createDataStore, createMemoryStoreBackend } from '../src/index.js';

// A scheduler that holds jobs until `run()` and records raises.
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

  // The screen left behind asked it; the scheduler lowered it on leaving; the
  // next screen asks the same read and shares the queued flight.
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
