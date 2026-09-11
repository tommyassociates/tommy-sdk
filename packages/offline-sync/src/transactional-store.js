/** Durable branch of DataStore. The injected backend owns physical CAS/epochs. */
export class StorageReadError extends Error {
  constructor(reason) { super(`Storage read failed (${reason})`); this.name = 'StorageReadError'; this.reason = reason; }
}
const strip = (row) => Object.fromEntries(Object.entries(row).filter(([key]) => !key.startsWith('_')));
const copy = (row) => {
  if (row === undefined) return undefined;
  const seen = new Set();
  function check(value) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
    if (typeof value === 'number' && Number.isFinite(value)) return;
    if (!value || typeof value !== 'object' || seen.has(value) || Object.getOwnPropertySymbols(value).length) throw new StorageReadError('unserializable');
    const prototype = Object.getPrototypeOf(value);
    if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) throw new StorageReadError('unserializable');
    seen.add(value);
    if (Array.isArray(value)) { for (let i = 0; i < value.length; i += 1) { if (!Object.hasOwn(value, i)) throw new StorageReadError('unserializable'); check(value[i]); } }
    else Object.values(value).forEach(check);
    seen.delete(value);
  }
  check(row);
  return JSON.parse(JSON.stringify(row));
};
export function assertCompleteSet(rows, { maxRows = 1000, maxBytes = 8 * 1024 * 1024 } = {}) {
  if (!Array.isArray(rows) || rows.length > maxRows) throw new StorageReadError('scan-required');
  let bytes = 2;
  const encoder = new TextEncoder();
  for (const row of rows) {
    const json = JSON.stringify(row);
    if (typeof json !== 'string') throw new StorageReadError('unserializable');
    bytes += encoder.encode(json).byteLength + 1;
    if (bytes > maxBytes) throw new StorageReadError('scan-required');
  }
}
const keyString = (key) => String(key);
const nextRevision = (value = 0) => { if (!Number.isSafeInteger(value) || value < 0 || value >= Number.MAX_SAFE_INTEGER) throw new StorageReadError('write-failed'); return value + 1; };

export function createTransactionalDataStore({ name, keyPath, backend, validate, paintable, now, PersistError, onPersistError, maxWindows }) {
  let retired = false;
  let tail = Promise.resolve();
  const subscribers = new Set();
  const queries = new Set();
  let publication = 0;
  const cursors = new Map();
  let cursorSequence = 0;
  const cursorOwner = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  const windows = new Map();
  const live = () => { if (retired) throw new StorageReadError('retired'); };
  const exclusive = (operation) => {
    const result = tail.then(() => { live(); return operation(); });
    tail = result.catch(() => {});
    return result;
  };
  function validateRecord(row) {
    if (validate && !validate(row)) return (validate.errors || []).map((error) => `${error.instancePath || '$'} ${error.message}`).join('; ');
    if (row?.[keyPath] === undefined) return `record missing keyPath '${keyPath}'`;
    return null;
  }
  function requiredRecord(row) { const reason = validateRecord(row); if (reason) throw new Error(`store '${name}': record failed recordSchema: ${reason}`); }
  function failure(result, key) {
    try { onPersistError?.({ event: 'persist_failed', store: name, key, ...result }); } catch (_) { /* reporting cannot change commit truth */ }
    throw new PersistError(name, { retained: false, ...result });
  }
  async function mutation(keys, transform, { retry = false } = {}) {
    for (let attempt = 0; attempt < (retry ? 3 : 1); attempt += 1) {
      live();
      let snapshot;
      try { snapshot = await backend.snapshot(keys); } catch (error) { failure({ reason: error.reason || 'read-failed', retained: false }, keys[0]); }
      const previous = new Map(snapshot.rows.map((row) => [row.key, row.value]));
      const changes = transform(previous);
      if (!changes.length) return;
      const result = await backend.commit(snapshot, changes);
      live();
      if (result.ok !== false) return;
      if (result.reason !== 'conflict' || !retry || attempt === 2) failure(result, keys[0]);
    }
  }
  async function notify() {
    live();
    publication += 1;
    if (!queries.size && !subscribers.size) return;
    let rows;
    try { rows = (await backend.getAll()).filter(paintable); } catch (error) {
      for (const query of queries) { try { query.onError?.(error); } catch (_) { /* isolated consumer */ } }
      return;
    }
    if (retired) return;
    // Keep the existing complete-array callback. A failed bounded read skips
    // publication and never turns the committed operation into a failed write.
    for (const handler of subscribers) { try { handler(rows.map(copy)); } catch (_) { /* isolated consumer */ } }
    for (const query of queries) {
      try {
        const value = query.selector({ get: (key) => rows.find((row) => keyString(row[keyPath]) === keyString(key)), getAll: () => rows, readWhere: (predicate) => rows.filter(predicate) });
        const encoded = JSON.stringify(value);
        if (encoded !== query.previous) { query.previous = encoded; query.handler(value); }
      } catch (_) { /* isolated consumer */ }
    }
  }
  async function scan(options, raw) {
    live();
    if (!options || Object.keys(options).some((key) => !['cursor', 'limit'].includes(key))
      || !Object.hasOwn(options, 'cursor') || !Number.isInteger(options.limit) || options.limit < 1 || options.limit > 100) throw new StorageReadError('unserializable');
    const held = options.cursor === null ? null : cursors.get(options.cursor);
    if (options.cursor !== null && (!held || held.raw !== raw)) throw new StorageReadError('retired');
    const result = await backend.page({ afterKey: held?.afterKey || null, limit: options.limit });
    live();
    if (held && (result.epoch !== held.epoch || result.storeRevision !== held.revision)) { cursors.delete(options.cursor); throw new StorageReadError('conflict'); }
    if (options.cursor !== null) cursors.delete(options.cursor);
    let nextCursor = null;
    if (result.nextKey !== null) {
      if (cursors.size >= 20) throw new StorageReadError('payload-capacity');
      cursorSequence += 1;
      nextCursor = `${cursorOwner}:scan-${cursorSequence}`;
      cursors.set(nextCursor, { afterKey: result.nextKey, epoch: result.epoch, revision: result.storeRevision, raw });
    }
    return { rows: result.rows.map((row) => row.value).filter((row) => raw || paintable(row)).map(copy), nextCursor, complete: nextCursor === null };
  }
  const api = {
    name,
    validateRecord,
    async get(key) { live(); const row = await backend.get(keyString(key)); live(); return paintable(row) ? copy(row) : undefined; },
    async getRaw(key) { live(); const row = await backend.get(keyString(key)); live(); return copy(row); },
    async getAll() { live(); const rows = await backend.getAll(); live(); return rows.filter(paintable).map(copy); },
    async getAllRaw() { live(); const rows = await backend.getAll(); live(); return rows.map(copy); },
    async readWhere(predicate = () => true) { return (await api.getAll()).filter(predicate).map(strip); },
    scan: (options) => scan(options, false),
    scanRaw: (options) => scan(options, true),
    async put(record, { dedupeKey, silent = false } = {}) {
      requiredRecord(record);
      const submitted = copy(record);
      const key = keyString(record[keyPath]);
      return exclusive(async () => {
        await mutation([key], (rows) => {
          const previous = rows.get(key);
          const stamped = { ...submitted, ...(previous?._window != null ? { _window: previous._window } : {}), _rev: nextRevision(previous?._rev), _dirty: true, _updatedAt: new Date(now()).toISOString(), ...(dedupeKey ? { _dedupeKey: dedupeKey } : {}) };
          return [{ op: 'put', key, value: stamped }];
        }, { retry: true });
        if (!silent) await notify();
        return record[keyPath];
      });
    },
    delete(key, { silent = false, expectedRevision } = {}) {
      return exclusive(async () => {
        await mutation([keyString(key)], (rows) => {
          const row = rows.get(keyString(key));
          if (row && expectedRevision !== undefined && row._rev !== expectedRevision) failure({ reason: 'conflict', retained: false }, key);
          return row ? [{ op: 'delete', key: keyString(key) }] : [];
        });
        if (!silent) await notify();
      });
    },
    markSynced(key, { expectedRevision } = {}) {
      return exclusive(async () => {
        await mutation([keyString(key)], (rows) => {
          const row = rows.get(keyString(key));
          if (!row || (expectedRevision !== undefined && row._rev !== expectedRevision)) return [];
          const { _persistFailed, ...rest } = row;
          return [{ op: 'put', key: keyString(key), value: { ...rest, _dirty: false } }];
        });
        await notify();
      });
    },
    async reconcile(records = [], { scope, windowKey } = {}) {
      assertCompleteSet(records);
      assertCompleteSet(records.map((row) => ({ ...row, _rev: Number.MAX_SAFE_INTEGER, _dirty: false,
        _updatedAt: new Date(now()).toISOString(), ...(windowKey != null ? { _window: String(windowKey) } : {}) })), {
        maxRows: Math.min(1000, backend.limits?.maxRows || 1000),
        maxBytes: Math.min(8 * 1024 * 1024, backend.limits?.maxBytes ?? 8 * 1024 * 1024),
      });
      const incoming = new Map();
      for (const row of records) { if (!validateRecord(row)) incoming.set(keyString(row[keyPath]), copy(row)); }
      return exclusive(async () => {
        let upserted = 0;
        for (const [key, row] of incoming) {
          await mutation([key], (rows) => [{ op: 'put', key, value: { ...row, _rev: nextRevision(rows.get(key)?._rev), _dirty: false, _updatedAt: new Date(now()).toISOString(), ...(windowKey != null ? { _window: String(windowKey) } : {}) } }]);
          upserted += 1;
        }
        if (windowKey != null) { windows.delete(String(windowKey)); windows.set(String(windowKey), now()); }
        const retainedWindows = new Set([...windows.keys()].slice(-maxWindows));
        let afterKey = null;
        let pruned = 0;
        do {
          const page = await backend.page({ afterKey, limit: 100 });
          const changes = page.rows.filter(({ key, value }) => !value._dirty && !incoming.has(key)
            && ((!scope || scope(value)) || (value._window != null && !retainedWindows.has(value._window) && windows.has(value._window))))
            .map(({ key }) => ({ op: 'delete', key }));
          if (changes.length) {
            const result = await backend.commit(page, changes);
            if (result.ok === false) failure(result);
            pruned += changes.length;
          }
          afterKey = page.nextKey;
        } while (afterKey !== null);
        await notify();
        return { upserted, pruned };
      });
    },
    subscribe(handler) { live(); subscribers.add(handler); return () => subscribers.delete(handler); },
    subscribeQuery(selector, handler, { onError } = {}) {
      live();
      const query = { selector, handler, onError, previous: undefined };
      queries.add(query);
      const captured = publication;
      backend.getAll().then((rows) => {
        if (retired || !queries.has(query) || publication !== captured) return;
        const visible = rows.filter(paintable);
        const value = selector({ get: (key) => visible.find((row) => keyString(row[keyPath]) === keyString(key)), getAll: () => visible, readWhere: (predicate) => visible.filter(predicate) });
        query.previous = JSON.stringify(value);
      }).catch((error) => { try { onError?.(error); } catch (_) { /* isolated consumer */ } });
      return () => queries.delete(query);
    },
    dispose({ purge = false } = {}) {
      retired = true;
      subscribers.clear();
      queries.clear();
      cursors.clear();
      return backend.close({ purge });
    },
  };
  return api;
}
