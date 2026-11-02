// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { createHostStorePort } from '../src/host-store/index.js';
import { DATABASES, identity } from './helpers/host-databases.js';

const ROWS = 50;
const options = () => ({ identity: identity(), storeName: 'workforce.timesheets', policy: 'cache', schemaVersion: 1,
  cacheFingerprint: 'fp', limits: { maxRows: 1000, maxAgeMs: null, maxBytes: null } });

describe.each(DATABASES)('hot keyed port reads on %s', (_name, create) => {
  it('decodes each held row once per read and answers the same rows', async () => {
    const db = create();
    try {
      const port = createHostStorePort({ database: db });
      const opened = await port.open(options());
      const keys = Array.from({ length: ROWS }, (_, at) => String(at + 1));
      await port.commit({ handle: opened.handle, expectedEpoch: opened.epoch, expectedStoreRevision: 0,
        changes: keys.map(key => ({ op: 'put', key, value: { id: key, minutes: Number(key) * 15 } })) });
      const ask = { handle: opened.handle, expectedEpoch: opened.epoch, keys };
      const cold = await port.read(ask);
      const parse = vi.spyOn(JSON, 'parse');
      let hot;
      let parses;
      try {
        hot = await port.read(ask);
        parses = parse.mock.calls.length;
      } finally {
        parse.mockRestore();
      }
      expect(hot).toEqual(cold);
      expect(hot.rows.map(row => row.value.minutes)).toEqual(keys.map(key => Number(key) * 15));
      // A held metadata row, a held body row and the body's value per key,
      // plus the store's own reads (each held row was decoded twice before).
      expect(parses).toBeLessThanOrEqual(3 * ROWS + 10);
    } finally { await db.close(); }
  });
});
