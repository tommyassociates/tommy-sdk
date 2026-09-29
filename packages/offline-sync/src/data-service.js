/**
 * data-service.js — the small data surface over DataStores:
 *
 *   read(collection, key?)            rows as stored (the paint ceiling applies)
 *   query(collection, spec)           rows by a declared index, in index order
 *   subscribe(target, callback)       the current value now, then on every change
 *   refresh(target, options)          a scheduled, coalesced background sync
 *   ingest(collection, rows, options) server rows a domain received, stored synced
 *   mutate(collection, command)       an optimistic write, pushed when possible
 *   purge(collection, options)        clear cached rows (never dirty ones unless forced)
 *   trim(collection, options)         keep a subject's newest rows by index order
 *   status(target)                    fresh | stale | refreshing | offline | error
 *
 * The host builds one over its domain collections (`<domain>.<collection>`);
 * an MP's DataApi builds one over its own manifest stores, confined to
 * `mp.<mpId>.*`. Rows on disk are display candidates: anything that acts still
 * needs a fresh server answer. Views render from subscriptions; network
 * results are written into the stores first and observed from there.
 */
import { reconcileFetched, windowKeyOf } from './reconcile.js';

export const DATA_STATES = Object.freeze(['fresh', 'stale', 'refreshing', 'offline', 'error']);
const PRIORITIES = { visible: 0, high: 1, normal: 2, background: 3 };
export const DEFAULT_STALE_AFTER_MS = 5 * 60000;

/** Runs work at once, one flight per key. Hosts inject their scheduler instead. */
export function createImmediateScheduler() {
  const flights = new Map();
  return {
    request(job) {
      if (flights.has(job.key)) return flights.get(job.key);
      const flight = Promise.resolve().then(() => job.run(() => true)).finally(() => flights.delete(job.key));
      flights.set(job.key, flight);
      return flight;
    },
  };
}

const serviceError = (message, code) => Object.assign(new Error(message), { name: 'DataServiceError', code });
// One reconcile carries a bounded complete set; larger ingests go in chunks.
const INGEST_CHUNK = 500;
// A physical index read returns at most this many rows per page.
const PAGE_ROWS = 100;

/**
 * Rows of an index range in index order, read in pages: up to `limit` from
 * `cursor`. `raw` includes rows past the paint ceiling, with their dirty
 * flags, for writers.
 */
async function queryPages(store, index, range, { limit = 50, cursor: start = null, raw = false } = {}) {
  const rows = [];
  let cursor = start;
  let complete = false;
  do {
    // Each page continues from the cursor the previous one returned.
    // eslint-disable-next-line no-await-in-loop
    const page = await store.query(index, range, { limit: Math.min(PAGE_ROWS, limit - rows.length), cursor, ...(raw ? { raw: true } : {}) });
    rows.push(...page.rows);
    complete = page.complete;
    cursor = page.complete ? null : page.nextCursor;
  } while (cursor !== null && rows.length < limit);
  return { rows, nextCursor: complete ? null : cursor, complete };
}
// The fields of an index range; a purge or trim acts on the whole range.
const RANGE_FIELDS = new Set(['index', 'equals', 'prefix', 'lower', 'upper']);
function wholeRange(spec, operation) {
  const extra = Object.keys(spec || {}).filter((field) => !RANGE_FIELDS.has(field) && field !== 'keep');
  if (typeof spec?.index !== 'string' || extra.length) {
    throw serviceError(`${operation}: an index range only (${extra.join(', ') || 'index'} not accepted)`, 'DATA_INVALID');
  }
  const { index, keep: _keep, ...range } = spec;
  return { index, range };
}
/** Every key of an index range in index order, with its dirty flag, page by page. */
async function rangeKeys(store, keyPath, { index, range }) {
  const keys = [];
  let cursor = null;
  do {
    // Each page continues from the cursor the previous one returned.
    // eslint-disable-next-line no-await-in-loop
    const page = await store.query(index, range, { limit: PAGE_ROWS, cursor, raw: true });
    page.rows.forEach((row) => keys.push({ key: String(row[keyPath]), dirty: !!row._dirty }));
    cursor = page.complete ? null : page.nextCursor;
  } while (cursor !== null);
  return keys;
}
const same = (a, b) => {
  try { return JSON.stringify(a) === JSON.stringify(b); } catch (_) { return false; }
};

export function createDataService({
  namespace = null,
  resolve,
  scheduler = createImmediateScheduler(),
  feed = null,
  labelOf = (name) => name,
  now = () => Date.now(),
  isOnline = () => true,
  staleAfterMs = DEFAULT_STALE_AFTER_MS,
  onPersistError,
  budgetKey = namespace || 'host',
} = {}) {
  if (typeof resolve !== 'function') throw serviceError('createDataService: resolve(collection) is required', 'DATA_INVALID');
  const sources = new Map();
  const states = new Map();
  const listeners = new Set();
  let disposed = false;
  const live = () => { if (disposed) throw serviceError('Data service retired', 'DATA_RETIRED'); };

  /** A collection name within this service's namespace, or a thrown refusal. */
  function local(name) {
    if (typeof name !== 'string' || !name) throw serviceError('A collection name is required', 'DATA_INVALID');
    let bare = name;
    if (namespace) {
      if (name.startsWith(`${namespace}.`)) bare = name.slice(namespace.length + 1);
      else if (name.includes('.')) throw serviceError(`'${name}' is outside ${namespace}`, 'DATA_FORBIDDEN');
    }
    const found = resolve(bare);
    if (!found?.store) throw serviceError(`Collection '${name}' is not declared`, 'DATA_UNDECLARED');
    return { name: bare, label: labelOf(bare), ...found };
  }
  const targetOf = (target) => (typeof target === 'string' ? { collection: target } : { ...target });
  const targetKey = (target) => JSON.stringify([target.collection, target.key ?? null, target.window ?? null, target.query ?? null]);
  function stateFor(key) {
    if (!states.has(key)) states.set(key, { state: 'stale', syncedAt: null, error: null, flight: null });
    return states.get(key);
  }
  function describeState(state) {
    let value = state.state;
    if (value !== 'refreshing' && !isOnline()) value = 'offline';
    else if (value === 'fresh' && (state.syncedAt === null || now() - state.syncedAt > staleAfterMs)) value = 'stale';
    return { state: value, syncedAt: state.syncedAt, error: state.error };
  }
  const emitStatus = () => { [...listeners].forEach((listener) => { try { listener(); } catch (_) { /* listener isolation */ } }); };

  async function valueOf(target) {
    const { store } = local(target.collection);
    if (target.query) {
      const { index, limit = 50, cursor = null, ...range } = target.query;
      return (await queryPages(store, index, range, { limit, cursor })).rows;
    }
    if (target.key !== undefined && target.key !== null) return (await store.get(String(target.key))) ?? null;
    return store.getAll();
  }

  // One entry per row with unsent changes, oldest change first.
  const outbox = new Map();
  const writes = new Map();
  let sequence = 0;
  const bare = (row) => Object.fromEntries(Object.entries(row || {}).filter(([field]) => !field.startsWith('_')));
  const pushOf = (name, decl) => (sources.get(name) || decl?.source)?.push || decl?.push;
  const describeError = (error) => ({ code: error?.code || null, status: error?.status ?? null, message: error?.message || String(error) });

  /** Runs `task` after every earlier task for the same id. */
  function serial(id, task) {
    const next = (writes.get(id) || Promise.resolve()).then(task);
    const tail = next.then(() => {}, () => {});
    writes.set(id, tail);
    tail.then(() => { if (writes.get(id) === tail) writes.delete(id); });
    return next;
  }

  /** Drops a row's unsent changes: the caller removed the row itself. */
  function dropPending(label, key) {
    const id = `${label}:${String(key)}`;
    const entry = outbox.get(id);
    if (!entry) return;
    entry.discarded = true;
    outbox.delete(id);
    entry.changes.splice(0).forEach((change) => change.reject(serviceError('Change discarded', 'DATA_DISCARDED')));
  }
  /**
   * Removes one row as a purge or trim decided, in turn with local writes to
   * it: a row written dirty since it was listed stays unless `force`, and a
   * forced removal drops the row's unsent changes with it. Resolves whether
   * the row was removed.
   */
  function removeRow({ label, store, key, force }) {
    return serial(`${label}:${key}`, async () => {
      const row = await store.getRaw(key);
      if (!row || (!force && row._dirty)) return false;
      try {
        await store.delete(key, { silent: true, ...(Number.isSafeInteger(row._rev) ? { expectedRevision: row._rev } : {}) });
      } catch (error) {
        // Another tab wrote the row since: it stays.
        if (error?.reason === 'conflict') return false;
        throw error;
      }
      if (force) dropPending(label, key);
      return true;
    });
  }
  function entryFor({ name, label, key, store, decl }) {
    const id = `${label}:${key}`;
    if (!outbox.has(id)) {
      outbox.set(id, {
        id, collection: name, label, key, store, decl, changes: [], attempts: 0, lastError: null, state: 'queued', restored: false, draining: null, discarded: false,
      });
    }
    return outbox.get(id);
  }
  function addChange(entry, { command, record, revision }) {
    let resolve;
    let reject;
    const done = new Promise((ok, fail) => { resolve = ok; reject = fail; });
    sequence += 1;
    entry.changes.push({ seq: sequence, command, record, revision, resolve, reject });
    return done;
  }
  function enqueuePush(target, change) {
    const entry = entryFor(target);
    const done = addChange(entry, change);
    if (entry.state !== 'sending') entry.state = 'queued';
    emitStatus();
    drain(entry).catch(() => {});
    return done;
  }
  /** A dirty row with no change in memory, sent again as a `put` of the stored row. */
  function restoreEntry(target, row) {
    const entry = entryFor(target);
    const record = bare(row);
    addChange(entry, { command: { op: 'put', record }, record, revision: row._rev }).catch(() => {});
    entry.restored = true;
    emitStatus();
    return entry;
  }
  async function restoreDirty(target) {
    let rows;
    try { rows = await (target.store.getAllRaw ? target.store.getAllRaw() : target.store.getAll()); } catch (_) { return; }
    if (disposed) return;
    const keyPath = target.decl?.keyPath || 'id';
    rows.filter((row) => row?._dirty).forEach((row) => {
      const key = String(row[keyPath]);
      if (outbox.has(`${target.label}:${key}`)) return;
      drain(restoreEntry({ ...target, key }, row)).catch(() => {});
    });
  }
  /**
   * Sends one row's changes oldest first. A failure stops the row there and
   * keeps every change for a retry; the row is marked synced only when the
   * change just sent is still its latest local write.
   */
  function drain(entry) {
    if (entry.draining) return entry.draining;
    entry.draining = (async () => {
      await null;
      try {
        while (entry.changes.length && !entry.discarded) {
          const change = entry.changes[0];
          let sent = false;
          try {
            // Changes to one row go out one at a time, in order.
            // eslint-disable-next-line no-await-in-loop
            await scheduler.request({
              key: `push:${entry.id}:${change.seq}`, target: `push:${entry.label}`, budgetKey, priority: PRIORITIES.high, visible: false,
              run: async () => {
                const push = pushOf(entry.collection, entry.decl);
                if (typeof push !== 'function') throw serviceError(`'${entry.label}' has no push`, 'DATA_NO_SOURCE');
                entry.state = 'sending'; entry.attempts += 1; emitStatus();
                await push(change.command, change.record);
                sent = true;
                if (change.command.op === 'delete') return;
                // A row that cannot be marked stays dirty and is sent again later.
                try { await entry.store.markSynced(entry.key, { expectedRevision: change.revision }); } catch (_) { /* kept dirty */ }
              },
            });
          } catch (error) {
            if (!sent) {
              entry.state = 'failed'; entry.lastError = describeError(error); emitStatus();
              entry.changes.forEach((queued) => queued.reject(error));
              throw error;
            }
          }
          entry.changes.shift();
          change.resolve({ key: entry.key, pushed: true });
        }
        if (entry.discarded) return { key: entry.key, pushed: false };
        if (outbox.get(entry.id) === entry) outbox.delete(entry.id);
        emitStatus();
        return { key: entry.key, pushed: true };
      } finally {
        entry.draining = null;
      }
    })();
    return entry.draining;
  }

  const service = {
    namespace,
    async read(collection, key) {
      live();
      const { store } = local(collection);
      if (Array.isArray(key)) return Promise.all(key.map((item) => store.get(String(item))));
      if (key !== undefined && key !== null) return (await store.get(String(key))) ?? null;
      return store.getAll();
    },
    async query(collection, spec = {}) {
      live();
      const { store } = local(collection);
      const { index, limit = 50, cursor = null, where, ...range } = spec;
      if (index) return queryPages(store, index, range, { limit, cursor });
      const rows = (await store.getAll()).filter((row) => (typeof where === 'function' ? where(row) : true));
      return { rows: rows.slice(0, limit), nextCursor: null, complete: rows.length <= limit };
    },
    /**
     * `target`: a collection name, `{ collection, key }` or
     * `{ collection, query: { index, … } }`. Fires with the current value, then
     * whenever it changes — in this tab or another.
     */
    subscribe(target, callback, { onError } = {}) {
      live();
      const wanted = targetOf(target);
      const { store, label } = local(wanted.collection);
      let active = true;
      let last;
      let seq = 0;
      const emit = () => {
        if (!active) return;
        seq += 1;
        const mine = seq;
        valueOf(wanted).then((value) => {
          if (!active || mine !== seq || (last !== undefined && same(value, last))) return;
          last = value;
          callback(value);
        }).catch((error) => { if (active) { try { onError?.(error); } catch (_) { /* isolated */ } } });
      };
      // A change listener reads only this target, however large the collection.
      const offStore = typeof store.onChange === 'function' ? store.onChange(() => emit()) : store.subscribe(() => emit());
      const offFeed = feed?.subscribe((event) => {
        if (event.label === label || event.labels?.includes(label) || (event.type === 'purge' && !event.label)) emit();
      });
      emit();
      return () => { active = false; offStore?.(); offFeed?.(); };
    },
    /**
     * Registers how a collection syncs: `fetch(target) → DTO[] | DTO | null`,
     * `toRecord(dto, prev)`, optional `keyOf(dto)` and `scope(target) →
     * row predicate` for list targets (rows in scope that the server no longer
     * returns are pruned; dirty rows never are). With `push(command, record)`,
     * local changes are sent; a change left unsent when an earlier service was
     * disposed arrives as a `put` of the stored row.
     */
    source(collection, spec) {
      live();
      const { name } = local(collection);
      if (typeof spec?.fetch !== 'function') throw serviceError('source.fetch is required', 'DATA_INVALID');
      sources.set(name, spec);
      // With a push, every dirty row in the collection is an unsent change:
      // ones this service has no record of (it was rebuilt) are sent again.
      if (typeof spec.push === 'function') {
        const { label, store, decl } = local(collection);
        restoreDirty({ name, label, store, decl });
      }
      return () => { if (sources.get(name) === spec) sources.delete(name); };
    },
    /** Whether `collection` can refresh (a source is registered or declared). */
    hasSource(collection) {
      const { name, decl } = local(collection);
      return !!(sources.get(name) || decl?.source);
    },
    /**
     * A background sync of `target` through the scheduler, coalesced by target.
     * `mode: 'silent'` never rejects (status carries the error); `'visible'`
     * rejects so a surface with nothing to show can say why. `maxAge` skips
     * the fetch while the last successful sync is younger than it.
     */
    refresh(target, { mode = 'silent', priority = 'normal', maxAge = 0, reason = null } = {}) {
      live();
      const wanted = targetOf(target);
      const { name, label, store, decl } = local(wanted.collection);
      const spec = sources.get(name) || decl?.source;
      const key = targetKey({ ...wanted, collection: name });
      const state = stateFor(key);
      const settle = (promise) => (mode === 'visible' ? promise : promise.then(() => service.status(target), () => service.status(target)));
      if (!spec) return settle(Promise.reject(serviceError(`'${wanted.collection}' has no source`, 'DATA_NO_SOURCE')));
      if (maxAge > 0 && state.syncedAt !== null && now() - state.syncedAt < maxAge && state.state !== 'error') return settle(Promise.resolve());
      if (!isOnline()) {
        state.state = 'offline';
        emitStatus();
        return settle(Promise.reject(serviceError('Offline', 'DATA_OFFLINE')));
      }
      if (state.flight) return settle(state.flight);
      state.state = 'refreshing';
      emitStatus();
      const keyPath = decl?.keyPath || 'id';
      const run = async (isCurrent) => {
        if (wanted.key !== undefined && wanted.key !== null) {
          const dto = await spec.fetch(wanted);
          if (!isCurrent()) return;
          const prev = await store.getRaw?.(String(wanted.key));
          if (!dto) {
            if (prev && !prev._dirty) await store.delete(String(wanted.key));
            return;
          }
          const record = (spec.toRecord || ((value) => value))(dto, prev ? bare(prev) : prev);
          await store.reconcile([record], { prune: false });
          return;
        }
        const scope = typeof spec.scope === 'function' ? spec.scope(wanted) : () => true;
        await reconcileFetched(store, keyPath, { fetch: () => spec.fetch(wanted), toRecord: spec.toRecord || ((dto) => dto), keyOf: spec.keyOf },
          scope, wanted.window, windowKeyOf(wanted.window), { onPersistError, rethrow: true });
      };
      state.flight = scheduler.request({
        key: `data:${label}:${key}`, target: label, budgetKey, reason,
        priority: PRIORITIES[priority] ?? PRIORITIES.normal, visible: mode === 'visible', run,
      }).then(() => {
        state.state = 'fresh'; state.syncedAt = now(); state.error = null;
      }, (error) => {
        state.state = isOnline() ? 'error' : 'offline'; state.error = { code: error?.code || null, status: error?.status ?? null, message: error?.message || String(error) };
        throw error;
      }).finally(() => { state.flight = null; emitStatus(); });
      return settle(state.flight);
    },
    /**
     * Stores rows a domain received from the server (a page, an event, a
     * detail read) as synced rows: views subscribed to them update, nothing is
     * pushed. With `replace`, the rows are the complete set for `scope` (a row
     * predicate; the whole collection without one): rows in scope that the set
     * leaves out are removed, dirty rows never, and the collection is fresh.
     */
    async ingest(collection, rows, { replace = false, scope = null } = {}) {
      live();
      const { name, store, decl } = local(collection);
      if (!Array.isArray(rows)) throw serviceError('ingest: rows must be an array', 'DATA_INVALID');
      const keyPath = decl?.keyPath || 'id';
      const inScope = typeof scope === 'function' ? scope : () => true;
      // Only rows the store accepts count, once per key; a refused row never
      // keeps an older stored version alive through a replacement.
      const accepted = rows.filter((row) => row && typeof row === 'object'
        && !(typeof store.validateRecord === 'function' && store.validateRecord(row)));
      const kept = new Set(accepted.map((row) => String(row[keyPath])));
      if (replace && rows.length <= INGEST_CHUNK) {
        await store.reconcile(rows, { scope: inScope });
      } else {
        for (let start = 0; start < rows.length; start += INGEST_CHUNK) {
          // Chunks commit in order; each is a bounded complete set.
          // eslint-disable-next-line no-await-in-loop
          await store.reconcile(rows.slice(start, start + INGEST_CHUNK), { prune: false });
        }
        if (replace) await store.reconcile([], { scope: (row) => inScope(row) && !kept.has(String(row[keyPath])) });
      }
      const written = kept.size;
      if (replace) {
        const state = stateFor(targetKey({ collection: name }));
        state.state = 'fresh'; state.syncedAt = now(); state.error = null;
        emitStatus();
      }
      return { written };
    },
    /**
     * `{ op: 'put', record } | { op: 'patch', key, patch } | { op: 'delete', key }`.
     * The row is written at once (dirty until the server confirms). With a
     * collection `push(command, record)`, pushes for one row go out in order
     * through the scheduler, and the row is marked synced only when no later
     * local write has changed it; `wait: true` resolves after this change is
     * sent.
     */
    async mutate(collection, command, { wait = false } = {}) {
      live();
      const { name, label, store, decl } = local(collection);
      const keyPath = decl?.keyPath || 'id';
      if (!['put', 'patch', 'delete'].includes(command?.op)) throw serviceError('mutate: op must be put, patch or delete', 'DATA_INVALID');
      const key = String(command.op === 'put' ? command.record?.[keyPath] : command.key);
      const push = pushOf(name, decl);
      // One local write per row at a time, so each push knows the revision it wrote.
      const written = await serial(`${label}:${key}`, async () => {
        let record = null;
        if (command.op === 'put') {
          record = command.record;
          await store.put(record);
        } else if (command.op === 'patch') {
          record = bare({ ...((await store.getRaw(key)) || {}), ...command.patch });
          await store.put(record);
        } else await store.delete(key);
        const revision = command.op === 'delete' || typeof push !== 'function' ? undefined : (await store.getRaw(key))?._rev;
        return { record, revision };
      });
      if (typeof push !== 'function') return { key, pushed: false };
      const change = enqueuePush({ name, label, key, store, decl }, { command, record: written.record, revision: written.revision });
      if (wait) return change;
      change.catch(() => {});
      return { key, pushed: false };
    },
    /** Queued and failed pushes, one per row, for a pending-sync view. */
    pending(collection = null) {
      const wanted = collection === null ? null : local(collection).name;
      return [...outbox.values()].filter((entry) => wanted === null || entry.collection === wanted).map((entry) => ({
        collection: entry.collection,
        label: entry.label,
        key: entry.key,
        op: entry.changes.at(-1)?.command.op ?? null,
        changes: entry.changes.length,
        attempts: entry.attempts,
        lastError: entry.lastError,
        state: entry.state,
        restored: entry.restored,
      }));
    },
    /**
     * Sends a row's unsent changes again. A dirty row with no change in memory
     * (the service was rebuilt since it was written) is sent as a `put` of the
     * stored row.
     */
    async retry(collection, key) {
      const { name, label, store, decl } = local(collection);
      const id = `${label}:${String(key)}`;
      let entry = outbox.get(id);
      if (!entry) {
        const push = pushOf(name, decl);
        const row = typeof push === 'function' ? await store.getRaw?.(String(key)) : null;
        if (!row?._dirty) return { key, pushed: false };
        entry = outbox.get(id) || restoreEntry({ name, label, key: String(key), store, decl }, row);
      }
      if (!entry.draining && entry.state === 'failed') { entry.state = 'queued'; emitStatus(); }
      return drain(entry);
    },
    /** Drops a pending local change after an explicit confirm. */
    async discard(collection, key) {
      const { label, store } = local(collection);
      dropPending(label, key);
      await store.delete(String(key));
      emitStatus();
    },
    /**
     * Clears a collection's cached rows, or only `keys`, or every row of an
     * index range (`query: { index, prefix | equals | lower | upper }`; paging
     * fields are refused). Dirty rows stay unless `force`.
     */
    async purge(collection, { force = false, keys = null, query = null } = {}) {
      live();
      const { store, decl } = local(collection);
      const keyPath = decl?.keyPath || 'id';
      let entries;
      if (Array.isArray(keys)) {
        entries = (await Promise.all(keys.map((key) => store.getRaw(String(key))))).filter(Boolean)
          .map((row) => ({ key: String(row[keyPath]), dirty: !!row._dirty }));
      } else if (query) entries = await rangeKeys(store, keyPath, wholeRange(query, 'purge'));
      else {
        entries = (await (store.getAllRaw ? store.getAllRaw() : store.getAll()))
          .map((row) => ({ key: String(row[keyPath]), dirty: !!row._dirty }));
      }
      const { label } = local(collection);
      const removed = [];
      for (const { key, dirty } of entries) {
        if (!force && dirty) continue;
        // eslint-disable-next-line no-await-in-loop
        if (await removeRow({ label, store, key, force })) removed.push(key);
      }
      await store.revalidateSubscribers?.();
      return { removed };
    },
    /**
     * Keeps the newest `keep` rows of an index range (the last in index
     * order) and removes the older ones. Dirty rows are never removed.
     */
    async trim(collection, spec = {}) {
      live();
      const { store, decl } = local(collection);
      if (typeof spec.index !== 'string' || !Number.isSafeInteger(spec.keep) || spec.keep < 0) throw serviceError('trim: index and keep are required', 'DATA_INVALID');
      const keyPath = decl?.keyPath || 'id';
      const entries = await rangeKeys(store, keyPath, wholeRange(spec, 'trim'));
      const { label } = local(collection);
      const removed = [];
      for (const { key, dirty } of entries.slice(0, Math.max(0, entries.length - spec.keep))) {
        if (dirty) continue;
        // eslint-disable-next-line no-await-in-loop
        if (await removeRow({ label, store, key, force: false })) removed.push(key);
      }
      if (removed.length) await store.revalidateSubscribers?.();
      return { removed };
    },
    status(target) {
      const wanted = targetOf(target);
      const { name } = local(wanted.collection);
      return describeState(stateFor(targetKey({ ...wanted, collection: name })));
    },
    /** Status of every target this service has refreshed. */
    statuses() {
      return [...states.entries()].map(([key, state]) => {
        const [collection, rowKey, window] = JSON.parse(key);
        return { collection, label: labelOf(collection), key: rowKey, window, ...describeState(state) };
      });
    },
    onStatusChange(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    dispose() {
      disposed = true;
      listeners.clear();
      sources.clear();
      // Unsent rows stay dirty on disk; the next service sends them again.
      outbox.forEach((entry) => { entry.discarded = true; });
      outbox.clear();
    },
  };
  return service;
}
