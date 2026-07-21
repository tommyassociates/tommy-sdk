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
    const b = createLocalStorageBackend('tommy-mp:team-3:scheduling', 'settings');
    expect(await b.getAll()).toEqual([]);

    await b.put('view', { key: 'view', value: { durationType: 'day' } });
    expect(await b.get('view')).toEqual({ key: 'view', value: { durationType: 'day' } });
    expect(await b.getAll()).toHaveLength(1);

    await b.delete('view');
    expect(await b.get('view')).toBeUndefined();
    expect(await b.getAll()).toEqual([]);
  });

  it('persists across a fresh backend for the same (db, store) — survives reload', async () => {
    const first = createLocalStorageBackend('tommy-mp:team-3:scheduling', 'settings');
    await first.put('view', { key: 'view', value: { viewType: 'role', durationType: 'week' } });

    // A new backend instance = the shell reloaded and re-created the store.
    const afterReload = createLocalStorageBackend('tommy-mp:team-3:scheduling', 'settings');
    expect((await afterReload.get('view')).value).toEqual({ viewType: 'role', durationType: 'week' });
  });

  it('scopes storage per (tenant, mp, store) — no cross-tenant bleed', async () => {
    const team3 = createLocalStorageBackend('tommy-mp:team-3:scheduling', 'settings');
    const team9 = createLocalStorageBackend('tommy-mp:team-9:scheduling', 'settings');
    await team3.put('view', { key: 'view', value: { durationType: 'day' } });
    expect(await team9.get('view')).toBeUndefined();
  });

  it('degrades to empty (never throws) when there is no Web Storage', async () => {
    delete globalThis.localStorage;
    expect(hasWebStorage()).toBe(false);
    const b = createLocalStorageBackend('tommy-mp:team-3:scheduling', 'settings');
    await b.put('view', { key: 'view', value: { x: 1 } }); // no-op, must not throw
    expect(await b.getAll()).toEqual([]);
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
