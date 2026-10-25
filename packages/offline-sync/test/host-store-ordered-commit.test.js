// @vitest-environment node
/**
 * A commit on a database that runs a transaction's requests in the order they
 * were asked (IndexedDB) asks its row writes together instead of waiting on
 * each: a large team's page of 600 shifts was thousands of round trips in a
 * row. A database that does not say so (SQLite) still has each request
 * waited for before the next is asked.
 */
import { describe, it, expect } from 'vitest';
import { createHostStorePort } from '../src/host-store/index.js';
import { createMemoryIndexedDb, identity } from './helpers/host-databases.js';

// Each request answers on its own later macrotask; `turns` counts how many
// the commit waited through, `peak` the most requests outstanding at once.
function counted({ ordered }) {
  const stats = { turns: 0, outstanding: 0, peak: 0 };
  const turn = (value) => {
    stats.outstanding += 1;
    stats.peak = Math.max(stats.peak, stats.outstanding);
    return new Promise((resolve) => {
      setImmediate(() => { stats.outstanding -= 1; stats.turns += 1; resolve(value); });
    });
  };
  const database = createMemoryIndexedDb({ turn });
  if (!ordered) delete database.ordered;
  return { database, stats };
}
const openInput = () => ({
  identity: identity(), storeName: 'workforce.shifts', policy: 'cache', schemaVersion: 1, cacheFingerprint: 'fp-1',
  limits: { maxRows: 5000, maxAgeMs: 86400000, maxBytes: null },
  indexes: { byAssignee: 'assignee_id', byStart: 'start_at' },
});
const rows = (count, edit = 0) => Array.from({ length: count }, (_, index) => ({
  id: index + 1, assignee_id: (index % 40) + 1 + edit, start_at: `2026-10-${String((index % 28) + 1).padStart(2, '0')}T0${index % 10}:00:00Z`, note: `v${edit}`,
}));
async function writeTwice(database, stats) {
  const port = createHostStorePort({ database, backend: 'indexeddb', now: () => 1000 });
  const opened = await port.open(openInput());
  const commit = async (values, revision) => port.commit({
    handle: opened.handle, expectedEpoch: opened.epoch, expectedStoreRevision: revision,
    changes: values.map((value) => ({ op: 'put', key: String(value.id), value })),
  });
  // A commit holds at most 100 changes (MAX_ROWS), as the data layer sends them.
  let revision = opened.storeRevision;
  const all = rows(300);
  let first;
  for (let start = 0; start < all.length; start += 100) {
    first = await commit(all.slice(start, start + 100), revision); // eslint-disable-line no-await-in-loop
    revision = first.storeRevision;
  }
  const second = await commit(rows(300, 1).slice(0, 100), revision);
  const removed = await port.commit({
    handle: opened.handle, expectedEpoch: opened.epoch, expectedStoreRevision: second.storeRevision,
    changes: ['1', '2', '3'].map((key) => ({ op: 'delete', key })),
  });
  const commitPeak = stats.peak;
  const values = [];
  for (let afterKey = null; ;) {
    const page = await port.read({ handle: opened.handle, expectedEpoch: opened.epoch, afterKey, limit: 100 }); // eslint-disable-line no-await-in-loop
    values.push(...page.rows.map((row) => row.value));
    if (!page.nextAfterKey && page.rows.length < 100) break;
    afterKey = page.nextAfterKey ?? page.rows.at(-1).key;
  }
  const byAssignee = await port.query({ handle: opened.handle, expectedEpoch: opened.epoch, limit: 100, index: 'byAssignee', equals: [41] });
  return { first, second, removed, commitPeak, values, byAssignee: byAssignee.rows.map((row) => row.value) };
}

describe('host store commit on an ordered database', () => {
  it('asks the row writes of a commit together, not one request at a time', async () => {
    const { database, stats } = counted({ ordered: true });
    const { first, second, commitPeak } = await writeTwice(database, stats);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    // Rewriting 100 rows (meta read, index deletes and puts, meta, body)
    // once asked one request at a time.
    expect(commitPeak).toBeGreaterThan(100);
  });

  it('commits the same rows and index entries as a database that waits on each request', async () => {
    const ordered = counted({ ordered: true });
    const serial = counted({ ordered: false });
    const a = await writeTwice(ordered.database, ordered.stats);
    const b = await writeTwice(serial.database, serial.stats);
    expect(a.values).toEqual(b.values);
    expect(a.values).toHaveLength(297);
    expect(a.values.find((value) => value.id === 4).note).toBe('v1');
    expect(a.values.find((value) => value.id === 150).note).toBe('v0');
    expect(a.byAssignee).toEqual(b.byAssignee);
    expect(a.removed.ok && b.removed.ok).toBe(true);
    expect(b.commitPeak).toBe(1);
  });
});
