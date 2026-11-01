// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { createHostStorePort } from '../src/host-store/index.js';
import { DATABASES, identity } from './helpers/host-databases.js';
import { storageError } from '../src/host-store/protocol.js';

function counted(database) {
  const counts = { transactions: 0, rows: 0 };
  return { counts, database: { ...database, transaction(mode, work) {
    counts.transactions += 1;
    return database.transaction(mode, tx => work(new Proxy(tx, { get(target, name) {
      const fn = target[name];
      return typeof fn !== 'function' ? fn : (...args) => {
        if (args[0] === 'rows') counts.rows += 1;
        return fn(...args);
      };
    } })));
  } } };
}
const options = name => ({ identity: identity(), storeName: name, policy: 'cache', schemaVersion: 1,
  cacheFingerprint: 'fp', limits: { maxRows: 100, maxAgeMs: 1000, maxBytes: null } });
const change = title => [{ op: 'put', key: '1', value: { id: '1', title } }];

describe.each(DATABASES)('hot port reads on %s', (_name, create) => {
  it.each(['payload-capacity', 'quota'])('propagates %s after a successful hot read and coalesces only that failure', async reason => {
    const db = create();
    try {
      let failure = null;
      const { counts, database } = counted({ ...db, transaction(mode, work) {
        return db.transaction(mode, tx => {
          if (mode === 'readonly' && failure) throw storageError(failure);
          return work(tx);
        });
      } });
      const port = createHostStorePort({ database });
      const opened = await port.open(options('person.accounts'));
      await port.commit({ handle: opened.handle, expectedEpoch: opened.epoch, expectedStoreRevision: 0, changes: change('One') });
      const ask = { handle: opened.handle, expectedEpoch: opened.epoch, keys: ['1'] };
      expect((await port.read(ask)).rows[0].value.title).toBe('One');
      failure = reason;
      counts.transactions = 0;
      counts.rows = 0;
      const failed = await Promise.all(Array.from({ length: 26 }, () => port.read(ask)));
      expect(failed).toEqual(Array.from({ length: 26 }, () => ({ ok: false, reason })));
      expect(counts.transactions).toBe(1);
      expect(counts.rows).toBe(0);
      failure = null;
      expect((await port.read(ask)).rows[0].value.title).toBe('One');
      expect(counts.rows).toBeGreaterThan(0);
    } finally { await db.close(); }
  });

  it.each([false, true])('forgets hot rows evicted by a sibling namespace (another port: %s)', async anotherPort => {
    const db = create();
    try {
      let clock = 0;
      const port = createHostStorePort({ database: db, now: () => ++clock });
      const writer = anotherPort ? createHostStorePort({ database: db, now: () => ++clock }) : port;
      const limited = name => ({ ...options(name), limits: { ...options(name).limits, evict: 'lru', domainMaxBytes: 100 } });
      const shifts = await port.open(limited('workforce.shifts'));
      const sibling = await writer.open(limited('workforce.timesheets_window'));
      const put = opened => ({ handle: opened.handle, expectedEpoch: opened.epoch, expectedStoreRevision: 0, changes: change('x'.repeat(60)) });
      expect(await port.commit(put(shifts))).toMatchObject({ ok: true });
      const scan = { handle: shifts.handle, expectedEpoch: shifts.epoch, afterKey: null, limit: 100 };
      const keyed = { handle: shifts.handle, expectedEpoch: shifts.epoch, keys: ['1'] };
      expect((await port.read(scan)).rows.map(row => row.key)).toEqual(['1']);
      expect((await port.read(keyed)).rows.map(row => row.key)).toEqual(['1']);
      expect(await writer.commit(put(sibling))).toMatchObject({ ok: true, evicted: [expect.objectContaining({ key: '1' })] });
      expect((await port.read(scan)).rows).toEqual([]);
      expect((await port.read(keyed)).rows).toEqual([]);
    } finally { await db.close(); }
  });

  it.each(['workforce.timesheets_window', 'person.accounts'])('holds %s metadata and bodies between commits', async name => {
    const db = create();
    try {
      const { counts, database } = counted(db);
      const port = createHostStorePort({ database });
      const opened = await port.open(options(name));
      const committed = await port.commit({ handle: opened.handle, expectedEpoch: opened.epoch, expectedStoreRevision: 0, changes: change('One') });
      expect(committed.ok).toBe(true);
      const ask = { handle: opened.handle, expectedEpoch: opened.epoch, afterKey: null, limit: 100 };
      const first = await port.read(ask);
      counts.rows = 0;
      first.rows[0].value.title = 'caller mutation';
      for (let n = 0; n < 8; n += 1) expect((await port.read(ask)).rows[0].value.title).toBe('One');
      // Point reads share the same normalized rows the scan held.
      expect((await port.read({ handle: opened.handle, expectedEpoch: opened.epoch, keys: ['1'] })).rows[0].value.title).toBe('One');
      expect(counts.rows).toBe(0);
      await port.commit({ handle: opened.handle, expectedEpoch: opened.epoch, expectedStoreRevision: committed.storeRevision, changes: change('Two') });
      expect((await port.read(ask)).rows[0].value.title).toBe('Two');
    } finally { await db.close(); }
  });
  it('coalesces identical in-flight reads without coalescing across a write', async () => {
    const db = create();
    try {
      const { counts, database } = counted(db);
      const port = createHostStorePort({ database });
      const opened = await port.open(options('person.accounts'));
      const ask = { handle: opened.handle, expectedEpoch: opened.epoch, keys: ['1'] };
      counts.transactions = 0;
      await Promise.all(Array.from({ length: 26 }, () => port.read(ask)));
      expect(counts.transactions).toBe(1);
      const before = port.read(ask);
      const write = port.commit({ handle: opened.handle, expectedEpoch: opened.epoch, expectedStoreRevision: 0, changes: change('New') });
      const after = port.read(ask);
      await before;
      expect((await write).ok).toBe(true);
      expect((await after).rows[0].value.title).toBe('New');
    } finally { await db.close(); }
  });
  it('rechecks revisions written through another port and fences retired handles', async () => {
    const db = create();
    try {
      const port = createHostStorePort({ database: db });
      const other = createHostStorePort({ database: db });
      const opened = await port.open(options('person.accounts'));
      const writer = await other.open(options('person.accounts'));
      const ask = { handle: opened.handle, expectedEpoch: opened.epoch, keys: ['1'] };
      expect((await port.read(ask)).rows).toEqual([]);
      await other.commit({ handle: writer.handle, expectedEpoch: writer.epoch, expectedStoreRevision: 0, changes: change('Other tab') });
      expect((await port.read(ask)).rows[0].value.title).toBe('Other tab');
      await other.retire({ handle: writer.handle, mode: 'purge_owner' });
      expect(await port.read(ask)).toMatchObject({ ok: false, reason: 'retired' });
    } finally { await db.close(); }
  });
  it('bounds snapshots and evicts closed namespaces', async () => {
    const db = create();
    try {
      const { counts, database } = counted(db);
      const port = createHostStorePort({ database });
      const handles = [];
      for (let n = 0; n < 66; n += 1) {
        const opened = await port.open(options(`person.items_${n}`));
        await port.commit({ handle: opened.handle, expectedEpoch: opened.epoch, expectedStoreRevision: 0, changes: change('Held') });
        await port.read({ handle: opened.handle, expectedEpoch: opened.epoch, keys: ['1'] });
        handles.push(opened);
      }
      counts.rows = 0;
      await port.read({ handle: handles[0].handle, expectedEpoch: handles[0].epoch, keys: ['1'] });
      expect(counts.rows).toBeGreaterThan(0);
      await port.retire({ handle: handles[0].handle, mode: 'close' });
      const reopened = await port.open(options('person.items_0'));
      counts.rows = 0;
      expect((await port.read({ handle: reopened.handle, expectedEpoch: reopened.epoch, keys: ['1'] })).rows[0].value.title).toBe('Held');
      expect(counts.rows).toBeGreaterThan(0);
    } finally { await db.close(); }
  });

  it('forgets projected rows on rollback and reads the committed snapshot again', async () => {
    const db = create();
    try {
      let abort = false;
      const { counts, database } = counted({ ...db, transaction(mode, work) {
        return db.transaction(mode, async tx => {
          const result = await work(tx);
          if (abort && mode === 'readwrite') throw Error('abort after writes');
          return result;
        });
      } });
      const port = createHostStorePort({ database });
      const opened = await port.open(options('person.accounts'));
      const ask = { handle: opened.handle, expectedEpoch: opened.epoch, keys: ['1'] };
      const first = await port.commit({ handle: opened.handle, expectedEpoch: opened.epoch, expectedStoreRevision: 0, changes: change('Committed') });
      expect(first.ok).toBe(true);
      await port.read(ask);
      abort = true;
      expect(await port.commit({ handle: opened.handle, expectedEpoch: opened.epoch, expectedStoreRevision: 1, changes: change('Rolled back') })).toMatchObject({ ok: false });
      counts.rows = 0;
      expect((await port.read(ask)).rows[0].value.title).toBe('Committed');
      expect(counts.rows).toBeGreaterThan(0);
    } finally { await db.close(); }
  });

  it('never reuses a prior owner epoch when another port retires and reopens it', async () => {
    const db = create();
    try {
      const port = createHostStorePort({ database: db });
      const other = createHostStorePort({ database: db });
      const old = await port.open(options('person.accounts'));
      const writer = await other.open(options('person.accounts'));
      const ask = opened => ({ handle: opened.handle, expectedEpoch: opened.epoch, keys: ['1'] });
      await other.commit({ handle: writer.handle, expectedEpoch: writer.epoch, expectedStoreRevision: 0, changes: change('Old epoch') });
      expect((await port.read(ask(old))).rows[0].value.title).toBe('Old epoch');
      await other.retire({ handle: writer.handle, mode: 'purge_owner' });
      const fresh = await other.open(options('person.accounts'));
      await other.commit({ handle: fresh.handle, expectedEpoch: fresh.epoch, expectedStoreRevision: 0, changes: change('New epoch') });
      const reader = await port.open(options('person.accounts'));
      expect(reader.epoch).toBeGreaterThan(old.epoch);
      expect((await port.read(ask(reader))).rows[0].value.title).toBe('New epoch');
    } finally { await db.close(); }
  });

  it('keeps other namespaces hot when one is retired', async () => {
    const db = create();
    try {
      const { counts, database } = counted(db);
      const port = createHostStorePort({ database });
      const a = await port.open(options('person.accounts'));
      const b = await port.open(options('workforce.timesheets_window'));
      const ask = opened => ({ handle: opened.handle, expectedEpoch: opened.epoch, keys: ['1'] });
      await port.commit({ handle: a.handle, expectedEpoch: a.epoch, expectedStoreRevision: 0, changes: change('Keep hot') });
      await port.read(ask(a));
      await port.read(ask(b));
      await port.retire({ handle: b.handle, mode: 'close' });
      counts.rows = 0;
      expect((await port.read(ask(a))).rows[0].value.title).toBe('Keep hot');
      expect(counts.rows).toBe(0);
    } finally { await db.close(); }
  });

});
