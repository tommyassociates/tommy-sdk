import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

  beforeEach(() => { vi.useFakeTimers(); storage = fakeStorage(); });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('a flush after the page\'s window went away still writes, and throws nothing', async () => {
    const page = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
    vi.stubGlobal('window', page);
    const backend = createWebStorageBackend({ storage });
    await backend.put({ runId: 'late', startedAt: 1 });
    delete page.addEventListener;
    delete page.removeEventListener;
    expect(() => vi.advanceTimersByTime(1000)).not.toThrow();
    expect(persisted(storage).map((record) => record.runId)).toEqual(['late']);
  });

  it('loads lazily once and coalesces a burst while reads see pending puts and deletes', async () => {
    storage.setItem('mp-action-records', JSON.stringify([{ runId: 'old', startedAt: 0 }]));
    const get = vi.spyOn(storage, 'getItem');
    const set = vi.spyOn(storage, 'setItem');
    const backend = createWebStorageBackend({ storage });
    expect(get).not.toHaveBeenCalled();
    for (let i = 0; i < 20; i += 1) await backend.put({ runId: `r${i}`, startedAt: i + 1 });
    await backend.delete('old');
    await backend.delete('r0');
    expect(await backend.get('old')).toBeUndefined();
    expect(await backend.get('r0')).toBeUndefined();
    expect(await backend.get('r1')).toEqual({ runId: 'r1', startedAt: 2 });
    expect(await backend.count()).toBe(19);
    expect(await backend.all()).toHaveLength(19);
    expect(get).toHaveBeenCalledTimes(1);
    expect(set).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(set).toHaveBeenCalledTimes(1);
    const reloaded = createWebStorageBackend({ storage });
    expect(await reloaded.count()).toBe(19);
    expect(await reloaded.get('old')).toBeUndefined();
    expect(await reloaded.get('r0')).toBeUndefined();
  });

  it.each(['pagehide', 'visibilitychange'])('flushes synchronously on %s and cancels the timer', async (event) => {
    const window = new EventTarget();
    const document = new EventTarget();
    document.visibilityState = 'visible';
    vi.stubGlobal('window', window);
    vi.stubGlobal('document', document);
    const set = vi.spyOn(storage, 'setItem');
    const backend = createWebStorageBackend({ storage });
    await backend.put({ runId: 'r' });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(set).not.toHaveBeenCalled();
    document.visibilityState = 'hidden';
    (event === 'pagehide' ? window : document).dispatchEvent(new Event(event));
    expect(set).toHaveBeenCalledTimes(1);
    expect(persisted(storage)).toEqual([{ runId: 'r' }]);
    vi.advanceTimersByTime(1000);
    expect(set).toHaveBeenCalledTimes(1);
    await backend.delete('r');
    window.dispatchEvent(new Event('pagehide'));
    expect(persisted(storage)).toEqual([]);
  });

  it('redacts credentials in older rows when rewriting the persisted history', async () => {
    storage.setItem('mp-action-records', JSON.stringify([{ runId: 'old', capabilityTokenId: 'old-secret' }]));
    const backend = createWebStorageBackend({ storage });
    await backend.put({ runId: 'new' });
    vi.advanceTimersByTime(1000);
    expect(storage.getItem('mp-action-records')).not.toContain('old-secret');
    expect(persisted(storage)).toHaveLength(2);
  });

  it('preserves another tab’s writes and deletions when flushing older snapshots', async () => {
    storage.setItem('mp-action-records', JSON.stringify([{ runId: 'old', startedAt: 1 }]));
    const first = createWebStorageBackend({ storage });
    const second = createWebStorageBackend({ storage });
    await first.put({ runId: 'first', startedAt: 2 });
    await second.delete('old');
    vi.advanceTimersByTime(1000);
    await first.put({ runId: 'later', startedAt: 3 });
    await second.put({ runId: 'second', startedAt: 4 });
    vi.advanceTimersByTime(1000);
    expect(persisted(storage).map((row) => row.runId)).toEqual(['first', 'later', 'second']);
  });

  it.each(['getItem', 'setItem'])('retains pending changes after a failed storage %s', async (method) => {
    storage.setItem('mp-action-records', JSON.stringify([{ runId: 'old', startedAt: 1 }]));
    const first = createWebStorageBackend({ storage });
    await first.put({ runId: 'first', startedAt: 2 });
    await first.delete('old');
    const operation = vi.spyOn(storage, method).mockImplementationOnce(() => {
      throw new Error('Storage temporarily unavailable');
    });
    vi.advanceTimersByTime(1000);
    operation.mockRestore();
    expect(persisted(storage).map((row) => row.runId)).toEqual(['old']);
    expect(await first.get('old')).toBeUndefined();

    const otherTab = createWebStorageBackend({ storage });
    await otherTab.put({ runId: 'other-tab', startedAt: 3 });
    vi.advanceTimersByTime(1000);
    await first.put({ runId: 'later', startedAt: 4 });
    vi.advanceTimersByTime(1000);

    expect(persisted(storage).map((row) => row.runId)).toEqual(['first', 'other-tab', 'later']);
  });

  it('keeps capability credentials in session only', async () => {
    const backend = createWebStorageBackend({ storage });
    const record = { runId: 'r', capabilityTokenId: 'signed-secret' };
    await backend.put(record);
    expect(await backend.get('r')).toEqual(record);
    vi.advanceTimersByTime(1000);
    expect(persisted(storage)).toEqual([{ runId: 'r' }]);
    expect(await createWebStorageBackend({ storage }).get('r')).toEqual({ runId: 'r' });
  });

  it('SURVIVES A RELOAD — a second store over the same storage still has the run', async () => {
    const first = makeStore();
    const opened = await first.open({ kind: 'invoke', activityName: 'submit', sourceMpId: 'timesheets', args: { week: 'w1' } });
    await first.update(opened.runId, { status: 'succeeded' });

    vi.advanceTimersByTime(1000);
    const second = makeStore();
    const found = await second.get(opened.runId);
    expect(found).toBeDefined();
    expect(found.activityName).toBe('submit');
    expect(found.status).toBe('succeeded');
  });

  it('NEVER persists args, result or payload — the record is diagnostics, not the write', async () => {
    const store = makeStore();
    const opened = await store.open({ kind: 'invoke', activityName: 'verify_kiosk_pin', sourceMpId: 'time-clock', args: { pin: '4321' } });
    await store.update(opened.runId, { status: 'succeeded', result: { token: 'secret' } });

    vi.advanceTimersByTime(1000);
    const raw = storage.getItem('mp-action-records');
    expect(raw).not.toContain('4321');
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
    vi.advanceTimersByTime(1000);
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
    expect(() => vi.advanceTimersByTime(1000)).not.toThrow();
    expect((await quota.get(q.runId)).activityName).toBe('b');
  });

  it('an explicit backend still wins — the self-detecting default is a default, not a lock', async () => {
    const store = createRecordStore({ backend: createMemoryBackend() });
    const opened = await store.open({ kind: 'invoke', activityName: 'a', sourceMpId: 'm' });
    expect(await store.get(opened.runId)).toBeDefined();
    expect(storage.getItem('mp-action-records')).toBeNull();
  });
});
