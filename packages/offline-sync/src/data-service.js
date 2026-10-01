/**
 * data-service.js — the small data surface over DataStores:
 *
 *   read(collection, key?)            rows as stored (the paint ceiling applies)
 *   query(collection, spec)           rows by a declared index, in index order
 *   subscribe(target, callback)       the current value now, then on every change
 *   refresh(target, options)          a scheduled, coalesced background sync (experimental)
 *   ingest(collection, rows, options) server rows a domain received, stored synced
 *   mutate(collection, command)       an optimistic write, pushed when possible (experimental)
 *   purge(collection, options)        clear cached rows (never dirty ones unless forced)
 *   trim(collection, options)         keep a subject's newest rows by index order
 *   status(target)                    fresh | stale | refreshing | offline | error
 *
 * A source may declare its read (`read`): the service then keeps the read's
 * cursor in the collection's source meta (`sourceMeta`, one record per
 * collection for this service's principal, never among the collection's
 * rows), asks only for what changed while the stored rows are still the
 * whole set the last read left (a digest of their keys proves it, so an
 * eviction or any write the service did not account for makes the next read
 * whole) and a whole read ran within `fullEveryMs`, removes rows a read marks
 * removed (`removedField`), purges the collection's rows when the server
 * refuses the read (403, 404), and never lets a read undo a change stored
 * after it began.
 *
 * Writes to one collection take turns: a declared read's commit (all its
 * chunks and its prune), ingests, purges, trims and a refresh's store step
 * never interleave, and a read decides what it keeps when its turn comes.
 *
 * `source`, `refresh` and `mutate` with a source's `push` are experimental:
 * no host collection or MP uses them yet. Their outbox keeps every unsent
 * change on the row (a delete as a hidden tombstone, a refusal for access as
 * a marker), sends a restored change as the row is when it goes out (as it
 * was restored once a server read replaced the row), and drops queued
 * changes on a forced removal or a principal switch.
 *
 * The host builds one over its domain collections (`<domain>.<collection>`);
 * an MP's DataApi builds one over its own manifest stores, confined to
 * `mp.<mpId>.*`. Rows on disk are display candidates: anything that acts still
 * needs a fresh server answer. Views render from subscriptions; network
 * results are written into the stores first and observed from there.
 */
import {
  reconcileFetched, windowKeyOf, previousByKey, reportRejected,
} from './reconcile.js';
import { boundedBatches } from './bytes.js';

export const DATA_STATES = Object.freeze(['fresh', 'stale', 'refreshing', 'offline', 'error']);
// A store's methods that change its rows: called only on the handles a
// collection's turn gives (see inTurn), never on the store `local()` answers.
const WRITE_METHODS = new Set(['put', 'delete', 'deleteMany', 'markRow', 'markSynced', 'reconcile', 'patchSynced']);
/**
 * The service's public methods that answer at once; every other one is
 * tracked from its call to its end (`idle()` is false meanwhile).
 */
export const DATA_SERVICE_SYNC_METHODS = Object.freeze([
  'writer', 'watch', 'subscribe', 'source', 'sends', 'hasSource', 'pending', 'fence', 'status', 'statuses', 'onStatusChange', 'idle', 'dispose',
]);
const PRIORITIES = { visible: 0, high: 1, normal: 2, background: 3 };
export const DEFAULT_STALE_AFTER_MS = 5 * 60000;
// A declared read with a cursor reads the whole collection at least this often.
const FULL_EVERY_MS = 24 * 60 * 60000;

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

/**
 * Source meta kept in memory: `get(collection) → meta | null`,
 * `set(collection, meta | null)`. A host injects a durable one per
 * principal; without it a declared read's first read after a restart is
 * whole.
 */
export function createMemorySourceMeta() {
  const metas = new Map();
  return {
    async get(name) { return metas.has(name) ? { ...metas.get(name) } : null; },
    async set(name, meta) { if (meta) metas.set(name, { ...meta }); else metas.delete(name); },
  };
}

// A digest of a set of keys, whatever their order: two 32-bit hashes of each
// key (FNV-1a, djb2), each XORed over the set, so adding or removing a key
// toggles its share.
/* eslint-disable no-bitwise */
function keyHashes(key) {
  let fnv = 0x811c9dc5;
  let djb = 5381;
  for (let at = 0; at < key.length; at += 1) {
    const code = key.charCodeAt(at);
    fnv = Math.imul(fnv ^ code, 0x01000193) >>> 0;
    djb = (Math.imul(djb, 33) + code) >>> 0;
  }
  return [fnv, djb];
}
function keysDigest(keys) {
  let fnv = 0;
  let djb = 0;
  keys.forEach((key) => {
    const [a, b] = keyHashes(String(key));
    fnv = (fnv ^ a) >>> 0;
    djb = (djb ^ b) >>> 0;
  });
  return `${fnv.toString(16)}.${djb.toString(16)}`;
}
/* eslint-enable no-bitwise */
const rawRows = (store) => (store.getAllRaw ? store.getAllRaw() : store.getAll());
// A read that answered no list: nothing of the collection is removed or
// stamped for it.
const NO_SNAPSHOT = Symbol('no snapshot');
/**
 * The rows a list or declared read answered, or null when it answered no
 * list (`null`, `undefined`, an object without `rows`): the one check every
 * read's answer passes through, so only an explicit list may replace rows.
 */
function snapshotRows(answer) {
  if (Array.isArray(answer)) return answer;
  if (answer && typeof answer === 'object' && Array.isArray(answer.rows)) return answer.rows;
  return null;
}
// One reconcile carries a bounded complete set: at most this many rows and
// about WRITE_BATCH_BYTES (bytes.js); larger ingests go in chunks.
const INGEST_CHUNK = 500;
const ingestChunks = (rows) => boundedBatches(rows, { maxItems: INGEST_CHUNK });
// A whole read writes the rows it changed, and confirms (writes again) an
// unchanged row only once it was last written this long ago, so its age
// limits count from a recent confirmation; in a store whose rows stop being
// visible sooner (its age limit), once it was written half that limit ago.
const CONFIRM_AFTER_MS = 24 * 60 * 60 * 1000;
const confirmAfterMs = (store) => {
  let limit = null;
  try { limit = typeof store?.ageLimitMs === 'function' ? store.ageLimitMs() : null; } catch (_) { limit = null; }
  return Number.isFinite(limit) && limit > 0 ? Math.min(CONFIRM_AFTER_MS, limit / 2) : CONFIRM_AFTER_MS;
};
// A value's content, whatever the order of its fields.
function contentValue(value) {
  if (Array.isArray(value)) return `[${value.map(contentValue).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).filter((field) => value[field] !== undefined).sort()
      .map((field) => `${JSON.stringify(field)}:${contentValue(value[field])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}
// A row's content: every field, nested ones included, but the storage
// fields at its root.
const contentOf = (row) => contentValue(Object.fromEntries(Object.entries(row || {}).filter(([field]) => !field.startsWith('_'))));
// Keys whose last local change a read still on its way must keep, per collection.
const TOUCHES_KEPT = 5000;
// A declared read whose protection was dropped reads again at most this often.
const READ_TRIES = 3;
// A physical index read returns at most this many rows per page.
const PAGE_ROWS = 100;
// The most rows one query or subscription returns, however it pages.
export const MAX_QUERY_ROWS = 5000;
function queryLimit(limit) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_QUERY_ROWS) {
    throw serviceError(`A query limit is a whole number from 1 to ${MAX_QUERY_ROWS}`, 'DATA_INVALID');
  }
  return limit;
}

/**
 * Rows of an index range in index order, read in pages: up to `limit` from
 * `cursor`. `raw` includes rows past the paint ceiling, with their dirty
 * flags, for writers.
 */
async function queryPages(store, index, range, { limit = 50, cursor: start = null, raw = false } = {}) {
  queryLimit(limit);
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
// `keep` belongs to a trim only: a purge refuses it rather than clear the range.
function wholeRange(spec, operation) {
  const extra = Object.keys(spec || {}).filter((field) => !RANGE_FIELDS.has(field) && !(field === 'keep' && operation === 'trim'));
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
// A row as a caller gets it: a copy, without storage metadata (`_rev`, …).
const clean = (row) => (row && typeof row === 'object'
  ? JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(row).filter(([field]) => !field.startsWith('_'))))) : row ?? null);
const copyRow = (row) => (row && typeof row === 'object' ? JSON.parse(JSON.stringify(row)) : row ?? null);
/**
 * A query: by a declared index (paged by the index cursor; a row filter is
 * refused, since a page could not honour both it and the limit), or over the
 * whole collection in key order (`where` filters it, `cursor` continues after
 * the last key a page returned). `raw` answers as writers see the collection.
 */
/** Refuses a declared read it could not honour: only its known fields, in their shapes. */
function checkRead(read) {
  const known = ['cursor', 'removedField', 'fullEveryMs', 'forbidden'];
  const fields = read && typeof read === 'object' && !Array.isArray(read) ? Object.keys(read) : null;
  const invalid = !fields || fields.some((field) => !known.includes(field))
    || (read.cursor !== undefined && typeof read.cursor !== 'boolean')
    || (read.removedField !== undefined && read.removedField !== null && typeof read.removedField !== 'string')
    || (read.fullEveryMs !== undefined && !(Number.isFinite(read.fullEveryMs) && read.fullEveryMs > 0))
    || (read.forbidden !== undefined && !['purge', 'keep'].includes(read.forbidden));
  if (invalid) throw serviceError(`source.read: ${known.join(', ')} only (cursor a boolean, removedField a field name, fullEveryMs a positive number, forbidden 'purge' or 'keep')`, 'DATA_INVALID');
}
/** Refuses, at once, a query spec a read could not honour. */
// The most values one `anyOf` query may ask for.
export const MAX_ANY_OF = 500;
function checkQuery(spec = {}) {
  const { index, limit = 50, cursor = null, where, raw: _raw, ...range } = spec;
  queryLimit(limit);
  if (range.anyOf !== undefined) {
    if (!Array.isArray(range.anyOf) || range.anyOf.length > MAX_ANY_OF
      || range.anyOf.some((value) => value === null || value === undefined || (typeof value === 'object' && !Array.isArray(value)))) {
      throw serviceError(`query: anyOf must be a list of at most ${MAX_ANY_OF} index values`, 'DATA_INVALID');
    }
    if (Object.keys(range).some((field) => field !== 'anyOf')) throw serviceError('query: anyOf cannot be combined with another range', 'DATA_INVALID');
    if (cursor !== null) throw serviceError('query: anyOf answers at most one page; it takes no cursor', 'DATA_INVALID');
  }
  if (where !== undefined && typeof where !== 'function') throw serviceError('query: where must be a function', 'DATA_INVALID');
  if (cursor !== null && typeof cursor !== 'string') throw serviceError('query: cursor must be a string', 'DATA_INVALID');
  if (index && where) throw serviceError('query: where cannot filter an index read; filter the rows it returns', 'DATA_INVALID');
  if (!index && Object.keys(range).length) throw serviceError(`query: ${Object.keys(range).join(', ')} needs an index`, 'DATA_INVALID');
}
async function runQuery(store, keyPath, spec = {}) {
  checkQuery(spec);
  const { index, limit = 50, cursor = null, where, raw = false, ...range } = spec;
  if (index && Array.isArray(range.anyOf)) {
    // Many rows by one declared index: the rows of each value asked for, in
    // the order asked, each row once, up to `limit` in all.
    const keyOf = (row) => String(row[keyPath]);
    const seen = new Set();
    const rows = [];
    let complete = true;
    const values = [...new Map(range.anyOf.map((value) => [JSON.stringify(value), value])).values()];
    for (const value of values) {
      if (rows.length >= limit) { complete = false; break; }
      // eslint-disable-next-line no-await-in-loop
      const page = await queryPages(store, index, { equals: Array.isArray(value) ? value : [value] }, { limit: limit - rows.length, cursor: null, raw: raw === true });
      page.rows.forEach((row) => { if (!seen.has(keyOf(row))) { seen.add(keyOf(row)); rows.push(row); } });
      if (!page.complete) complete = false;
    }
    return { rows: rows.map(raw === true ? copyRow : clean), nextCursor: null, complete };
  }
  if (index) {
    const page = await queryPages(store, index, range, { limit, cursor, raw: raw === true });
    return { ...page, rows: page.rows.map(raw === true ? copyRow : clean) };
  }
  const all = raw === true && store.getAllRaw ? await store.getAllRaw() : await store.getAll();
  const keyOf = (row) => String(row[keyPath]);
  const rows = all.filter((row) => (typeof where === 'function' ? where(row) : true)).sort((a, b) => (keyOf(a) < keyOf(b) ? -1 : keyOf(a) > keyOf(b) ? 1 : 0));
  const start = cursor === null ? 0 : rows.findIndex((row) => keyOf(row) > cursor);
  const from = start === -1 ? rows.length : start;
  const page = rows.slice(from, from + limit);
  const more = from + limit < rows.length;
  return { rows: page.map(raw === true ? copyRow : clean), nextCursor: more ? keyOf(page.at(-1)) : null, complete: !more };
}

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
  // The account this service reads and sends for (opaque here), passed to
  // every source's fetch and push: a value, or a function naming it now (a
  // namespace one account reaches in several forms). Each read or change
  // takes it when it is asked and keeps it until it is sent. `lane` keeps
  // its scheduler jobs apart from other accounts'; while `foreground()` is
  // false, its work waits behind the displayed account's.
  principal = null,
  lane = null,
  foreground = () => true,
  // Declared reads' cursors and the key digest of the set each left, one
  // record per collection, for this principal.
  sourceMeta = createMemorySourceMeta(),
} = {}) {
  if (typeof resolve !== 'function') throw serviceError('createDataService: resolve(collection) is required', 'DATA_INVALID');
  // What a source's fetch and push are given: the principal to send with, and
  // that the request is background work (never reported by the request layer).
  const principalNow = typeof principal === 'function' ? principal : () => principal;
  const jobContextNow = () => Object.freeze({ principal: principalNow(), background: true });
  // Which principal a context names, to tell two forms of one account apart.
  const formOf = (context) => { try { return JSON.stringify(context.principal ?? null); } catch (_) { return null; } };
  const laned = (label) => (lane === null ? label : `${lane}|${label}`);
  const lanedKey = (kind, rest) => (lane === null ? `${kind}:${rest}` : `${kind}:${lane}:${rest}`);
  const inForeground = () => { try { return foreground() !== false; } catch (_) { return true; } };
  const sources = new Map();
  const states = new Map();
  const listeners = new Set();
  let disposed = false;
  const live = () => { if (disposed) throw serviceError('Data service retired', 'DATA_RETIRED'); };
  // Per collection, when each key was last stored or removed by anything but
  // a declared read: a read that began before never undoes it. The newest
  // TOUCHES_KEPT keys are kept, most recently touched last; a marker dropped
  // at that bound is remembered as the collection's `lost` point, and a read
  // that began before it reads again rather than lose its protection.
  const touches = new Map();
  const lostTouches = new Map();
  let touchSequence = 0;
  // `at`: the point its data is from (a declared read's start), else now.
  function noteTouched(name, keys, at = null) {
    if (!touches.has(name)) touches.set(name, new Map());
    const seen = touches.get(name);
    keys.forEach((key) => {
      let stamp = at;
      if (stamp === null) { touchSequence += 1; stamp = touchSequence; }
      // A key touched later than this keeps its later mark.
      if ((seen.get(String(key)) || 0) > stamp) return;
      seen.delete(String(key));
      seen.set(String(key), stamp);
    });
    while (seen.size > TOUCHES_KEPT) {
      const [oldest, at] = seen.entries().next().value;
      seen.delete(oldest);
      lostTouches.set(name, Math.max(lostTouches.get(name) || 0, at));
    }
  }
  const touchedAfter = (name, since) => new Set([...(touches.get(name) || new Map())].filter(([, at]) => at > since).map(([key]) => key));
  // Whether a marker a read that began at `since` needed was dropped.
  const protectionLost = (name, since) => (lostTouches.get(name) || 0) > since;
  // When a replacing ingest from outside a declared read last ran, by collection.
  const replaced = new Map();
  function noteReplaced(name, at = null) {
    let stamp = at;
    if (stamp === null) { touchSequence += 1; stamp = touchSequence; }
    replaced.set(name, Math.max(replaced.get(name) || 0, stamp));
  }
  const replacedAfter = (name, since) => (replaced.get(name) || 0) > since;
  /**
   * What a write through a collection's turn did, recorded at its width, so
   * a read that began before (a declared read, a keyed, query or window
   * refresh) never undoes it: a replacement of the whole collection raises
   * the collection-wide barrier; any other write marks the keys it changed
   * and removed. `at`: the point its data is from (a declared read's start;
   * a local write's is now). Every commit path records here, a declared
   * read's own included.
   */
  function recordEffect(name, {
    whole = false, changedKeys = [], removedKeys = [], at = null,
  } = {}) {
    if (whole) { noteReplaced(name, at); return; }
    noteTouched(name, [...changedKeys, ...removedKeys].filter((key) => key !== undefined && key !== null), at);
  }
  // One writer at a time per collection (see the module note); a task queued
  // after the service retired is refused. The task is given the only handles
  // that write the collection: `store`, which records each change it makes
  // (touching), and `raw`, for a declared read's own commit. `at`: for a
  // fetched write, its read's start, which every change it makes is recorded
  // as of; a local write's is now.
  const turns = new Map();
  function inTurn(name, task, { at = null } = {}) {
    const next = (turns.get(name) || Promise.resolve()).then(() => {
      live();
      const found = resolve(name);
      if (!found?.store) throw serviceError(`Collection '${name}' is not declared`, 'DATA_UNDECLARED');
      const raw = found.store;
      return task({ store: touching(name, raw, found.decl?.keyPath || 'id', at), raw });
    });
    const tail = next.then(() => {}, () => {});
    turns.set(name, tail);
    tail.then(() => { if (turns.get(name) === tail) turns.delete(name); });
    return next;
  }
  /**
   * A collection's store as every writer but a declared read's commit uses
   * it, inside its turn: each put, removal, row mark and reconcile records
   * the keys it changes (a pruning reconcile records the collection as
   * replaced), as of `at` (a fetched write's read start, else now), so a
   * read that began before never undoes them.
   */
  function touching(name, store, keyPath, at = null) {
    const keyOf = (row) => (row && typeof row === 'object' ? row[keyPath] : undefined);
    const changed = (keys) => recordEffect(name, { changedKeys: keys, at });
    // Each write records exactly what it changed, once the store answered:
    // a write the store refused (an invalid row) changed nothing; one it
    // kept in memory only (`retained`) did.
    const recorded = async (work, keysOf, failedKeys) => {
      let result;
      try { result = await work(); } catch (error) {
        if (error?.retained === true) changed(failedKeys());
        throw error;
      }
      changed(keysOf(result));
      return result;
    };
    const writers = {
      put: (record, ...rest) => recorded(() => store.put(record, ...rest), () => [keyOf(record)], () => [keyOf(record)]),
      delete: (key, ...rest) => recorded(() => store.delete(key, ...rest), () => [key], () => [key]),
      deleteMany: (keys, ...rest) => recorded(() => store.deleteMany(keys, ...rest),
        (removed) => (Array.isArray(removed) ? removed : (keys || [])), () => keys || []),
      markRow: (key, ...rest) => recorded(() => store.markRow(key, ...rest), (found) => (found === false ? [] : [key]), () => [key]),
      patchSynced: (keys, ...rest) => recorded(() => store.patchSynced(keys, ...rest),
        (outcome) => (outcome && typeof outcome === 'object' ? [...(outcome.patched || []), ...(outcome.unsaved || [])] : (keys || [])), () => keys || []),
      // A prune with no scope (or one marked `whole`: a replacement of the
      // whole collection) replaces it; a scoped one (a window, a query)
      // records the rows it wrote and removed, and nothing else. A
      // reconcile that failed part way records every row it was given, as it
      // may have stored some.
      reconcile: async (records = [], { whole: replacesAll = false, ...options } = {}) => {
        const whole = replacesAll === true || (options.prune !== false && typeof options.scope !== 'function');
        let result;
        try { result = await store.reconcile(records, options); } catch (error) {
          changed(records.map(keyOf));
          throw error;
        }
        // Rows left as they were (an unsent local write kept) were not written.
        const left = new Set((Array.isArray(result?.skipped) ? result.skipped : []).map(String));
        changed(records.map(keyOf).filter((key) => !left.has(String(key))));
        if (whole) recordEffect(name, { whole: true, at });
        else if (Array.isArray(result?.prunedKeys)) recordEffect(name, { removedKeys: result.prunedKeys, at });
        return result;
      },
    };
    return new Proxy(store, {
      get(target, property) {
        if (Object.hasOwn(writers, property) && typeof target[property] === 'function') return writers[property];
        const value = target[property];
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  }
  const metaOf = async (name) => { try { return await sourceMeta.get(name); } catch (_) { return null; } };
  // Per collection, a count of changes to its rows as this page hears of
  // them (its store's own notices, and the change feed's for other tabs,
  // evictions and purges): a declared read reuses the rows it read before
  // fetching when nothing changed by its commit.
  const generations = new Map();
  const watchedStores = new Map();
  const generationOf = (name) => generations.get(name) || 0;
  const bump = (name) => generations.set(name, generationOf(name) + 1);
  // Whether the collection's changes are heard (its store tells them): only
  // then may rows read earlier stand in for a read now.
  function watchChanges(name, store) {
    if (watchedStores.has(name)) return true;
    if (typeof store.onChange !== 'function') return false;
    try { watchedStores.set(name, store.onChange(() => bump(name))); return true; } catch (_) { return false; }
  }
  const offGenerationFeed = feed?.subscribe((event) => {
    [...watchedStores.keys()].forEach((name) => {
      const label = labelOf(name);
      if (event?.label === label || event?.labels?.includes(label) || (event?.type === 'purge' && !event.label)) bump(name);
    });
  });
  /**
   * Keeps a collection's source meta in step with keys a write added or
   * removed (`toggled`: keys whose presence changed), or forgets it
   * (`null`): the next declared read is then whole. A collection with no
   * meta has nothing to keep.
   */
  async function adjustMeta(name, toggled) {
    // Only a collection whose declared read keeps a cursor has source meta.
    const spec = sources.get(name) || resolve(name)?.decl?.source;
    if (!spec?.read?.cursor) return;
    const meta = await metaOf(name);
    if (!meta) return;
    if (toggled === null || meta.digest === null) { await sourceMeta.set(name, null); return; }
    if (!toggled.added.length && !toggled.removed.length) return;
    let [fnv, djb] = String(meta.digest).split('.').map((part) => parseInt(part, 16));
    [...toggled.added, ...toggled.removed].forEach((key) => {
      const [a, b] = keyHashes(String(key));
      fnv = (fnv ^ a) >>> 0; // eslint-disable-line no-bitwise
      djb = (djb ^ b) >>> 0; // eslint-disable-line no-bitwise
    });
    await sourceMeta.set(name, {
      ...meta, digest: `${fnv.toString(16)}.${djb.toString(16)}`, count: meta.count + toggled.added.length - toggled.removed.length,
    });
  }

  /** A collection name within this service's namespace, or a thrown refusal. */
  function local(name) {
    if (typeof name !== 'string' || !name) throw serviceError('A collection name is required', 'DATA_INVALID');
    let bare = name;
    if (namespace) {
      // A name is this namespace's own when it carries the namespace, or is a
      // name it declares (one may hold a dot); any other dotted name is not.
      if (name.startsWith(`${namespace}.`)) bare = name.slice(namespace.length + 1);
      else if (name.includes('.') && !resolve(name)?.store) throw serviceError(`'${name}' is outside ${namespace}`, 'DATA_FORBIDDEN');
    }
    const found = resolve(bare);
    if (!found?.store) throw serviceError(`Collection '${name}' is not declared`, 'DATA_UNDECLARED');
    return { name: bare, label: labelOf(bare), ...found, store: readOnly(bare, found.store) };
  }
  // A collection's store as every reader sees it: a write through it is
  // refused (writes take the handles its turn gives).
  const readOnlyStores = new WeakMap();
  function readOnly(name, store) {
    if (!readOnlyStores.has(store)) {
      readOnlyStores.set(store, new Proxy(store, {
        get(target, property) {
          const value = target[property];
          if (typeof value !== 'function') return value;
          if (WRITE_METHODS.has(property)) {
            return () => { throw serviceError(`'${name}' written outside its turn`, 'DATA_INVALID'); };
          }
          return value.bind(target);
        },
      }));
    }
    return readOnlyStores.get(store);
  }
  const targetOf = (target) => (typeof target === 'string' ? { collection: target } : { ...target });
  // A query's `where` is known by the function itself: two predicates are two
  // targets, each refreshed and reported on its own.
  const predicates = new WeakMap();
  let predicateCount = 0;
  const predicateId = (where) => {
    if (!predicates.has(where)) { predicateCount += 1; predicates.set(where, `where#${predicateCount}`); }
    return predicates.get(where);
  };
  const queryKey = (query) => (query && typeof query.where === 'function' ? { ...query, where: predicateId(query.where) } : query ?? null);
  const targetKey = (target) => JSON.stringify([target.collection, target.key ?? null, target.window ?? null, queryKey(target.query)]);
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
    const { store, decl } = local(target.collection);
    const keyPath = decl?.keyPath || 'id';
    if (target.query) return (await runQuery(store, keyPath, target.query)).rows;
    if (target.key !== undefined && target.key !== null) return clean(await store.get(String(target.key)));
    return (await store.getAll()).map(clean);
  }

  // One entry per row with unsent changes, oldest change first.
  const outbox = new Map();
  const writes = new Map();
  // Calls still on their way (reads, writes, ingests, purges, the restore of
  // unsent rows): a service with any of them is not idle.
  let working = 0;
  const tracked = (work) => {
    working += 1;
    return Promise.resolve(work).finally(() => { working -= 1; });
  };
  let sequence = 0;
  // Bumped by fence(): work that began before it never queues a change after.
  let fenceGeneration = 0;
  const bare = (row) => Object.fromEntries(Object.entries(row || {}).filter(([field]) => !field.startsWith('_')));
  const pushOf = (name, decl) => (sources.get(name) || decl?.source)?.push || decl?.push;
  const describeError = (error) => ({ code: error?.code || null, status: error?.status ?? null, message: error?.message || String(error) });
  // The server refused the push for access (the account can no longer write
  // it, e.g. after its role or scopes changed): the row stays unsent and is
  // listed as access changed, never sent again on its own.
  const refusedAccess = (error) => Number(error?.status) === 403 || error?.code === 'PermissionDenied' || error?.code === 'DATA_ACCESS_CHANGED';
  // A change held, not refused: it waits for its account to be displayed
  // again and is sent then. It lists as waiting, never as failed.
  const heldBack = (error) => error?.code === 'ACCOUNT_NOT_DISPLAYED';

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
   * Another tab removed rows here (a forced purge, a delete, an eviction): a
   * change queued in this tab for a row that no longer exists is dropped, so
   * it never brings the row back on the server. A queued delete is kept.
   */
  function dropOrphaned(event) {
    // Another tab's writes, and any service's removals in this tab.
    if (!outbox.size || (!event?.remote && !['purge', 'evict'].includes(event?.type))) return;
    const touched = (entry) => event.label === entry.label || event.labels?.includes(entry.label) || (event.type === 'purge' && !event.label);
    [...outbox.values()].filter(touched).forEach((entry) => {
      serial(entry.id, async () => {
        if (outbox.get(entry.id) !== entry) return;
        // A delete of a key that held no row has nothing on the device to lose.
        const last = entry.changes.at(-1);
        if (last?.command.op === 'delete' && (last.revision === undefined || last.revision === null)) return;
        const row = await entry.store.getRaw(entry.key);
        if (row !== undefined && row !== null) return;
        dropPending(entry.label, entry.key);
        emitStatus();
      }).catch(() => { /* kept: the next change event checks again */ });
    });
  }
  const offOrphanFeed = feed?.subscribe((event) => dropOrphaned(event));
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
  /**
   * Removes the listed rows a purge or trim decided. On a store that commits
   * many rows at once, up to 100 go per commit, each re-checked inside it (a
   * row dirty by then stays). A forced removal, or a store without batch
   * deletes, goes row by row in turn with local writes. Resolves the keys
   * removed.
   */
  async function removeRows({ label, store, keys, force }) {
    const removed = [];
    if (force || typeof store.deleteMany !== 'function') {
      for (const key of keys) {
        // eslint-disable-next-line no-await-in-loop
        if (await removeRow({ label, store, key, force })) removed.push(key);
      }
    } else {
      for (let start = 0; start < keys.length; start += PAGE_ROWS) {
        // eslint-disable-next-line no-await-in-loop
        removed.push(...await store.deleteMany(keys.slice(start, start + PAGE_ROWS), { keep: (row) => !!row._dirty, silent: true }));
      }
    }
    // The removals go out together, once: every subscriber hears of them,
    // those watching a removed row included, whichever path removed the rows
    // (a purge, a trim, a read).
    if (removed.length) await store.revalidateSubscribers?.(removed);
    return removed;
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
  function addChange(entry, {
    command, record, revision, restored = false, context = jobContextNow(),
  }) {
    let resolve;
    let reject;
    const done = new Promise((ok, fail) => { resolve = ok; reject = fail; });
    sequence += 1;
    entry.changes.push({
      seq: sequence, command, record, revision, restored, context, resolve, reject,
    });
    return done;
  }
  function enqueuePush(target, change) {
    const entry = entryFor(target);
    const done = addChange(entry, change);
    // A row refused for access stays refused: a later change joins it, unsent,
    // until a person retries.
    if (entry.state === 'access_changed') {
      entry.changes.at(-1).reject(serviceError('Access changed: kept on this device until retried', 'DATA_ACCESS_CHANGED'));
      emitStatus();
      return done;
    }
    if (entry.state !== 'sending') entry.state = 'queued';
    emitStatus();
    drain(entry).catch(() => {});
    return done;
  }
  /**
   * A dirty row with no change in memory, sent again as the row is when it
   * goes out: a `put` of the stored row, or a `delete` of a tombstone. A row
   * whose push was refused for access waits as access changed.
   */
  function restoreEntry(target, row) {
    const entry = entryFor(target);
    const record = bare(row);
    const command = row._deleted ? { op: 'delete', key: String(target.key) } : { op: 'put', record };
    addChange(entry, { command, record: row._deleted ? null : record, revision: row._rev, restored: true }).catch(() => {});
    entry.restored = true;
    if (row._pushRefused === 'access') entry.state = 'access_changed';
    emitStatus();
    return entry;
  }
  async function restoreDirty(target) {
    const generation = fenceGeneration;
    let rows;
    try { rows = await (target.store.getAllRaw ? target.store.getAllRaw() : target.store.getAll()); } catch (_) { return; }
    if (disposed || generation !== fenceGeneration) return;
    const keyPath = target.decl?.keyPath || 'id';
    rows.filter((row) => row?._dirty).forEach((row) => {
      const key = String(row[keyPath]);
      if (outbox.has(`${target.label}:${key}`)) return;
      const entry = restoreEntry({ ...target, key }, row);
      // A row refused for access is sent again only when a person asks.
      if (entry.state !== 'access_changed') drain(entry).catch(() => {});
    });
  }
  /**
   * After a change was sent, the row it came from settles, only while it is
   * still that change: a sent delete removes its tombstone (never a row
   * written since, and never a row when it held none), and a sent put is
   * marked synced at the revision it wrote, recorded as acknowledged
   * (`_ackRev`): the evidence a later check needs that the server has it.
   */
  // Best effort, whole: the server has the change whatever happens here, so
  // no step of it (reading the row included) ever fails the send.
  async function settleSent(entry, change) {
    if (change.revision === undefined || change.revision === null) return;
    try {
      const row = await entry.store.getRaw(entry.key);
      if (!row || row._rev !== change.revision) return;
      if (change.command.op === 'delete') {
        // The sent delete's tombstone goes in the collection's turn, recorded
        // as a change, so a read already on its way never brings the row back.
        if (row._deleted) {
          await inTurn(entry.collection, ({ store }) => store.delete(entry.key, { expectedRevision: change.revision }));
        }
        return;
      }
      await inTurn(entry.collection, ({ store }) => store.markSynced(entry.key, { expectedRevision: change.revision, pushed: true }));
    } catch (_) { /* written again since, or its store retired: it stays as it is */ }
  }
  /**
   * Sends one row's changes oldest first. A failure stops the row there and
   * keeps every change for a retry; the row is marked synced only when the
   * change just sent is still its latest local write. A change a push
   * already acknowledged (the row's `_ackRev` is at or past its revision:
   * this tab or another sent it, or a later state) is not sent: it would put
   * an older state on the server. A row a server read overwrote is no such
   * acknowledgement, so the change still goes (a restored one as it was
   * restored). Edits queued behind a
   * change that its send already holds (written at or before the revision it
   * sends) settle with it; they stay queued until then, so a failed or
   * repeated send, a fence, a discard or a dispose reaches them as it does
   * any change.
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
            // A write: the scheduler never gives up its ownership before it settles.
            await scheduler.request({
              key: lanedKey('push', `${entry.id}:${change.seq}`), target: `push:${laned(entry.label)}`, budgetKey, kind: 'write',
              priority: inForeground() ? PRIORITIES.high : PRIORITIES.background, visible: false,
              run: async () => {
                const push = pushOf(entry.collection, entry.decl);
                if (typeof push !== 'function') throw serviceError(`'${entry.label}' has no push`, 'DATA_NO_SOURCE');
                // The row as it is now, just before it is sent: one refused for
                // access meanwhile (by another service or tab) is not sent, and
                // waits, refused, until a person retries.
                const row = await entry.store.getRaw(entry.key);
                if (row?._pushRefused === 'access') throw serviceError('Access changed: kept on this device until retried', 'DATA_ACCESS_CHANGED');
                const held = (revision) => entry.changes.slice(1)
                  .filter((queued) => Number.isSafeInteger(queued.revision) && queued.revision <= revision);
                // The highest revision of this row a push acknowledged.
                const acked = Number.isSafeInteger(row?._ackRev) ? row._ackRev : null;
                const skip = () => { sent = true; change.skipped = true; change.carries = acked === null ? [] : held(acked); };
                const acknowledged = row && !row._dirty && acked !== null && Number.isSafeInteger(change.revision) && acked >= change.revision;
                if (change.restored) {
                  // Sent as the row is now while it is still an unsent change.
                  // Once it is not, it is skipped only when a push acknowledged
                  // it, or (a delete) its tombstone is gone, which happens only
                  // after one; a server read that replaced or a purge that
                  // removed the row sends the change as it was restored.
                  if (row?._dirty) {
                    change.command = row._deleted ? { op: 'delete', key: entry.key } : { op: 'put', record: bare(row) };
                    change.record = row._deleted ? null : bare(row);
                    change.revision = row._rev;
                  } else if (acknowledged || (!row && change.command.op === 'delete')) { skip(); return; }
                } else if (acknowledged) {
                  // A push acknowledged this change, or a later state of the row.
                  skip(); return;
                }
                change.carries = Number.isSafeInteger(change.revision) ? held(change.revision) : [];
                // Fenced, discarded or disposed while it waited: never sent.
                if (entry.discarded || outbox.get(entry.id) !== entry) throw serviceError('Change fenced', 'DATA_FENCED');
                entry.state = 'sending'; entry.attempts += 1; emitStatus();
                await push(change.command, change.record, change.context);
                sent = true;
                await settleSent(entry, change);
              },
            });
          } catch (error) {
            if (!sent && entry.discarded) {
              entry.changes.forEach((queued) => queued.reject(error));
              throw error;
            }
            if (!sent) {
              const refused = refusedAccess(error);
              entry.state = refused ? 'access_changed' : 'failed'; entry.lastError = describeError(error);
              entry.held = !refused && heldBack(error);
              emitStatus();
              // The refusal stays with the row, so a restart does not send it again on its own.
              if (refused) {
                try {
                  await inTurn(entry.collection, ({ store }) => store.markRow?.(entry.key, { _pushRefused: 'access' }));
                } catch (_) { /* kept in memory */ }
              }
              entry.changes.forEach((queued) => queued.reject(error));
              throw error;
            }
          }
          const settled = [change, ...(change.carries || [])];
          entry.changes = entry.changes.filter((queued) => !settled.includes(queued));
          settled.forEach((done) => done.resolve({ key: entry.key, pushed: !change.skipped }));
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

  /** Stores server rows (see `ingest`), noting nothing as a change of its own. */
  async function ingestRows(collection, rows, { replace = false, scope = null, complete = false } = {}, store) {
    live();
    const { name, decl } = local(collection);
    if (!Array.isArray(rows)) throw serviceError('ingest: rows must be an array', 'DATA_INVALID');
    const keyPath = decl?.keyPath || 'id';
    const inScope = typeof scope === 'function' ? scope : () => true;
    // Only rows the store accepts count, once per key; a refused row never
    // keeps an older stored version alive through a replacement.
    const isAccepted = (row) => row && typeof row === 'object'
      && !(typeof store.validateRecord === 'function' && store.validateRecord(row));
    const kept = new Set(rows.filter(isAccepted).map((row) => String(row[keyPath])));
    // The distinct keys stored: accepted rows the store did not leave as an
    // unsent local write.
    const stored = new Set();
    const unsaved = new Set();
    // A replacement with no scope is of the whole collection.
    const scoped = typeof scope === 'function';
    const upsert = async (chunk, options) => {
      const result = await store.reconcile(chunk, { ...options, keepDirty: true, ...(replace || complete === true ? {} : { syncedAt: null }) });
      const left = new Set((Array.isArray(result?.skipped) ? result.skipped : []).map(String));
      const notSaved = new Set((Array.isArray(result?.unsaved) ? result.unsaved : []).map(String));
      chunk.filter(isAccepted).forEach((row) => {
        const key = String(row[keyPath]);
        if (notSaved.has(key)) { unsaved.add(key); stored.delete(key); } else if (!left.has(key)) { stored.add(key); unsaved.delete(key); }
      });
    };
    const chunks = ingestChunks(rows);
    if (replace && chunks.length <= 1) {
      await upsert(rows, scoped ? { scope: inScope } : {});
    } else {
      for (const chunk of chunks) {
        // Chunks commit in order; each is a bounded complete set.
        // eslint-disable-next-line no-await-in-loop
        await upsert(chunk, { prune: false });
      }
      if (replace) await store.reconcile([], { scope: (row) => inScope(row) && !kept.has(String(row[keyPath])), whole: !scoped });
    }
    const written = stored.size;
    // A replacing or complete ingest is a whole read: the collection is fresh.
    if (replace || complete === true) {
      const state = stateFor(targetKey({ collection: name }));
      state.state = 'fresh'; state.syncedAt = now(); state.error = null;
      emitStatus();
    }
    return { written, ...(unsaved.size ? { unsaved: [...unsaved] } : {}) };
  }

  /**
   * A declared read of a whole collection. With `read.cursor`, it asks only
   * for what changed since the stored cursor while the stored rows are still
   * the whole set the source meta describes (their key digest matches) and a
   * whole read ran within `fullEveryMs`; `fetch` answers `{ rows, cursor,
   * since }` (`since`: it used the cursor) or the rows alone. The answer is
   * stored in the collection's turn (commitDeclared). A refusal (403, 404)
   * purges the collection's rows, unsent ones kept.
   */
  /**
   * The one guard every read of the server goes through when it stores what
   * it read, declared or not: in the collection's turn, a replacement of the
   * collection since the read began drops its answer, a read that lost its
   * protection (too many changes to track) reads again, and rows changed
   * since it began are neither written nor removed by it.
   */
  // Every listener this service installed (its subscriptions and watches):
  // disposing the service removes them, including those on the shared feed.
  const installed = new Set();
  function held(off) {
    let done = false;
    const stop = () => {
      if (done) return;
      done = true;
      installed.delete(stop);
      try { off(); } catch (_) { /* gone */ }
    };
    installed.add(stop);
    return stop;
  }
  // A commit that lost its protection part way asks for the read again.
  const READ_AGAIN = Symbol('read again');
  async function guardedRead(name, read, commit, { isCurrent = () => true } = {}) {
    for (let attempt = 0; attempt < READ_TRIES; attempt += 1) {
      // Each read begins at its own point: what a read that began later
      // records is later than it, and what one that began earlier records
      // is earlier.
      touchSequence += 1;
      const startedAt = touchSequence;
      // eslint-disable-next-line no-await-in-loop
      const answer = await read(startedAt);
      if (!isCurrent()) return undefined;
      // What it stores is recorded as of the read's start: a read that began
      // later and answers after it is not taken for a local edit.
      // eslint-disable-next-line no-await-in-loop
      const outcome = await inTurn(name, async (turn) => {
        // Still wanted, checked again in the turn, just before it commits.
        if (!isCurrent()) return { dropped: true };
        if (replacedAfter(name, startedAt)) return { dropped: true };
        if (protectionLost(name, startedAt)) return null;
        const value = await commit(answer, touchedAfter(name, startedAt), startedAt, turn);
        return value === READ_AGAIN ? null : { value };
      }, { at: startedAt });
      if (outcome) return outcome.dropped ? undefined : outcome.value;
    }
    throw serviceError(`'${name}' changed on this device faster than it could be read`, 'DATA_BUSY');
  }
  /**
   * A read of part or all of a collection by a caller's own fetch (an MP's
   * window cache or live query), stored through the one guard. A failed fetch
   * leaves the collection as it was. Resolves the stored rows in `scope`.
   */
  async function reconcileWindow(name, store, keyPath, {
    fetch, toRecord = (dto) => dto, keyOf, scope = () => true, window, windowKey, complete = false, keepDirty = false, rethrow = false, context,
  }) {
    // No fetch (a store its own writer fills), or a failed one: the rows as they are.
    if (typeof fetch !== 'function') return store.readWhere(scope);
    let failed = false;
    const stored = await guardedRead(name, async () => {
      try { return await fetch(window, context); } catch (error) {
        if (rethrow) throw error;
        failed = true;
        return null;
      }
    }, (dtos, touched, _startedAt, turn) => (failed ? null : reconcileFetched(turn.store, keyPath, { fetch: () => dtos, toRecord, keyOf }, scope, window, windowKey, {
      onPersistError, rethrow, keepDirty, skip: touched, ...(complete ? {} : { syncedAt: null }),
    })));
    // The reconcile answers with its own read of the scope.
    return Array.isArray(stored) ? stored : store.readWhere(scope);
  }
  async function readDeclared(target, spec, wanted, isCurrent, { full = false, context = jobContextNow() } = {}) {
    const { name, store, keyPath } = target;
    const { cursor: keepsCursor = false, fullEveryMs = FULL_EVERY_MS, forbidden = 'purge' } = spec.read;
    // Through the one read guard; each attempt decides afresh from the
    // stored rows and their meta whether it may ask only for what changed.
    const outcome = await guardedRead(name, async () => {
      let since = null;
      let read = null;
      if (keepsCursor && !full) {
        const observed = watchChanges(name, store);
        const generation = generationOf(name);
        const [meta, rows] = await Promise.all([metaOf(name), rawRows(store)]);
        read = observed ? { rows, generation } : null;
        const keys = rows.map((row) => String(row[keyPath]));
        const whole = !!meta && typeof meta.digest === 'string' && meta.count === keys.length && meta.digest === keysDigest(keys);
        // A cursor vouches for the rows it left only while they stay readable:
        // a whole read confirms (writes again) rows last written over
        // confirmAfterMs ago, so one runs at least that often, before the
        // store's age limit hides them.
        const wholeWithin = Math.min(fullEveryMs, confirmAfterMs(store));
        if (whole && typeof meta.cursor === 'string' && meta.cursor && Number.isFinite(meta.fullAt) && now() - meta.fullAt < wholeWithin) since = meta.cursor;
      }
      try {
        return { answer: await spec.fetch(wanted, { ...context, since }), since, read };
      } catch (error) {
        if (forbidden === 'purge' && [403, 404].includes(Number(error?.status)) && isCurrent()) {
          await service.purge(name, {}).catch(() => {}); // eslint-disable-line no-use-before-define
        }
        throw error;
      }
    }, async ({ answer, since, read }, _touched, startedAt, turn) => {
      if (snapshotRows(answer) === null) return NO_SNAPSHOT;
      const stored = await commitDeclared(target, spec, answer, {
        startedAt, since, isCurrent, read, turn,
      });
      return stored === 'read_again' ? READ_AGAIN : undefined;
    }, { isCurrent });
    return outcome === NO_SNAPSHOT ? NO_SNAPSHOT : undefined;
  }

  /**
   * Stores a declared read's answer, in the collection's turn, after the read
   * guard's checks, deciding then what it keeps: a key stored or removed by
   * anything else after the read began keeps that change (checked again
   * before each chunk and the removals), and a read whose protection was
   * dropped part way (more keys touched meanwhile than are kept) stops and
   * answers `read_again`. Each answered row becomes its
   * record with the stored row as `prev` (the same keyed lookup a refresh
   * uses), and its record's key decides. A read of changes removes the rows
   * `removedField` marks and stores the rest; a whole read stores every row,
   * then removes the rows it left out (unsent ones stay). The source meta is
   * written last:
   *   - every row of the answer stored: the new cursor, and the digest of the
   *     keys the read left (none when a read of changes found the rows no
   *     longer the whole set its cursor describes);
   *   - a row the store could not keep: the old cursor, and a whole read
   *     leaves no digest, so the refused change is asked for again.
   * A record the collection's schema refuses is reported and never stored.
   */
  async function commitDeclared({ name, label, store, keyPath }, spec, answer, {
    startedAt, since, isCurrent, read = null, turn,
  }) {
    // A declared read's own commit writes through the turn's raw store: it is
    // the read the others' recorded changes are kept from.
    const { raw } = turn;
    const { cursor: keepsCursor = false, removedField = null } = spec.read;
    if (!isCurrent()) return 'dropped';
    const keyOf = (row) => String(row[keyPath]);
    // The rows read before fetching, while nothing has changed them since.
    const rows = read && generationOf(name) === read.generation ? read.rows : await rawRows(store);
    const present = new Set(rows.map(keyOf));
    const dtos = snapshotRows(answer) || [];
    const toRecord = spec.toRecord || ((dto) => dto);
    const dtoKey = typeof spec.keyOf === 'function' ? spec.keyOf : (dto) => dto[keyPath];
    const previous = previousByKey(rows, keyPath);
    // An answer counts only when every entry of it is a row with a key: one
    // that is not fails the whole answer, which removes nothing and leaves
    // the collection not fresh.
    const invalid = () => Object.assign(new Error(`'${name}': an answered entry is not a row with a key`), { name: 'DataServiceError', code: 'DATA_INVALID' });
    if (dtos.some((dto) => !dto || typeof dto !== 'object')) throw invalid();
    const mapped = dtos.map((dto) => {
      const key = dtoKey(dto);
      return { dto, record: toRecord(dto, key === undefined || key === null ? undefined : previous.get(String(key))) };
    });
    if (mapped.some(({ record }) => !record || typeof record !== 'object' || record[keyPath] === undefined || record[keyPath] === null)) throw invalid();
    const changesOnly = since !== null && answer?.since === true;
    const removedKeys = new Set(removedField
      ? mapped.filter(({ dto }) => dto[removedField] !== undefined && dto[removedField] !== null).map(({ record }) => keyOf(record)) : []);
    const refusals = [];
    const records = mapped.map(({ record }) => record).filter((record) => {
      if (removedKeys.has(keyOf(record))) return false;
      const why = typeof store.validateRecord === 'function' ? store.validateRecord(record) : null;
      if (why) refusals.push(why);
      return !why;
    });
    if (refusals.length) reportRejected(store, refusals, onPersistError);
    // A whole answer larger than the collection may hold is refused whole:
    // storing part of it would look like the whole list.
    const limit = local(name).decl?.maxRows;
    if (!changesOnly && Number.isSafeInteger(limit) && records.length > limit) {
      throw serviceError(`'${name}' answered ${records.length} rows; this device keeps at most ${limit}`, 'DATA_TOO_LARGE');
    }
    // A job no longer current, or whose protection was dropped, stops between
    // commits: the rows it wrote stay, and the collection's source meta is
    // forgotten, so the next read is whole.
    const halted = () => !isCurrent() || protectionLost(name, startedAt);
    const stop = async () => {
      if (keepsCursor) await sourceMeta.set(name, null).catch(() => {});
      return isCurrent() ? 'read_again' : 'dropped';
    };
    const written = new Set();
    const unsaved = new Set();
    // What this commit did, recorded as of the read's start (recordEffect):
    // its written and removed keys; a whole read that completed, the whole
    // collection.
    const recordCommit = (whole) => recordEffect(name, whole
      ? { whole: true, at: startedAt } : { changedKeys: [...written], removedKeys: removed, at: startedAt });
    const noteResult = (chunk, result) => {
      const left = new Set((Array.isArray(result?.skipped) ? result.skipped : []).map(String));
      const notSaved = new Set((Array.isArray(result?.unsaved) ? result.unsaved : []).map(String));
      chunk.forEach((record) => {
        const key = keyOf(record);
        if (notSaved.has(key)) unsaved.add(key);
        else if (!left.has(key)) written.add(key);
      });
    };
    let removed = [];
    // Rows sent to the store: a chunk that fails part way may have stored some.
    const attempted = new Set();
    const commitChunk = async (chunk, options) => {
      chunk.forEach((record) => attempted.add(keyOf(record)));
      noteResult(chunk, await raw.reconcile(chunk, options));
    };
    const stopHere = () => { recordCommit(false); return stop(); };
    try {
      if (changesOnly) {
        const touched = touchedAfter(name, startedAt);
        removed = await removeRows({ label, store: raw, keys: [...removedKeys].filter((key) => !touched.has(key) && present.has(key)), force: false });
      }
      if (halted()) return stopHere();
      const unchanged = (touched) => (row) => !touched.has(keyOf(row));
      if (changesOnly) {
        for (const batch of ingestChunks(records)) {
          if (halted()) return stopHere();
          const touched = touchedAfter(name, startedAt);
          const chunk = batch.filter(unchanged(touched));
          // Chunks commit in order.
          // eslint-disable-next-line no-await-in-loop
          if (chunk.length) await commitChunk(chunk, { prune: false, keepDirty: true });
        }
      } else {
        // An answer the store cannot keep whole is refused before anything
        // goes: the rows it holds stay as the last usable set.
        const unfit = typeof raw.fitsWhole === 'function' ? raw.fitsWhole(records) : null;
        if (unfit) throw Object.assign(serviceError(`'${name}' answered rows this device cannot keep (${unfit})`, 'DATA_TOO_LARGE'), { reason: unfit });
        // The rows it left out go first, so the rows it answered fit beside
        // the ones it adds, and none it answered is evicted for them.
        const answered = new Set(records.map(keyOf));
        const touchedBefore = touchedAfter(name, startedAt);
        removed = await removeRows({
          label, store: raw, keys: rows.filter((row) => !row._dirty && !answered.has(keyOf(row)) && !touchedBefore.has(keyOf(row))).map(keyOf), force: false,
        });
        if (halted()) return stopHere();
        // A whole read writes the rows it changed (and the unchanged ones last
        // written a day or more ago, or half the store's age limit), keeps the
        // rest as they are, and removes the rows it left out. One row is always
        // written, which stamps the collection synced.
        const touched = touchedAfter(name, startedAt);
        const stored = new Map(rows.map((row) => [keyOf(row), row]));
        const confirmBefore = now() - confirmAfterMs(store);
        const toWrite = [];
        let oldest = null;
        records.forEach((record) => {
          const key = keyOf(record);
          if (touched.has(key)) return;
          const row = stored.get(key);
          if (!row || row._dirty || row._persistFailed || contentOf(record) !== contentOf(row)) { toWrite.push(record); return; }
          const at = Date.parse(row._updatedAt || '');
          if (!Number.isFinite(at) || at < confirmBefore) { toWrite.push(record); return; }
          written.add(key);
          if (!oldest || at < oldest.at) oldest = { record, at };
        });
        if (!toWrite.length && oldest) toWrite.push(oldest.record);
        for (const batch of ingestChunks(toWrite)) {
          if (halted()) return stopHere();
          const touchedSince = touchedAfter(name, startedAt);
          const chunk = batch.filter(unchanged(touchedSince));
          // eslint-disable-next-line no-await-in-loop
          if (chunk.length) await commitChunk(chunk, { prune: false, keepDirty: true, protect: [...answered] });
        }
      }
    } catch (error) {
      // A commit that failed part way records what it may have stored and
      // removed, as of the read's start, so a read begun before it never
      // undoes those rows.
      recordEffect(name, { changedKeys: [...written, ...attempted], removedKeys: removed, at: startedAt });
      throw error;
    }
    if (halted()) return stopHere();
    recordCommit(!changesOnly);
    if (!keepsCursor) return 'stored';
    // The keys the read leaves: what it stored, and the rows it kept as
    // they were (unsent, or changed by anything else since it began); a row
    // the store could not keep is there only if it was before.
    const touched = touchedAfter(name, startedAt);
    const kept = rows.filter((row) => row._dirty || touched.has(keyOf(row)) || (changesOnly && !removed.includes(keyOf(row)))).map(keyOf);
    const left = new Set([...kept, ...written, ...[...unsaved].filter((key) => present.has(key))]);
    const cursor = typeof answer?.cursor === 'string' && answer.cursor ? answer.cursor : null;
    const before = await metaOf(name);
    const allSaved = unsaved.size === 0;
    // A read of changes leaves the whole set only if the rows were the whole
    // set its cursor describes when its turn came.
    const wasWhole = !!before && typeof before.digest === 'string' && before.count === present.size && before.digest === keysDigest(present);
    const whole = changesOnly ? wasWhole : allSaved;
    let nextCursor;
    if (!allSaved) nextCursor = changesOnly ? before?.cursor ?? null : null;
    else nextCursor = changesOnly ? cursor ?? before?.cursor ?? null : cursor;
    await sourceMeta.set(name, {
      cursor: nextCursor,
      fullAt: changesOnly ? (before?.fullAt ?? null) : now(),
      count: whole ? left.size : null,
      digest: whole ? keysDigest(left) : null,
    });
    return 'stored';
  }

  /** A refresh of `target` as the principal in `context` (taken when it was asked). */
  function refreshAs(target, { mode = 'silent', priority = 'normal', maxAge = 0, reason = null, full = false } = {}, context) {
    live();
    const wanted = targetOf(target);
    const { name, label, store, decl } = local(wanted.collection);
    if (wanted.query) checkQuery(wanted.query);
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
    // A read in flight as another form of the account is not joined: this
    // one reads after it, as the principal it was asked as. Nor is a read of
    // changes by a whole read (`full`): it reads whole after it. A read of
    // changes may join a whole read.
    const form = formOf(context);
    if (state.flight && state.flightForm === form && (!full || state.flightFull)) return settle(state.flight);
    if (state.flight) {
      return settle(state.flight.catch(() => {}).then(() => refreshAs(target, {
        mode: 'visible', priority, maxAge: 0, reason, full,
      }, context)));
    }
    state.state = 'refreshing';
    emitStatus();
    const keyPath = decl?.keyPath || 'id';
    // A server copy never replaces a row with an unsent local change.
    const run = async (isCurrent) => {
      if (wanted.key !== undefined && wanted.key !== null) {
        const rowKey = String(wanted.key);
        // Stored through the one read guard (a change to the row since the
        // read began is kept), and recorded as a change of the row: a
        // declared read already on its way keeps it.
        await guardedRead(name, () => spec.fetch(wanted, context), async (dto, touched, _startedAt, { store: writer }) => {
          if (touched.has(rowKey)) return;
          if (!dto) {
            // Decided in turn with local writes to the row, on the row as it is then.
            await serial(`${label}:${rowKey}`, async () => {
              const current = await store.getRaw?.(rowKey);
              if (!current || current._dirty) return;
              try {
                await writer.delete(rowKey, Number.isSafeInteger(current._rev) ? { expectedRevision: current._rev } : {});
              } catch (error) { if (error?.reason !== 'conflict') throw error; }
            });
            return;
          }
          const prev = await store.getRaw?.(rowKey);
          const record = (spec.toRecord || ((value) => value))(dto, prev ? previousByKey([prev], keyPath).get(rowKey) : prev);
          // One record leaves the collection's synced stamp as it was.
          await writer.reconcile([record], { prune: false, keepDirty: true, syncedAt: null });
        }, { isCurrent });
        return;
      }
      if (spec.read && !wanted.query && !wanted.window && typeof spec.scope !== 'function') {
        return readDeclared({ name, label, store, keyPath }, spec, wanted, isCurrent, { full, context });
      }
      // A query target prunes only the rows of that query; a list or window
      // target the source's scope (the whole collection without one).
      let scope = typeof spec.scope === 'function' ? spec.scope(wanted) : () => true;
      if (wanted.query && typeof spec.scope !== 'function') {
        const { limit: _limit, cursor: _cursor, raw: _raw, where, ...range } = wanted.query;
        if (range.index) {
          const held = new Set((await rangeKeys(store, keyPath, wholeRange(range, 'refresh'))).map((entry) => entry.key));
          scope = (row) => held.has(String(row[keyPath]));
        } else if (typeof where === 'function') scope = (row) => where(row);
      }
      // Only a read of the whole collection marks it synced.
      const whole = !wanted.query && typeof spec.scope !== 'function';
      // Fetched first; stored through the one read guard.
      return guardedRead(name, async () => snapshotRows(await spec.fetch(wanted, context)), (dtos, touched, _startedAt, turn) => (dtos === null ? NO_SNAPSHOT
        : reconcileFetched(turn.store, keyPath, { fetch: () => dtos, toRecord: spec.toRecord || ((dto) => dto), keyOf: spec.keyOf },
          scope, wanted.window, windowKeyOf(wanted.window), {
            onPersistError, rethrow: true, keepDirty: true, skip: touched, ...(whole ? {} : { syncedAt: null }),
          })), { isCurrent });
    };
    state.flightForm = form;
    state.flightFull = full === true;
    state.flight = scheduler.request({
      key: lanedKey('data', `${label}:${key}`), target: laned(label), budgetKey: spec.budgetKey || budgetKey, reason,
      ...(inForeground()
        ? { priority: PRIORITIES[priority] ?? PRIORITIES.normal, visible: mode === 'visible' }
        : { priority: PRIORITIES.background, visible: false }),
      run,
    }).then((outcome) => {
      // A read that answered no list leaves the collection as it was, not fresh.
      if (outcome === NO_SNAPSHOT) { if (state.state === 'refreshing') state.state = 'stale'; return; }
      state.state = 'fresh'; state.syncedAt = now(); state.error = null;
    }, (error) => {
      state.state = isOnline() ? 'error' : 'offline'; state.error = { code: error?.code || null, status: error?.status ?? null, message: error?.message || String(error) };
      throw error;
    }).finally(() => { state.flight = null; state.flightForm = null; state.flightFull = false; emitStatus(); });
    return settle(state.flight);
  }

  const service = {
    namespace,
    // Rows come as copies without storage metadata. `raw` reads as writers
    // see the collection (rows past the paint ceiling and the store's age
    // limit, and unsent tombstones), metadata kept, for a caller checking what
    // it painted or deciding what to remove.
    async read(collection, key, { raw = false } = {}) {
      live();
      const { store } = local(collection);
      const one = async (item) => (raw ? copyRow(await store.getRaw(String(item))) : clean(await store.get(String(item))));
      if (Array.isArray(key)) return Promise.all(key.map(one));
      if (key !== undefined && key !== null) return one(key);
      return raw ? (await store.getAllRaw()).map(copyRow) : (await store.getAll()).map(clean);
    },
    // `raw: true` answers as writers see the collection (rows past the paint
    // ceiling and the age limit included), for a caller deciding what to remove.
    async query(collection, spec = {}) {
      live();
      const { store, decl } = local(collection);
      return runQuery(store, decl?.keyPath || 'id', spec);
    },
    /**
     * A read of part or all of a collection by the caller's own `fetch(window,
     * context)` (a window cache, a live query), stored through the one read
     * guard every read uses: rows changed since it began are kept. A failed
     * fetch leaves the collection as it was (`rethrow` to hear it). Resolves
     * the stored rows in `scope`.
     */
    async reconcileWindow(collection, options = {}) {
      live();
      const { name, store, decl } = local(collection);
      return reconcileWindow(name, store, decl?.keyPath || 'id', { ...options, context: jobContextNow() });
    },
    /**
     * A collection's store for a caller that writes it directly (an MP's own
     * store handle): reads go straight to the store, and every write goes in
     * the collection's turn, recorded as a change of its rows, so a read
     * already on its way never undoes it. Once the service is disposed a
     * write rejects as a retired store's does (`reason: 'retired'`).
     */
    writer(collection) {
      live();
      const { name, store } = local(collection);
      return new Proxy(store, {
        get(target, property) {
          const value = target[property];
          if (typeof value !== 'function') return value;
          if (!WRITE_METHODS.has(property)) return value;
          // Once the service is retired its handle refuses as a retired store does.
          return (...args) => (disposed
            ? Promise.reject(Object.assign(new Error('Data store retired'), { name: 'StorageReadError', reason: 'retired', code: 'DATA_RETIRED' }))
            : tracked(inTurn(name, (turn) => turn.store[property](...args))));
        },
      });
    },
    /**
     * Calls `listener()` whenever the collection may have changed (a write
     * here, another tab's, an eviction or a purge), without reading it: for a
     * caller that keeps something derived from the rows and reads again only
     * when told.
     */
    watch(collection, listener) {
      live();
      const { store, label } = local(collection);
      const fire = () => { try { listener(); } catch (_) { /* isolated */ } };
      const offStore = typeof store.onChange === 'function' ? store.onChange(fire) : store.subscribe(fire);
      const offFeed = feed?.subscribe((event) => {
        if (event.label === label || event.labels?.includes(label) || (event.type === 'purge' && !event.label)) fire();
      });
      return held(() => { offStore?.(); offFeed?.(); });
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
      if (wanted.query) checkQuery(wanted.query);
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
      return held(() => { active = false; offStore?.(); offFeed?.(); });
    },
    /**
     * Registers how a collection syncs: `fetch(target) → DTO[] | DTO | null`,
     * with `budgetKey` (optional) the scheduler budget and circuit its
     * refreshes run in (the service's own without one),
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
      if (spec.read !== undefined) checkRead(spec.read);
      if (spec.budgetKey !== undefined && (typeof spec.budgetKey !== 'string' || !spec.budgetKey)) {
        throw serviceError('source.budgetKey must be a name', 'DATA_INVALID');
      }
      sources.set(name, spec);
      // With a push, every dirty row in the collection is an unsent change:
      // ones this service has no record of (it was rebuilt) are sent again.
      if (typeof spec.push === 'function') {
        const { label, store, decl } = local(collection);
        tracked(restoreDirty({ name, label, store, decl })).catch(() => {});
      }
      return () => { if (sources.get(name) === spec) sources.delete(name); };
    },
    /** Whether `collection` sends its local changes (a push is registered or declared). */
    sends(collection) {
      const { name, decl } = local(collection);
      return typeof pushOf(name, decl) === 'function';
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
     * the fetch while the last successful sync is younger than it. A query
     * target without an index prunes the rows its `where` selects; its status,
     * `maxAge` and coalescing belong to that `where` function. `full` makes a
     * declared read read the whole collection whatever its cursor.
     */
    refresh(target, options = {}) {
      // The principal it reads as, taken when it is asked.
      return refreshAs(target, options, jobContextNow());
    },    /**
     * Stores rows a domain received from the server (a page, an event, a
     * detail read) as synced rows: views subscribed to them update, nothing is
     * pushed. A row with an unsent local write keeps that write: the server's
     * copy does not replace it. With `replace`, the rows are the complete set
     * for `scope` (a row predicate; the whole collection without one): rows in
     * scope that the set leaves out are removed, dirty rows never. After a
     * replacing or `complete` ingest the collection is fresh. Resolves
     * `{ written }`, the rows stored, and `unsaved`, the keys of rows a store
     * could keep only in memory (its device storage refused them). With
     * `ifEmpty`, the rows (an earlier copy, such as a restored snapshot) are
     * stored only while the collection holds none, decided in its turn, and
     * as rows no newer than any read: a read already on its way replaces them.
     */
    // A replacing ingest, or one of rows a complete read delivered
    // (`complete`), stamps the collection synced; any other does not.
    async ingest(collection, rows, options = {}) {
      live();
      const { name, store, decl } = local(collection);
      const keyPath = decl?.keyPath || 'id';
      // In the collection's turn, through the store that records what it
      // changes: a replacement removes rows it leaves out, and a read already
      // on its way never brings them back.
      return inTurn(name, async (turn) => {
        // A replacement ends what a declared read's cursor describes; a few
        // rows keep the source meta in step with the keys they add.
        const tracksMeta = !!(sources.get(name) || decl?.source)?.read?.cursor;
        if (options?.ifEmpty === true) {
          if ((await store.getAllRaw()).length) return { written: 0 };
          const adopted = await ingestRows(collection, rows, { complete: false }, turn.raw);
          if (tracksMeta) await adjustMeta(name, null);
          return adopted;
        }
        const small = tracksMeta && !options?.replace && Array.isArray(rows) && rows.length <= PAGE_ROWS;
        const keys = small ? [...new Set(rows.filter((row) => row && typeof row === 'object').map((row) => String(row[keyPath])))] : [];
        const before = small ? await Promise.all(keys.map(async (key) => !!(await store.getRaw(key)))) : [];
        const result = await ingestRows(collection, rows, options, turn.store);
        if (small) {
          const after = await Promise.all(keys.map(async (key) => !!(await store.getRaw(key))));
          await adjustMeta(name, {
            added: keys.filter((key, at) => !before[at] && after[at]), removed: keys.filter((key, at) => before[at] && !after[at]),
          });
        } else if (tracksMeta) await adjustMeta(name, null);
        return result;
      });
    },
    /**
     * Applies a change the server made (`patch`, the fields it set) to the
     * rows of `keys` as they are when it is written: the store reads and
     * writes each row as one step (a revision-checked commit on the host
     * store), so a change or removal by another service or tab that lands
     * first is kept. Nothing else in a row changes, a row that is gone stays
     * gone, a row with an unsent local write keeps it, nothing is pushed, and
     * a read already on its way never undoes it. Resolves the store's account
     * of it: `{ patched, unsaved, skipped: [{ key, reason }], refused: [{ key, reason }] }`.
     */
    async patchRows(collection, keys, patch) {
      live();
      const { name, store, decl } = local(collection);
      const keyPath = decl?.keyPath || 'id';
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw serviceError('patchRows: patch must be an object of fields', 'DATA_INVALID');
      if (Object.keys(patch).some((field) => field === keyPath || field.startsWith('_'))) {
        throw serviceError('patchRows: a patch sets fields, never a row\'s key or storage fields', 'DATA_INVALID');
      }
      if (typeof store.patchSynced !== 'function') throw serviceError(`patchRows: '${name}' cannot patch rows`, 'DATA_INVALID');
      const wanted = [...new Set((Array.isArray(keys) ? keys : [keys]).filter((key) => key !== null && key !== undefined).map(String))];
      if (!wanted.length) return { patched: [], unsaved: [], skipped: [], refused: [] };
      // In the collection's turn, recorded as a change of these rows, a
      // store transaction's worth of keys at a time; every key is accounted for.
      return inTurn(name, async ({ store: writer }) => {
        const outcome = { patched: [], unsaved: [], skipped: [], refused: [] };
        for (let start = 0; start < wanted.length; start += PAGE_ROWS) {
          // eslint-disable-next-line no-await-in-loop
          const part = await writer.patchSynced(wanted.slice(start, start + PAGE_ROWS), { ...patch });
          Object.keys(outcome).forEach((field) => { outcome[field].push(...(part?.[field] || [])); });
        }
        return outcome;
      });
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
      // The principal it is sent as, taken when it is asked.
      const context = jobContextNow();
      const generation = fenceGeneration;
      const { name, label, store, decl } = local(collection);
      const keyPath = decl?.keyPath || 'id';
      if (!['put', 'patch', 'delete'].includes(command?.op)) throw serviceError('mutate: op must be put, patch or delete', 'DATA_INVALID');
      const key = String(command.op === 'put' ? command.record?.[keyPath] : command.key);
      const push = pushOf(name, decl);
      // In the collection's turn, through the store that records what it
      // changes; one local write per row at a time, so each push knows the
      // revision it wrote.
      const written = await inTurn(name, ({ store: writer }) => serial(`${label}:${key}`, async () => {
        let record = null;
        let held = null;
        if (command.op === 'put') {
          record = command.record;
          await writer.put(record);
        } else if (command.op === 'patch') {
          record = bare({ ...((await store.getRaw(key)) || {}), ...command.patch });
          await writer.put(record);
        } else if (typeof push === 'function' && typeof store.markRow === 'function' && (held = await store.getRaw(key))) {
          // A delete to send stays a hidden, unsent tombstone until it is sent,
          // so a reload sends it again. It keeps only its key, so it holds no
          // indexed value.
          await writer.markRow(key, { _deleted: true }, { dirty: true, body: { [keyPath]: held[keyPath] } });
        } else await writer.delete(key);
        const revision = typeof push !== 'function' ? undefined : (await store.getRaw(key))?._rev;
        return { record, revision };
      }));
      if (typeof push !== 'function') return { key, pushed: false };
      // Fenced while the local write ran: the row stays unsent on disk for
      // the principal it was written under.
      if (generation !== fenceGeneration || disposed) return { key, pushed: false };
      const change = enqueuePush({ name, label, key, store, decl }, {
        command, record: written.record, revision: written.revision, context,
      });
      if (wait) return change;
      change.catch(() => {});
      return { key, pushed: false };
    },
    /**
     * Queued and failed pushes, one per row, for a pending-sync view. `state`
     * is queued, sending, failed (sent again on retry or reconnect) or
     * access_changed (refused for access; sent again only when asked).
     */
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
        // A held change (its account not displayed) is waiting, not failed:
        // the next retry sends it.
        state: entry.held && entry.state === 'failed' ? 'queued' : entry.state,
        ...(entry.held ? { waiting: 'account' } : {}),
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
        const generation = fenceGeneration;
        const push = pushOf(name, decl);
        const row = typeof push === 'function' ? await store.getRaw?.(String(key)) : null;
        if (!row?._dirty || generation !== fenceGeneration || disposed) return { key, pushed: false };
        entry = outbox.get(id) || restoreEntry({ name, label, key: String(key), store, decl }, row);
      }
      if (!entry.draining && ['failed', 'access_changed'].includes(entry.state)) {
        // A person asked: a refusal for access is cleared from the row, and the
        // row is sent once, as it is now, whatever edits joined it meanwhile.
        if (entry.state === 'access_changed') {
          try { await inTurn(name, ({ store: writer }) => writer.markRow?.(String(key), { _pushRefused: null })); } catch (_) { /* sent anyway */ }
          const row = await store.getRaw?.(String(key));
          if (row?._dirty) {
            entry.changes.splice(0);
            const record = bare(row);
            const command = row._deleted ? { op: 'delete', key: String(key) } : { op: 'put', record };
            addChange(entry, { command, record: row._deleted ? null : record, revision: row._rev, restored: true }).catch(() => {});
          }
        }
        entry.state = 'queued'; emitStatus();
      }
      return drain(entry);
    },
    /** Sends again every change that failed (never one refused for access), e.g. on reconnect. */
    retryFailed() {
      return Promise.allSettled([...outbox.values()].filter((entry) => entry.state === 'failed' && !entry.draining).map((entry) => {
        entry.state = 'queued';
        return drain(entry);
      }));
    },
    /**
     * Drops every queued change from memory, e.g. when the signed-in principal
     * changes: the rows stay unsent on disk, and that principal's next
     * service sends them again.
     */
    fence() {
      fenceGeneration += 1;
      outbox.forEach((entry) => {
        entry.discarded = true;
        entry.changes.splice(0).forEach((change) => change.reject(serviceError('Change fenced', 'DATA_FENCED')));
      });
      outbox.clear();
      emitStatus();
    },
    /**
     * Drops a pending local change after an explicit confirm, in turn with
     * local writes to the row, so a change made just before is dropped too.
     */
    async discard(collection, key) {
      const { name, label } = local(collection);
      await inTurn(name, ({ store: writer }) => serial(`${label}:${String(key)}`, async () => {
        dropPending(label, key);
        await writer.delete(String(key));
      }));
      emitStatus();
    },
    /**
     * Clears a collection's cached rows, or only `keys`, or every row of an
     * index range (`query: { index, prefix | equals | lower | upper }`; paging
     * fields are refused). Dirty rows stay unless `force`; a forced removal
     * drops their unsent changes, in this tab and in other tabs.
     */
    async purge(collection, options = {}) {
      live();
      // Only the options it knows, in the shapes it reads: a misspelt or
      // malformed option is refused rather than clear the whole collection.
      const invalid = !options || typeof options !== 'object' || Array.isArray(options)
        || Object.keys(options).some((field) => !['force', 'keys', 'query'].includes(field))
        || (options.force !== undefined && typeof options.force !== 'boolean')
        || (options.keys !== undefined && options.keys !== null && !Array.isArray(options.keys))
        || (options.query !== undefined && options.query !== null && (typeof options.query !== 'object' || Array.isArray(options.query)));
      if (invalid) throw serviceError('purge: options are force, keys (an array) and query (an index range)', 'DATA_INVALID');
      const { force = false, keys = null, query = null } = options;
      const {
        name, label, store, decl,
      } = local(collection);
      const keyPath = decl?.keyPath || 'id';
      const range = query ? wholeRange(query, 'purge') : null;
      const whole = !Array.isArray(keys) && !query;
      // Listed and removed in the collection's turn.
      return inTurn(name, async (turn) => {
        // A barrier as wide as the purge, whatever it finds to remove: every
        // read begun before it stores nothing of the keys it names, or (a
        // whole or range purge) nothing at all, so a row it purged, or one
        // not held yet, never arrives after it.
        if (Array.isArray(keys)) recordEffect(name, { changedKeys: keys.map(String) });
        else recordEffect(name, { whole: true });
        let entries;
        if (Array.isArray(keys)) {
          entries = (await Promise.all(keys.map((key) => store.getRaw(String(key))))).filter(Boolean)
            .map((row) => ({ key: String(row[keyPath]), dirty: !!row._dirty }));
        } else if (range) entries = await rangeKeys(store, keyPath, range);
        else entries = (await rawRows(store)).map((row) => ({ key: String(row[keyPath]), dirty: !!row._dirty }));
        const removed = await removeRows({
          label, store: turn.store, keys: entries.filter(({ dirty }) => force || !dirty).map(({ key }) => key), force,
        });
        await adjustMeta(name, whole ? null : { added: [], removed });
        return { removed };
      });
    },
    /**
     * Keeps the newest `keep` rows of an index range (the last in index
     * order) and removes the older ones. Dirty rows are never removed.
     */
    async trim(collection, spec = {}) {
      live();
      const {
        name, label, store, decl,
      } = local(collection);
      if (typeof spec.index !== 'string' || !Number.isSafeInteger(spec.keep) || spec.keep < 0) throw serviceError('trim: index and keep are required', 'DATA_INVALID');
      const keyPath = decl?.keyPath || 'id';
      const range = wholeRange(spec, 'trim');
      // Listed and removed in the collection's turn.
      return inTurn(name, async (turn) => {
        const entries = await rangeKeys(store, keyPath, range);
        const older = entries.slice(0, Math.max(0, entries.length - spec.keep)).filter(({ dirty }) => !dirty).map(({ key }) => key);
        const removed = await removeRows({ label, store: turn.store, keys: older, force: false });
        await adjustMeta(name, { added: [], removed });
        return { removed };
      });
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
    /**
     * Whether nothing is queued or running: no unsent change in memory, no
     * local write, read, ingest or purge on its way, and no refresh flying.
     */
    idle() {
      return outbox.size === 0 && writes.size === 0 && turns.size === 0 && working === 0
        && ![...states.values()].some((state) => state.flight);
    },
    dispose() {
      disposed = true;
      [...installed].forEach((stop) => stop());
      offOrphanFeed?.();
      offGenerationFeed?.();
      watchedStores.forEach((off) => { try { off?.(); } catch (_) { /* gone */ } });
      watchedStores.clear();
      listeners.clear();
      sources.clear();
      // Unsent rows stay dirty on disk; the next service sends them again.
      fenceGeneration += 1;
      outbox.forEach((entry) => {
        entry.discarded = true;
        entry.changes.splice(0).forEach((change) => change.reject(serviceError('Change fenced', 'DATA_FENCED')));
      });
      outbox.clear();
      states.clear();
    },
  };
  // Every call but the synchronous ones counts as work until it settles.
  Object.keys(service).forEach((method) => {
    const call = service[method];
    if (typeof call !== 'function' || DATA_SERVICE_SYNC_METHODS.includes(method)) return;
    const wrapped = (...args) => tracked(call(...args));
    wrapped.tracked = true;
    service[method] = wrapped;
  });
  return service;
}
