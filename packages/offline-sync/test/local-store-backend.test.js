/**
 * local-store-backend.test.js — the localStorage-backed DataStore backend and
 * the createDataManager default that persists client-owned (`last_write_wins`)
 * stores across a shell reload. Fixes the "MP view settings aren't saved"
 * regression: the default memory backend was wiped on every reload.
 *
 * The package tests run in node (no DOM), so a minimal localStorage stub is
 * installed on globalThis — the backend reads `globalThis.localStorage`.
 */
import {
  describe, it, expect, beforeEach, afterEach, vi,
} from 'vitest';
import {
  createLocalStorageBackend, hasWebStorage, createDataManager, createMemoryStoreBackend,
} from '../src/index.js';
import { databaseName } from '../src/names.js';

/**
 * Database names come from the RESOLVER, not from literals (§8.8 requirement 3,
 * enforced by `sdk check:store-name-literals` — this file was its one standing
 * violation, parked as E.49).
 *
 * The literals it replaces were legitimate test INPUT, not hand-built store
 * names in a code path, so an allowlist entry would have been defensible. Going
 * through the resolver is strictly better: it keeps this test honest if the name
 * scheme ever changes, and it proves the backend is exercised with names the
 * resolver actually produces rather than with a hand-copy of them that could
 * drift silently. The tenant id still varies per case, which is what the
 * cross-tenant-bleed assertion below needs.
 */
const dbFor = (tenantId) => databaseName({ tenantId }, 'scheduling');

function fakeLocalStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    clear: () => { map.clear(); },
  };
}

beforeEach(() => { globalThis.localStorage = fakeLocalStorage(); });
afterEach(() => { delete globalThis.localStorage; });

describe('createLocalStorageBackend', () => {
  it('round-trips get/put/getAll/delete', async () => {
    const b = createLocalStorageBackend(dbFor('team-3'), 'settings');
    expect(await b.getAll()).toEqual([]);

    await b.put('view', { key: 'view', value: { durationType: 'day' } });
    expect(await b.get('view')).toEqual({ key: 'view', value: { durationType: 'day' } });
    expect(await b.getAll()).toHaveLength(1);

    await b.delete('view');
    expect(await b.get('view')).toBeUndefined();
    expect(await b.getAll()).toEqual([]);
  });

  it('persists across a fresh backend for the same (db, store) — survives reload', async () => {
    const first = createLocalStorageBackend(dbFor('team-3'), 'settings');
    await first.put('view', { key: 'view', value: { viewType: 'role', durationType: 'week' } });

    // A new backend instance = the shell reloaded and re-created the store.
    const afterReload = createLocalStorageBackend(dbFor('team-3'), 'settings');
    expect((await afterReload.get('view')).value).toEqual({ viewType: 'role', durationType: 'week' });
  });

  it('scopes storage per (tenant, mp, store) — no cross-tenant bleed', async () => {
    const team3 = createLocalStorageBackend(dbFor('team-3'), 'settings');
    const team9 = createLocalStorageBackend(dbFor('team-9'), 'settings');
    await team3.put('view', { key: 'view', value: { durationType: 'day' } });
    expect(await team9.get('view')).toBeUndefined();
  });

  it('reports a write it could not make, and never reads an unreachable store as empty, when Web Storage has gone away', async () => {
    // This backend is only ever chosen because Web Storage existed when the
    // store was built, so reaching here means it went away mid-session (a
    // WKWebView data store cleared, a permission revoked). A write reports
    // it did not reach storage and keeps nothing (it does not know the rows
    // beside it); a read rejects, so no caller takes the unknown store for
    // an empty one.
    delete globalThis.localStorage;
    expect(hasWebStorage()).toBe(false);
    const b = createLocalStorageBackend(dbFor('team-3'), 'settings');
    const res = await b.put('view', { key: 'view', value: { x: 1 } });
    expect(res).toMatchObject({ ok: false, reason: 'unavailable', retained: false });
    await expect(b.getAll()).rejects.toMatchObject({ code: 'DATA_UNAVAILABLE' });
    await expect(b.get('view')).rejects.toMatchObject({ code: 'DATA_UNAVAILABLE' });
  });

  it('rejects a read of storage that throws, and reads a corrupt blob as empty', async () => {
    globalThis.localStorage = { getItem: () => { throw new Error('SecurityError'); }, setItem() {}, removeItem() {} };
    const b = createLocalStorageBackend(dbFor('team-3'), 'blocked');
    await expect(b.getAll()).rejects.toMatchObject({ code: 'DATA_UNAVAILABLE' });
    await expect(b.delete('view')).resolves.toMatchObject({ ok: false, reason: 'unavailable' });
    const map = new Map([['mp-store:x:corrupt', '{not json']]);
    globalThis.localStorage = { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: (key) => map.delete(key) };
    const corrupt = createLocalStorageBackend('x', 'corrupt');
    await expect(corrupt.getAll()).resolves.toEqual([]);
  });
});

describe('createDataManager default backend selection', () => {
  const token = { tenantId: 'team-3', mpId: 'scheduling' };
  const localData = {
    settings: {
      keyPath: 'key',
      syncStrategy: 'last_write_wins',
      recordSchema: { type: 'object', required: ['key'], properties: { key: { type: 'string' }, value: {} } },
    },
    schedule_cache: {
      keyPath: 'id',
      syncStrategy: 'server_authoritative',
      recordSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
    },
  };

  it('persists last_write_wins stores across a re-created manager; keeps server_authoritative in memory', async () => {
    const first = createDataManager({ capabilityToken: token, mpId: 'scheduling', localData });
    await first.store('settings').put({ key: 'view', value: { durationType: 'day' } });
    await first.store('schedule_cache').put({ id: 's1' });

    // Re-create the manager = a shell reload: new in-memory stores, same localStorage.
    const afterReload = createDataManager({ capabilityToken: token, mpId: 'scheduling', localData });
    expect((await afterReload.store('settings').get('view')).value).toEqual({ durationType: 'day' });
    expect(await afterReload.store('schedule_cache').get('s1')).toBeUndefined(); // memory — gone
  });
});

/**
 * Two tabs over the same Web Storage store: each has its own page (its own
 * module instance, so its own write turns); the origin's Web Locks and the
 * storage itself are shared.
 */
describe('Web Storage stores across tabs', () => {
  const settle = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
  async function tab() {
    vi.resetModules();
    return import('../src/data-store.js');
  }

  it('a delete fenced to a revision never removes an edit another tab wrote since', async () => {
    const tabA = await tab();
    const tabB = await tab();
    const storeIn = (page, backend) => page.createDataStore({ name: 'drafts', keyPath: 'id', syncStrategy: 'last_write_wins', backend });
    const seed = storeIn(tabA, tabA.createLocalStorageBackend(dbFor('team-3'), 'drafts'));
    await seed.put({ id: 'd1', body: 'first' });
    const listed = await seed.get('d1');
    const b = storeIn(tabB, tabB.createLocalStorageBackend(dbFor('team-3'), 'drafts'));
    // Tab B edits the row while tab A is in its fenced delete: right after A
    // reads the row, or before A's one-step compare-and-delete.
    let edit = null;
    const editMeanwhile = async () => {
      if (!edit) { edit = b.put({ id: 'd1', body: 'edited in tab B' }); await settle(30); }
    };
    const inner = tabA.createLocalStorageBackend(dbFor('team-3'), 'drafts');
    const a = storeIn(tabA, {
      ...inner,
      async get(key) { const row = await inner.get(key); await editMeanwhile(); return row; },
      async deleteIf(key, keep) { await editMeanwhile(); return inner.deleteIf(key, keep); },
    });
    const removed = a.delete('d1', { expectedRevision: listed._rev }).then(() => 'deleted', (error) => error.reason);
    await removed;
    await edit;
    const row = await b.get('d1');
    expect(row).toMatchObject({ body: 'edited in tab B', _dirty: true });
  });
});

describe('a pref removed while storage cannot be read', () => {
  it('is not saved: the removal rejects rather than report a removal it could not make', async () => {
    const saved = globalThis.localStorage;
    const kept = new Map();
    let readable = true;
    globalThis.localStorage = {
      getItem: (k) => { if (!readable) throw new Error('SecurityError'); return kept.has(k) ? kept.get(k) : null; },
      setItem: (k, v) => { kept.set(k, String(v)); },
      removeItem: (k) => { kept.delete(k); },
    };
    try {
      const data = createDataManager({ capabilityToken: { tenantId: 'team-48', mpId: 'scheduling' }, mpId: 'scheduling', localData: {} });
      await data.prefs.set('layout', 'grid');
      readable = false;
      await expect(data.prefs.remove('layout')).rejects.toMatchObject({ code: 'DATA_NOT_SAVED' });
      readable = true;
      const reloaded = createDataManager({ capabilityToken: { tenantId: 'team-48', mpId: 'scheduling' }, mpId: 'scheduling', localData: {} });
      await reloaded.prefs.ready();
      expect(reloaded.prefs.get('layout')).toBe('grid');
    } finally { if (saved === undefined) delete globalThis.localStorage; else globalThis.localStorage = saved; }
  });
});

describe('prefs on a store whose reads fail', () => {
  it('answer a removal and a save the store could not read for as not saved, alike', async () => {
    const unreadable = () => { throw Object.assign(new Error('Storage read failed (unavailable)'), { name: 'StorageReadError', reason: 'unavailable' }); };
    const inner = createMemoryStoreBackend();
    const failing = { ...inner, getAll: async () => unreadable(), get: async () => unreadable(), put: async () => unreadable() };
    const data = createDataManager({ capabilityToken: { tenantId: 'team-53', mpId: 'scheduling' }, mpId: 'scheduling', localData: {},
      backendFactory: (_db, storeName) => (storeName === 'prefs' ? failing : createMemoryStoreBackend()) });
    await expect(data.prefs.remove('layout')).rejects.toMatchObject({ code: 'DATA_NOT_SAVED' });
    await expect(data.prefs.set('layout', 'grid')).rejects.toMatchObject({ code: 'DATA_NOT_SAVED' });
  });
});

