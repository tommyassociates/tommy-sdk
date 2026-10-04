// @vitest-environment node
/**
 * The SQLite engine's connection set-up: a failed open is not remembered, so
 * one refused open (a native connection left over from a WebView reload, a
 * busy file) does not leave every later host-store call failing until the app
 * is killed.
 */
import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSqliteDatabase, createHostStorePort } from '../src/host-store/index.js';
import { identity } from './helpers/host-databases.js';

function nodeDriver({ failOpens = 0 } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'host-store-open-'));
  const connection = new DatabaseSync(join(directory, 'store.sqlite'));
  let refusals = failOpens;
  const calls = { open: 0, close: 0 };
  return {
    calls,
    driver: {
      async open() {
        calls.open += 1;
        if (refusals > 0) { refusals -= 1; throw new Error('Connection tommy_host_store_v2 already exists'); }
      },
      async run(sql, args) { return connection.prepare(sql).run(...args); },
      async query(sql, args) { return connection.prepare(sql).all(...args); },
      async close() { calls.close += 1; },
    },
    dispose() { connection.close(); rmSync(directory, { recursive: true, force: true }); },
  };
}
const openInput = {
  identity: identity({ mpId: 'forms' }), storeName: 'form_drafts', policy: 'authored', schemaVersion: 1,
  cacheFingerprint: null, limits: { maxRows: 100, maxAgeMs: null, maxBytes: null },
};

describe('SQLite engine connection set-up', () => {
  it('opens again after a refused open instead of failing every later call', async () => {
    const native = nodeDriver({ failOpens: 1 });
    try {
      const database = createSqliteDatabase({ driver: native.driver });
      await expect(database.transaction('readonly', async () => 'first')).rejects.toThrow(/already exists/);
      await expect(database.transaction('readonly', async () => 'second')).resolves.toBe('second');
      expect(native.calls.open).toBe(2);

      const port = createHostStorePort({ database, backend: 'capacitor_sqlite' });
      const handle = await port.open(openInput);
      const written = await port.commit({ handle: handle.handle, expectedEpoch: handle.epoch, expectedStoreRevision: handle.storeRevision,
        changes: [{ op: 'put', key: 'd1', value: { id: 'd1' } }] });
      expect(written).toMatchObject({ ok: true });
    } finally { native.dispose(); }
  });

  it('opens once for many transactions, and again after close', async () => {
    const native = nodeDriver();
    try {
      const database = createSqliteDatabase({ driver: native.driver });
      await Promise.all([1, 2, 3].map((n) => database.transaction('readonly', async () => n)));
      expect(native.calls.open).toBe(1);
      await database.close();
      expect(native.calls.close).toBe(1);
      await expect(database.transaction('readonly', async () => 'reopened')).resolves.toBe('reopened');
      expect(native.calls.open).toBe(2);
    } finally { native.dispose(); }
  });
});
