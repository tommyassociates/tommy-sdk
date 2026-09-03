/**
 * persist-failure-contract.test.js — mp-store-quota-guard review findings F2 and
 * F5, pinned at the level they were found.
 *
 * The retain contract is: a write that does not reach disk still leaves the row
 * READABLE for the session, flagged `_persistFailed`, and the caller is told. The
 * review found two places where that promise quietly did not hold.
 */
import { describe, it, expect } from 'vitest';
import { createDataStore, createMemoryStoreBackend } from '../src/data-store.js';

/** A backend that keeps rows but reports every write as never reaching disk. */
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
    // The row IS in the store; the put rejected because it did not reach disk.
    // Skipping it left it out of `incoming`, so the prune below then deleted it
    // as absent — on the one path (a durable cache under storage pressure) where
    // the failure is most likely at scale.
    const store = createDataStore({
      name: 'grid', keyPath: 'id', backend: unpersistableBackend(),
    });
    const res = await store.reconcile([{ id: 'a' }, { id: 'b' }], { scope: () => true });
    const ids = (await store.getAll()).map((r) => r.id).sort();
    expect(ids).toEqual(['a', 'b']);
    expect(res.pruned).toBe(0);
  });

  it('still drops a record the SCHEMA rejected, which really is not there', async () => {
    // The distinction the fix rests on: a schema failure means nothing was
    // written, so the row is genuinely absent and the prune is correct.
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
    // An unsynced drafts store is all-dirty by definition, so `enforceRowCap`
    // can evict nothing and `residentCount` stays above `maxRows` forever. Every
    // later put used to pay a full getAll() that could not help.
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
    // ⚠ SILENT PUTS. `notify` takes its own `getAll()` snapshot for subscribers,
    // so a plain put walks the store once for reasons that have nothing to do
    // with the cap. Counting both together measured the notify path and called it
    // the cap — the first version of this test failed for that reason alone.
    const put = (id) => store.put({ id }, { silent: true });
    await put('1');
    await put('2');
    await put('3');                        // over the cap; nothing clean to evict
    expect(walks).toBe(1);                 // exactly one cap walk, and it found nothing
    await put('4');
    await put('5');
    expect(walks).toBe(1);                 // the latch held: no further walks

    // markSynced clears _dirty, which makes a row evictable again — the cap must
    // come back to life rather than stay latched off for the store's lifetime.
    await store.markSynced('1');
    await put('6');
    expect(walks).toBe(2);
    expect((await store.getAll()).map((r) => r.id)).not.toContain('1');
  });

  it('never evicts a dirty row to satisfy the cap', async () => {
    // The reason saturation exists at all: unsent work outranks the cap.
    const store = createDataStore({
      name: 'drafts', keyPath: 'id', backend: createMemoryStoreBackend(), maxRows: 1,
    });
    await store.put({ id: '1' });
    await store.put({ id: '2' });
    expect((await store.getAll()).length).toBe(2);
  });
});
