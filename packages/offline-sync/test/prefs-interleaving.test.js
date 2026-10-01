// @vitest-environment node
/**
 * `tommy.prefs` against storage whose every read and write lands when the test
 * lets it, in any order: loads, sets, removals, refusals and reloads
 * overlapping each other. `get()` answers the last value the device saved, or
 * the value of a change still on its way; a reload answers what storage holds.
 */
import { describe, it, expect } from 'vitest';
import { createDataManager } from '../src/index.js';

const FALLBACK = 'fallback';
const KEYS = ['a', 'b', 'c'];
const flush = async () => { for (let i = 0; i < 3; i += 1) await new Promise((resolve) => { setImmediate(resolve); }); };

function prng(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The device's storage for the prefs store. Every call waits in `queue` until
 * `release` runs it: reads answer what storage holds then, writes land or are
 * refused then. A whole read asked after the test called the prefs API, before
 * it released anything, is a load, and only a load may fail.
 */
function heldStorage() {
  const durable = new Map();
  const queue = [];
  let phase = 'release';
  const held = (kind, key, run) => new Promise((resolve, reject) => {
    queue.push({ kind, key, load: kind === 'getAll' && phase === 'api', run, resolve, reject });
  });
  const backend = {
    get: (key) => held('get', String(key), () => durable.get(String(key))),
    getAll: () => held('getAll', null, () => [...durable.values()]),
    put: (key, record) => held('put', String(key), (ok) => {
      if (!ok) return { ok: false, reason: 'quota', retained: false };
      durable.set(String(key), record);
      return { ok: true };
    }),
    delete: (key) => held('delete', String(key), (ok) => {
      if (!ok) return { ok: false, reason: 'quota', retained: false };
      durable.delete(String(key));
      return { ok: true };
    }),
    keys: () => [...durable.keys()],
  };
  return {
    backend,
    durable,
    queue,
    api(call) { phase = 'api'; return call(); },
    release(index, ok) {
      phase = 'release';
      const [op] = queue.splice(index, 1);
      if (op.load && !ok) { op.reject(Object.assign(new Error('read failed'), { name: 'StorageReadError' })); return op; }
      op.resolve(op.run(ok));
      return op;
    },
  };
}

function open(storage, tenant) {
  return createDataManager({
    capabilityToken: { tenantId: tenant, mpId: 'scheduling' }, mpId: 'scheduling', localData: {},
    backendFactory: () => storage.backend,
  });
}

const stored = (storage, key) => (storage.durable.has(key) ? storage.durable.get(key).value : FALLBACK);

describe('tommy.prefs under overlapping loads and writes', () => {
  it('answers the saved value after a set refused while the first load was on its way', async () => {
    const storage = heldStorage();
    storage.durable.set('layout', { key: 'layout', value: 'grid', _rev: 1, _dirty: false });
    const data = open(storage, 'team-70');
    const loading = storage.api(() => data.prefs.ready());
    await flush();
    const refused = storage.api(() => data.prefs.set('layout', 'list')).catch((error) => error);
    await flush();
    // The set's row read and write land first, and the device refuses the write.
    while (storage.queue.some((op) => !op.load)) {
      storage.release(storage.queue.findIndex((op) => !op.load), false);
      // eslint-disable-next-line no-await-in-loop
      await flush();
    }
    expect((await refused).code).toBe('DATA_NOT_SAVED');
    storage.release(storage.queue.findIndex((op) => op.load), true);
    await loading;
    expect(data.prefs.get('layout', FALLBACK)).toBe('grid');
    await data.prefs.ready();
    expect(data.prefs.get('layout', FALLBACK)).toBe('grid');
  });

  it('keeps get() to the last saved value or the change on its way, across random interleavings', async () => {
    for (let seed = 1; seed <= 300; seed += 1) {
      const random = prng(seed);
      const pick = (list) => list[Math.floor(random() * list.length)];
      const storage = heldStorage();
      let instance = 0;
      let data = open(storage, `team-${seed}`);
      // Per key, the changes asked of this instance and not settled yet, in order.
      let pending = new Map(KEYS.map((key) => [key, []]));
      // Keys whose stored value this instance knows: all, once a load answered.
      let known = new Set();
      let loaded = false;
      const settled = new Set();
      const change = (key, present, value) => {
        const entry = { present, value };
        pending.get(key).push(entry);
        const call = storage.api(() => (present ? data.prefs.set(key, value) : data.prefs.remove(key)));
        const own = pending;
        const tracked = call.then(() => { if (own === pending) known.add(key); }, () => {})
          .finally(() => { own.get(key).splice(own.get(key).indexOf(entry), 1); settled.delete(tracked); });
        settled.add(tracked);
      };
      const expected = (key) => {
        const list = pending.get(key);
        if (list.length) return list[list.length - 1].present ? list[list.length - 1].value : FALLBACK;
        return loaded || known.has(key) ? stored(storage, key) : FALLBACK;
      };
      const check = (step) => {
        for (const key of KEYS) {
          const answer = storage.api(() => data.prefs.get(key, FALLBACK));
          if (answer !== expected(key)) {
            throw new Error(`seed ${seed} step ${step} instance ${instance}: get('${key}') answered ${answer}, expected ${expected(key)}`);
          }
        }
      };
      const releaseOne = async () => {
        const index = Math.floor(random() * storage.queue.length);
        const op = storage.queue[index];
        const ok = op.load ? random() < 0.8 : (op.kind === 'put' || op.kind === 'delete' ? random() < 0.6 : true);
        storage.release(index, ok);
        if (op.load && ok) loaded = true;
        await flush();
      };
      const drain = async () => {
        while (storage.queue.length || settled.size) {
          // eslint-disable-next-line no-await-in-loop
          if (storage.queue.length) await releaseOne(); else await flush();
        }
      };

      for (let step = 0; step < 60; step += 1) {
        const roll = random();
        if (roll < 0.12) {
          storage.api(() => data.prefs.ready());
        } else if (roll < 0.34) {
          change(pick(KEYS), true, Math.floor(random() * 5));
        } else if (roll < 0.44) {
          change(pick(KEYS), false);
        } else if (roll < 0.95) {
          if (storage.queue.length) await releaseOne();
        } else {
          await drain();
          await data.dispose();
          // A reload answers exactly what storage holds.
          const reloaded = open(storage, `team-${seed}`);
          storage.api(() => reloaded.prefs.ready());
          await flush();
          while (storage.queue.length) {
            storage.release(storage.queue.length - 1, true);
            // eslint-disable-next-line no-await-in-loop
            await flush();
          }
          for (const key of KEYS) expect(reloaded.prefs.get(key, FALLBACK)).toBe(stored(storage, key));
          await reloaded.dispose();
          // The next instance starts with nothing loaded: its first load overlaps what comes next.
          instance += 1;
          data = open(storage, `team-${seed}`);
          pending = new Map(KEYS.map((key) => [key, []]));
          known = new Set();
          loaded = false;
          if (random() < 0.5) storage.api(() => data.prefs.ready());
        }
        await flush();
        check(step);
      }
      await drain();
      check('end');
      await data.dispose();
    }
  }, 120000);
});
