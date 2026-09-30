/** Durable branch of DataStore. The injected backend owns physical CAS/epochs. */
// The most rows one whole-collection read returns, page by page.
export const WHOLE_READ_ROWS = 20000;
// A whole read that has to page stops at this many bytes too (a domain's
// largest budget), so large rows are never all held in memory at once.
export const WHOLE_READ_BYTES = 32 * 1024 * 1024;
// The most rows the host store returns in one complete read.
const COMPLETE_ROWS = 1000;
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
// One commit carries at most MAX_BATCH_ROWS rows and about MAX_BATCH_BYTES.
const MAX_BATCH_ROWS = 100;
const MAX_BATCH_BYTES = 6 * 1024 * 1024;
function upsertBatches(incoming) {
  const encoder = new TextEncoder();
  const batches = [];
  let batch = [];
  let size = 0;
  for (const entry of incoming) {
    const length = encoder.encode(JSON.stringify(entry[1])).byteLength;
    if (batch.length && (batch.length >= MAX_BATCH_ROWS || size + length > MAX_BATCH_BYTES)) { batches.push(batch); batch = []; size = 0; }
    batch.push(entry); size += length;
  }
  if (batch.length) batches.push(batch);
  return batches;
}
const nextRevision = (value = 0) => { if (!Number.isSafeInteger(value) || value < 0 || value >= Number.MAX_SAFE_INTEGER) throw new StorageReadError('write-failed'); return value + 1; };
// A row's next revision: above its own and above the store's, which every
// commit moves on, so a key written again after it was removed never takes a
// revision it held before (a push still on its way cannot settle the new row).
// What a push acknowledged of a row (`_ackRev`) stays known through later writes.
const acknowledged = (previous) => (Number.isSafeInteger(previous?._ackRev) ? { _ackRev: previous._ackRev } : {});
const rowRevision = (previous, storeRevision) => nextRevision(Math.max(previous?._rev || 0, Number.isSafeInteger(storeRevision) ? storeRevision : 0));

export function createTransactionalDataStore({ name, keyPath, backend, validate, paintable, now, PersistError, onPersistError, maxWindows, indexes = {}, queryRows = null }) {
  let retired = false;
  let tail = Promise.resolve();
  const subscribers = new Set();
  const queries = new Set();
  const changeListeners = new Set();
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
  // The collection's rows as last read whole or written here, with the
  // store revision they are exact for (`epoch`, `revision`): a whole read that
  // finds the store still at that revision answers from them after reading
  // one metadata row, and this store's own commits keep them in step. Any
  // other change (another tab, an eviction) moves the revision, and the next
  // whole read reads the store again. Only a paged whole read, which carries
  // each row's metadata, fills them.
  let held = null;
  // Whether the store's age limit keeps a row out of a reader's view. A row
  // held from a read knows only its own last-written stamp (the store may
  // have touched it since), so one that looks aged is not decided here.
  const ageLimit = () => (backend.policy !== 'authored' && Number.isFinite(backend.limits?.maxAgeMs) ? backend.limits.maxAgeMs : null);
  const looksAged = (entry, limit) => limit !== null && !entry.dirty && entry.updatedAt + limit <= now();
  function track(snapshot, changes, result) {
    if (!held) return;
    if (result?.ok === false) return;
    if (held.epoch !== snapshot.epoch || held.revision !== snapshot.storeRevision || result?.evicted?.length
      || !Number.isSafeInteger(result?.storeRevision)) { held = null; return; }
    const at = now();
    changes.forEach((change) => {
      if (change.op === 'delete') held.rows.delete(change.key);
      else {
        if (!held.rows.has(change.key)) held.sorted = false;
        held.rows.set(change.key, {
          value: JSON.parse(JSON.stringify(change.value)), updatedAt: at, exact: true, dirty: !!change.value?._dirty,
        });
      }
    });
    held.revision = result.storeRevision;
    if (Number.isSafeInteger(result.epoch)) held.epoch = result.epoch;
  }
  async function commit(snapshot, changes, extra) {
    const result = await backend.commit(snapshot, changes, extra);
    track(snapshot, changes, result);
    return result;
  }
  async function mutation(keys, transform, { retry = false, syncedAt } = {}) {
    for (let attempt = 0; attempt < (retry ? 3 : 1); attempt += 1) {
      live();
      let snapshot;
      try { snapshot = await backend.snapshot(keys, { aged: true }); } catch (error) { failure({ reason: error.reason || 'read-failed', retained: false }, keys[0]); }
      const previous = new Map(snapshot.rows.map((row) => [row.key, row.value]));
      const changes = transform(previous, snapshot.storeRevision);
      if (!changes.length) return;
      const result = await commit(snapshot, changes, syncedAt === undefined || syncedAt === null ? undefined : { syncedAt });
      live();
      if (result.ok !== false) return;
      if (result.reason !== 'conflict' || !retry || attempt === 2) failure(result, keys[0]);
    }
  }
  // A whole-collection read: one complete read when the collection fits it,
  // else page by page (100 rows a page) with every page checked against the
  // first page's revision, starting over when a write lands in between.
  // Once a collection needed pages, later reads go straight to pages until
  // one returns at most half a complete read. Past WHOLE_READ_ROWS a caller
  // reads by index or scan instead.
  // `aged` (writers) includes rows past the backend's age limit.
  let paged = false;
  // Rows served from `held` are fresh copies; callers need not copy them again.
  const freshRows = new WeakSet();
  // The held rows as a reader sees them (fresh copies), or null when the
  // age limit may keep a held row out and only the store can say.
  function heldRows(aged) {
    if (!held.sorted) {
      held.rows = new Map([...held.rows.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
      held.sorted = true;
    }
    const limit = aged ? null : ageLimit();
    const rows = [];
    for (const entry of held.rows.values()) {
      if (looksAged(entry, limit)) {
        if (!entry.exact) return null;
      } else rows.push(entry.value);
    }
    const fresh = JSON.parse(JSON.stringify(rows));
    freshRows.add(fresh);
    return fresh;
  }
  async function wholeRows({ aged = false } = {}) {
    if (held && typeof backend.page === 'function') {
      const head = await backend.page({ afterKey: null, limit: 1, aged: true, metadataOnly: true });
      live();
      if (held && head.epoch === held.epoch && head.storeRevision === held.revision) {
        const rows = heldRows(aged);
        if (rows) return rows;
      } else held = null;
    }
    if (!paged || typeof backend.page !== 'function') {
      try { return await backend.getAll({ aged }); } catch (error) {
        if (error?.reason !== 'scan-required' || typeof backend.page !== 'function') throw error;
      }
    }
    paged = true;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const rows = [];
      let size = 0;
      let afterKey = null;
      let fence = null;
      let moved = false;
      const entries = [];
      do {
        // Each page continues from the one before it.
        // eslint-disable-next-line no-await-in-loop
        const page = await backend.page({ afterKey, limit: 100, aged });
        live();
        if (fence && (page.epoch !== fence.epoch || page.storeRevision !== fence.revision)) { moved = true; break; }
        fence = { epoch: page.epoch, revision: page.storeRevision };
        rows.push(...page.rows.map((row) => row.value));
        if (aged) entries.push(...page.rows);
        size += page.rows.reduce((total, row) => total + (Number.isSafeInteger(row.bytes) ? row.bytes : JSON.stringify(row.value ?? null).length), 0);
        if (rows.length > WHOLE_READ_ROWS || size > WHOLE_READ_BYTES) throw new StorageReadError('scan-required');
        afterKey = page.nextKey;
      } while (afterKey !== null);
      if (!moved) {
        if (rows.length <= COMPLETE_ROWS / 2) paged = false;
        // A complete writers' read with each row's metadata: held, for the
        // revision it was read at.
        if (aged && fence) {
          held = {
            epoch: fence.epoch,
            revision: fence.revision,
            sorted: true,
            rows: new Map(entries.map((row) => [row.key, {
              value: JSON.parse(JSON.stringify(row.value)), updatedAt: Date.parse(row.value?._updatedAt || '') || 0, exact: false, dirty: !!row.value?._dirty,
            }])),
          };
        }
        return rows;
      }
    }
    throw new StorageReadError('conflict');
  }
  async function notify() {
    live();
    publication += 1;
    // Change listeners read only what they need (a key or an index range), so
    // a collection too large for a complete read still tells them it changed.
    for (const listener of changeListeners) { try { listener(); } catch (_) { /* isolated consumer */ } }
    if (!queries.size && !subscribers.size) return;
    let rows;
    try { rows = (await wholeRows()).filter(paintable); } catch (error) {
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
    const result = await backend.page({ afterKey: held?.afterKey || null, limit: options.limit, aged: raw });
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
    async getRaw(key) { live(); const row = await backend.get(keyString(key), { aged: true }); live(); return copy(row); },
    async getAll() { live(); const rows = await wholeRows(); live(); return freshRows.has(rows) ? rows.filter(paintable) : rows.filter(paintable).map(copy); },
    async getAllRaw() { live(); const rows = await wholeRows({ aged: true }); live(); return freshRows.has(rows) ? rows : rows.map(copy); },
    async readWhere(predicate = () => true) { return (await api.getAll()).filter(predicate).map(strip); },
    /** What `readWhere(predicate)` would answer, from rows a subscriber was just given. */
    selectFrom(rows, predicate = () => true) { return (rows || []).filter(paintable).filter(predicate).map(strip); },
    scan: (options) => scan(options, false),
    scanRaw: (options) => scan(options, true),
    async put(record, { dedupeKey, silent = false } = {}) {
      requiredRecord(record);
      const submitted = copy(record);
      const key = keyString(record[keyPath]);
      return exclusive(async () => {
        await mutation([key], (rows, storeRevision) => {
          const previous = rows.get(key);
          // A local write keeps the row's window, what a push acknowledged,
          // and a refusal for access: the row stays refused until a retry.
          const refusal = previous?._pushRefused != null ? { _pushRefused: previous._pushRefused } : {};
          const stamped = { ...submitted, ...(previous?._window != null ? { _window: previous._window } : {}), ...acknowledged(previous), ...refusal, _rev: rowRevision(previous, storeRevision), _dirty: true, _updatedAt: new Date(now()).toISOString(), ...(dedupeKey ? { _dedupeKey: dedupeKey } : {}) };
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
    /**
     * Deletes `keys` (at most 100) in one commit, each only while
     * `keep(row)` is false for the row as committed; rows already gone are
     * skipped. A write that lands first makes the commit read again. Resolves
     * the keys removed.
     */
    deleteMany(keys, { keep = () => false, silent = false } = {}) {
      const wanted = [...new Set(keys.map(keyString))];
      if (wanted.length > 100) return Promise.reject(new StorageReadError('payload-capacity'));
      return exclusive(async () => {
        let removed = [];
        await mutation(wanted, (rows) => {
          removed = wanted.filter((key) => rows.has(key) && !keep(rows.get(key)));
          return removed.map((key) => ({ op: 'delete', key }));
        }, { retry: true });
        if (!silent && removed.length) await notify();
        return removed;
      });
    },
    // The sync engine's markers on a stored row, written without validating
    // or re-stamping the record (see the DataStore's `markRow`).
    markRow(key, patch, { dirty = false, body = null } = {}) {
      return exclusive(async () => {
        let found = false;
        await mutation([keyString(key)], (rows, storeRevision) => {
          const row = rows.get(keyString(key));
          if (!row) return [];
          found = true;
          const meta = Object.fromEntries(Object.entries(row).filter(([field]) => field.startsWith('_')));
          const next = body ? { ...body, ...meta } : { ...row };
          Object.entries(patch).forEach(([field, value]) => { if (value === null) delete next[field]; else next[field] = value; });
          if (dirty) Object.assign(next, { _dirty: true, _rev: rowRevision(row, storeRevision), _updatedAt: new Date(now()).toISOString() });
          return [{ op: 'put', key: keyString(key), value: next }];
        }, { retry: true });
        if (found) await notify();
        return found;
      });
    },
    /**
     * Sets `patch`'s fields on the stored rows of `keys` (at most 100) as a
     * server change, in one revision-checked commit: a write that lands first
     * makes it read the rows again, so the patch applies to them as they are.
     * A row that is gone or holds an unsent local write is left as it is; a
     * row the record schema refuses once patched is not written. Resolves
     * `{ patched, unsaved: [], skipped: [{ key, reason }], refused: [{ key, reason }] }`.
     */
    patchSynced(keys, patch) {
      const wanted = [...new Set((keys || []).map(keyString))];
      if (wanted.length > 100) return Promise.reject(new StorageReadError('payload-capacity'));
      return exclusive(async () => {
        let outcome = { patched: [], unsaved: [], skipped: [], refused: [] };
        await mutation(wanted, (rows, storeRevision) => {
          outcome = { patched: [], unsaved: [], skipped: [], refused: [] };
          const changes = [];
          wanted.forEach((key) => {
            const row = rows.get(key);
            if (!row || row._deleted) { outcome.skipped.push({ key, reason: 'gone' }); return; }
            if (row._dirty) { outcome.skipped.push({ key, reason: 'unsent' }); return; }
            const meta = Object.fromEntries(Object.entries(row).filter(([field]) => field.startsWith('_')));
            const record = { ...Object.fromEntries(Object.entries(row).filter(([field]) => !field.startsWith('_'))), ...patch };
            const why = validateRecord(record);
            if (why) { outcome.refused.push({ key, reason: why }); return; }
            outcome.patched.push(key);
            changes.push({ op: 'put', key, value: { ...record, ...meta, _rev: rowRevision(row, storeRevision), _dirty: false, _updatedAt: new Date(now()).toISOString() } });
          });
          return changes;
        }, { retry: true, syncedAt: null });
        if (outcome.patched.length) await notify();
        return outcome;
      });
    },
    // `pushed` records the revision as one a push acknowledged (`_ackRev`).
    markSynced(key, { expectedRevision, pushed = false } = {}) {
      return exclusive(async () => {
        await mutation([keyString(key)], (rows) => {
          const row = rows.get(keyString(key));
          if (!row || (expectedRevision !== undefined && row._rev !== expectedRevision)) return [];
          // A refusal for access set meanwhile stays: only a person's retry clears it.
          const { _persistFailed, ...rest } = row;
          return [{ op: 'put', key: keyString(key), value: { ...rest, _dirty: false, ...(pushed ? { _ackRev: row._rev } : {}) } }];
        });
        await notify();
      });
    },
    /**
     * Server rows, stored synced (`syncedAt: null` stores them without
     * stamping the collection synced). `prune: false` only upserts; otherwise rows
     * in `scope` (every row without one) that the set leaves out are removed,
     * dirty rows never. Upserts commit in bounded batches, not one per row.
     * `keepDirty: true` leaves a row with an unsent local write as it is
     * (its key listed in `skipped`), decided inside the same commit.
     */
    async reconcile(records = [], { scope, windowKey, syncedAt = now(), prune = true, keepDirty = false } = {}) {
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
        const skipped = new Set();
        // A row keeps the window it was loaded in unless this read names one.
        const windowOf = (previous) => {
          if (windowKey != null) return { _window: String(windowKey) };
          return previous?._window != null ? { _window: previous._window } : {};
        };
        const stamp = (row, previous, storeRevision) => ({ ...row, ...acknowledged(previous), _rev: rowRevision(previous, storeRevision), _dirty: false, _updatedAt: new Date(now()).toISOString(), ...windowOf(previous) });
        for (const batch of upsertBatches(incoming)) {
          let left = [];
          // eslint-disable-next-line no-await-in-loop
          await mutation(batch.map(([key]) => key), (rows, storeRevision) => {
            left = keepDirty ? batch.filter(([key]) => rows.get(key)?._dirty).map(([key]) => key) : [];
            return batch.filter(([key]) => !left.includes(key)).map(([key, row]) => ({ op: 'put', key, value: stamp(row, rows.get(key), storeRevision) }));
          }, { syncedAt, retry: true });
          upserted += batch.length - left.length;
          left.forEach((key) => skipped.add(key));
        }
        const counts = skipped.size ? { skipped: [...skipped] } : {};
        if (windowKey != null) { windows.delete(String(windowKey)); windows.set(String(windowKey), now()); }
        if (!prune) {
          await notify();
          return { upserted, pruned: 0, ...counts };
        }
        const retainedWindows = new Set([...windows.keys()].slice(-maxWindows));
        let afterKey = null;
        let pruned = 0;
        do {
          const page = await backend.page({ afterKey, limit: 100, aged: true });
          const changes = page.rows.filter(({ key, value }) => !value._dirty && !incoming.has(key)
            && ((!scope || scope(value)) || (value._window != null && !retainedWindows.has(value._window) && windows.has(value._window))))
            .map(({ key }) => ({ op: 'delete', key }));
          if (changes.length) {
            const result = await commit(page, changes);
            if (result.ok === false) failure(result);
            pruned += changes.length;
          }
          afterKey = page.nextKey;
        } while (afterKey !== null);
        await notify();
        return { upserted, pruned, ...counts };
      });
    },
    // Rows by a secondary index, in index order: the physical index where the
    // store opened with it, else the declared index over the complete row set.
    // `raw: true` includes rows past the paint ceiling and the backend's age
    // limit, for writers.
    async query(index, range = {}, { limit = 50, cursor = null, raw = false } = {}) {
      live();
      const visible = (row) => raw || paintable(row);
      const physical = typeof backend.query === 'function' && (!Array.isArray(backend.indexes) || backend.indexes.includes(index));
      if (physical) {
        const result = await backend.query({ index, ...range, limit, afterKey: cursor, ...(raw ? { aged: true } : {}) });
        live();
        return { rows: result.rows.map((row) => row.value).filter(visible).map(copy), nextCursor: result.nextKey, complete: result.nextKey === null };
      }
      const declared = indexes?.[index];
      if (!declared || typeof queryRows !== 'function') throw new StorageReadError(typeof backend.query === 'function' ? 'unserializable' : 'unavailable');
      const fields = Array.isArray(declared) ? declared : [declared];
      const rows = queryRows(raw ? await api.getAllRaw() : await api.getAll(), fields, range, (row) => row[keyPath]);
      const start = cursor === null ? 0 : rows.findIndex((row) => keyString(row[keyPath]) === keyString(cursor)) + 1;
      const page = rows.slice(start, start + limit);
      const more = start + limit < rows.length;
      return { rows: page, nextCursor: more ? keyString(page.at(-1)[keyPath]) : null, complete: !more };
    },
    // Another tab or handle changed this store: subscribers read it again.
    revalidateSubscribers() { return notify(); },
    subscribe(handler) { live(); subscribers.add(handler); return () => subscribers.delete(handler); },
    /** Called after every change, with nothing read: the listener reads what it needs. */
    onChange(listener) { live(); changeListeners.add(listener); return () => changeListeners.delete(listener); },
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
      held = null;
      subscribers.clear();
      queries.clear();
      changeListeners.clear();
      cursors.clear();
      return backend.close({ purge });
    },
  };
  return api;
}
