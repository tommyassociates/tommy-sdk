// @vitest-environment node
/**
 * Whole reads of a host-store collection asked while one is in flight share
 * it: many followers opening at once (a screen's MP worlds each following the
 * roster) read the store once. A read that may predate one of the store's own
 * writes is never handed to a caller that asked after the write began, and
 * every caller still gets rows of its own.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDataStore } from '../src/index.js';
import { createHostStorePort } from '../src/host-store/index.js';
import { DATABASES, identity } from './helpers/host-databases.js';

const storageError = (reason) => Object.assign(new Error(`Storage read failed (${reason})`), { name: 'StorageReadError', reason });

// The app's complete read in brief; `between` runs after each read's metadata
// and `after` once its rows are read, before it answers.
function countingBackend(port, options, between, after) {
  let handle;
  const ready = () => (handle ||= port.open(options));
  const read = async (input) => {
    const h = await ready();
    const result = await port.read({ handle: h.handle, expectedEpoch: h.epoch, ...input });
    if (result.ok === false) throw storageError(result.reason);
    return result;
  };
  const reads = { complete: 0 };
  return {
    reads,
    transactional: true,
    policy: options.policy,
    limits: options.limits,
    snapshot: (keys) => read({ keys }),
    async getAll() {
      reads.complete += 1;
      const metadata = await read({ afterKey: null, limit: 100, metadataOnly: true });
      await between(reads.complete);
      if (!metadata.rows.length) return [];
      const bodies = await read({ keys: metadata.rows.map((row) => row.key) });
      if (bodies.storeRevision !== metadata.storeRevision || bodies.epoch !== metadata.epoch) throw storageError('conflict');
      await after(reads.complete);
      return bodies.rows.map((row) => row.value);
    },
    async commit(snapshot, changes, extra) {
      const h = await ready();
      return port.commit({
        handle: h.handle, expectedEpoch: snapshot.epoch, expectedStoreRevision: snapshot.storeRevision, changes, ...(extra || {}),
      });
    },
    async close() {},
  };
}

const closers = [];
afterEach(async () => { await Promise.all(closers.splice(0).map((close) => close())); });

describe.each(DATABASES)('whole reads asked together (%s)', (_name, create) => {
  function open(between = async () => {}, after = async () => {}) {
    const database = create();
    closers.push(() => database.close());
    const port = createHostStorePort({ database, backend: database.kind === 'sqlite' ? 'electron_sqlite' : 'indexeddb' });
    const options = { identity: identity(), storeName: 'members', policy: 'authored', schemaVersion: 1, cacheFingerprint: null,
      limits: { maxRows: 1000, maxAgeMs: null, maxBytes: null } };
    const backend = countingBackend(port, options, between, after);
    const store = createDataStore({ name: 'members', backend, syncStrategy: 'last_write_wins' });
    return { store, backend };
  }

  it('read the store once and give each caller its own rows', async () => {
    const { store, backend } = open();
    await store.put({ id: '1', name: 'Ada' });
    await store.put({ id: '2', name: 'Bo' });
    const before = backend.reads.complete;
    const answers = await Promise.all(Array.from({ length: 10 }, () => store.getAll()));
    expect(backend.reads.complete - before).toBe(1);
    answers.forEach((rows) => expect(rows.map((row) => row.name).sort()).toEqual(['Ada', 'Bo']));
    answers[0][0].name = 'Mutated';
    answers.slice(1).forEach((rows) => expect(rows.map((row) => row.name)).not.toContain('Mutated'));
  });

  it('are not shared with a caller that asked after a write began', async () => {
    let holdAt = 0;
    let release = null;
    const read = new Promise((resolve) => { release = resolve; });
    let readDone;
    const readFinished = new Promise((resolve) => { readDone = resolve; });
    const { store, backend } = open(async () => {}, async (attempt) => {
      if (attempt === holdAt) { readDone(); await read; }
    });
    await store.put({ id: '1', name: 'Ada' });
    holdAt = backend.reads.complete + 1;
    // The first read has its rows (Ada alone) but has not answered yet.
    const first = store.getAll();
    await readFinished;
    await store.put({ id: '2', name: 'Bo' });
    const later = store.getAll();
    release();
    expect((await first).map((row) => row.name)).toEqual(['Ada']);
    expect((await later).map((row) => row.name).sort()).toEqual(['Ada', 'Bo']);
  });

  it('are not shared once the read in flight is 30 s old', async () => {
    let holdAt = 0;
    let release = null;
    const read = new Promise((resolve) => { release = resolve; });
    let readDone;
    const readFinished = new Promise((resolve) => { readDone = resolve; });
    const { store, backend } = open(async () => {}, async (attempt) => {
      if (attempt === holdAt) { readDone(); await read; }
    });
    await store.put({ id: '1', name: 'Ada' });
    holdAt = backend.reads.complete + 1;
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    const stalled = store.getAll();
    await readFinished;
    clock.mockReturnValue(now + 30000);
    const before = backend.reads.complete;
    expect((await store.getAll()).map((row) => row.name)).toEqual(['Ada']);
    expect(backend.reads.complete - before).toBe(1);
    clock.mockRestore();
    release();
    await stalled;
  });

  it('share a failure, and the next read reads the store again', async () => {
    let failOnce = true;
    const { store, backend } = open(async () => {
      if (failOnce) { failOnce = false; throw storageError('unavailable'); }
    });
    await store.put({ id: '1', name: 'Ada' }).catch(() => {});
    failOnce = true;
    const before = backend.reads.complete;
    const results = await Promise.allSettled([store.getAll(), store.getAll(), store.getAll()]);
    expect(results.every((result) => result.status === 'rejected' && result.reason?.reason === 'unavailable')).toBe(true);
    expect(backend.reads.complete - before).toBe(1);
    expect((await store.getAll()).map((row) => row.name)).toEqual(['Ada']);
  });
});
