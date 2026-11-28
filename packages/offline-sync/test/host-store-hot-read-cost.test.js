// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { createHostStorePort } from '../src/host-store/index.js';
import { DATABASES, createMemoryIndexedDb, identity } from './helpers/host-databases.js';

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
      expect(parses).toBeLessThanOrEqual(3 * ROWS + 10);
    } finally { await db.close(); }
  });
});

it('reuses a browser attendance window that has more than 4,096 metadata and body entries', async () => {
  const database = createMemoryIndexedDb();
  let reads = 0;
  const port = createHostStorePort({
    database: {
      ...database,
      transaction: (mode, work) => database.transaction(mode, (tx) => work({
        ...tx,
        get(table, key) {
          if (mode === 'readonly' && table === 'rows') reads += 1;
          return tx.get(table, key);
        },
      })),
    },
  });
  const opened = await port.open({
    ...options(), storeName: 'workforce.attendances', limits: { maxRows: 3000, maxAgeMs: null, maxBytes: null },
  });
  const keys = Array.from({ length: 2560 }, (_, at) => String(at + 1));
  let revision = opened.storeRevision;
  const scope = { handle: opened.handle, expectedEpoch: opened.epoch };
  const commit = (changes) => port.commit({ ...scope, expectedStoreRevision: revision, changes });
  const keyPages = Array.from({ length: Math.ceil(keys.length / 100) }, (_, at) => keys.slice(at * 100, (at + 1) * 100));
  for (const page of keyPages) {
    const result = await commit(page.map(key => ({ op: 'put', key, value: { id: key, duration: 8 } }))); // eslint-disable-line no-await-in-loop
    expect(result.ok).toBe(true);
    revision = result.storeRevision;
  }
  const readWindow = async () => {
    const rows = [];
    for (const page of keyPages) {
      const result = await port.read({ ...scope, keys: page }); // eslint-disable-line no-await-in-loop
      rows.push(...result.rows.map(row => row.value));
    }
    return rows;
  };
  const first = await readWindow();
  expect(first.map(row => row.id)).toEqual(keys);
  expect(reads).toBe(keys.length * 2);
  reads = 0;
  expect(await readWindow()).toEqual(first);
  expect(reads).toBe(0);

  const updated = { id: keys[0], duration: 6 };
  expect((await commit([{ op: 'put', key: updated.id, value: updated }])).ok).toBe(true);
  expect((await port.read({ ...scope, keys: [updated.id] })).rows[0].value).toEqual(updated);
  await port.retire({ handle: opened.handle, mode: 'close' });
});
