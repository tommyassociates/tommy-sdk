// @vitest-environment node
/**
 * A host-store collection's complete read spans several port reads (the
 * metadata, then the bodies) and is refused when a write moves the store in
 * between. The store's own reader starts it over, as its paged read does, so
 * a read that overlaps one of the store's own writes still answers; a store
 * that keeps moving is still answered with the conflict.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createDataStore } from '../src/index.js';
import { createHostStorePort } from '../src/host-store/index.js';
import { DATABASES, identity } from './helpers/host-databases.js';

const storageError = (reason) => Object.assign(new Error(`Storage read failed (${reason})`), { name: 'StorageReadError', reason });

/**
 * The app's complete read in brief: metadata first, then the bodies, each
 * fenced on the store revision the metadata was read at. `between` runs once
 * per complete read, after its metadata.
 */
function fencedBackend(port, options, between) {
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

describe.each(DATABASES)('a complete read a write overlaps (%s)', (_name, create) => {
  function open(between) {
    const database = create();
    closers.push(() => database.close());
    const port = createHostStorePort({ database, backend: database.kind === 'sqlite' ? 'electron_sqlite' : 'indexeddb' });
    const options = { identity: identity(), storeName: 'clock_events', policy: 'authored', schemaVersion: 1, cacheFingerprint: null,
      limits: { maxRows: 1000, maxAgeMs: null, maxBytes: null } };
    let store;
    const backend = fencedBackend(port, options, (attempt) => between(store, attempt));
    store = createDataStore({ name: 'clock_events', backend, syncStrategy: 'last_write_wins' });
    return { store, backend };
  }

  it('starts over and answers the rows the write left', async () => {
    let armed = false;
    const { store, backend } = open(async (target) => {
      if (!armed) return;
      armed = false;
      await target.put({ id: 'b', kind: 'session_end' });
    });
    await store.put({ id: 'a', kind: 'session_start' });
    const before = backend.reads.complete;
    armed = true;

    const rows = await store.getAll();

    expect(rows.map((row) => row.id).sort()).toEqual(['a', 'b']);
    expect(backend.reads.complete - before).toBe(2);
  });

  it('answers the conflict when the store moves under every attempt', async () => {
    let armed = false;
    let next = 0;
    const { store, backend } = open(async (target) => {
      if (!armed) return;
      next += 1;
      await target.put({ id: `w${next}`, kind: 'session_end' });
    });
    await store.put({ id: 'a', kind: 'session_start' });
    const before = backend.reads.complete;
    armed = true;

    await expect(store.getAll()).rejects.toMatchObject({ reason: 'conflict' });
    expect(backend.reads.complete - before).toBe(3);
  });
});
