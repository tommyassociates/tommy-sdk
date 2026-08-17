/**
 * D.43 — the run-record store survives a reload, REDACTED.
 *
 * This store is the one that spent the platform's whole life documenting a
 * shell-supplied IndexedDB backend nobody ever passed, so the tests that matter
 * are (a) the default picks itself when storage exists, and (b) what it writes
 * carries no tenant payload.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createRecordStore, createWebStorageBackend, createMemoryBackend } from '../src/index.js';

function fakeStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    _raw: data,
  };
}

const persisted = (storage) => JSON.parse(storage.getItem('mp-action-records') || '[]');

describe('D.43 — durable, redacted run records', () => {
  let storage;
  const makeStore = () => createRecordStore({ backend: createWebStorageBackend({ storage }) });

  beforeEach(() => { storage = fakeStorage(); });

  it('SURVIVES A RELOAD — a second store over the same storage still has the run', async () => {
    const first = makeStore();
    const opened = await first.open({ kind: 'invoke', activityName: 'submit', sourceMpId: 'timesheets', args: { week: 'w1' } });
    await first.update(opened.runId, { status: 'succeeded' });

    const second = makeStore();               // the reload
    const found = await second.get(opened.runId);
    expect(found).toBeDefined();
    expect(found.activityName).toBe('submit');
    expect(found.status).toBe('succeeded');
  });

  it('NEVER persists args, result or payload — the record is diagnostics, not the write', async () => {
    const store = makeStore();
    const opened = await store.open({ kind: 'invoke', activityName: 'verify_kiosk_pin', sourceMpId: 'time-clock', args: { pin: '4321' } });
    await store.update(opened.runId, { status: 'succeeded', result: { token: 'secret' } });

    const raw = storage.getItem('mp-action-records');
    expect(raw).not.toContain('4321');        // the PIN never reaches disk
    expect(raw).not.toContain('secret');
    for (const row of persisted(storage)) {
      expect(row).not.toHaveProperty('args');
      expect(row).not.toHaveProperty('result');
    }
  });

  it('IN-SESSION fidelity is untouched — the memory tier still returns args and result', async () => {
    const store = makeStore();
    const opened = await store.open({ kind: 'invoke', activityName: 'submit', sourceMpId: 'timesheets', args: { week: 'w1' } });
    const updated = await store.update(opened.runId, { status: 'succeeded', result: { ok: true } });

    expect(updated.result).toEqual({ ok: true });
    expect((await store.get(opened.runId)).args).toEqual({ week: 'w1' });
  });

  it('the persisted history is BOUNDED — oldest first out', async () => {
    const backend = createWebStorageBackend({ storage, max: 3 });
    const store = createRecordStore({ backend });
    for (let i = 0; i < 6; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await store.open({ kind: 'invoke', activityName: `a${i}`, sourceMpId: 'timesheets' });
    }
    expect(persisted(storage)).toHaveLength(3);
    expect(persisted(storage).map((r) => r.activityName)).toEqual(['a3', 'a4', 'a5']);
  });

  it('degrades rather than throws — absent, corrupt and over-quota storage all keep working', async () => {
    expect(() => createWebStorageBackend({ storage: null })).not.toThrow();

    const corrupt = fakeStorage();
    corrupt.setItem('mp-action-records', 'not json');
    const store = createRecordStore({ backend: createWebStorageBackend({ storage: corrupt }) });
    const opened = await store.open({ kind: 'invoke', activityName: 'a', sourceMpId: 'm' });
    expect((await store.get(opened.runId)).activityName).toBe('a');

    const full = { getItem: () => null, setItem: () => { throw new Error('QuotaExceeded'); } };
    const quota = createRecordStore({ backend: createWebStorageBackend({ storage: full }) });
    const q = await quota.open({ kind: 'invoke', activityName: 'b', sourceMpId: 'm' });
    expect((await quota.get(q.runId)).activityName).toBe('b'); // still in the memory tier
  });

  it('an explicit backend still wins — the self-detecting default is a default, not a lock', async () => {
    const store = createRecordStore({ backend: createMemoryBackend() });
    const opened = await store.open({ kind: 'invoke', activityName: 'a', sourceMpId: 'm' });
    expect(await store.get(opened.runId)).toBeDefined();
    expect(storage.getItem('mp-action-records')).toBeNull(); // nothing written
  });
});
