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
  describe, it, expect, beforeEach, afterEach,
} from 'vitest';
import { createLocalStorageBackend, hasWebStorage, createDataManager } from '../src/index.js';
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

  it('RETAINS the row and reports failure when Web Storage has gone away', async () => {
    // This backend is only ever chosen because Web Storage existed when the
    // store was built, so reaching here means it went away mid-session (a
    // WKWebView data store cleared, a permission revoked). It used to answer
    // `{ ok: true }` and drop the write — a silent loss with a success result,
    // the very shape the quota path was written to end (review finding F4).
    // The row is now held for the session and the caller is told; only the
    // BACKEND stays throw-free, and DataStore turns the report into a
    // PersistError for the surface above it.
    delete globalThis.localStorage;
    expect(hasWebStorage()).toBe(false);
    const b = createLocalStorageBackend(dbFor('team-3'), 'settings');
    const res = await b.put('view', { key: 'view', value: { x: 1 } });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('unavailable');
    expect(await b.getAll()).toEqual([{ key: 'view', value: { x: 1 } }]);
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
