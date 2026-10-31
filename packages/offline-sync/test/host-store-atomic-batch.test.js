// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { createHostStorePort } from '../src/host-store/index.js';
import { DATABASES, identity } from './helpers/host-databases.js';

describe.each(DATABASES)('bounded atomic batches (%s)', (_name, create) => {
  it('commits 202 related changes together and rejects an oversized batch', async () => {
    const database = create();
    try {
      const port = createHostStorePort({ database });
      const h = await port.open({ identity: identity(), storeName: 'drafts', policy: 'authored', schemaVersion: 1,
        cacheFingerprint: null, limits: { maxRows: 1000, maxAgeMs: null, maxBytes: null } });
      const commit = (revision, changes) => port.commit({ handle: h.handle, expectedEpoch: h.epoch,
        expectedStoreRevision: revision, changes });
      const changes = Array.from({ length: 202 }, (_, n) => ({ op: 'put', key: String(n), value: { n } }));
      const saved = await commit(0, changes);
      expect(saved).toMatchObject({ ok: true });
      expect(await commit(0, [{ op: 'delete', key: '0' }])).toMatchObject({ ok: false, reason: 'conflict' });
      expect(await commit(saved.storeRevision, Array.from({ length: 257 }, (_, n) => ({ op: 'delete', key: String(n) }))))
        .toMatchObject({ ok: false, reason: 'unserializable' });
      expect(await port.read({ handle: h.handle, expectedEpoch: h.epoch, afterKey: null, limit: 101 }))
        .toMatchObject({ ok: false, reason: 'unserializable' });
      expect(await commit(saved.storeRevision, changes.map(({ key }) => ({ op: 'delete', key }))))
        .toMatchObject({ ok: true });
      expect((await port.read({ handle: h.handle, expectedEpoch: h.epoch, afterKey: null, limit: 100 })).rows).toEqual([]);
    } finally { await database.close(); }
  });
});
