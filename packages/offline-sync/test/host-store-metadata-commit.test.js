// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { createHostStorePort } from '../src/host-store/index.js';
import { DATABASES, identity } from './helpers/host-databases.js';

describe.each(DATABASES)('freshness-only commits (%s)', (_name, create) => {
  it('updates freshness under the same revision and epoch fences as rows', async () => {
    const database = create();
    try {
      const port = createHostStorePort({ database, backend: database.kind === 'sqlite' ? 'electron_sqlite' : 'indexeddb' });
      const opened = await port.open({ identity: identity(), storeName: 'docs', policy: 'cache', schemaVersion: 1,
        cacheFingerprint: 'fp', limits: { maxRows: 1000, maxAgeMs: 86400000, maxBytes: null } });
      const input = { handle: opened.handle, expectedEpoch: opened.epoch, expectedStoreRevision: opened.storeRevision,
        changes: [{ op: 'put', key: '1', value: { id: 1, n: 1 } }], syncedAt: 1000 };
      expect(await port.commit(input)).toMatchObject({ ok: true });
      const before = await port.read({ handle: opened.handle, expectedEpoch: opened.epoch, keys: ['1'] });
      const stamp = { ...input, expectedStoreRevision: before.storeRevision, changes: [], syncedAt: 2000 };
      expect(await port.commit(stamp)).toMatchObject({ ok: true, storeRevision: before.storeRevision + 1 });
      const after = await port.read({ handle: opened.handle, expectedEpoch: opened.epoch, keys: ['1'] });
      expect(after.rows).toEqual(before.rows);
      const inspected = await port.inspect({ op: 'stores', selector: { authorityOrigin: 'https://api.example.test', viewerId: '7' } });
      expect(inspected.stores[0].syncedAt).toBe(2000);
      expect(await port.commit(stamp)).toMatchObject({ ok: false, reason: 'conflict' });
      expect(await port.commit({ ...stamp, expectedEpoch: opened.epoch + 1 })).toMatchObject({ ok: false, reason: 'retired' });
      const { syncedAt, ...unstamped } = stamp;
      expect(await port.commit(unstamped)).toMatchObject({ ok: false, reason: 'unserializable' });
      await port.retire({ handle: opened.handle, mode: 'close' });
    } finally { await database.close(); }
  });
});
