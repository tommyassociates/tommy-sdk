/**
 * data-store.js — the DataStore behind `tommy.data.store(name)`
 * (sdk-types.ts DataStore/DataApi; offline-sync.md §1/§4).
 *
 * The MP never touches raw IndexedDB: this wrapper enforces the manifest
 * `recordSchema` on every put, stamps sync metadata `{_rev, _updatedAt,
 * _dirty}` (+ `_dedupeKey` when supplied — the fabric's per-write identity),
 * and provides the whole-store `subscribe` plus the additive selector
 * `subscribeQuery` (fires only when an entity the selector read changes).
 *
 * Backends are injected: MemoryBackend for tests/node, an IndexedDB backend
 * in the shell. Store creation/upgrade from the manifest is the manager's job.
 */
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

export function createMemoryStoreBackend() {
  const rows = new Map();
  return {
    async get(key) { return rows.get(key); },
    async getAll() { return [...rows.values()]; },
    async put(key, record) { rows.set(key, record); },
    async delete(key) { rows.delete(key); },
    keys() { return [...rows.keys()]; },
  };
}

/** The runtime's Web Storage (localStorage), or null when there is none
 *  (node, or access throws in a sandboxed/locked-down context). */
function webStorage() {
  try {
    return (typeof globalThis !== 'undefined' && globalThis.localStorage) || null;
  } catch (_) {
    return null;
  }
}

/** Whether this runtime can persist a store across a reload (has Web Storage). */
export function hasWebStorage() {
  return !!webStorage();
}

/**
 * A localStorage-backed store backend — the same async contract as
 * createMemoryStoreBackend, but the whole store PERSISTS across a shell reload
 * under a stable `mp-store:{dbName}:{storeName}` key. Sized for small
 * client-owned stores (manifest `syncStrategy: last_write_wins`, e.g. an MP's
 * `settings`): the whole store is a single JSON blob. Reads/writes degrade to
 * empty (never throw) when storage is absent, corrupt, or over quota.
 */
export function createLocalStorageBackend(dbName, storeName) {
  const storeKey = `mp-store:${dbName}:${storeName}`;
  function load() {
    const store = webStorage();
    if (!store) return new Map();
    try {
      const raw = store.getItem(storeKey);
      return raw ? new Map(Object.entries(JSON.parse(raw))) : new Map();
    } catch (_) {
      return new Map(); // corrupt/unavailable — behave as empty, never throw
    }
  }
  function save(map) {
    const store = webStorage();
    if (!store) return;
    try {
      store.setItem(storeKey, JSON.stringify(Object.fromEntries(map)));
    } catch (_) {
      /* quota / disabled — degrade to in-memory-until-reload */
    }
  }
  return {
    async get(key) { return load().get(String(key)); },
    async getAll() { return [...load().values()]; },
    async put(key, record) { const map = load(); map.set(String(key), record); save(map); },
    async delete(key) { const map = load(); map.delete(String(key)); save(map); },
    keys() { return [...load().keys()]; },
  };
}

export function createDataStore({ name, keyPath = 'id', recordSchema, backend = createMemoryStoreBackend(), now = () => Date.now() }) {
  const validate = recordSchema ? ajv.compile(recordSchema) : null;
  const wholeStoreSubscribers = new Set();
  const selectorSubscribers = new Set(); // {selector, handler, touched:Set, last}

  const keyOf = (record) => record[keyPath];

  /** Drop the sync-metadata stamps (_rev/_dirty/_updatedAt/_dedupeKey) so a read
   *  returns clean, re-put-safe domain rows. */
  const stripMeta = (record) => Object.fromEntries(
    Object.entries(record).filter(([key]) => !key.startsWith('_')),
  );

  async function snapshot() { return backend.getAll(); }

  function trackedQuery(records, touched) {
    const byKey = new Map(records.map((r) => [keyOf(r), r]));
    return {
      get(key) { touched.add(key); return byKey.get(key); },
      getAll() { touched.add('*'); return records; },
    };
  }

  /**
   * Fan a change out to subscribers. `changed` is ONE key or an iterable of
   * them — reconcile passes the whole batch so a merge of N records wakes
   * every subscriber exactly once instead of N times (see reconcile below).
   */
  async function notify(changed) {
    const changedKeys = (changed && typeof changed !== 'string' && typeof changed[Symbol.iterator] === 'function')
      ? new Set(changed)
      : new Set([changed]);
    const records = await snapshot();
    for (const handler of wholeStoreSubscribers) {
      try { handler(records); } catch (_) { /* subscriber errors are theirs */ }
    }
    for (const sub of selectorSubscribers) {
      if (!sub.touched.has('*') && ![...changedKeys].some((k) => sub.touched.has(k))) continue;
      const touched = new Set();
      const value = sub.selector(trackedQuery(records, touched));
      sub.touched = touched;
      if (JSON.stringify(value) !== JSON.stringify(sub.last)) {
        sub.last = value;
        try { sub.handler(value); } catch (_) { /* theirs */ }
      }
    }
  }

  const api = {
    async get(key) {
      return backend.get(key);
    },
    async getAll() {
      return snapshot();
    },
    /** Cache-read half of SWR: the stored records matching `predicate(record)`,
     *  meta stamps stripped (clean domain rows). Sorting is the caller's job. */
    async readWhere(predicate = () => true) {
      return (await snapshot()).filter(predicate).map(stripMeta);
    },
    async put(record, { dedupeKey, silent = false } = {}) {
      if (validate && !validate(record)) {
        const detail = (validate.errors || []).map((e) => `${e.instancePath || '$'} ${e.message}`).join('; ');
        throw new Error(`store '${name}': record failed recordSchema: ${detail}`);
      }
      const key = keyOf(record);
      if (key === undefined) throw new Error(`store '${name}': record missing keyPath '${keyPath}'`);
      const previous = await backend.get(key);
      const stamped = {
        ...record,
        _rev: (previous?._rev || 0) + 1,
        _updatedAt: new Date(now()).toISOString(),
        _dirty: true,
        ...(dedupeKey ? { _dedupeKey: dedupeKey } : {}),
      };
      await backend.put(key, stamped);
      if (!silent) await notify(key);
      return key;
    },
    async delete(key, { silent = false } = {}) {
      await backend.delete(key);
      if (!silent) await notify(key);
    },
    /** Sync engine hook: clear _dirty after a successful push. */
    async markSynced(key) {
      const record = await backend.get(key);
      if (record) await backend.put(key, { ...record, _dirty: false });
    },
    /**
     * SWR reconcile — merge a fresh AUTHORITATIVE set of records into the store,
     * the read-through pattern every windowed MP grid needs: upsert each record
     * and mark it synced (it came from the server, not a local edit), then prune
     * rows the fresh set dropped. Two invariants baked in so each MP can't get
     * them subtly wrong: locally-dirty (unsynced/optimistic) rows are NEVER
     * pruned, and only rows matching `scope` are prune-candidates (e.g. "in this
     * window") — omit `scope` for a whole-store authoritative replace. Returns
     * `{ upserted, pruned }`.
     */
    async reconcile(records = [], { scope } = {}) {
      const existing = await backend.getAll();
      const incoming = new Set();
      // ONE notify for the whole merge, at the end. Per-record notifies made a
      // reconcile of N rows wake every subscriber N times, each with a
      // partially-merged snapshot — so an instant-data surface repainted N
      // times on a single revalidate, and anything its render kicks off (the
      // Forms activity pane's per-subject reads) ran N times over a list that
      // grew by one row each pass. Quadratic, and every intermediate paint was
      // a lie about the store's contents.
      const changed = new Set();
      for (const record of records) {
        let key;
        try {
          // eslint-disable-next-line no-await-in-loop
          key = await api.put(record, { silent: true });
        } catch (_) {
          // ONE record that fails `recordSchema` must not cost the whole merge.
          // The throw used to abort the loop mid-way, which still left the
          // records before it in the store (each had already notified on its
          // own put); with a single notify at the end, an abort would paint
          // NOTHING — a surface going blank because row 12 of 31 had a number
          // where the schema wants a string. Skip it and merge the rest.
          continue;
        }
        // eslint-disable-next-line no-await-in-loop
        await api.markSynced(key);
        incoming.add(String(key));
        changed.add(key);
      }
      let pruned = 0;
      for (const row of existing) {
        const key = keyOf(row);
        if (incoming.has(String(key)) || row._dirty) continue; // kept: fresh or optimistic
        if (scope && !scope(row)) continue; // out of the reconcile scope
        // eslint-disable-next-line no-await-in-loop
        await api.delete(key, { silent: true });
        changed.add(key);
        pruned += 1;
      }
      if (changed.size) await notify(changed);
      return { upserted: incoming.size, pruned };
    },
    subscribe(handler) {
      wholeStoreSubscribers.add(handler);
      return () => wholeStoreSubscribers.delete(handler);
    },
    subscribeQuery(selector, handler) {
      const sub = { selector, handler, touched: new Set(['*']), last: undefined };
      // Prime: compute initial value + touched set without firing the handler.
      snapshot().then((records) => {
        const touched = new Set();
        sub.last = selector(trackedQuery(records, touched));
        sub.touched = touched;
      });
      selectorSubscribers.add(sub);
      return () => selectorSubscribers.delete(sub);
    },
  };
  return api;
}
