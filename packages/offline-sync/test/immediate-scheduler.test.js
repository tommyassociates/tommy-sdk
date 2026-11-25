// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import {
  createDataService, createDataStore, createImmediateScheduler, createMemoryStoreBackend,
} from '../src/index.js';

describe('the immediate scheduler', () => {
  it('runs a valid job once and answers with its result', async () => {
    const scheduler = createImmediateScheduler();
    const run = vi.fn(async () => 'done');
    await expect(scheduler.request({ key: 'a', valid: () => true, run })).resolves.toBe('done');
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('runs a job that declares no valid()', async () => {
    const scheduler = createImmediateScheduler();
    const run = vi.fn(async () => 'done');
    await expect(scheduler.request({ key: 'a', run })).resolves.toBe('done');
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('never runs a job no longer valid when its turn comes, and settles it as dropped', async () => {
    const scheduler = createImmediateScheduler();
    let wanted = true;
    const run = vi.fn(async () => 'done');
    const flight = scheduler.request({ key: 'a', valid: () => wanted, run });
    wanted = false;
    await expect(flight).rejects.toMatchObject({ code: 'REFRESH_DROPPED' });
    expect(run).not.toHaveBeenCalled();
  });

  it('treats a valid() that throws as no longer valid', async () => {
    const scheduler = createImmediateScheduler();
    const run = vi.fn(async () => 'done');
    const flight = scheduler.request({ key: 'a', valid: () => { throw new Error('gone'); }, run });
    await expect(flight).rejects.toMatchObject({ code: 'REFRESH_DROPPED' });
    expect(run).not.toHaveBeenCalled();
  });

  it('keeps one flight per key, and frees the key once a dropped job settles', async () => {
    const scheduler = createImmediateScheduler();
    let wanted = true;
    const run = vi.fn(async () => 'done');
    const first = scheduler.request({ key: 'a', valid: () => wanted, run });
    const joined = scheduler.request({ key: 'a', valid: () => wanted, run });
    expect(joined).toBe(first);
    wanted = false;
    await expect(first).rejects.toMatchObject({ code: 'REFRESH_DROPPED' });
    wanted = true;
    await expect(scheduler.request({ key: 'a', valid: () => wanted, run })).resolves.toBe('done');
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe('a data service on the default scheduler', () => {
  it('fetches nothing for a refresh whose reads paused just after it was queued', async () => {
    let factor = 2;
    const store = createDataStore({ name: 'members', backend: createMemoryStoreBackend() });
    const data = createDataService({
      resolve: (name) => (name === 'members' ? { store, decl: { keyPath: 'id' } } : null),
      now: () => 1_000_000,
      principal: { id: 'p1' },
      foreground: () => false,
      backgroundCadence: () => factor,
    });
    const fetch = vi.fn(async () => [{ id: '1' }]);
    data.source('members', { fetch });
    const read = data.refresh('members');
    factor = Infinity;
    await read;
    expect(fetch).not.toHaveBeenCalled();
    expect(await data.read('members')).toEqual([]);
    expect(data.status('members')).toMatchObject({ syncedAt: null });
    data.dispose();
  });
});
