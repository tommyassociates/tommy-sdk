// @vitest-environment node
/**
 * A collection refresh may pass `stillWanted`, answering whether its asker
 * still waits. The queued scheduler job stays valid while any asker of the
 * read still wants it, and always when one asked without `stillWanted`; once
 * none does, the job is dropped before it runs and reads nothing.
 */
import { describe, it, expect, vi } from 'vitest';
import { createDataService, createDataStore, createMemoryStoreBackend } from '../src/index.js';

// A scheduler that holds jobs until `run()`; like the host's, a job whose
// `valid()` is false when its turn comes is dropped without running.
function heldScheduler() {
  const held = [];
  return {
    held,
    request(job) { return new Promise((resolve, reject) => { held.push({ job, resolve, reject }); }); },
    async run() {
      for (const { job, resolve, reject } of held.splice(0)) {
        if (job.valid && !job.valid()) reject(Object.assign(new Error('Refresh no longer current'), { code: 'REFRESH_DROPPED' }));
        else {
          try { resolve(await job.run(() => true)); } catch (error) { reject(error); } // eslint-disable-line no-await-in-loop
        }
      }
    },
  };
}

function service() {
  const scheduler = heldScheduler();
  const store = createDataStore({ name: 'active', backend: createMemoryStoreBackend() });
  const data = createDataService({
    resolve: (name) => (name === 'active' ? { store, decl: { keyPath: 'id' } } : null),
    principal: { id: 'p1' },
    foreground: () => true,
    scheduler,
  });
  const fetch = vi.fn(async () => [{ id: '1' }]);
  data.source('active', { fetch });
  return { data, scheduler, fetch };
}

const settle = () => new Promise((resolve) => { setTimeout(resolve, 0); });

describe('a collection refresh with stillWanted', () => {
  it('is dropped before it runs once its asker no longer wants it', async () => {
    const { data, scheduler, fetch } = service();
    let wanted = true;
    const read = data.refresh('active', { mode: 'visible', fromNow: true, stillWanted: () => wanted });
    expect(scheduler.held).toHaveLength(1);
    expect(scheduler.held[0].job.valid()).toBe(true);
    wanted = false;
    expect(scheduler.held[0].job.valid()).toBe(false);
    await scheduler.run();
    await expect(read).rejects.toMatchObject({ code: 'REFRESH_DROPPED' });
    expect(fetch).not.toHaveBeenCalled();
    expect(data.status('active').state).not.toBe('error');
  });

  it('stays valid while any asker of the read still wants it', async () => {
    const { data, scheduler, fetch } = service();
    let first = true;
    const second = true;
    const a = data.refresh('active', { mode: 'visible', stillWanted: () => first });
    const b = data.refresh('active', { mode: 'visible', stillWanted: () => second });
    expect(scheduler.held).toHaveLength(1);
    first = false;
    expect(scheduler.held[0].job.valid()).toBe(true);
    await scheduler.run();
    await Promise.all([a, b]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('stays valid for good once an asker without stillWanted joins', async () => {
    const { data, scheduler, fetch } = service();
    let wanted = true;
    const a = data.refresh('active', { mode: 'visible', stillWanted: () => wanted });
    const b = data.refresh('active', { mode: 'visible' });
    wanted = false;
    expect(scheduler.held[0].job.valid()).toBe(true);
    await scheduler.run();
    await Promise.all([a, b]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps stillWanted for a read queued after one already in flight', async () => {
    const { data, scheduler, fetch } = service();
    let wanted = true;
    const first = data.refresh('active', { mode: 'visible' });
    const after = data.refresh('active', { mode: 'visible', fromNow: true, stillWanted: () => wanted });
    await scheduler.run();
    await first;
    await settle();
    expect(scheduler.held).toHaveLength(1);
    wanted = false;
    expect(scheduler.held[0].job.valid()).toBe(false);
    await scheduler.run();
    await expect(after).rejects.toMatchObject({ code: 'REFRESH_DROPPED' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('never starts a read queued after another once its asker has gone', async () => {
    const { data, scheduler, fetch } = service();
    let wanted = true;
    const first = data.refresh('active', { mode: 'visible' });
    const after = data.refresh('active', { mode: 'visible', fromNow: true, stillWanted: () => wanted });
    wanted = false;
    await scheduler.run();
    await first;
    await expect(after).rejects.toMatchObject({ code: 'REFRESH_DROPPED' });
    expect(scheduler.held).toHaveLength(0);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('reads once begun even if its asker leaves meanwhile', async () => {
    const { data, scheduler, fetch } = service();
    let wanted = true;
    const read = data.refresh('active', { mode: 'visible', fromNow: true, stillWanted: () => wanted });
    const [{ job, resolve }] = scheduler.held.splice(0);
    let checked = null;
    const running = job.run(() => { checked = job.valid(); return checked; });
    wanted = false;
    resolve(await running);
    await read;
    expect(checked).toBe(true);
    expect(job.valid()).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects a stillWanted that is not a function', async () => {
    const { data } = service();
    await expect(data.refresh('active', { stillWanted: true })).rejects.toMatchObject({ code: 'DATA_INVALID' });
  });

  it('rejects stillWanted on a named refresh method', async () => {
    const { data } = service();
    await expect(data.refresh({ collection: 'active', method: 'bySelf', params: {} }, { stillWanted: () => true }))
      .rejects.toMatchObject({ code: 'DATA_UNSUPPORTED' });
  });

  it('runs as before without stillWanted', async () => {
    const { data, scheduler, fetch } = service();
    const read = data.refresh('active', { mode: 'visible', fromNow: true });
    expect(scheduler.held[0].job.valid()).toBe(true);
    await scheduler.run();
    await read;
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
