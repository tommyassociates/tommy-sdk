// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDataStore } from '../src/index.js';
import { createHostStorePort } from '../src/host-store/index.js';
import { WHOLE_READ_ROWS } from '../src/transactional-store.js';
import { DATABASES, identity } from './helpers/host-databases.js';

const storageError = (reason) => Object.assign(new Error(`Storage read failed (${reason})`), { name: 'StorageReadError', reason });

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

describe('an oversized whole read', () => {
  it('refuses from one bound proof on a cold read and after another writer changes the revision', async () => {
    let revision = 1;
    let bodies = 0;
    const proof = () => ({
      epoch: 1, storeRevision: revision, rows: [], nextKey: null, expiresAt: 2000, wholeReadRefusal: true,
    });
    const page = vi.fn(async ({ afterKey, limit, metadataOnly, wholeReadLimits }) => {
      if (wholeReadLimits) return proof();
      if (!metadataOnly) bodies += 1;
      const start = afterKey === null ? 0 : Number(afterKey) + 1;
      const end = Math.min(WHOLE_READ_ROWS + 1, start + limit);
      return {
        epoch: 1, storeRevision: revision, nextKey: end > WHOLE_READ_ROWS ? null : String(end - 1),
        rows: Array.from({ length: end - start }, (_, index) => ({ key: String(start + index), value: { id: start + index }, bytes: 20 })),
        expiresAt: 2000,
      };
    });
    const backend = {
      transactional: true, policy: 'cache', limits: { maxAgeMs: 1000 }, page, readExpiry: true, wholeReadBounds: true,
      async getAll({ wholeReadLimits }) {
        const error = storageError('scan-required');
        if (wholeReadLimits) error.bound = proof();
        throw error;
      },
    };
    const store = createDataStore({ name: 'shifts', backend, now: () => 1000 });
    await expect(store.getAll()).rejects.toMatchObject({ reason: 'scan-required' });
    expect(bodies).toBe(0);
    expect(page).not.toHaveBeenCalled();
    await expect(store.getAll()).rejects.toMatchObject({ reason: 'scan-required' });
    expect(page).toHaveBeenCalledTimes(1);
    revision += 1;
    await expect(store.getAll()).rejects.toMatchObject({ reason: 'scan-required' });
    expect(bodies).toBe(0);
    expect(page).toHaveBeenCalledTimes(3);
  });

  it('does an ordinary read when the bound expires in transit', async () => {
    const clock = 2000;
    const expired = { epoch: 1, storeRevision: 1, rows: [], nextKey: null, expiresAt: clock, wholeReadRefusal: true };
    const page = vi.fn(async ({ wholeReadLimits }) => wholeReadLimits ? expired : {
      epoch: 1, storeRevision: 1, rows: [{ key: 'draft', value: { id: 'draft', _dirty: true } }], nextKey: null,
    });
    const backend = {
      transactional: true, policy: 'cache', limits: { maxAgeMs: 1000 }, page, wholeReadBounds: true,
      async getAll() { throw Object.assign(storageError('scan-required'), { bound: expired }); },
    };
    const store = createDataStore({ name: 'shifts', backend, now: () => clock });
    await expect(store.getAll()).resolves.toEqual([{ id: 'draft', _dirty: true }]);
    expect(page).toHaveBeenCalledTimes(2);
    expect(page.mock.lastCall[0]).not.toHaveProperty('wholeReadLimits');
  });

  it('reuses a size refusal by revision and checks again after writes or row expiry', async () => {
    let clock = 1000;
    let revision = 1;
    let count = WHOLE_READ_ROWS + 1;
    const expiresAt = 2000;
    const pages = vi.fn(async ({ afterKey, limit, metadataOnly, aged, includeExpiry }) => {
      const start = afterKey === null ? 0 : Number(afterKey) + 1;
      const end = Math.min(aged || clock < expiresAt ? count : 1, start + limit);
      const rows = Array.from({ length: end - start }, (_, offset) => {
        const key = String(start + offset);
        return { key, value: metadataOnly ? null : { id: key }, revision, bytes: 20 };
      });
      return {
        epoch: 1, storeRevision: revision, rows,
        nextKey: end < (aged || clock < expiresAt ? count : 1) ? String(end - 1) : null,
        ...(includeExpiry ? { expiresAt } : {}),
      };
    });
    const backend = {
      transactional: true, policy: 'cache', limits: { maxAgeMs: 1000 }, page: pages, readExpiry: true,
      getAll: async () => { throw storageError('scan-required'); },
    };
    const store = createDataStore({ name: 'shifts', backend, now: () => clock });
    await expect(store.getAll()).rejects.toMatchObject({ reason: 'scan-required' });
    const baselinePages = pages.mock.calls.length;
    expect(baselinePages).toBe(Math.ceil(count / 100));
    await expect(store.getAll()).rejects.toMatchObject({ reason: 'scan-required' });
    expect(pages.mock.calls.length - baselinePages).toBe(1);

    revision += 1;
    count = 1;
    await expect(store.getAll()).resolves.toEqual([{ id: '0' }]);

    revision += 1;
    count = WHOLE_READ_ROWS + 1;
    await expect(store.getAll()).rejects.toMatchObject({ reason: 'scan-required' });
    clock = expiresAt;
    await expect(store.getAll()).resolves.toEqual([{ id: '0' }]);
  });
});

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
