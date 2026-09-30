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
 * cursor with the rows (a `~meta` row, `SOURCE_META_KEY`, written last and
 * never handed to a reader), asks only for what changed while the stored rows
 * are the whole set and a whole read ran within `fullEveryMs`, removes rows a
 * read marks removed (`removedField`), purges the collection's rows when the
 * server refuses the read (403, 404), and never lets a read undo a change
 * stored after it began.
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
import { reconcileFetched, windowKeyOf } from './reconcile.js';

export const DATA_STATES = Object.freeze(['fresh', 'stale', 'refreshing', 'offline', 'error']);
const PRIORITIES = { visible: 0, high: 1, normal: 2, background: 3 };
export const DEFAULT_STALE_AFTER_MS = 5 * 60000;
/** The row a declared read keeps its cursor in, in its own collection. */
export const SOURCE_META_KEY = '~meta';
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
// One reconcile carries a bounded complete set; larger ingests go in chunks.
const INGEST_CHUNK = 500;
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
/** Refuses, at once, a query spec a read could not honour. */
function checkQuery(spec = {}) {
  const { index, limit = 50, cursor = null, where, raw: _raw, ...range } = spec;
  queryLimit(limit);
  if (where !== undefined && typeof where !== 'function') throw serviceError('query: where must be a function', 'DATA_INVALID');
  if (cursor !== null && typeof cursor !== 'string') throw serviceError('query: cursor must be a string', 'DATA_INVALID');
  if (index && where) throw serviceError('query: where cannot filter an index read; filter the rows it returns', 'DATA_INVALID');
  if (!index && Object.keys(range).length) throw serviceError(`query: ${Object.keys(range).join(', ')} needs an index`, 'DATA_INVALID');
}
async function runQuery(store, keyPath, spec = {}) {
  checkQuery(spec);
  const { index, limit = 50, cursor = null, where, raw = false, ...range } = spec;
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
  // every source's fetch and push; `lane` keeps its scheduler jobs apart from
  // other accounts'; while `foreground()` is false, its work waits behind the
  // displayed account's.
  principal = null,
  lane = null,
  foreground = () => true,
} = {}) {
  if (typeof resolve !== 'function') throw serviceError('createDataService: resolve(collection) is required', 'DATA_INVALID');
  // What a source's fetch and push are given: the principal to send with, and
  // that the request is background work (never reported by the request layer).
  const jobContext = Object.freeze({ principal, background: true });
  const laned = (label) => (lane === null ? label : `${lane}|${label}`);
  const lanedKey = (kind, rest) => (lane === null ? `${kind}:${rest}` : `${kind}:${lane}:${rest}`);
  const inForeground = () => { try { return foreground() !== false; } catch (_) { return true; } };
  const sources = new Map();
  const states = new Map();
  const listeners = new Set();
  let disposed = false;
  const live = () => { if (disposed) throw serviceError('Data service retired', 'DATA_RETIRED'); };
  // Per collection, when each key was last stored or removed by anything but
  // a declared read: a read that began before never undoes it.
  const touches = new Map();
  let touchSequence = 0;
  function noteTouched(name, keys) {
    if (!touches.has(name)) touches.set(name, new Map());
    const seen = touches.get(name);
    keys.forEach((key) => { touchSequence += 1; seen.set(String(key), touchSequence); });
    // Only reads still on their way need these; keep the newest few thousand.
    if (seen.size > 5000) [...seen.keys()].slice(0, seen.size - 5000).forEach((key) => seen.delete(key));
  }
  const touchedAfter = (name, since) => new Set([...(touches.get(name) || new Map())].filter(([, at]) => at > since).map(([key]) => key));
  // A declared read's collection hides its cursor row from every reader.
  const declaredRead = (name, decl) => (sources.get(name) || decl?.source)?.read || null;
  const visible = (name, decl, keyPath) => (declaredRead(name, decl)
    ? (row) => !(row && String(row[keyPath]) === SOURCE_META_KEY) : () => true);

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
    return { name: bare, label: labelOf(bare), ...found };
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
    const { name, store, decl } = local(target.collection);
    const keyPath = decl?.keyPath || 'id';
    const shown = visible(name, decl, keyPath);
    if (target.query) return (await runQuery(store, keyPath, target.query)).rows.filter(shown);
    if (target.key !== undefined && target.key !== null) {
      const row = clean(await store.get(String(target.key)));
      return row && shown(row) ? row : null;
    }
    return (await store.getAll()).map(clean).filter(shown);
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
  const refusedAccess = (error) => Number(error?.status) === 403 || error?.code === 'PermissionDenied';

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
      return removed;
    }
    for (let start = 0; start < keys.length; start += PAGE_ROWS) {
      // eslint-disable-next-line no-await-in-loop
      removed.push(...await store.deleteMany(keys.slice(start, start + PAGE_ROWS), { keep: (row) => !!row._dirty, silent: true }));
    }
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
  function addChange(entry, { command, record, revision, restored = false }) {
    let resolve;
    let reject;
    const done = new Promise((ok, fail) => { resolve = ok; reject = fail; });
    sequence += 1;
    entry.changes.push({ seq: sequence, command, record, revision, restored, resolve, reject });
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
        if (row._deleted) await entry.store.delete(entry.key, { expectedRevision: change.revision });
        return;
      }
      await entry.store.markSynced(entry.key, { expectedRevision: change.revision, pushed: true });
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
            await scheduler.request({
              key: lanedKey('push', `${entry.id}:${change.seq}`), target: `push:${laned(entry.label)}`, budgetKey,
              priority: inForeground() ? PRIORITIES.high : PRIORITIES.background, visible: false,
              run: async () => {
                const push = pushOf(entry.collection, entry.decl);
                if (typeof push !== 'function') throw serviceError(`'${entry.label}' has no push`, 'DATA_NO_SOURCE');
                const row = await entry.store.getRaw(entry.key);
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
                await push(change.command, change.record, jobContext);
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
              entry.state = refused ? 'access_changed' : 'failed'; entry.lastError = describeError(error); emitStatus();
              // The refusal stays with the row, so a restart does not send it again on its own.
              if (refused) { try { await entry.store.markRow?.(entry.key, { _pushRefused: 'access' }); } catch (_) { /* kept in memory */ } }
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
  async function ingestRows(collection, rows, { replace = false, scope = null, complete = false } = {}) {
    live();
    const { name, store, decl } = local(collection);
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
    const upsert = async (chunk, options) => {
      const result = await store.reconcile(chunk, { ...options, keepDirty: true, ...(replace || complete === true ? {} : { syncedAt: null }) });
      const left = new Set((Array.isArray(result?.skipped) ? result.skipped : []).map(String));
      const notSaved = new Set((Array.isArray(result?.unsaved) ? result.unsaved : []).map(String));
      chunk.filter(isAccepted).forEach((row) => {
        const key = String(row[keyPath]);
        if (notSaved.has(key)) { unsaved.add(key); stored.delete(key); } else if (!left.has(key)) { stored.add(key); unsaved.delete(key); }
      });
    };
    if (replace && rows.length <= INGEST_CHUNK) {
      await upsert(rows, { scope: inScope });
    } else {
      for (let start = 0; start < rows.length; start += INGEST_CHUNK) {
        // Chunks commit in order; each is a bounded complete set.
        // eslint-disable-next-line no-await-in-loop
        await upsert(rows.slice(start, start + INGEST_CHUNK), { prune: false });
      }
      if (replace) await store.reconcile([], { scope: (row) => inScope(row) && !kept.has(String(row[keyPath])) });
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
   * for what changed since the stored cursor while the stored rows are the
   * whole set (the cursor row counts them) and a whole read ran within
   * `fullEveryMs`; `fetch` answers `{ rows, cursor, since }` (`since`: it used
   * the cursor) or the rows alone. A whole read replaces the collection; a read
   * of changes stores them and removes the rows `removedField` marks. The
   * cursor row goes last, with the rows it describes. Keys stored or removed by
   * anything else after the read began keep that change. A refusal (403, 404)
   * purges the collection's rows, unsent ones kept.
   */
  async function readDeclared({ name, label, store, keyPath }, spec, wanted, isCurrent, { full = false } = {}) {
    const { cursor: keepsCursor = false, removedField = null, fullEveryMs = FULL_EVERY_MS, forbidden = 'purge' } = spec.read;
    const startedAt = touchSequence;
    const all = await (store.getAllRaw ? store.getAllRaw() : store.getAll());
    const meta = all.find((row) => row && String(row[keyPath]) === SOURCE_META_KEY) || null;
    const storedKeys = new Set(all.filter((row) => row && String(row[keyPath]) !== SOURCE_META_KEY).map((row) => String(row[keyPath])));
    const whole = !!meta && Number.isSafeInteger(meta.count) && meta.count === storedKeys.size;
    const since = keepsCursor && !full && whole && typeof meta.cursor === 'string' && meta.cursor
      && Number.isFinite(meta.fullAt) && now() - meta.fullAt < fullEveryMs ? meta.cursor : null;
    let answer;
    try {
      answer = await spec.fetch(wanted, { ...jobContext, since });
    } catch (error) {
      if (forbidden === 'purge' && [403, 404].includes(Number(error?.status)) && isCurrent()) {
        await service.purge(name, {}).catch(() => {}); // eslint-disable-line no-use-before-define
      }
      throw error;
    }
    if (!isCurrent()) return;
    const rows = (Array.isArray(answer) ? answer : (answer?.rows || []))
      .filter((row) => row && typeof row === 'object' && row[keyPath] !== undefined && row[keyPath] !== null
        && String(row[keyPath]) !== SOURCE_META_KEY);
    const changesOnly = since !== null && answer?.since === true;
    const cursor = keepsCursor ? (typeof answer?.cursor === 'string' && answer.cursor ? answer.cursor : null) : null;
    // What was stored or removed since this read began stays as it is.
    const kept = touchedAfter(name, startedAt);
    const keyOf = (row) => String(row[keyPath]);
    const removed = removedField ? rows.filter((row) => row[removedField] !== undefined && row[removedField] !== null) : [];
    const removedKeys = new Set(removed.map(keyOf));
    const toRecord = spec.toRecord || ((dto) => dto);
    const records = rows.filter((row) => !removedKeys.has(keyOf(row)) && !kept.has(keyOf(row))).map((row) => toRecord(row));
    const gone = [...removedKeys].filter((key) => !kept.has(key));
    if (changesOnly) {
      if (gone.length) await removeRows({ label, store, keys: gone, force: false });
      if (!isCurrent()) return;
      const count = new Set([...storedKeys, ...records.map(keyOf)]);
      gone.forEach((key) => count.delete(key));
      const metaRow = { [keyPath]: SOURCE_META_KEY, cursor: cursor ?? meta.cursor, fullAt: meta.fullAt, count: count.size };
      await ingestRows(name, [...records, metaRow], { complete: true });
      return;
    }
    const scope = (row) => !kept.has(keyOf(row));
    const metaRow = keepsCursor ? [{ [keyPath]: SOURCE_META_KEY, cursor, fullAt: now(), count: records.length }] : [];
    await ingestRows(name, [...records, ...metaRow], { replace: true, scope });
  }

  const service = {
    namespace,
    // Rows come as copies without storage metadata. `raw` reads as writers
    // see the collection (rows past the paint ceiling and the store's age
    // limit, and unsent tombstones), metadata kept, for a caller checking what
    // it painted or deciding what to remove.
    async read(collection, key, { raw = false } = {}) {
      live();
      const { name, store, decl } = local(collection);
      const shown = visible(name, decl, decl?.keyPath || 'id');
      const one = async (item) => {
        const row = raw ? copyRow(await store.getRaw(String(item))) : clean(await store.get(String(item)));
        return row && shown(row) ? row : null;
      };
      if (Array.isArray(key)) return Promise.all(key.map(one));
      if (key !== undefined && key !== null) return one(key);
      return (raw ? (await store.getAllRaw()).map(copyRow) : (await store.getAll()).map(clean)).filter(shown);
    },
    // `raw: true` answers as writers see the collection (rows past the paint
    // ceiling and the age limit included), for a caller deciding what to remove.
    async query(collection, spec = {}) {
      live();
      const { name, store, decl } = local(collection);
      const keyPath = decl?.keyPath || 'id';
      const page = await runQuery(store, keyPath, spec);
      return { ...page, rows: page.rows.filter(visible(name, decl, keyPath)) };
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
    refresh(target, { mode = 'silent', priority = 'normal', maxAge = 0, reason = null, full = false } = {}) {
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
      if (state.flight) return settle(state.flight);
      state.state = 'refreshing';
      emitStatus();
      const keyPath = decl?.keyPath || 'id';
      // A server copy never replaces a row with an unsent local change.
      const run = async (isCurrent) => {
        if (wanted.key !== undefined && wanted.key !== null) {
          const rowKey = String(wanted.key);
          const dto = await spec.fetch(wanted, jobContext);
          if (!isCurrent()) return;
          const prev = await store.getRaw?.(rowKey);
          if (!dto) {
            // Decided in turn with local writes to the row, on the row as it is then.
            await serial(`${label}:${rowKey}`, async () => {
              const current = await store.getRaw?.(rowKey);
              if (!current || current._dirty) return;
              try {
                await store.delete(rowKey, Number.isSafeInteger(current._rev) ? { expectedRevision: current._rev } : {});
              } catch (error) { if (error?.reason !== 'conflict') throw error; }
            });
            return;
          }
          const record = (spec.toRecord || ((value) => value))(dto, prev ? bare(prev) : prev);
          // One record leaves the collection's synced stamp as it was.
          await store.reconcile([record], { prune: false, keepDirty: true, syncedAt: null });
          return;
        }
        if (spec.read && !wanted.query && !wanted.window && typeof spec.scope !== 'function') {
          await readDeclared({ name, label, store, keyPath }, spec, wanted, isCurrent, { full });
          return;
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
        await reconcileFetched(store, keyPath, { fetch: () => spec.fetch(wanted, jobContext), toRecord: spec.toRecord || ((dto) => dto), keyOf: spec.keyOf },
          scope, wanted.window, windowKeyOf(wanted.window), { onPersistError, rethrow: true, keepDirty: true, ...(whole ? {} : { syncedAt: null }) });
      };
      state.flight = scheduler.request({
        key: lanedKey('data', `${label}:${key}`), target: laned(label), budgetKey, reason,
        ...(inForeground()
          ? { priority: PRIORITIES[priority] ?? PRIORITIES.normal, visible: mode === 'visible' }
          : { priority: PRIORITIES.background, visible: false }),
        run,
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
     * pushed. A row with an unsent local write keeps that write: the server's
     * copy does not replace it. With `replace`, the rows are the complete set
     * for `scope` (a row predicate; the whole collection without one): rows in
     * scope that the set leaves out are removed, dirty rows never. After a
     * replacing or `complete` ingest the collection is fresh. Resolves
     * `{ written }`, the rows stored, and `unsaved`, the keys of rows a store
     * could keep only in memory (its device storage refused them).
     */
    // A replacing ingest, or one of rows a complete read delivered
    // (`complete`), stamps the collection synced; any other does not.
    async ingest(collection, rows, options = {}) {
      live();
      const { name, decl } = local(collection);
      const keyPath = decl?.keyPath || 'id';
      if (Array.isArray(rows)) noteTouched(name, rows.filter((row) => row && typeof row === 'object').map((row) => row[keyPath]));
      return ingestRows(collection, rows, options);
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
      const generation = fenceGeneration;
      const { name, label, store, decl } = local(collection);
      const keyPath = decl?.keyPath || 'id';
      if (!['put', 'patch', 'delete'].includes(command?.op)) throw serviceError('mutate: op must be put, patch or delete', 'DATA_INVALID');
      const key = String(command.op === 'put' ? command.record?.[keyPath] : command.key);
      noteTouched(name, [key]);
      const push = pushOf(name, decl);
      // One local write per row at a time, so each push knows the revision it wrote.
      const written = await serial(`${label}:${key}`, async () => {
        let record = null;
        let held = null;
        if (command.op === 'put') {
          record = command.record;
          await store.put(record);
        } else if (command.op === 'patch') {
          record = bare({ ...((await store.getRaw(key)) || {}), ...command.patch });
          await store.put(record);
        } else if (typeof push === 'function' && typeof store.markRow === 'function' && (held = await store.getRaw(key))) {
          // A delete to send stays a hidden, unsent tombstone until it is sent,
          // so a reload sends it again. It keeps only its key, so it holds no
          // indexed value.
          await store.markRow(key, { _deleted: true }, { dirty: true, body: { [keyPath]: held[keyPath] } });
        } else await store.delete(key);
        const revision = typeof push !== 'function' ? undefined : (await store.getRaw(key))?._rev;
        return { record, revision };
      });
      if (typeof push !== 'function') return { key, pushed: false };
      // Fenced while the local write ran: the row stays unsent on disk for
      // the principal it was written under.
      if (generation !== fenceGeneration || disposed) return { key, pushed: false };
      const change = enqueuePush({ name, label, key, store, decl }, { command, record: written.record, revision: written.revision });
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
          try { await store.markRow?.(String(key), { _pushRefused: null }); } catch (_) { /* sent anyway */ }
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
      const { name, label, store } = local(collection);
      noteTouched(name, [key]);
      await serial(`${label}:${String(key)}`, async () => {
        dropPending(label, key);
        await store.delete(String(key));
      });
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
      const removed = await removeRows({ label, store, keys: entries.filter(({ dirty }) => force || !dirty).map(({ key }) => key), force });
      noteTouched(local(collection).name, removed);
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
      const older = entries.slice(0, Math.max(0, entries.length - spec.keep)).filter(({ dirty }) => !dirty).map(({ key }) => key);
      const removed = await removeRows({ label, store, keys: older, force: false });
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
    /**
     * Whether nothing is queued or running: no unsent change in memory, no
     * local write, read, ingest or purge on its way, and no refresh flying.
     */
    idle() {
      return outbox.size === 0 && writes.size === 0 && working === 0
        && ![...states.values()].some((state) => state.flight);
    },
    dispose() {
      disposed = true;
      offOrphanFeed?.();
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
  // Every asynchronous call counts as work until it settles.
  ['read', 'query', 'refresh', 'ingest', 'mutate', 'purge', 'trim', 'retry', 'discard'].forEach((method) => {
    const call = service[method];
    service[method] = (...args) => tracked(call(...args));
  });
  return service;
}
