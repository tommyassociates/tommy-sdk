import { describe, it, expect } from 'vitest';
import { createDataStore, createMemoryStoreBackend } from '../src/data-store.js';

function unpersistableBackend() {
  const inner = createMemoryStoreBackend();
  return {
    get: (k) => inner.get(k),
    getAll: () => inner.getAll(),
    delete: (k) => inner.delete(k),
    keys: () => inner.keys(),
    async put(k, r) { await inner.put(k, r); return { ok: false, reason: 'quota' }; },
  };
}

describe('F2 — reconcile must not prune a row it only failed to PERSIST', () => {
  it('keeps an unpersisted row instead of deleting it microseconds later', async () => {
    const store = createDataStore({
      name: 'grid', keyPath: 'id', backend: unpersistableBackend(),
    });
    const res = await store.reconcile([{ id: 'a' }, { id: 'b' }], { scope: () => true });
    const ids = (await store.getAll()).map((r) => r.id).sort();
    expect(ids).toEqual(['a', 'b']);
    expect(res.pruned).toBe(0);
  });

  it('still drops a record the SCHEMA rejected, which really is not there', async () => {
    const store = createDataStore({
      name: 'grid',
      keyPath: 'id',
      recordSchema: {
        type: 'object', required: ['id'], additionalProperties: false, properties: { id: { type: 'string' } },
      },
    });
    await store.reconcile([{ id: 'a' }], { scope: () => true });
    await store.reconcile([{ id: 'a' }, { id: 'b', bogus: true }], { scope: () => true });
    const ids = (await store.getAll()).map((r) => r.id).sort();
    expect(ids).toEqual(['a']);
  });
});

describe('F5 — a saturated row cap stops walking the store on every write', () => {
  it('does not re-walk once nothing is evictable, and resumes when something is', async () => {
    const inner = createMemoryStoreBackend();
    let walks = 0;
    const counting = {
      get: (k) => inner.get(k),
      put: (k, r) => inner.put(k, r),
      delete: (k) => inner.delete(k),
      keys: () => inner.keys(),
      async getAll() { walks += 1; return inner.getAll(); },
    };
    const store = createDataStore({
      name: 'drafts', keyPath: 'id', backend: counting, maxRows: 2,
    });
    const put = (id) => store.put({ id }, { silent: true });
    await put('1');
    await put('2');
    await put('3');
    expect(walks).toBe(1);
    await put('4');
    await put('5');
    expect(walks).toBe(1);

    await store.markSynced('1');
    await put('6');
    expect(walks).toBe(2);
    expect((await store.getAll()).map((r) => r.id)).not.toContain('1');
  });

  it('never evicts a dirty row to satisfy the cap', async () => {
    const store = createDataStore({
      name: 'drafts', keyPath: 'id', backend: createMemoryStoreBackend(), maxRows: 1,
    });
    await store.put({ id: '1' });
    await store.put({ id: '2' });
    expect((await store.getAll()).length).toBe(2);
  });
});

function undeletableBackend() {
  const inner = createMemoryStoreBackend();
  return {
    get: (k) => inner.get(k),
    getAll: () => inner.getAll(),
    put: (k, r) => inner.put(k, r),
    keys: () => inner.keys(),
    async delete(k) { await inner.delete(k); return { ok: false, reason: 'unavailable' }; },
  };
}

describe('QG-R3-2 — a failed eviction must not abort the reconcile around it', () => {
  it('completes the reconcile, notifies once, and returns full counts', async () => {
    const store = createDataStore({
      name: 'grid', keyPath: 'id', backend: undeletableBackend(),
    });
    await store.reconcile([{ id: 'a' }, { id: 'b' }], { scope: () => true });

    let notifications = 0;
    store.subscribe(() => { notifications += 1; });
    notifications = 0;

    const res = await store.reconcile([{ id: 'a' }], { scope: () => true });

    expect(res.pruned).toBe(1);
    expect(res.upserted).toBe(1);
    expect(notifications).toBe(1);
  });

  it('still surfaces a delete failure to a caller who asked for the delete', async () => {
    const store = createDataStore({
      name: 'grid', keyPath: 'id', backend: undeletableBackend(),
    });
    await store.put({ id: 'a' });
    await expect(store.delete('a')).rejects.toThrow();
  });
});
