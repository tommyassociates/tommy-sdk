/**
 * A Mini Program's `tommy.data.store(name).put` may be conditional through
 * declarative options only: `ifAbsent` writes only while no row has the key,
 * `expectedRevision` only while the row is still that revision; either leaves
 * the row as it was and resolves undefined otherwise. Only a store that
 * judges the condition inside its revision-checked commit (a host-store
 * collection) takes one; on any other store the put rejects
 * CONDITIONAL_WRITE_UNSUPPORTED and writes nothing. A declined put records
 * no change. A host-only `when` never passes.
 */
import { describe, it, expect } from 'vitest';
import { createMemoryStoreBackend } from '../src/data-store.js';
import { createDataManager } from '../src/manager.js';

// A host-store-shaped (transactional) backend over a Map with one revision.
function transactionalBackend() {
  const rows = new Map();
  let revision = 0;
  const copy = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
  const page = () => ({ epoch: 1, storeRevision: revision, rows: [...rows].map(([key, value]) => ({ key, value: copy(value) })), nextKey: null });
  return {
    transactional: true,
    policy: 'authored',
    limits: { maxRows: 1000, maxAgeMs: null, maxBytes: null },
    async snapshot(keys) { return { epoch: 1, storeRevision: revision, rows: keys.filter((key) => rows.has(key)).map((key) => ({ key, value: copy(rows.get(key)) })) }; },
    async get(key) { return copy(rows.get(String(key))); },
    async getAll() { return [...rows.values()].map(copy); },
    async page() { return page(); },
    async commit(snapshot, changes) {
      if (snapshot.storeRevision !== revision) return { ok: false, reason: 'conflict' };
      changes.forEach(({ op, key, value }) => { if (op === 'delete') rows.delete(key); else rows.set(key, copy(value)); });
      revision += 1;
      return { ok: true, epoch: 1, storeRevision: revision };
    },
    async close() {},
  };
}

const manager = (backendFactory = () => transactionalBackend()) => createDataManager({
  capabilityToken: { tenantId: 'team-3', mpId: 'claim-mp' }, mpId: 'claim-mp',
  localData: { settings: { keyPath: 'key', syncStrategy: 'last_write_wins' } },
  backendFactory,
});

describe('a Mini Program\'s conditional put', () => {
  it('ifAbsent claims a key once; a second claim leaves the first', async () => {
    const store = manager().store('settings');
    expect(await store.put({ key: 'slot', value: 'a' }, { ifAbsent: true })).toBe('slot');
    expect(await store.put({ key: 'slot', value: 'b' }, { ifAbsent: true })).toBeUndefined();
    expect((await store.get('slot')).value).toBe('a');
  });

  it('expectedRevision writes only over that revision', async () => {
    const store = manager().store('settings');
    await store.put({ key: 'slot', value: 'a' });
    const first = await store.get('slot');
    await store.put({ key: 'slot', value: 'b' });
    expect(await store.put({ key: 'slot', value: 'stale' }, { expectedRevision: first._rev })).toBeUndefined(); // eslint-disable-line no-underscore-dangle
    const now = await store.get('slot');
    expect(now.value).toBe('b');
    expect(await store.put({ key: 'slot', value: 'c' }, { expectedRevision: now._rev })).toBe('slot'); // eslint-disable-line no-underscore-dangle
    expect((await store.get('slot')).value).toBe('c');
  });

  it('a store that cannot judge a condition in its commit refuses a conditional put and writes nothing', async () => {
    const store = manager(() => createMemoryStoreBackend()).store('settings');
    await expect(store.put({ key: 'slot', value: 'a' }, { ifAbsent: true })).rejects.toMatchObject({ code: 'CONDITIONAL_WRITE_UNSUPPORTED' });
    await expect(store.put({ key: 'slot', value: 'a' }, { expectedRevision: 1 })).rejects.toMatchObject({ code: 'CONDITIONAL_WRITE_UNSUPPORTED' });
    expect(await store.get('slot')).toBeFalsy();
    expect(await store.put({ key: 'slot', value: 'plain' })).toBe('slot');
  });

  it('a declined put records no change: a server answer read meanwhile is still taken', async () => {
    const mgr = manager();
    const store = mgr.store('settings');
    await store.put({ key: 'slot', value: 'held' });
    let answer;
    const reading = mgr.record('settings', { fetch: () => new Promise((done) => { answer = done; }) }).get('slot', { refresh: true });
    await new Promise((done) => { setTimeout(done, 0); });
    // A claim that loses to the existing row writes nothing while the read is on its way.
    expect(await store.put({ key: 'slot', value: 'claim' }, { ifAbsent: true })).toBeUndefined();
    answer({ key: 'slot', value: 'from server' });
    expect((await reading).value).toBe('from server');
  });

  it('a host-only when never passes', async () => {
    const store = manager().store('settings');
    expect(await store.put({ key: 'slot', value: 'a' }, { when: () => false })).toBe('slot');
  });
});
