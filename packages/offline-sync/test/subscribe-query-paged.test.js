// @vitest-environment node
/**
 * A selector subscription over a host-store collection too large for one
 * complete read takes its first value from the same paged whole read that
 * later changes are compared with, so a change the selector does not read
 * tells it nothing.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDataService, createDataStore } from '../src/index.js';
import { createHostStorePort } from '../src/host-store/index.js';
import { COMPLETE_ROWS } from '../src/host-store/protocol.js';
import { DATABASES, identity } from './helpers/host-databases.js';

const scanRequired = () => Object.assign(new Error('scan-required'), { name: 'StorageReadError', reason: 'scan-required' });

/**
 * A host-store-backed collection the way the app opens one: its complete read
 * is refused past COMPLETE_ROWS, and `pages` counts the paged reads that
 * reached the last row.
 */
function boundedBackend(port, options, pages) {
  let handle;
  const ready = () => (handle ||= port.open(options));
  const read = async ({ aged = false, ...input }) => {
    const h = await ready();
    const result = await port.read({ handle: h.handle, expectedEpoch: h.epoch, ...input, ...(aged ? { includeAged: true } : {}) });
    if (result.ok === false) throw Object.assign(new Error(result.reason), { name: 'StorageReadError', reason: result.reason });
    return result;
  };
  return {
    transactional: true, policy: options.policy, limits: options.limits,
    snapshot: (keys, { aged = false } = {}) => read({ keys, aged }),
    async page({ afterKey = null, limit = 100, aged = false, metadataOnly = false } = {}) {
      const result = await read({ afterKey, limit, aged, ...(metadataOnly ? { metadataOnly } : {}) });
      if (!metadataOnly && result.nextKey === null) pages.last += 1;
      return result;
    },
    async getAll({ aged = false } = {}) {
      const rows = []; let afterKey = null;
      do { const page = await read({ afterKey, limit: 100, aged }); rows.push(...page.rows.map((row) => row.value)); afterKey = page.nextKey; } while (afterKey !== null);
      if (rows.length > COMPLETE_ROWS) throw scanRequired();
      return rows;
    },
    async commit(snapshot, changes, extra) {
      const h = await ready();
      return port.commit({ handle: h.handle, expectedEpoch: snapshot.epoch, expectedStoreRevision: snapshot.storeRevision, changes, ...(extra || {}) });
    },
    async close() {},
  };
}

const closers = [];
afterEach(async () => { await Promise.all(closers.splice(0).map((close) => close())); });

describe.each(DATABASES)('a selector subscription over a paged collection (%s)', (_name, create) => {
  it('is not told of a change to a row its selector does not read', async () => {
    const database = create();
    closers.push(() => database.close());
    const port = createHostStorePort({ database, backend: database.kind === 'sqlite' ? 'electron_sqlite' : 'indexeddb' });
    const options = { identity: identity(), storeName: 'shifts', policy: 'cache', schemaVersion: 1, cacheFingerprint: 'fp',
      limits: { maxRows: 5000, maxAgeMs: 30 * 86400000, maxBytes: null } };
    const pages = { last: 0 };
    const store = createDataStore({ name: 'shifts', backend: boundedBackend(port, options, pages) });
    const data = createDataService({ resolve: (name) => (name === 'shifts' ? { store, decl: { keyPath: 'id' } } : null) });
    closers.push(() => data.dispose());
    await data.ingest('shifts', Array.from({ length: COMPLETE_ROWS + 200 }, (_, at) => ({ id: String(at), hours: at })));

    const heard = [];
    const errors = [];
    const before = pages.last;
    store.subscribeQuery((query) => query.get('5')?.hours, (value) => heard.push(value), { onError: (error) => errors.push(error.reason) });
    // Its first value is read (or refused) before anything changes.
    await vi.waitFor(() => expect(errors.length + pages.last - before).toBeGreaterThan(0));

    await store.put({ id: '900', hours: 1 });
    expect(heard).toEqual([]);
    await store.put({ id: '5', hours: 50 });
    expect(heard).toEqual([50]);
    expect(errors).toEqual([]);
  });
});
