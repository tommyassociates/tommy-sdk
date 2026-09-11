import test, { after } from 'node:test';
const cleanups = [];
after(() => cleanups.forEach((cleanup) => cleanup()));
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHostStorePort, createSqliteDatabase, retireHostStorePrincipal } from '../../packages/offline-sync/src/host-store/index.js';

const identity = { version: 2, authorityOrigin: 'https://api.example.test', viewerId: '17', accountType: 'User', accountId: '17', tenantId: 'user-17', mpId: 'mileage', subjectKey: null };
const options = { identity, storeName: 'drafts', policy: 'authored', schemaVersion: 1, cacheFingerprint: null, limits: { maxRows: 1000, maxAgeMs: null, maxBytes: null } };
function setup(t) {
  const directory = mkdtempSync(join(tmpdir(), 'tommy-host-sqlite-'));
  const path = join(directory, 'store.sqlite');
  const connections = [];
  const databases = [];
  let failKey = null;
  function open() {
    const db = new DatabaseSync(path);
    connections.push(db);
    const database = createSqliteDatabase({ driver: {
      async run(sql, args) { if (failKey && sql.startsWith('INSERT INTO rows') && String(args[0]).includes(failKey)) throw new Error('injected failure'); return db.prepare(sql).run(...args); },
      async query(sql, args) { return db.prepare(sql).all(...args); },
    } });
    databases.push(database);
    return { database, port: createHostStorePort({ database, backend: 'electron_sqlite' }) };
  }
  cleanups.push(() => { connections.forEach((db) => db.close()); rmSync(directory, { recursive: true, force: true }); });
  return { open, connections, fail(key) { failKey = key; } };
}
const put = (port, state, key, value, storeRevision = state.storeRevision) => port.commit({ handle: state.handle, expectedEpoch: state.epoch, expectedStoreRevision: storeRevision, changes: [{ op: 'put', key, value }] });
const read = (port, state, keys) => port.read({ handle: state.handle, expectedEpoch: state.epoch, keys });

test('SQLite uses WAL/FULL and reads committed data from a second connection', async (t) => {
  const s = setup(t); const a = s.open(); const opened = await a.port.open(options);
  assert.equal(s.connections[0].prepare('PRAGMA journal_mode').get().journal_mode, 'wal');
  assert.equal(s.connections[0].prepare('PRAGMA synchronous').get().synchronous, 2);
  assert.equal((await put(a.port, opened, 'draft', { text: 'kept', _dirty: true })).ok, true);
  const b = s.open(); const other = await b.port.open(options);
  assert.equal((await read(b.port, other, ['draft'])).rows[0].value.text, 'kept');
});

test('independent SQLite handles use physical store CAS', async (t) => {
  const s = setup(t); const a = s.open(); const b = s.open();
  const one = await a.port.open(options); const two = await b.port.open(options);
  assert.equal((await put(a.port, one, 'a', { text: 'first' })).ok, true);
  const conflict = await put(b.port, two, 'b', { text: 'stale' });
  assert.equal(conflict.ok, false); assert.equal(conflict.reason, 'conflict');
  assert.deepEqual((await read(b.port, two, ['a', 'b'])).rows.map((row) => row.key), ['a']);
});

test('failed multirow SQLite transaction leaves previous data and revision intact', async (t) => {
  const s = setup(t); const { port } = s.open(); const opened = await port.open(options);
  s.fail('broken');
  const result = await port.commit({ handle: opened.handle, expectedEpoch: opened.epoch, expectedStoreRevision: opened.storeRevision,
    changes: [{ op: 'put', key: 'first', value: { text: 'no partial write' } }, { op: 'put', key: 'broken', value: { text: 'fail' } }] });
  assert.equal(result.ok, false);
  const snapshot = await read(port, opened, ['first', 'broken']);
  assert.equal(snapshot.rows.length, 0); assert.equal(snapshot.storeRevision, opened.storeRevision);
});

test('SQLite owner retirement persists after close/reopen and fences old handles', async (t) => {
  const s = setup(t); const a = s.open(); const opened = await a.port.open(options);
  await put(a.port, opened, 'draft', { text: 'old' });
  await a.port.retire({ handle: opened.handle, mode: 'close' });
  const b = s.open(); const before = await b.port.open(options);
  await retireHostStorePrincipal({ authorityOrigin: identity.authorityOrigin, viewerId: identity.viewerId });
  assert.equal((await put(b.port, before, 'late', { text: 'must not survive' })).reason, 'retired');
  const after = await b.port.open(options);
  assert.ok(after.epoch > before.epoch); assert.equal((await read(b.port, after, ['draft', 'late'])).rows.length, 0);
});

test('SQLite keyset scan matches UTF-16 key order without hydration of other pages', async (t) => {
  const s = setup(t); const { port } = s.open(); const opened = await port.open(options);
  const keys = ['a', '😀', '\ue000', 'z'];
  await port.commit({ handle: opened.handle, expectedEpoch: opened.epoch, expectedStoreRevision: opened.storeRevision, changes: keys.map((key) => ({ op: 'put', key, value: { key } })) });
  const first = await port.read({ handle: opened.handle, expectedEpoch: opened.epoch, afterKey: null, limit: 2 });
  const second = await port.read({ handle: opened.handle, expectedEpoch: opened.epoch, afterKey: first.nextKey, limit: 2 });
  assert.deepEqual([...first.rows, ...second.rows].map((row) => row.key), keys.sort());
  assert.equal(second.nextKey, null);
});
