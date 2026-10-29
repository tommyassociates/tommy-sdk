// @vitest-environment node
/**
 * The default (immediate) scheduler, which SDK tests and MPs run against the
 * fake host use, keeps the host scheduler's rule (core
 * src/data/refresh-scheduler.js): a job that is no longer `valid()` is never
 * run. One no longer valid when its turn comes settles as dropped
 * (REFRESH_DROPPED) without running. One flight per key.
 */
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
    // Its reads paused just after it was asked, before its microtask ran.
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
    // No scheduler given: the service runs on the immediate one.
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
    // The account's reads paused (its cadence became Infinity) before the
    // queued read's turn came.
    factor = Infinity;
    await read;
    expect(fetch).not.toHaveBeenCalled();
    expect(await data.read('members')).toEqual([]);
    expect(data.status('members')).toMatchObject({ syncedAt: null });
    data.dispose();
  });
});
