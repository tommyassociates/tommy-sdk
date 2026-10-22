// @vitest-environment node
/**
 * An exclusive SQLite database (a phone's WebView, its only user): a read
 * sends no BEGIN or COMMIT of its own, and owner and store rows are answered
 * from memory once read — yet every write, rollback and purge is seen exactly
 * as the database holds it.
 */
import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSqliteDatabase, createHostStorePort } from '../src/host-store/index.js';
import { identity } from './helpers/host-databases.js';

function nodeDriver() {
  const directory = mkdtempSync(join(tmpdir(), 'host-store-exclusive-'));
  const connection = new DatabaseSync(join(directory, 'store.sqlite'));
  const statements = [];
  return {
    statements,
    driver: {
      async run(sql, args) { statements.push(sql); return connection.prepare(sql).run(...args); },
      async query(sql, args) { statements.push(sql); return connection.prepare(sql).all(...args); },
    },
    dispose() { connection.close(); rmSync(directory, { recursive: true, force: true }); },
  };
}
const openInput = {
  identity: identity({ mpId: 'forms' }), storeName: 'form_drafts', policy: 'authored', schemaVersion: 1,
  cacheFingerprint: null, limits: { maxRows: 100, maxAgeMs: null, maxBytes: null },
};
const put = (id, value) => ({ op: 'put', key: id, value: { id, ...value } });

describe('exclusive SQLite database', () => {
  it('reads without a transaction of its own and answers owner and store rows from memory', async () => {
    const native = nodeDriver();
    try {
      const port = createHostStorePort({ database: createSqliteDatabase({ driver: native.driver, exclusive: true }), backend: 'capacitor_sqlite' });
      const handle = await port.open(openInput);
      await port.commit({ handle: handle.handle, expectedEpoch: handle.epoch, expectedStoreRevision: handle.storeRevision, changes: [put('d1', { title: 'One' })] });
      native.statements.length = 0;
      const answer = await port.read({ handle: handle.handle, expectedEpoch: handle.epoch, keys: ['d1'] });
      expect(answer.rows.map((row) => row.value.title)).toEqual(['One']);
      expect(native.statements.filter((sql) => /^(BEGIN|COMMIT)/.test(sql))).toEqual([]);
      expect(native.statements.filter((sql) => /FROM (owners|stores) WHERE key/.test(sql))).toEqual([]);
    } finally { native.dispose(); }
  });

  it('sees each committed write, and nothing of one rolled back', async () => {
    const native = nodeDriver();
    try {
      const database = createSqliteDatabase({ driver: native.driver, exclusive: true });
      const port = createHostStorePort({ database, backend: 'capacitor_sqlite' });
      const handle = await port.open(openInput);
      const first = await port.commit({ handle: handle.handle, expectedEpoch: handle.epoch, expectedStoreRevision: handle.storeRevision, changes: [put('d1', { title: 'One' })] });
      const second = await port.commit({ handle: handle.handle, expectedEpoch: handle.epoch, expectedStoreRevision: first.storeRevision, changes: [put('d1', { title: 'Two' })] });
      expect(second).toMatchObject({ ok: true });
      // A stale revision is refused as the store row now held says.
      expect(await port.commit({ handle: handle.handle, expectedEpoch: handle.epoch, expectedStoreRevision: first.storeRevision, changes: [put('d1', { title: 'Stale' })] }))
        .toMatchObject({ ok: false, reason: 'conflict' });
      // A write undone inside its transaction is not held.
      await expect(database.transaction('readwrite', async (tx) => {
        const store = (await tx.scan('stores', [JSON.parse(JSON.stringify((await tx.scan('owners', [], { limit: 1 }))[0].key))], { limit: 1 }))[0];
        await tx.put('stores', { ...store, revision: store.revision + 50 });
        throw new Error('undo');
      })).rejects.toThrow('undo');
      const read = await port.read({ handle: handle.handle, expectedEpoch: handle.epoch, keys: ['d1'] });
      expect(read.storeRevision).toBe(second.storeRevision);
      expect(read.rows[0].value.title).toBe('Two');
    } finally { native.dispose(); }
  });

  it('a database shared with other users keeps its transactions and reads every row', async () => {
    const native = nodeDriver();
    try {
      const port = createHostStorePort({ database: createSqliteDatabase({ driver: native.driver }), backend: 'electron_sqlite' });
      const handle = await port.open(openInput);
      native.statements.length = 0;
      await port.read({ handle: handle.handle, expectedEpoch: handle.epoch, keys: ['d1'] });
      expect(native.statements[0]).toBe('BEGIN');
      expect(native.statements.some((sql) => /FROM stores WHERE key/.test(sql))).toBe(true);
    } finally { native.dispose(); }
  });
});
