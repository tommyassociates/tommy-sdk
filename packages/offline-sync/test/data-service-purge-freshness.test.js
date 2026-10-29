// @vitest-environment node
/**
 * A whole purge (what a host invalidation does) leaves the collection's
 * reads not run: the next refresh reads the server whatever `maxAge` it asks
 * with, and a read begun before the purge never marks the collection fresh,
 * whether the purge overtook it before it stored or after. A purge of named
 * keys removes only those rows and leaves what the last whole read covered.
 */
import { describe, it, expect } from 'vitest';
import {
  createDataService, createDataStore, createMemoryStoreBackend, createMemorySourceMeta,
} from '../src/index.js';

const HOUR = 3600000;
const flush = () => new Promise((resolve) => { setTimeout(resolve, 0); });

function world({
  scheduler, backend = createMemoryStoreBackend(), sourceMeta = createMemorySourceMeta(), answer = (v) => [{ key: 'one', v }],
} = {}) {
  let at = Date.now();
  const store = createDataStore({ name: 'wls', keyPath: 'key', backend });
  const data = createDataService({
    resolve: (name) => (name === 'wls' ? { store, decl: { keyPath: 'key' } } : null),
    now: () => at,
    sourceMeta,
    ...(scheduler ? { scheduler } : {}),
  });
  const counts = { calls: 0 };
  let gate = null;
  data.source('wls', {
    fetch: async () => {
      counts.calls += 1;
      const mine = counts.calls;
      if (gate) await gate;
      return { rows: answer(mine) };
    },
    read: { cursor: false },
  });
  return {
    data,
    counts,
    tick: (ms = 1000) => { at += ms; },
    hold: () => { let open; gate = new Promise((resolve) => { open = resolve; }); return () => { gate = null; open(); }; },
    ask: () => data.refresh('wls', { mode: 'visible', maxAge: HOUR, priority: 'normal' }),
    rows: async () => (await data.read('wls')).map((row) => row.v),
  };
}

// Runs each job at once, but answers its callers only when the test says:
// what the read stored is in the store before its outcome lands.
function heldScheduler() {
  const held = [];
  return {
    held,
    request(job) {
      return new Promise((resolve, reject) => {
        Promise.resolve().then(() => job.run(() => true, {}))
          .then((value) => held.push(() => resolve(value)))
          .catch((error) => held.push(() => reject(error)));
      });
    },
    revalidate() {},
  };
}

describe('a whole purge leaves the collection not read', () => {
  it('within maxAge a refresh reads nothing until a purge, then reads the server again', async () => {
    const w = world();
    await w.ask();
    expect(w.counts.calls).toBe(1);
    w.tick();
    await w.ask();
    expect(w.counts.calls).toBe(1);

    await w.data.purge('wls', {});
    expect(w.data.status('wls').state).toBe('stale');
    expect(w.data.status('wls').syncedAt).toBeNull();
    w.tick();
    await w.ask();
    expect(w.counts.calls).toBe(2);
    expect(await w.rows()).toEqual([2]);
    expect(w.data.status('wls').state).toBe('fresh');
  });

  it('a read the purge overtook before it stored is dropped, and the next refresh within maxAge reads again', async () => {
    const w = world();
    await w.ask();
    w.tick();
    const open = w.hold();
    const flying = w.data.refresh('wls', { mode: 'visible', maxAge: 0, priority: 'high' }).then(() => 'ok', (error) => error.code);
    await flush();
    await w.data.purge('wls', {});
    open();
    expect(await flying).toBe('REFRESH_DROPPED');
    expect(w.data.status('wls').state).toBe('stale');
    expect(w.data.status('wls').syncedAt).toBeNull();

    w.tick();
    await w.ask();
    expect(w.counts.calls).toBe(3);
    expect(await w.rows()).toEqual([3]);
  });

  it('a read that stored before the purge but landed after it does not mark the collection fresh', async () => {
    const scheduler = heldScheduler();
    const w = world({ scheduler });
    const first = w.ask();
    await flush();
    scheduler.held.shift()();
    await first;
    expect(w.data.status('wls').state).toBe('fresh');

    w.tick();
    const flying = w.data.refresh('wls', { mode: 'visible', maxAge: 0, priority: 'high' }).then(() => 'ok', (error) => error.code);
    await flush();
    expect(scheduler.held).toHaveLength(1);
    expect(await w.rows()).toEqual([2]);
    await w.data.purge('wls', {});
    scheduler.held.shift()();
    expect(await flying).toBe('REFRESH_DROPPED');
    expect(w.data.status('wls').state).not.toBe('fresh');
    expect(w.data.status('wls').syncedAt).toBeNull();

    w.tick();
    const next = w.ask();
    await flush();
    expect(w.counts.calls).toBe(3);
    scheduler.held.shift()();
    await next;
    expect(await w.rows()).toEqual([3]);
  });

  it('a whole read stored before the purge does not stand for a read when the app opens again', async () => {
    const backend = createMemoryStoreBackend();
    const sourceMeta = createMemorySourceMeta();
    const before = world({ backend, sourceMeta, answer: () => [] });
    await before.ask();
    expect(before.counts.calls).toBe(1);
    await before.data.purge('wls', {});

    const reopened = world({ backend, sourceMeta, answer: () => [] });
    await reopened.ask();
    expect(reopened.counts.calls).toBe(1);
  });

  it('a purge of named keys removes those rows and leaves the whole read fresh', async () => {
    const w = world({ answer: (v) => [{ key: 'one', v }, { key: 'two', v }] });
    await w.ask();
    await w.data.purge('wls', { keys: ['two'] });
    expect(w.data.status('wls').state).toBe('fresh');
    w.tick();
    await w.ask();
    expect(w.counts.calls).toBe(1);
    expect((await w.data.read('wls')).map((row) => row.key)).toEqual(['one']);
  });
});
