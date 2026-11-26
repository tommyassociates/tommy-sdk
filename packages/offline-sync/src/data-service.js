import {
  reconcileFetched, windowKeyOf, previousByKey, reportRejected,
} from './reconcile.js';
import { copyStorageRow, isOwnCopy } from './transactional-store.js'; // eslint-disable-line import/extensions
import { boundedBatches } from './bytes.js';
import { storeMutationOrigin, withStoreMutationOrigin } from './store-mutation-origin.js';
import createTargetStateBudget from './target-state-budget.js'; // eslint-disable-line import/extensions

export const DATA_STATES = Object.freeze(['fresh', 'stale', 'refreshing', 'offline', 'error']);
// Writes go in the collection's turn, never on the store `local()` answers.
const WRITE_METHODS = new Set(['put', 'delete', 'deleteMany', 'markRow', 'markSynced', 'reconcile', 'patchSynced', 'replaceSynced']);
export const DATA_SERVICE_SYNC_METHODS = Object.freeze([
  'writer', 'watch', 'subscribe', 'source', 'sends', 'hasSource', 'pending', 'fence', 'status', 'statuses', 'methodStatuses', 'onStatusChange', 'idle', 'dispose',
]);
const PRIORITIES = { visible: 0, high: 1, normal: 2, background: 3 };
export const DEFAULT_STALE_AFTER_MS = 5 * 60000;
const FULL_EVERY_MS = 24 * 60 * 60000;

export function createImmediateScheduler() {
  const flights = new Map();
  const valid = (job) => { try { return !job.valid || !!job.valid(); } catch (_) { return false; } };
  const dropped = () => Object.assign(new Error('Refresh no longer current'), { code: 'REFRESH_DROPPED' });
  return {
    request(job) {
      if (flights.has(job.key)) return flights.get(job.key);
      const flight = Promise.resolve().then(() => {
        if (!valid(job)) throw dropped();
        return job.run(() => true);
      }).finally(() => flights.delete(job.key));
      flights.set(job.key, flight);
      return flight;
    },
  };
}

const serviceError = (message, code) => Object.assign(new Error(message), { name: 'DataServiceError', code });

export function timedOutFor(error, collection, asked) {
  if (error?.code !== 'REFRESH_TIMEOUT' || !asked) return error;
  const named = Object.assign(new Error(`Refresh took too long: '${collection}'`), error, { collection, cause: error });
  const frames = String(asked.stack || '').replace(/^Error\n/, '');
  named.stack = `${named.name}: ${named.message}\n${frames}`;
  return named;
}

// Callers are not held through the scheduler's retry backoff.
function readAttempts(onFailure = () => {}) {
  let failure = null;
  let done = false;
  const waiting = new Set();
  return {
    run: (work) => async (...args) => {
      failure = null;
      try {
        return await work(...args);
      } catch (error) {
        if (done) throw error;
        failure = { error };
        const answered = [...waiting];
        waiting.clear();
        try { onFailure(error); } catch (_) { /* the read's own outcome stands */ }
        answered.forEach((reject) => reject(error));
        throw error;
      }
    },
    answer(flight, { nextAttempt = false } = {}) {
      if (failure && !done && !nextAttempt) return Promise.reject(failure.error);
      return new Promise((resolve, reject) => {
        waiting.add(reject);
        flight.then((value) => { waiting.delete(reject); resolve(value); }, (error) => { waiting.delete(reject); reject(error); });
      });
    },
    failing: () => !!failure && !done,
    settled() { done = true; waiting.clear(); },
  };
}

export function createMemorySourceMeta() {
  const metas = new Map();
  return {
    async get(name) { return metas.has(name) ? { ...metas.get(name) } : null; },
    async set(name, meta) { if (meta) metas.set(name, { ...meta }); else metas.delete(name); },
  };
}

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
const NO_SNAPSHOT = Symbol('no snapshot');
const DROPPED = Symbol('dropped');
const STOPPED = Symbol('stopped');
const ANSWERED_FRESH = Symbol('answered fresh');
function snapshotRows(answer) {
  if (Array.isArray(answer)) return answer;
  if (answer && typeof answer === 'object' && Array.isArray(answer.rows)) return answer.rows;
  return null;
}
const INGEST_CHUNK = 500;
const ingestChunks = (rows) => boundedBatches(rows, { maxItems: INGEST_CHUNK });
const CONFIRM_AFTER_MS = 24 * 60 * 60 * 1000;
const confirmAfterMs = (store) => {
  let limit = null;
  try { limit = typeof store?.ageLimitMs === 'function' ? store.ageLimitMs() : null; } catch (_) { limit = null; }
  return Number.isFinite(limit) && limit > 0 ? Math.min(CONFIRM_AFTER_MS, limit / 2) : CONFIRM_AFTER_MS;
};
function contentValue(value) {
  if (Array.isArray(value)) return `[${value.map(contentValue).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).filter((field) => value[field] !== undefined).sort()
      .map((field) => `${JSON.stringify(field)}:${contentValue(value[field])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}
const contentOf = (row) => contentValue(Object.fromEntries(Object.entries(row || {}).filter(([field]) => !field.startsWith('_'))));
// Keys whose last local change a read still on its way must keep, per collection.
const TOUCHES_KEPT = 5000;
const READ_TRIES = 3;
const PAGE_ROWS = 100;
const KEYED_REREAD_KEYS = 500;
export const MAX_QUERY_ROWS = 5000;
function queryLimit(limit) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_QUERY_ROWS) {
    throw serviceError(`A query limit is a whole number from 1 to ${MAX_QUERY_ROWS}`, 'DATA_INVALID');
  }
  return limit;
}

async function queryPages(store, index, range, { limit = 50, cursor: start = null, raw = false } = {}) {
  queryLimit(limit);
  const rows = [];
  let cursor = start;
  let complete = false;
  do {
    // eslint-disable-next-line no-await-in-loop
    const page = await store.query(index, range, { limit: Math.min(PAGE_ROWS, limit - rows.length), cursor, ...(raw ? { raw: true } : {}) });
    rows.push(...page.rows);
    complete = page.complete;
    cursor = page.complete ? null : page.nextCursor;
  } while (cursor !== null && rows.length < limit);
  return { rows, nextCursor: complete ? null : cursor, complete };
}
const RANGE_FIELDS = new Set(['index', 'equals', 'prefix', 'lower', 'upper']);
function wholeRange(spec, operation) {
  const extra = Object.keys(spec || {}).filter((field) => !RANGE_FIELDS.has(field) && !(field === 'keep' && operation === 'trim'));
  if (typeof spec?.index !== 'string' || extra.length) {
    throw serviceError(`${operation}: an index range only (${extra.join(', ') || 'index'} not accepted)`, 'DATA_INVALID');
  }
  const { index, keep: _keep, ...range } = spec;
  return { index, range };
}
async function rangeKeys(store, keyPath, { index, range }) {
  const keys = [];
  let cursor = null;
  do {
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
const clean = (row) => (row && typeof row === 'object'
  ? JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(row).filter(([field]) => !field.startsWith('_'))))) : row ?? null);
const copyRow = (row) => (row && typeof row === 'object' ? JSON.parse(JSON.stringify(row)) : row ?? null);
const asIs = (row) => row ?? null;
function checkRead(read) {
  const known = ['cursor', 'removedField', 'fullEveryMs', 'forbidden'];
  const fields = read && typeof read === 'object' && !Array.isArray(read) ? Object.keys(read) : null;
  const invalid = !fields || fields.some((field) => !known.includes(field))
    || (read.cursor !== undefined && typeof read.cursor !== 'boolean')
    || (read.removedField !== undefined && read.removedField !== null && typeof read.removedField !== 'string')
    || (read.fullEveryMs !== undefined && !(Number.isFinite(read.fullEveryMs) && read.fullEveryMs > 0))
    || (read.forbidden !== undefined && !['purge', 'confirm', 'keep'].includes(read.forbidden));
  if (invalid) throw serviceError(`source.read: ${known.join(', ')} only (cursor a boolean, removedField a field name, fullEveryMs a positive number, forbidden 'purge', 'confirm' or 'keep')`, 'DATA_INVALID');
}
// A method reads a slice, never the collection.
export const MAX_METHOD_IDS = 200;
export const MAX_METHOD_ROWS = 5000;
export const MAX_METHOD_GONE = 5000;
export const METHOD_PARAM_TYPES = Object.freeze(['ids', 'id', 'string', 'date', 'boolean', 'page']);
export const METHOD_SHARE_MS = 30 * 1000;
const METHOD_FRESH_KEPT = 5000;
const METHOD_GROUPS_KEPT = 500;
const EVICTIONS_KEPT = 64;
export const METHOD_REFUSAL_HOLD_MS = Object.freeze([30 * 1000, 5 * 60 * 1000]);
const METHOD_REFUSALS_KEPT = 200;
const HELD_REFUSAL_CODES = new Set(['DATA_INVALID', 'DATA_TOO_LARGE']);
const METHOD_NAME = /^[a-z][A-Za-z0-9]{0,63}$/;
const MAX_METHOD_STRING = 200;
function checkMethods(methods) {
  const refuse = (why) => { throw serviceError(`source.methods: ${why}`, 'DATA_INVALID'); };
  if (!methods || typeof methods !== 'object' || Array.isArray(methods)) refuse('an object of named methods');
  Object.entries(methods).forEach(([name, method]) => {
    if (!METHOD_NAME.test(name)) refuse(`'${name}' is not a method name`);
    if (!method || typeof method !== 'object' || typeof method.fetch !== 'function') refuse(`'${name}' needs a fetch`);
    const known = ['params', 'fetch', 'batch', 'field', 'cadenceMs', 'available', 'prunesWhere', 'strictReceipt'];
    if (Object.keys(method).some((field) => !known.includes(field))) refuse(`'${name}' takes ${known.join(', ')} only`);
    const { params } = method;
    if (!params || typeof params !== 'object' || Array.isArray(params)) refuse(`'${name}' needs its params`);
    Object.entries(params).forEach(([param, spec]) => {
      if (!METHOD_NAME.test(param.replace(/_/g, 'x'))) refuse(`'${name}.${param}' is not a param name`);
      if (!spec || !METHOD_PARAM_TYPES.includes(spec.type)) refuse(`'${name}.${param}' needs a type (${METHOD_PARAM_TYPES.join(', ')})`);
      if (Object.keys(spec).some((field) => !['type', 'max', 'optional'].includes(field))) refuse(`'${name}.${param}' takes type, max, optional only`);
      const ceiling = spec.type === 'ids' ? MAX_METHOD_IDS : MAX_METHOD_STRING;
      if (spec.max !== undefined && (!['ids', 'string'].includes(spec.type) || !Number.isSafeInteger(spec.max) || spec.max < 1 || spec.max > ceiling)) {
        refuse(`'${name}.${param}.max' is for ids (1 to ${MAX_METHOD_IDS}) or a string (1 to ${MAX_METHOD_STRING})`);
      }
      if (spec.optional !== undefined && typeof spec.optional !== 'boolean') refuse(`'${name}.${param}.optional' must be a boolean`);
    });
    if (method.batch !== undefined && (params[method.batch]?.type !== 'ids' || params[method.batch]?.optional)) refuse(`'${name}.batch' must name a required ids param`);
    if (method.cadenceMs !== undefined && !(Number.isFinite(method.cadenceMs) && method.cadenceMs >= 0)) refuse(`'${name}.cadenceMs' must be a duration`);
    if (method.field !== undefined && (!method.batch || typeof method.field !== 'string' || !method.field)) refuse(`'${name}.field' names the row field a batched method's ids name`);
    if (method.prunesWhere !== undefined && (typeof method.prunesWhere !== 'function' || method.batch)) refuse(`'${name}.prunesWhere' is a row predicate of a method that is not batched`);
    if (method.available !== undefined && typeof method.available !== 'function') refuse(`'${name}.available' must be a function`);
    if (method.strictReceipt !== undefined && (typeof method.strictReceipt !== 'boolean' || method.batch)) {
      refuse(`'${name}.strictReceipt' is a boolean for a method that is not batched`);
    }
  });
}
const METHOD_ID = /^[A-Za-z0-9_.:~-]{1,64}$/;
const methodId = (value) => {
  if (Number.isSafeInteger(value) && value >= 0) return String(value);
  if (typeof value === 'string' && METHOD_ID.test(value)) return value;
  return null;
};
const idOrder = (a, b) => (a.length - b.length) || (a < b ? -1 : Number(a > b));
function methodParams(collection, name, method, given) {
  const refuse = (why) => { throw serviceError(`refresh '${collection}' ${name}: ${why}`, 'DATA_INVALID'); };
  const values = given === undefined || given === null ? {} : given;
  if (typeof values !== 'object' || Array.isArray(values)) refuse('params must be an object');
  const declared = method.params;
  Object.keys(values).forEach((param) => { if (!Object.hasOwn(declared, param)) refuse(`unknown param '${param}'`); });
  const out = {};
  Object.keys(declared).sort().forEach((param) => {
    const spec = declared[param];
    const value = values[param];
    if (value === undefined) {
      if (!spec.optional) refuse(`'${param}' is required`);
      return;
    }
    if (spec.type === 'ids') {
      const max = spec.max || MAX_METHOD_IDS;
      if (!Array.isArray(value) || !value.length) refuse(`'${param}' must be a non-empty list of ids`);
      const ids = value.map(methodId);
      if (ids.some((id) => id === null)) refuse(`'${param}' holds a value that is not an id`);
      const unique = [...new Set(ids)].sort(idOrder);
      if (unique.length > max) refuse(`'${param}' names more than ${max} ids`);
      out[param] = unique;
    } else if (spec.type === 'id') {
      const id = methodId(value);
      if (id === null) refuse(`'${param}' is not an id`);
      out[param] = id;
    } else if (spec.type === 'string') {
      const max = spec.max || MAX_METHOD_STRING;
      if (typeof value !== 'string' || !value.trim() || value.trim().length > max) refuse(`'${param}' must be a string of 1 to ${max} characters`);
      out[param] = value.trim();
    } else if (spec.type === 'date') {
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(value) || !Number.isFinite(Date.parse(value))) refuse(`'${param}' must be an ISO date`);
      out[param] = value;
    } else if (spec.type === 'boolean') {
      if (typeof value !== 'boolean') refuse(`'${param}' must be true or false`);
      out[param] = value;
    } else {
      if (!Number.isSafeInteger(value) || value < 1 || value > 1000) refuse(`'${param}' must be a page from 1 to 1000`);
      out[param] = value;
    }
  });
  return Object.freeze(out);
}
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
    const keyOf = (row) => String(row[keyPath]);
    const seen = new Set();
    const rows = [];
    let complete = true;
    const values = [...new Map(range.anyOf.map((value) => [JSON.stringify(value), value])).values()];
    const pageRows = Math.max(limit, PAGE_ROWS);
    for (const value of values) {
      if (!complete) break;
      let next = null;
      do {
        if (rows.length >= limit) { complete = false; break; }
        // eslint-disable-next-line no-await-in-loop
        const page = await queryPages(store, index, { prefix: Array.isArray(value) ? value : [value] }, { limit: pageRows, cursor: next, raw: raw === true });
        const over = page.rows.some((row) => {
          if (seen.has(keyOf(row))) return false;
          if (rows.length >= limit) return true;
          seen.add(keyOf(row)); rows.push(row);
          return false;
        });
        if (over) complete = false;
        next = complete && !page.complete ? page.nextCursor : null;
      } while (next !== null);
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
  wholeReadReuseMs = 0,
  writeMark = null,
  reuseSinceWriteMs = 0,
  // Collections may share labels but never share completeness.
  changeOwner = null,
  labelOf = (name) => name,
  now = () => Date.now(),
  isOnline = () => true,
  staleAfterMs = DEFAULT_STALE_AFTER_MS,
  onPersistError,
  budgetKey = namespace || 'host',
  principal = null,
  lane = null,
  foreground = () => true,
  backgroundCadence = () => 1,
  sourceMeta = createMemorySourceMeta(),
} = {}) {
  if (typeof resolve !== 'function') throw serviceError('createDataService: resolve(collection) is required', 'DATA_INVALID');
  // Background work: never reported by the request layer.
  const principalNow = typeof principal === 'function' ? principal : () => principal;
  const jobContextNow = () => Object.freeze({ principal: principalNow(), background: true });
  const writeMarkNow = () => {
    if (typeof writeMark !== 'function') return null;
    try { const mark = writeMark(); return mark === undefined ? null : mark; } catch (_) { return null; }
  };
  const formOf = (context) => { try { return JSON.stringify(context.principal ?? null); } catch (_) { return null; } };
  const laned = (label) => (lane === null ? label : `${lane}|${label}`);
  const lanedKey = (kind, rest) => (lane === null ? `${kind}:${rest}` : `${kind}:${lane}:${rest}`);
  const inForeground = (collection) => { try { return foreground(collection) !== false; } catch (_) { return true; } };
  const cadenceFactor = (collection) => {
    if (inForeground(collection)) return 1;
    let factor = 1;
    try { factor = Number(backgroundCadence(collection)); } catch (_) { factor = 1; }
    return Number.isNaN(factor) || factor < 1 ? 1 : factor;
  };
  const sources = new Map();
  const states = new Map();
  const knownCollections = new Set();
  const listeners = new Set();
  let disposed = false;
  const live = () => { if (disposed) throw serviceError('Data service retired', 'DATA_RETIRED'); };
  const touches = new Map();
  const lostTouches = new Map();
  let touchSequence = 0;
  function noteTouched(name, keys, at = null) {
    if (!touches.has(name)) touches.set(name, new Map());
    const seen = touches.get(name);
    keys.forEach((key) => {
      let stamp = at;
      if (stamp === null) { touchSequence += 1; stamp = touchSequence; }
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
  const goneValues = new Map();
  function noteGoneValues(name, field, values, at) {
    if (!values.length) return;
    if (!goneValues.has(name)) goneValues.set(name, new Map());
    const fields = goneValues.get(name);
    if (!fields.has(field)) fields.set(field, new Map());
    const seen = fields.get(field);
    values.forEach((value) => {
      if ((seen.get(String(value)) || 0) > at) return;
      seen.delete(String(value));
      seen.set(String(value), at);
    });
    while (seen.size > TOUCHES_KEPT) {
      const [oldest, stamp] = seen.entries().next().value;
      seen.delete(oldest);
      lostTouches.set(name, Math.max(lostTouches.get(name) || 0, stamp));
    }
  }
  const barredAfter = (name, since) => {
    const fields = goneValues.get(name);
    if (!fields || !fields.size) return () => false;
    return (record) => [...fields].some(([field, seen]) => record?.[field] !== undefined && record?.[field] !== null
      && (seen.get(String(record[field])) || 0) > since);
  };
  const protectionLost = (name, since) => (lostTouches.get(name) || 0) > since;
  const replaced = new Map();
  function noteReplaced(name, at = null) {
    let stamp = at;
    if (stamp === null) { touchSequence += 1; stamp = touchSequence; }
    replaced.set(name, Math.max(replaced.get(name) || 0, stamp));
  }
  const replacedAfter = (name, since) => (replaced.get(name) || 0) > since;
  // Every commit path records its effect here, so a read that began before never undoes it.
  function recordEffect(name, {
    whole = false, changedKeys = [], removedKeys = [], at = null,
  } = {}) {
    if (whole) { noteReplaced(name, at); return; }
    noteTouched(name, [...changedKeys, ...removedKeys].filter((key) => key !== undefined && key !== null), at);
  }
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
  function touching(name, store, keyPath, at = null) {
    const keyOf = (row) => (row && typeof row === 'object' ? row[keyPath] : undefined);
    const changed = (keys) => recordEffect(name, { changedKeys: keys, at });
    const barred = at === null ? () => false : barredAfter(name, at);
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
      put: (record, ...rest) => (barred(record) ? Promise.resolve(undefined)
        : recorded(() => store.put(record, ...rest), () => [keyOf(record)], () => [keyOf(record)])),
      delete: (key, ...rest) => recorded(() => store.delete(key, ...rest), () => [key], () => [key]),
      deleteMany: (keys, ...rest) => recorded(() => store.deleteMany(keys, ...rest),
        (removed) => (Array.isArray(removed) ? removed : (keys || [])), () => keys || []),
      markRow: (key, ...rest) => recorded(() => store.markRow(key, ...rest), (found) => (found === false ? [] : [key]), () => [key]),
      patchSynced: (keys, ...rest) => recorded(
        () => store.patchSynced(keys, ...rest),
        (outcome) => (outcome && typeof outcome === 'object' ? [...(outcome.patched || []), ...(outcome.unsaved || [])] : (keys || [])),
        () => keys || []
      ),
      replaceSynced: (key, ...rest) => recorded(
        () => store.replaceSynced(key, ...rest),
        (outcome) => (outcome?.replaced === true ? [key] : []),
        () => [key]
      ),
      reconcile: async (given = [], { whole: replacesAll = false, ...options } = {}) => {
        const records = given.filter((record) => !barred(record));
        const whole = replacesAll === true || (options.prune !== false && typeof options.scope !== 'function');
        let result;
        try { result = await store.reconcile(records, options); } catch (error) {
          changed(records.map(keyOf));
          throw error;
        }
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
  async function storedFreshAt(name, store, keyPath, context) {
    try {
      const [meta, rows] = await Promise.all([metaOf(name), rawRows(store)]);
      if (!meta || meta.form !== formOf(context) || !Number.isFinite(meta.fullAt) || meta.fullAt > now() || typeof meta.digest !== 'string') return null;
      const keys = rows.map((row) => String(row[keyPath]));
      return meta.count === keys.length && meta.digest === keysDigest(keys) ? meta.fullAt : null;
    } catch (_) { return null; }
  }
  const generations = new Map();
  const watchedStores = new Map();
  const generationOf = (name) => generations.get(name) || 0;
  const refusedOnce = new Set();
  const bump = (name) => generations.set(name, generationOf(name) + 1);
  function watchChanges(name, store) {
    if (watchedStores.has(name)) return true;
    if (typeof store.onChange !== 'function') return false;
    try {
      const off = store.onChange((notice) => {
        bump(name);
        if (notice?.evicted) {
          loseCoverage(name, Array.isArray(notice.keys) ? notice.keys : null);
          emitStatus();
        }
      });
      if (typeof off !== 'function') return false;
      watchedStores.set(name, off);
      return true;
    } catch (_) { return false; }
  }
  async function adjustMeta(name, toggled) {
    const spec = sources.get(name) || resolve(name)?.decl?.source;
    if (!spec?.read || (!spec.read.cursor && toggled !== null)) return;
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

  function local(name) {
    if (typeof name !== 'string' || !name) throw serviceError('A collection name is required', 'DATA_INVALID');
    let bare = name;
    if (namespace) {
      if (name.startsWith(`${namespace}.`)) bare = name.slice(namespace.length + 1);
      else if (name.includes('.') && !resolve(name)?.store) throw serviceError(`'${name}' is outside ${namespace}`, 'DATA_FORBIDDEN');
    }
    const found = resolve(bare);
    if (!found?.store) throw serviceError(`Collection '${name}' is not declared`, 'DATA_UNDECLARED');
    knownCollections.add(bare);
    return { name: bare, label: labelOf(bare), ...found, store: readOnly(bare, found.store) };
  }
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
  const targetStates = createTargetStateBudget({ states, budgetOf: (name) => local(name).decl?.targetStateBudget });
  const targetOf = (target) => (typeof target === 'string' ? { collection: target } : { ...target });
  const predicates = new WeakMap();
  let predicateCount = 0;
  const predicateId = (where) => {
    if (!predicates.has(where)) { predicateCount += 1; predicates.set(where, `where#${predicateCount}`); }
    return predicates.get(where);
  };
  const queryKey = (query) => (query && typeof query.where === 'function' ? { ...query, where: predicateId(query.where) } : query ?? null);
  const targetKey = (target) => JSON.stringify([target.collection, target.key ?? null, target.window ?? null, queryKey(target.query)]);
  const stateFor = (key, options) => targetStates.get(key, options);
  function principalState(state) {
    return state.freshForm === undefined || state.freshForm === formOf(jobContextNow())
      ? state : { state: 'stale', syncedAt: null, error: null };
  }
  function describeState(state) {
    let value = state.state;
    if (value !== 'refreshing' && !isOnline()) value = 'offline';
    else if (value === 'fresh' && (state.syncedAt === null || now() - state.syncedAt > staleAfterMs)) value = 'stale';
    const status = { state: value, syncedAt: state.syncedAt, error: state.error };
    if (value === 'error' && state.flight) status.retrying = true;
    return status;
  }
  const emitStatus = () => { [...listeners].forEach((listener) => { try { listener(); } catch (_) { /* listener isolation */ } }); };

  async function valueOf(target, { storageMetadata = false } = {}) {
    const { store, decl } = local(target.collection);
    const keyPath = decl?.keyPath || 'id';
    if (target.query) return (await runQuery(store, keyPath, target.query)).rows;
    const project = storageMetadata ? copyRow : clean;
    if (target.key !== undefined && target.key !== null) return project(await store.get(String(target.key)));
    return (await store.getAll()).map(project);
  }

  const outbox = new Map();
  const writes = new Map();
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
  // A change refused for access is never sent again on its own.
  const refusedAccess = (error) => Number(error?.status) === 403 || error?.code === 'PermissionDenied' || error?.code === 'DATA_ACCESS_CHANGED';
  const heldBack = (error) => error?.code === 'ACCOUNT_NOT_DISPLAYED';
  const heldNow = (entry) => entry.held === true && entry.state === 'failed';

  function serial(id, task) {
    const next = (writes.get(id) || Promise.resolve()).then(task);
    const tail = next.then(() => {}, () => {});
    writes.set(id, tail);
    tail.then(() => { if (writes.get(id) === tail) writes.delete(id); });
    return next;
  }

  function dropPending(label, key) {
    const id = `${label}:${String(key)}`;
    const entry = outbox.get(id);
    if (!entry) return;
    entry.discarded = true;
    outbox.delete(id);
    entry.changes.splice(0).forEach((change) => change.reject(serviceError('Change discarded', 'DATA_DISCARDED')));
  }
  // A queued change for a row gone elsewhere is dropped so it never brings the row back on the server.
  function dropOrphaned(event) {
    if (!outbox.size || (!event?.remote && !['purge', 'evict'].includes(event?.type))) return;
    const touched = (entry) => event.label === entry.label || event.labels?.includes(entry.label) || (event.type === 'purge' && !event.label);
    [...outbox.values()].filter(touched).forEach((entry) => {
      serial(entry.id, async () => {
        if (outbox.get(entry.id) !== entry) return;
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
  function removeRow({ label, store, key, force, origin = null }) {
    return serial(`${label}:${key}`, async () => {
      const row = await store.getRaw(key);
      if (!row || (!force && row._dirty)) return false;
      try {
        await store.delete(key, withStoreMutationOrigin({ silent: true, ...(Number.isSafeInteger(row._rev) ? { expectedRevision: row._rev } : {}) }, origin));
      } catch (error) {
        if (error?.reason === 'conflict') return false;
        throw error;
      }
      if (force) dropPending(label, key);
      return true;
    });
  }
  async function removeRows({ label, store, keys, force, origin = null }) {
    const removed = [];
    if (force || typeof store.deleteMany !== 'function') {
      for (const key of keys) {
        // eslint-disable-next-line no-await-in-loop
        if (await removeRow({ label, store, key, force, origin })) removed.push(key);
      }
    } else {
      for (let start = 0; start < keys.length; start += PAGE_ROWS) {
        // eslint-disable-next-line no-await-in-loop
        removed.push(...await store.deleteMany(keys.slice(start, start + PAGE_ROWS), withStoreMutationOrigin({ keep: (row) => !!row._dirty, silent: true }, origin)));
      }
    }
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
      if (entry.state !== 'access_changed') drain(entry).catch(() => {});
    });
  }
  async function settleSent(entry, change) {
    if (change.revision === undefined || change.revision === null) return;
    try {
      const row = await entry.store.getRaw(entry.key);
      if (!row || row._rev !== change.revision) return;
      if (change.command.op === 'delete') {
        // In the collection's turn, so a read already on its way never brings the row back.
        if (row._deleted) {
          await inTurn(entry.collection, ({ store }) => store.delete(entry.key, { expectedRevision: change.revision }));
        }
        return;
      }
      await inTurn(entry.collection, ({ store }) => store.markSynced(entry.key, { expectedRevision: change.revision, pushed: true }));
    } catch (_) { /* written again since, or its store is closed: it stays as it is */ }
  }
  // An already-acknowledged change is skipped: sending it would put an older state on the server.
  function drain(entry) {
    if (entry.draining) return entry.draining;
    entry.draining = (async () => {
      await null;
      try {
        while (entry.changes.length && !entry.discarded) {
          const change = entry.changes[0];
          let sent = false;
          try {
            // eslint-disable-next-line no-await-in-loop
            // A write: the scheduler never gives up its ownership before it settles.
            await scheduler.request({
              key: lanedKey('push', `${entry.id}:${change.seq}`), target: `push:${laned(entry.label)}`, budgetKey, kind: 'write',
              priority: inForeground(entry.collection) ? PRIORITIES.high : PRIORITIES.background, visible: false,
              // Never sent, or sent again, once fenced or disposed.
              valid: () => !disposed && !entry.discarded,
              run: async () => {
                const push = pushOf(entry.collection, entry.decl);
                if (typeof push !== 'function') throw serviceError(`'${entry.label}' has no push`, 'DATA_NO_SOURCE');
                const row = await entry.store.getRaw(entry.key);
                if (row?._pushRefused === 'access') throw serviceError('Access changed: kept on this device until retried', 'DATA_ACCESS_CHANGED');
                const held = (revision) => entry.changes.slice(1)
                  .filter((queued) => Number.isSafeInteger(queued.revision) && queued.revision <= revision);
                const acked = Number.isSafeInteger(row?._ackRev) ? row._ackRev : null;
                const skip = () => { sent = true; change.skipped = true; change.carries = acked === null ? [] : held(acked); };
                const acknowledged = row && !row._dirty && acked !== null && Number.isSafeInteger(change.revision) && acked >= change.revision;
                if (change.restored) {
                  if (row?._dirty) {
                    change.command = row._deleted ? { op: 'delete', key: entry.key } : { op: 'put', record: bare(row) };
                    change.record = row._deleted ? null : bare(row);
                    change.revision = row._rev;
                  } else if (acknowledged || (!row && change.command.op === 'delete')) { skip(); return; }
                } else if (acknowledged) {
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

  async function ingestRows(collection, incomingRows, { replace = false, scope = null, complete = false } = {}, store) {
    live();
    const { name, decl } = local(collection);
    if (!Array.isArray(incomingRows)) throw serviceError('ingest: rows must be an array', 'DATA_INVALID');
    const given = incomingRows.map((row) => {
      if (!row || typeof row !== 'object' || !Object.hasOwn(row, '_writeReceipt')) return row;
      const { _writeReceipt: _receipt, ...domain } = row;
      return domain;
    });
    const keyPath = decl?.keyPath || 'id';
    const spec = sources.get(name) || decl?.source;
    let rows = given;
    if (typeof spec?.ingestRecord === 'function') {
      const keyed = given.filter((row) => row && typeof row === 'object' && row[keyPath] !== undefined && row[keyPath] !== null);
      const previous = previousByKey((await Promise.all([...new Set(keyed.map((row) => String(row[keyPath])))]
        .map((key) => store.getRaw(key)))).filter(Boolean), keyPath);
      rows = given.map((row) => (keyed.includes(row) ? spec.ingestRecord(row, previous.get(String(row[keyPath]))) : row));
    }
    const inScope = typeof scope === 'function' ? scope : () => true;
    // A refused row never keeps an older stored version alive through a replacement.
    const isAccepted = (row) => row && typeof row === 'object'
      && !(typeof store.validateRecord === 'function' && store.validateRecord(row));
    const kept = new Set(rows.filter(isAccepted).map((row) => String(row[keyPath])));
    const stored = new Set();
    const unsaved = new Set();
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
        // eslint-disable-next-line no-await-in-loop
        await upsert(chunk, { prune: false });
      }
      if (replace) await store.reconcile([], { scope: (row) => inScope(row) && !kept.has(String(row[keyPath])), whole: !scoped });
    }
    const written = stored.size;
    const distinct = new Set(rows.filter((row) => row && typeof row === 'object').map((row) => String(row[keyPath])));
    let everyRow = false;
    if ((complete === true || (replace && !scoped)) && kept.size === distinct.size && !unsaved.size) {
      const present = new Set((await rawRows(store)).map((row) => String(row[keyPath])));
      everyRow = [...kept].every((key) => present.has(key));
    }
    if (replace && scoped && complete !== true) {
      const state = stateFor(targetKey({ collection: name }));
      state.freshForm = formOf(jobContextNow());
      state.state = 'fresh'; state.syncedAt = now(); state.error = null;
      emitStatus();
    }
    return { written, ...(unsaved.size ? { unsaved: [...unsaved] } : {}), everyRow };
  }

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
  const READ_AGAIN = Symbol('read again');
  const windowReads = new Map();
  // Every stored server read goes through this guard: replacements drop its answer, changed rows are left alone.
  async function guardedRead(name, read, commit, { isCurrent = () => true, storing = null } = {}) {
    for (let attempt = 0; attempt < READ_TRIES; attempt += 1) {
      touchSequence += 1;
      const startedAt = touchSequence;
      // eslint-disable-next-line no-await-in-loop
      const answer = await read(startedAt);
      if (!isCurrent()) return undefined;
      const stored = typeof storing === 'function' ? storing() : null;
      let outcome;
      try {
        // eslint-disable-next-line no-await-in-loop
        outcome = await inTurn(name, async (turn) => {
          if (!isCurrent()) return { dropped: true };
          if (replacedAfter(name, startedAt)) return { dropped: true, replaced: true };
          if (protectionLost(name, startedAt)) return null;
          const value = await commit(answer, touchedAfter(name, startedAt), startedAt, turn);
          return value === READ_AGAIN ? null : { value };
        }, { at: startedAt });
      } finally {
        if (typeof stored === 'function') stored();
      }
      if (outcome?.replaced) return DROPPED;
      if (outcome) return outcome.dropped ? undefined : outcome.value;
    }
    throw serviceError(`'${name}' changed on this device faster than it could be read`, 'DATA_BUSY');
  }
  async function reconcileWindow(name, store, keyPath, {
    fetch, toRecord = (dto) => dto, keyOf, scope = () => true, window, windowKey, complete = false, keepDirty = false, rethrow = false, readKey, onReadDropped, context,
  }) {
    if (typeof fetch !== 'function') return store.readWhere(scope);
    const identity = typeof readKey === 'function' ? readKey(window) : readKey;
    const coverageKey = typeof identity === 'string' && identity
      ? `read:${identity}` : (complete && window == null ? 'whole' : null);
    let frame = null;
    if (coverageKey !== null) {
      if (!windowReads.has(name)) windowReads.set(name, new Map());
      const windows = windowReads.get(name);
      if (!windows.has(coverageKey)) windows.set(coverageKey, { readers: 0, confirmed: 0 });
      frame = windows.get(coverageKey);
      frame.readers += 1;
    }
    try {
      let failed = false;
      const stored = await guardedRead(name, async () => {
        failed = false;
        try { return await fetch(window, context); } catch (error) {
          if (rethrow) throw error;
          failed = true;
          return null;
        }
      }, async (dtos, touched, startedAt, turn) => {
        if (failed) return null;
        if (frame && frame.confirmed > startedAt) return DROPPED;
        let validAnswer = Array.isArray(dtos) && dtos.every((row) => row && typeof row === 'object');
        const mapRecord = (dto, previous) => {
          const record = toRecord(dto, previous);
          if (!record || typeof record !== 'object' || record[keyPath] == null
            || (typeof store.validateRecord === 'function' && store.validateRecord(record))) validAnswer = false;
          return record;
        };
        const rows = await reconcileFetched(turn.store, keyPath, { fetch: () => dtos, toRecord: mapRecord, keyOf }, scope, window, windowKey, {
          onPersistError, rethrow, keepDirty, skip: touched, ...(complete ? {} : { syncedAt: null }),
        });
        if (frame && validAnswer) frame.confirmed = startedAt;
        return rows;
      });
      if (stored === DROPPED && typeof onReadDropped === 'function') {
        try { onReadDropped(); } catch (_) { /* An observer cannot fail the read. */ }
      }
      return Array.isArray(stored) ? stored : store.readWhere(scope);
    } finally {
      if (frame) {
        frame.readers -= 1;
        if (!frame.readers) {
          const windows = windowReads.get(name);
          if (windows?.get(coverageKey) === frame) {
            windows.delete(coverageKey);
            if (!windows.size) windowReads.delete(name);
          }
        }
      }
    }
  }
  async function readDeclared(target, spec, wanted, isCurrent, { full = false, context = jobContextNow(), storing = null } = {}) {
    const { name, store, keyPath } = target;
    const { cursor: keepsCursor = false, fullEveryMs = FULL_EVERY_MS, forbidden = 'purge' } = spec.read;
    const outcome = await guardedRead(name, async () => {
      let since = null;
      let read = null;
      if (keepsCursor && !full) {
        const observed = watchChanges(name, store);
        const generation = generationOf(name);
        const [meta, rows] = await Promise.all([metaOf(name), rawRows(store)]);
        read = observed ? { rows, generation } : null;
        const keys = rows.map((row) => String(row[keyPath]));
        const whole = !!meta && meta.form === formOf(context) && typeof meta.digest === 'string' && meta.count === keys.length && meta.digest === keysDigest(keys);
        // A whole read must run before the store's age limit hides rows the cursor vouches for.
        const wholeWithin = Math.min(fullEveryMs, confirmAfterMs(store));
        if (whole && typeof meta.cursor === 'string' && meta.cursor && Number.isFinite(meta.fullAt) && now() - meta.fullAt < wholeWithin) since = meta.cursor;
      }
      try {
        const answer = await spec.fetch(wanted, { ...context, since });
        refusedOnce.delete(name);
        return { answer, since, read };
      } catch (error) {
        const refused = [403, 404].includes(Number(error?.status)) && isCurrent();
        if (refused && (forbidden === 'purge' || (forbidden === 'confirm' && refusedOnce.has(name)))) {
          await service.purge(name, {}).catch(() => {}); // eslint-disable-line no-use-before-define
        }
        if (refused && forbidden === 'confirm') refusedOnce.add(name);
        throw error;
      }
    }, async ({ answer, since, read }, _touched, startedAt, turn) => {
      if (snapshotRows(answer) === null) return NO_SNAPSHOT;
      const stored = await commitDeclared(target, spec, answer, {
        startedAt, since, isCurrent, read, turn, context,
      });
      return stored === 'read_again' ? READ_AGAIN : undefined;
    }, { isCurrent, storing });
    return outcome === NO_SNAPSHOT || outcome === DROPPED ? outcome : undefined;
  }

  async function commitDeclared({ name, label, store, keyPath }, spec, answer, {
    startedAt, since, isCurrent, read = null, turn, context,
  }) {
    const { raw } = turn;
    const { cursor: keepsCursor = false, removedField = null } = spec.read;
    if (!isCurrent()) return 'dropped';
    const keyOf = (row) => String(row[keyPath]);
    const rows = read && generationOf(name) === read.generation ? read.rows : await rawRows(store);
    const present = new Set(rows.map(keyOf));
    const dtos = snapshotRows(answer) || [];
    const toRecord = spec.toRecord || ((dto) => dto);
    const dtoKey = typeof spec.keyOf === 'function' ? spec.keyOf : (dto) => dto[keyPath];
    const previous = previousByKey(rows, keyPath);
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
    const limit = local(name).decl?.maxRows;
    if (!changesOnly && Number.isSafeInteger(limit) && records.length > limit) {
      throw serviceError(`'${name}' answered ${records.length} rows; this device keeps at most ${limit}`, 'DATA_TOO_LARGE');
    }
    // Stopping between commits forgets the source meta, so the next read is whole.
    const halted = () => !isCurrent() || protectionLost(name, startedAt);
    const stop = async () => {
      await sourceMeta.set(name, null).catch(() => {});
      return isCurrent() ? 'read_again' : 'dropped';
    };
    const written = new Set();
    const unsaved = new Set();
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
      const barred = barredAfter(name, startedAt);
      const unchanged = (touched) => (row) => !touched.has(keyOf(row)) && !barred(row);
      if (changesOnly) {
        for (const batch of ingestChunks(records)) {
          if (halted()) return stopHere();
          const touched = touchedAfter(name, startedAt);
          const chunk = batch.filter(unchanged(touched));
          // eslint-disable-next-line no-await-in-loop
          if (chunk.length) await commitChunk(chunk, { prune: false, keepDirty: true });
        }
      } else {
        const unfit = typeof raw.fitsWhole === 'function' ? raw.fitsWhole(records) : null;
        if (unfit) throw Object.assign(serviceError(`'${name}' answered rows this device cannot keep (${unfit})`, 'DATA_TOO_LARGE'), { reason: unfit });
        const answered = new Set(records.map(keyOf));
        const touchedBefore = touchedAfter(name, startedAt);
        removed = await removeRows({
          label, store: raw, keys: rows.filter((row) => !row._dirty && !answered.has(keyOf(row)) && !touchedBefore.has(keyOf(row))).map(keyOf), force: false,
        });
        if (halted()) return stopHere();
        const touched = touchedAfter(name, startedAt);
        const stored = new Map(rows.map((row) => [keyOf(row), row]));
        const confirmBefore = now() - confirmAfterMs(store);
        const toWrite = [];
        records.forEach((record) => {
          const key = keyOf(record);
          if (touched.has(key) || barred(record)) return;
          const row = stored.get(key);
          if (!row || row._dirty || row._persistFailed || Object.hasOwn(row, '_writeReceipt') || contentOf(record) !== contentOf(row)) { toWrite.push(record); return; }
          const at = Date.parse(row._updatedAt || '');
          if (!Number.isFinite(at) || at < confirmBefore) { toWrite.push(record); return; }
          written.add(key);
        });
        if (!toWrite.length && written.size) await commitChunk([], { prune: false, keepDirty: true });
        for (const batch of ingestChunks(toWrite)) {
          if (halted()) return stopHere();
          const touchedSince = touchedAfter(name, startedAt);
          const chunk = batch.filter(unchanged(touchedSince));
          // eslint-disable-next-line no-await-in-loop
          if (chunk.length) await commitChunk(chunk, { prune: false, keepDirty: true, protect: [...answered] });
        }
      }
    } catch (error) {
      // Record what a partial commit may have stored, so an earlier read never undoes it.
      recordEffect(name, { changedKeys: [...written, ...attempted], removedKeys: removed, at: startedAt });
      throw error;
    }
    if (halted()) return stopHere();
    recordCommit(!changesOnly);
    const touched = touchedAfter(name, startedAt);
    const kept = rows.filter((row) => row._dirty || touched.has(keyOf(row)) || (changesOnly && !removed.includes(keyOf(row)))).map(keyOf);
    const left = new Set([...kept, ...written, ...[...unsaved].filter((key) => present.has(key))]);
    const cursor = keepsCursor && typeof answer?.cursor === 'string' && answer.cursor ? answer.cursor : null;
    const before = await metaOf(name);
    const allSaved = unsaved.size === 0;
    const wasWhole = !!before && typeof before.digest === 'string' && before.count === present.size && before.digest === keysDigest(present);
    const whole = changesOnly ? wasWhole : allSaved;
    let nextCursor;
    if (!allSaved) nextCursor = changesOnly ? before?.cursor ?? null : null;
    else nextCursor = changesOnly ? cursor ?? before?.cursor ?? null : cursor;
    await sourceMeta.set(name, {
      cursor: nextCursor,
      form: formOf(context),
      fullAt: changesOnly ? (before?.fullAt ?? null) : now(),
      count: whole ? left.size : null,
      digest: whole ? keysDigest(left) : null,
    });
    return 'stored';
  }

  const methodGroups = new Map();
  let methodBatches = 0;
  const methodRefusals = new Map();
  const holdRefusal = (key, error) => {
    if (error?.retryable !== false || !HELD_REFUSAL_CODES.has(error?.code)) return;
    const last = methodRefusals.get(key);
    const [first, longest] = METHOD_REFUSAL_HOLD_MS;
    const holdMs = last ? Math.min(last.holdMs * 2, longest) : first;
    methodRefusals.delete(key);
    if (methodRefusals.size >= METHOD_REFUSALS_KEPT) methodRefusals.delete(methodRefusals.keys().next().value);
    methodRefusals.set(key, { until: now() + holdMs, holdMs, error });
  };
  function methodGroup(key, collection, batch = false) {
    if (!methodGroups.has(key)) {
      if (methodGroups.size >= METHOD_GROUPS_KEPT) {
        [...methodGroups.entries()].filter(([, group]) => !group.flying.size && !group.open && !group.state.flight)
          .slice(0, methodGroups.size - METHOD_GROUPS_KEPT + 1).forEach(([old]) => methodGroups.delete(old));
      }
      methodGroups.set(key, {
        collection, batch, voidSeq: 0, flying: new Map(), open: null, fetched: new Map(), state: { state: 'stale', syncedAt: null, error: null, flight: null },
      });
    }
    return methodGroups.get(key);
  }
  function describeMethod(state, strictReceipt = false) {
    const status = describeState(state);
    return {
      ...status, keys: Array.isArray(state.keys) ? state.keys.slice() : null,
      more: state.more ?? null, truncated: state.truncated === true,
      receipt: status.state === 'fresh' && state.syncedAt !== null && Number.isSafeInteger(state.flightSeq)
        ? state.flightSeq : null,
      ...(strictReceipt ? {
        receiptRevision: status.state === 'fresh' && state.syncedAt !== null && Number.isSafeInteger(state.receiptRevision)
          ? state.receiptRevision : null,
        expiresAt: status.state === 'fresh' && Number.isFinite(state.syncedAt)
          && Number.isFinite(staleAfterMs) && Number.isSafeInteger(state.receiptRevision)
          ? state.syncedAt + staleAfterMs : null,
      } : {}),
    };
  }

  function retireStrictMethods(name, before, after) {
    let retired = false;
    methodGroups.forEach((group, key) => {
      if (group.collection !== name) return;
      const method = JSON.parse(key)[2];
      if (before?.methods?.[method]?.strictReceipt !== true
        && after?.methods?.[method]?.strictReceipt !== true) return;
      group.state.syncedAt = null;
      group.state.receiptRevision = null;
      if (group.state.state === 'fresh' || group.state.state === 'refreshing') group.state.state = 'stale';
      retired = true;
    });
    if (retired) emitStatus();
  }
  const methodsWorking = () => [...methodGroups.values()].some((group) => group.flying.size || group.open || group.state.flight);
  let coverageSeq = 0;
  const coverageVoid = new Map();
  const coverageLoss = new Map();
  const wholeCovers = new Map();
  const coverKey = (form, name) => JSON.stringify([form, name]);
  const evictions = new Map();
  const voidGroup = (group) => {
    group.voidSeq = coverageSeq;
    group.state.syncedAt = null;
    if (group.state.state === 'fresh') group.state.state = 'stale';
  };
  // With keys, only method groups whose answer or fetched ids lost a row are voided.
  const forgetMethods = (name, keys = null) => {
    coverageSeq += 1;
    coverageVoid.set(name, coverageSeq);
    const lost = keys ? new Set(keys.map(String)) : null;
    if (lost) {
      const log = evictions.get(name) || { floor: 0, entries: [] };
      log.entries.push({ seq: coverageSeq, keys: lost });
      if (log.entries.length > EVICTIONS_KEPT) log.floor = log.entries.shift().seq;
      evictions.set(name, log);
    }
    methodGroups.forEach((group) => {
      if (group.collection !== name) return;
      if (!lost) {
        group.fetched.clear();
        voidGroup(group);
        return;
      }
      let hit = false;
      lost.forEach((key) => { if (group.fetched.delete(key)) hit = true; });
      if (!group.batch && (Array.isArray(group.state.keys)
        ? group.state.keys.some((key) => lost.has(String(key))) : group.state.syncedAt !== null)) hit = true;
      if (hit) voidGroup(group);
    });
    emitStatus();
  };
  const evictedSince = (name, seq, keys) => {
    const log = evictions.get(name);
    if (!log || !keys.length) return false;
    if (seq < log.floor) return true;
    return log.entries.some((entry) => entry.seq > seq && keys.some((key) => entry.keys.has(String(key))));
  };
  const voidOf = (name) => coverageVoid.get(name) || 0;
  const groupVoid = (group) => group.voidSeq || 0;
  const purgedAt = new Map();
  function voidReads(name) {
    coverageSeq += 1;
    purgedAt.set(name, coverageSeq);
    states.forEach((state, key) => {
      if (JSON.parse(key)[0] !== name) return;
      state.syncedAt = null;
      if (state.state === 'fresh') state.state = 'stale';
    });
  }
  const lossOf = (name) => coverageLoss.get(name) || 0;
  const ownsChange = (event) => {
    if (changeOwner === null) return true;
    if (typeof event?.owner === 'string') return event.owner === changeOwner;
    // Unknown identities never grant coverage.
    if (event?.type !== 'purge' || typeof event.principal !== 'string') return false;
    try { return JSON.stringify(JSON.parse(changeOwner).slice(0, 2)) === event.principal; } catch (_) { return false; }
  };
  const matchesCollection = (event, name) => {
    const label = labelOf(name);
    return event?.label === label || event?.labels?.includes(label) || event?.store === label
      || (event?.type === 'purge' && !event.label && !event.labels);
  };
  function loseCoverage(name, keys = null) {
    forgetMethods(name, keys);
    coverageLoss.set(name, voidOf(name));
    states.forEach((state, key) => {
      if (JSON.parse(key)[0] !== name) return;
      state.syncedAt = null;
      if (state.state === 'fresh') state.state = 'stale';
    });
  }
  const offGenerationFeed = feed?.subscribe((event) => {
    if (disposed || !ownsChange(event)) return;
    let invalidated = false;
    knownCollections.forEach((name) => {
      if (!matchesCollection(event, name)) return;
      if (watchedStores.has(name)) bump(name);
      if (event.type === 'evict' || event.type === 'purge') {
        const keys = event.type === 'evict' && event.truncated !== true ? event.keysByLabel?.[labelOf(name)] : null;
        loseCoverage(name, Array.isArray(keys) ? keys : null);
        invalidated = true;
      }
    });
    if (invalidated) emitStatus();
  });

  function noteFetched(group, id, at, present = null) {
    group.fetched.delete(id);
    group.fetched.set(id, { at, present });
    while (group.fetched.size > METHOD_FRESH_KEPT) group.fetched.delete(group.fetched.keys().next().value);
  }
  // Removes only keys named gone, never one changed locally since or unsent.
  async function commitMethod({ name, label, store, decl }, spec, answer, {
    touched, turn, startedAt, current, unanswered = null, strictReceipt = false,
  }) {
    const keyPath = decl?.keyPath || 'id';
    const rows = Array.isArray(answer) ? answer : answer?.rows;
    const gone = Array.isArray(answer) ? [] : answer?.gone ?? [];
    // An answer refused here would be refused again: never retried.
    const invalid = (why) => Object.assign(serviceError(`'${name}': a method answer ${why}`, 'DATA_INVALID'), { retryable: false });
    if (!Array.isArray(rows) || !Array.isArray(gone)) throw invalid('is rows, or { rows, gone }');
    if (rows.length > MAX_METHOD_ROWS) {
      throw Object.assign(serviceError(`'${name}': a method answered ${rows.length} rows; at most ${MAX_METHOD_ROWS}`, 'DATA_TOO_LARGE'), { retryable: false });
    }
    if (gone.length > MAX_METHOD_GONE) {
      throw Object.assign(serviceError(`'${name}': a method named ${gone.length} keys gone; at most ${MAX_METHOD_GONE}`, 'DATA_TOO_LARGE'), { retryable: false });
    }
    if (rows.some((dto) => !dto || typeof dto !== 'object')) throw invalid('holds an entry that is not a row');
    if (gone.some((key) => methodId(key) === null)) throw invalid('names a gone key that is not a key');
    const dtoKey = typeof spec.keyOf === 'function' ? spec.keyOf : (dto) => dto[keyPath];
    const dtoKeys = rows.map((dto) => { const key = dtoKey(dto); return key === undefined || key === null ? null : String(key); });
    const previous = previousByKey(await Promise.all([...new Set(dtoKeys.filter((key) => key !== null))].map((key) => store.getRaw(key))), keyPath);
    const toRecord = spec.toRecord || ((dto) => dto);
    const mapped = rows.map((dto, at) => toRecord(dto, dtoKeys[at] === null ? undefined : previous.get(dtoKeys[at])));
    if (mapped.some((record) => !record || typeof record !== 'object' || record[keyPath] === undefined || record[keyPath] === null)) {
      throw invalid('holds an entry that is not a row with a key');
    }
    const keys = [...new Set(mapped.map((record) => String(record[keyPath])))];
    const before = await Promise.all(keys.map((key) => store.getRaw(key)));
    const incomplete = () => Object.assign(serviceError(`'${name}': a strict method answer was not completely admitted`, 'DATA_INCOMPLETE'), { retryable: false });
    if (strictReceipt && (keys.length !== mapped.length || before.some((row) => row?._dirty)
      || mapped.some((row) => row._dirty === true))) throw incomplete();
    const refusals = [];
    const barred = barredAfter(name, startedAt);
    const records = mapped.filter((record) => {
      if (touched.has(String(record[keyPath])) || barred(record)) return false;
      const why = typeof store.validateRecord === 'function' ? store.validateRecord(record) : null;
      if (why) refusals.push(why);
      return !why;
    });
    if (refusals.length) reportRejected(store, refusals, onPersistError);
    if (strictReceipt && records.length !== mapped.length) throw incomplete();
    for (const chunk of ingestChunks(records)) {
      if (!current()) return null;
      // eslint-disable-next-line no-await-in-loop
      const applied = await turn.store.reconcile(chunk, { prune: false, keepDirty: true, syncedAt: null });
      if (strictReceipt && (applied?.upserted !== chunk.length || applied.skipped?.length || applied.unsaved?.length)) throw incomplete();
    }
    if (!current()) return null;
    const answered = new Set(keys);
    const left = unanswered ? await unanswered(mapped, keyPath) : { keys: [], field: null, values: [] };
    if (!current()) return null;
    if (left.field && left.field !== keyPath) noteGoneValues(name, left.field, left.values, startedAt);
    const unansweredKeys = [...new Set([...gone.map(String), ...left.keys])].filter((key) => !answered.has(key));
    if (strictReceipt && unansweredKeys.some((key) => touched.has(key))) throw incomplete();
    const goneKeys = unansweredKeys.filter((key) => !touched.has(key));
    if (strictReceipt && (await Promise.all(goneKeys.map((key) => store.getRaw(key)))).some((row) => row?._dirty)) throw incomplete();
    recordEffect(name, { removedKeys: goneKeys, at: startedAt });
    const goneRows = (await Promise.all(goneKeys.map((key) => store.getRaw(key)))).filter((row) => row && !row._dirty);
    const removed = [];
    for (let start = 0; start < goneRows.length; start += PAGE_ROWS) {
      if (!current()) return null;
      // eslint-disable-next-line no-await-in-loop
      removed.push(...await removeRows({
        label, store: turn.store, keys: goneRows.slice(start, start + PAGE_ROWS).map((row) => String(row[keyPath])), force: false,
      }));
    }
    const after = await Promise.all(keys.map((key) => store.getRaw(key)));
    if (strictReceipt && after.some((row) => !row || row._dirty || row._persistFailed)) throw incomplete();
    await adjustMeta(name, { added: keys.filter((key, at) => !before[at] && after[at]), removed });
    return { keys, more: !Array.isArray(answer) && answer?.more === true, absent: unanswered ? left.values : null };
  }
  function refreshMethodAs(wanted, {
    mode = 'silent', priority = 'normal', maxAge = 0, reason = null, fromNow = false, sinceWrite = false, retry = false,
    stillWanted = null,
  } = {}, context) {
    live();
    const {
      name, label, store, decl,
    } = local(wanted.collection);
    if (wanted.key !== undefined || wanted.query !== undefined || wanted.window !== undefined) {
      return Promise.reject(serviceError('refresh: a method takes params, never a key, query or window', 'DATA_INVALID'));
    }
    const spec = sources.get(name) || decl?.source;
    if (!spec) return Promise.reject(serviceError(`'${wanted.collection}' has no source`, 'DATA_NO_SOURCE'));
    const method = spec.methods && typeof wanted.method === 'string' && Object.hasOwn(spec.methods, wanted.method) ? spec.methods[wanted.method] : null;
    if (!method) return Promise.reject(serviceError(`'${wanted.collection}' has no refresh method '${wanted.method}'`, 'DATA_INVALID'));
    let params;
    try { params = methodParams(name, wanted.method, method, wanted.params); } catch (error) { return Promise.reject(error); }
    let available = true;
    try { available = typeof method.available !== 'function' || method.available(params) !== false; } catch (_) { available = false; }
    const form = formOf(context);
    const batchParam = method.batch || null;
    if (stillWanted !== null && batchParam) return Promise.reject(serviceError('stillWanted needs an unbatched method', 'DATA_UNSUPPORTED'));
    const shared = batchParam ? Object.fromEntries(Object.entries(params).filter(([param]) => param !== batchParam)) : params;
    const groupKey = JSON.stringify([form, name, wanted.method, shared]);
    let group = methodGroup(groupKey, name, !!batchParam);
    const outcome = (value) => {
      if (value === ANSWERED_FRESH) return { ...describeState(group.state), state: 'fresh', error: null };
      return batchParam ? describeState(group.state)
        : describeMethod(group.state, method.strictReceipt === true);
    };
    const settle = (promise) => (mode === 'visible' ? promise.then(outcome) : promise.then(outcome, outcome));
    if (!available) {
      const refusal = Object.assign(serviceError(`'${wanted.collection}' cannot run '${wanted.method}' now`, 'DATA_UNSUPPORTED'), { retryable: false });
      group.state.state = 'error';
      group.state.error = { code: refusal.code, status: null, message: refusal.message };
      return settle(Promise.reject(refusal));
    }
    const factor = cadenceFactor(name);
    if (factor === Infinity) return settle(Promise.resolve());
    const age = Math.max(Number(maxAge) || 0, method.cadenceMs || 0) * factor;
    const askedAt = now();
    const whole = stateFor(targetKey({ collection: name }));
    const dropped = () => Object.assign(serviceError(`'${wanted.collection}' refresh method '${wanted.method}' is no longer current`, 'REFRESH_DROPPED'), { retryable: false });
    const failed = (error, isCurrent = null) => {
      if (isCurrent && !isCurrent()) return dropped();
      group.state.state = isOnline() ? 'error' : 'offline';
      group.state.error = { code: error?.code || null, status: error?.status ?? null, message: error?.message || String(error) };
      if (!batchParam) emitStatus();
      return error;
    };
    if (method.strictReceipt === true && !watchChanges(name, store)) {
      const refusal = Object.assign(serviceError(`'${name}' cannot observe strict method coverage`, 'DATA_INCOMPLETE'), { retryable: false });
      return settle(Promise.reject(failed(refusal)));
    }
    if (batchParam && !fromNow) {
      const covered = (wholeCovers.get(coverKey(form, name)) || 0) > voidOf(name);
      if (covered && whole.freshForm === form && age > 0 && whole.syncedAt !== null && askedAt - whole.syncedAt < age && whole.state !== 'error') {
        group.state.state = 'fresh';
        group.state.error = null;
        group.state.syncedAt = whole.syncedAt;
        return settle(Promise.resolve());
      }
      // A keyed ask never inherits a whole read's failure: it sends its own lookup.
      if (whole.flight && whole.flightWhole && whole.flightForm === form && (whole.flightSeq || 0) > voidOf(name)) {
        const stored = whole.flight.then(() => !disposed && formOf(jobContextNow()) === form
          && (wholeCovers.get(coverKey(form, name)) || 0) > voidOf(name)
          && stateFor(targetKey({ collection: name })).state === 'fresh', () => false);
        return settle(stored.then((answered) => {
          if (answered) {
            group.state.state = 'fresh';
            group.state.error = null;
            group.state.syncedAt = stateFor(targetKey({ collection: name })).syncedAt;
            return undefined;
          }
          const refuse = (message, code) => {
            const error = Object.assign(serviceError(message, code), { retryable: false });
            group.state.state = 'error';
            group.state.error = { code, status: null, message };
            throw error;
          };
          if (disposed) refuse('Data service retired', 'DATA_RETIRED');
          if (formOf(jobContextNow()) !== form) refuse('The account changed while the lookup waited', 'DATA_RETIRED');
          group = methodGroup(groupKey, name, !!batchParam);
          let offered = true;
          try { offered = typeof method.available !== 'function' || method.available(params) !== false; } catch (_) { offered = false; }
          if (!offered) refuse(`'${wanted.collection}' cannot run '${wanted.method}' now`, 'DATA_UNSUPPORTED');
          return lookup();
        }));
      }
    }
    return settle(lookup());

    // Ids whose fetched row the store's bounds evicted: fetched again, never fresh.
    async function evictedIds(ids) {
      if (!method.field || !ids.length) return new Set();
      const keyPath = decl?.keyPath || 'id';
      if (method.field === keyPath) {
        const rows = await Promise.all(ids.map((id) => Promise.resolve().then(() => store.getRaw(String(id))).catch(() => null)));
        return new Set(ids.filter((id, at) => !rows[at]));
      }
      const held = new Set((await Promise.resolve().then(() => rawRows(store)).catch(() => []) || []).map((row) => row?.[method.field])
        .filter((value) => value !== undefined && value !== null).map(String));
      return new Set(ids.filter((id) => !held.has(String(id))));
    }

    async function lookup() {
      const at = now();
      if (!isOnline()) {
        group.state.state = 'offline';
        throw serviceError('Offline', 'DATA_OFFLINE');
      }
      const fresh = (since) => !fromNow && age > 0 && since !== null && since !== undefined && at - since < age;
      const freshEntry = (entry) => !!entry && fresh(entry.at);
      const evicted = batchParam ? await evictedIds(params[batchParam]
        .filter((id) => { const entry = group.fetched.get(id); return freshEntry(entry) && entry.present === true; })) : new Set();
      const unansweredBy = (ids) => (method.field && ids ? async (records, keyPath) => {
        const answeredValues = new Set(records.map((record) => String(record[method.field])));
        const missing = ids.filter((id) => !answeredValues.has(id));
        if (!missing.length) return { keys: [], field: method.field, values: [] };
        if (method.field === keyPath) return { keys: missing, field: method.field, values: missing };
        const wantedValues = new Set(missing);
        const keys = (await rawRows(store)).filter((row) => row[method.field] !== undefined && row[method.field] !== null
          && wantedValues.has(String(row[method.field]))).map((row) => String(row[keyPath]));
        return { keys, field: method.field, values: missing };
      } : null);
      const unansweredOf = (asked) => (typeof method.prunesWhere === 'function' ? async (records, keyPath) => {
        const answeredKeys = new Set(records.map((record) => String(record[keyPath])));
        const keys = (await rawRows(store)).filter((row) => {
          if (answeredKeys.has(String(row[keyPath]))) return false;
          try { return method.prunesWhere(row, asked) === true; } catch (_) { return false; }
        }).map((row) => String(row[keyPath]));
        return { keys, field: null, values: [] };
      } : null);
      const run = async (asked, ids, isCurrent, afterDeadline = () => false, storing = null) => {
        const current = () => !disposed && isCurrent();
        if (!batchParam && !current()) {
          if (afterDeadline()) return;
          throw dropped();
        }
        const began = now();
        const voidAtStart = groupVoid(group);
        const seqAtStart = coverageSeq;
        group.state.state = 'refreshing';
        if (!batchParam) {
          group.state.error = null;
          emitStatus();
        }
        if (!batchParam && !current()) {
          if (afterDeadline()) return;
          throw dropped();
        }
        try {
          let stored = null;
          let truncated = false;
          await guardedRead(name, () => {
            if (!batchParam && !current()) return undefined;
            return method.fetch(asked, context);
          }, async (answer, touched, startedAt, turn) => {
            if (answer && !Array.isArray(answer) && answer.complete === false) {
              truncated = true;
              return;
            }
            stored = await commitMethod({
              name, label, store, decl,
            }, spec, answer, {
              touched, turn, startedAt, current, unanswered: unansweredBy(ids) || unansweredOf(asked), strictReceipt: method.strictReceipt === true,
            });
            if (stored && method.strictReceipt === true) stored.receiptRevision = generationOf(name);
          }, { isCurrent: current, storing });
          if (!batchParam && !current()) {
            if (afterDeadline()) return;
            throw dropped();
          }
          if (!batchParam) group.state.truncated = truncated;
          // Stored nothing or stopped: stale, never fresh.
          if (!stored || !current()) {
            if (group.state.state === 'refreshing') group.state.state = 'stale';
            if (!batchParam) emitStatus();
            return;
          }
          if (!batchParam) {
            group.state.keys = stored.keys;
            group.state.more = stored.more;
            if (method.strictReceipt === true) group.state.receiptRevision = stored.receiptRevision;
          }
          group.state.state = 'fresh';
          group.state.error = null;
          if (!batchParam) methodRefusals.delete(groupKey);
          if (evictedSince(name, seqAtStart, [...(stored.keys || []), ...(ids || [])])) {
            coverageSeq += 1;
            voidGroup(group);
            if (!batchParam) emitStatus();
            return;
          }
          if (groupVoid(group) !== voidAtStart) return;
          if (ids) {
            const absent = Array.isArray(stored.absent) ? new Set(stored.absent.map(String)) : null;
            ids.forEach((id) => noteFetched(group, id, began, absent ? !absent.has(String(id)) : null));
          }
          group.state.syncedAt = now();
          if (!batchParam) emitStatus();
        } catch (error) {
          const reported = failed(error, batchParam ? null : current);
          if (!batchParam && reported === error) holdRefusal(groupKey, error);
          throw reported;
        }
      };
      const standing = inForeground(name)
        ? { priority: PRIORITIES[priority] ?? PRIORITIES.normal, visible: mode === 'visible' }
        : { priority: PRIORITIES.background, visible: false };
      const askRank = standing.priority - (standing.visible ? PRIORITIES.background + 1 : 0);
      const job = (key, work, attempts, isCurrent = null) => Promise.resolve(scheduler.request({
        key: lanedKey('data', `${label}:${wanted.method}:${key}`),
        target: laned(label),
        budgetKey: spec.budgetKey || budgetKey,
        reason,
        ...standing,
        ...(spec.gate === true ? { gate: true } : {}),
        // Never run, or run again, once this service is disposed or its reads paused.
        valid: () => !disposed && cadenceFactor(name) !== Infinity && (!isCurrent || isCurrent()),
        run: attempts.run(work),
      })).catch((error) => { throw failed(error, isCurrent); }).finally(() => attempts.settled());
      if (!batchParam) {
        if (fresh(group.state.syncedAt) && group.state.state === 'fresh') return Promise.resolve();
        const held = methodRefusals.get(groupKey);
        if (held && retry === true) held.until = at;
        if (held && at < held.until) {
          group.state.state = 'error';
          group.state.error = { code: held.error.code, status: held.error.status ?? null, message: held.error.message };
          emitStatus();
          return Promise.reject(Object.assign(serviceError(held.error.message, held.error.code), { retryable: false, held: true }));
        }
        const join = (flying) => {
          if (stillWanted) flying.askers.wanted.add(stillWanted);
          else flying.askers.always = true;
          if (!flying.begun && inForeground(name) && typeof scheduler.raise === 'function') {
            try {
              if (scheduler.raise(lanedKey('data', `${label}:${wanted.method}:${flying.seq}`), standing)) flying.rank = Math.min(flying.rank, askRank);
            } catch (_) { /* the read keeps its rank */ }
          }
          return flying.attempts.answer(flying.promise);
        };
        if (!fromNow && group.state.flight && at - group.state.flight.at < METHOD_SHARE_MS) return join(group.state.flight);
        const sharesSinceWrite = fromNow && sinceWrite === true;
        const last = group.state.answered;
        if (sharesSinceWrite && reuseSinceWriteMs > 0 && last && method.strictReceipt !== true && group.state.state === 'fresh'
          && !group.state.flight && last.writeMark !== null && last.writeMark === writeMarkNow()
          && last.voidAt === groupVoid(group) && at - last.at < reuseSinceWriteMs) {
          return Promise.resolve();
        }
        const flying = group.state.flight;
        if (sharesSinceWrite && flying && !flying.settled && flying.rank <= askRank && flying.voidAtAsk === groupVoid(group)
          && !flying.attempts.failing() && at - flying.at < METHOD_SHARE_MS
          && (!flying.begun || (flying.writeMark !== null && flying.writeMark === writeMarkNow()))) {
          return join(flying);
        }
        if (stillWanted && !(() => { try { return !!stillWanted(); } catch (_) { return false; } })()) return Promise.reject(dropped());
        methodBatches += 1;
        const voidAtAsk = groupVoid(group);
        const flight = {
          at,
          seq: methodBatches,
          promise: null,
          attempts: readAttempts(),
          settled: false,
          deadlineRetry: false,
          begun: false,
          rank: askRank,
          voidAtAsk,
          writeMark: null,
          askers: { always: !stillWanted, wanted: new Set(stillWanted ? [stillWanted] : []) },
        };
        const stillAsked = () => flight.askers.always || [...flight.askers.wanted].some((asker) => { try { return !!asker(); } catch (_) { return false; } });
        group.state.flightSeq = flight.seq;
        group.state.flight = flight;
        const afterDeadline = () => flight.settled && flight.deadlineRetry;
        const current = () => !disposed && cadenceFactor(name) !== Infinity
          && methodGroups.get(groupKey) === group && (group.state.flight === flight || afterDeadline()) && group.state.flightSeq === flight.seq
          && (sources.get(name) || decl?.source) === spec && formOf(jobContextNow()) === form && groupVoid(group) === voidAtAsk;
        let resolveFlight;
        let rejectFlight;
        flight.promise = new Promise((_resolve, _reject) => { resolveFlight = _resolve; rejectFlight = _reject; });
        group.state.state = 'refreshing';
        group.state.error = null;
        let scheduled;
        try {
          scheduled = job(String(flight.seq), (isCurrent, helpers) => {
            // Taken once: a retry reads after the same writes.
            if (!flight.begun) flight.writeMark = writeMarkNow();
            flight.begun = true;
            flight.askers.always = true;
            return run(params, null, () => isCurrent() && current(), afterDeadline, helpers?.storing).then((value) => {
              if (group.state.flight === flight && group.state.state === 'fresh') {
                group.state.answered = {
                  writeMark: flight.writeMark, at: now(), voidAt: voidAtAsk,
                };
              }
              return value;
            });
          // Queued, it never runs once no asker still waits for it.
          }, flight.attempts, () => current() && stillAsked());
        } catch (error) {
          flight.attempts.settled();
          scheduled = Promise.reject(failed(error, current));
        }
        scheduled
          .catch((error) => {
            flight.deadlineRetry = error?.code === 'REFRESH_TIMEOUT' && error?.retryable === true;
            throw error;
          })
          .finally(() => {
            flight.settled = true;
            if (group.state.flight !== flight) return;
            group.state.flight = null;
            const ended = group.state.state;
            if (!disposed && methodGroups.get(groupKey) === group && group.state.flightSeq === flight.seq
              && !flight.deadlineRetry && group.state.state === 'refreshing') {
              group.state.state = 'stale';
            }
            if (!disposed && ended === 'error') emitStatus();
          })
          .then(resolveFlight, rejectFlight)
          .catch(rejectFlight);
        if (current()) emitStatus();
        return flight.attempts.answer(flight.promise);
      }
      const max = method.params[batchParam].max || MAX_METHOD_IDS;
      const waits = new Set();
      // Batches go to the scheduler only once every id is in, so an immediate scheduler never reads part.
      const started = [];
      params[batchParam].forEach((id) => {
        if (freshEntry(group.fetched.get(id)) && !evicted.has(id)) return;
        const flying = group.flying.get(id);
        if (!fromNow && flying && at - flying.at < METHOD_SHARE_MS) { waits.add(flying); return; }
        if (!group.open || group.open.ids.size >= max || at - group.open.at >= METHOD_SHARE_MS) {
          methodBatches += 1;
          const batch = {
            ids: new Set(), at, key: String(methodBatches), promise: null, settle: null, attempts: readAttempts(), begun: false,
          };
          batch.promise = new Promise((resolve, reject) => { batch.settle = { resolve, reject }; })
            .finally(() => {
              if (group.open === batch) group.open = null;
              batch.ids.forEach((one) => { if (group.flying.get(one) === batch) group.flying.delete(one); });
            });
          group.open = batch;
          started.push(batch);
        }
        group.open.ids.add(id);
        group.flying.set(id, group.open);
        waits.add(group.open);
      });
      if (!waits.size) return Promise.resolve(ANSWERED_FRESH);
      const answers = [...waits].map((batch) => batch.attempts.answer(batch.promise));
      if (inForeground(name) && typeof scheduler.raise === 'function') {
        waits.forEach((batch) => {
          if (batch.begun || started.includes(batch)) return;
          try { scheduler.raise(lanedKey('data', `${label}:${wanted.method}:${batch.key}`), standing); } catch (_) { /* the batch keeps its rank */ }
        });
      }
      started.forEach((batch) => {
        job(batch.key, (isCurrent, helpers) => {
          batch.begun = true;
          if (group.open === batch) group.open = null;
          const ids = [...batch.ids].sort(idOrder);
          return run({ ...shared, [batchParam]: ids }, ids, isCurrent, undefined, helpers?.storing);
        }, batch.attempts).then(batch.settle.resolve, batch.settle.reject);
      });
      return Promise.all(answers).then(() => undefined);
    }
  }

  function refreshAs(target, {
    mode = 'silent', priority = 'normal', maxAge = 0, reason = null, full = false, fromNow = false, sinceWrite = false, nextAttempt = false,
    storedChecked = false, retry = false, stillWanted = null,
  } = {}, context) {
    live();
    const wanted = targetOf(target);
    if (stillWanted !== null && typeof stillWanted !== 'function') return Promise.reject(serviceError('stillWanted must be a function', 'DATA_INVALID'));
    if (typeof nextAttempt !== 'boolean') return Promise.reject(serviceError('nextAttempt must be true or false', 'DATA_INVALID'));
    if (nextAttempt && (wanted.method !== undefined || wanted.query !== undefined || wanted.window !== undefined)) {
      return Promise.reject(serviceError('nextAttempt needs a collection or exact key read', 'DATA_UNSUPPORTED'));
    }
    if (wanted.method !== undefined) {
      return refreshMethodAs(wanted, {
        mode, priority, maxAge, reason, fromNow, sinceWrite, retry, stillWanted,
      }, context);
    }
    const { name, label, store, decl } = local(wanted.collection);
    watchChanges(name, store);
    if (wanted.query) checkQuery(wanted.query);
    const spec = sources.get(name) || decl?.source;
    const key = targetKey({ ...wanted, collection: name });
    const { state, release } = targetStates.acquire(key);
    const settle = (promise) => {
      const answer = mode === 'visible' ? promise : promise.then(() => service.status(target), () => service.status(target));
      return release ? answer.finally(release) : answer;
    };
    try {
      if (state.flight && state.flightSeq <= voidOf(name)) fromNow = true;
      if (!spec) return settle(Promise.reject(serviceError(`'${wanted.collection}' has no source`, 'DATA_NO_SOURCE')));
      const factor = cadenceFactor(name);
      if (factor === Infinity) return settle(Promise.resolve());
      const age = maxAge > 0 ? maxAge * factor : 0;
      const form = formOf(context);
      if (state.freshForm !== form) {
        state.syncedAt = null;
        state.storedCheck = null;
        if (state.state === 'fresh') state.state = 'stale';
      }
      state.freshForm = form;
      if (!fromNow && age > 0 && state.syncedAt !== null && now() - state.syncedAt < age && state.state !== 'error') return settle(Promise.resolve());
      if (!storedChecked && !fromNow && age > 0 && state.syncedAt === null && !state.flight && state.state !== 'error'
        && spec?.read && !wanted.query && !wanted.window && (wanted.key === undefined || wanted.key === null) && typeof spec.scope !== 'function'
        && (!state.storedCheck || state.storedCheck.pending)) {
        if (!state.storedCheck) {
          const check = { pending: true, at: null, loss: lossOf(name), form };
          check.done = storedFreshAt(name, store, decl?.keyPath || 'id', context).then((at) => { check.at = at; check.pending = false; });
          state.storedCheck = check;
        }
        const check = state.storedCheck;
        const asked = {
          mode, priority, maxAge, reason, full, fromNow, sinceWrite, nextAttempt, storedChecked: true, stillWanted,
        };
        return settle(check.done.then(() => {
          if (check.loss === lossOf(name) && check.form === formOf(jobContextNow()) && check.at !== null && now() - check.at < age && state.syncedAt === null && !state.flight && state.state !== 'error') {
            state.freshForm = form;
            state.state = 'fresh'; state.syncedAt = check.at; state.error = null;
            emitStatus();
            return undefined;
          }
          return refreshAs(target, asked, context);
        }));
      }
      if (!isOnline()) {
        state.state = 'offline';
        emitStatus();
        return settle(Promise.reject(serviceError('Offline', 'DATA_OFFLINE')));
      }
      if (retry === true && state.flight && state.flightForm === form && (!full || state.flightFull) && state.attempts?.failing()
        && state.flightJobKey && typeof scheduler.retryNow === 'function') {
        let woken = false;
        try { woken = scheduler.retryNow(state.flightJobKey) === true; } catch (_) { woken = false; }
        if (woken) {
          if (inForeground(name) && typeof scheduler.raise === 'function') {
            try { scheduler.raise(state.flightJobKey, { visible: mode === 'visible', priority: PRIORITIES[priority] ?? PRIORITIES.normal }); } catch (_) { /* the read keeps its rank */ }
          }
          if (state.flightAskers) {
            if (stillWanted) state.flightAskers.wanted.add(stillWanted);
            else state.flightAskers.always = true;
          }
          return settle(state.attempts.answer(state.flight, { nextAttempt: true }));
        }
      }
      if (state.flight && state.flightForm === form && (!full || state.flightFull) && !fromNow) {
        if (state.flightJobKey && inForeground(name) && typeof scheduler.raise === 'function') {
          try { scheduler.raise(state.flightJobKey, { visible: mode === 'visible', priority: PRIORITIES[priority] ?? PRIORITIES.normal }); } catch (_) { /* the read keeps its rank */ }
        }
        if (state.flightAskers) {
          if (stillWanted) state.flightAskers.wanted.add(stillWanted);
          else state.flightAskers.always = true;
        }
        return settle(state.attempts.answer(state.flight, { nextAttempt }));
      }
      if (state.flight) {
        const { attempts } = state;
        const after = () => refreshAs(target, {
          mode: 'visible', priority, maxAge: 0, reason, full, stillWanted,
        }, context);
        return settle(attempts.answer(state.flight, { nextAttempt }).then(after, (error) => (nextAttempt || attempts.failing() ? Promise.reject(error) : after())));
      }
      if (stillWanted && !stillWanted()) {
        return settle(Promise.reject(Object.assign(serviceError(`'${wanted.collection}' is no longer wanted`, 'REFRESH_DROPPED'), { retryable: false })));
      }
      state.state = 'refreshing';
      emitStatus();
      const keyPath = decl?.keyPath || 'id';
      // A server copy never replaces a row with an unsent local change.
      const run = async (isCurrent, storing = null) => {
        if (wanted.key !== undefined && wanted.key !== null) {
          const rowKey = String(wanted.key);
          await guardedRead(name, () => spec.fetch(wanted, context), async (dto, touched, _startedAt, { store: writer }) => {
            if (touched.has(rowKey)) return;
            if (!dto) {
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
            await writer.reconcile([record], { prune: false, keepDirty: true, syncedAt: null });
          }, { isCurrent, storing });
          return;
        }
        if (spec.read && !wanted.query && !wanted.window && typeof spec.scope !== 'function') {
          return readDeclared({ name, label, store, keyPath }, spec, wanted, isCurrent, { full, context, storing });
        }
        let scope = typeof spec.scope === 'function' ? spec.scope(wanted) : () => true;
        if (wanted.query && typeof spec.scope !== 'function') {
          const { limit: _limit, cursor: _cursor, raw: _raw, where, ...range } = wanted.query;
          if (range.index) {
            const held = new Set((await rangeKeys(store, keyPath, wholeRange(range, 'refresh'))).map((entry) => entry.key));
            scope = (row) => held.has(String(row[keyPath]));
          } else if (typeof where === 'function') scope = (row) => where(row);
        }
        const whole = !wanted.query && typeof spec.scope !== 'function';
        return guardedRead(name, async () => snapshotRows(await spec.fetch(wanted, context)), (dtos, touched, _startedAt, turn) => (dtos === null ? NO_SNAPSHOT
          : reconcileFetched(turn.store, keyPath, { fetch: () => dtos, toRecord: spec.toRecord || ((dto) => dto), keyOf: spec.keyOf },
            scope, wanted.window, windowKeyOf(wanted.window), {
              onPersistError, rethrow: true, keepDirty: true, skip: touched, ...(whole ? {} : { syncedAt: null }),
            })), { isCurrent, storing });
      };
      state.flightForm = form;
      state.flightFull = full === true;
      const attempts = readAttempts((error) => {
        if (states.get(key) !== state || state.attempts !== attempts) return;
        state.state = isOnline() ? 'error' : 'offline'; state.error = { code: error?.code || null, status: error?.status ?? null, message: error?.message || String(error) };
        emitStatus();
      });
      state.attempts = attempts;
      const wholeRead = !wanted.query && !wanted.window && (wanted.key === undefined || wanted.key === null) && typeof spec.scope !== 'function';
      coverageSeq += 1;
      const flightSeq = coverageSeq;
      state.flightSeq = flightSeq;
      state.flightWhole = wholeRead;
      const landed = (outcome) => {
        if (outcome === DROPPED) {
          if (state.state === 'refreshing') state.state = 'stale';
          throw Object.assign(serviceError(`'${wanted.collection}' was replaced while it was read`, 'REFRESH_DROPPED'), { retryable: false });
        }
        if (outcome === STOPPED) {
          if (state.state === 'refreshing') state.state = 'stale';
          throw Object.assign(serviceError(`'${wanted.collection}' stopped being read on its way`, 'REFRESH_DROPPED'), { retryable: false });
        }
        if (outcome === NO_SNAPSHOT) { if (state.state === 'refreshing') state.state = 'stale'; return; }
        if (flightSeq < (purgedAt.get(name) || 0)) {
          if (state.state === 'refreshing') state.state = 'stale';
          throw Object.assign(serviceError(`'${wanted.collection}' was purged while it was read`, 'REFRESH_DROPPED'), { retryable: false });
        }
        if (wholeRead && flightSeq <= lossOf(name)) {
          const error = Object.assign(serviceError(`'${wanted.collection}' lost rows while it was read`, 'DATA_INCOMPLETE'), { retryable: false });
          state.state = isOnline() ? 'error' : 'offline'; state.syncedAt = null;
          state.error = { code: error.code, status: null, message: error.message };
          throw error;
        }
        state.freshForm = form;
        state.state = 'fresh'; state.syncedAt = now(); state.error = null;
        if (wholeRead) wholeCovers.set(coverKey(form, name), Math.max(wholeCovers.get(coverKey(form, name)) || 0, flightSeq));
      };
      let answeredLate = false;
      const landLate = (outcome) => {
        if (!answeredLate || disposed || states.get(key) !== state || state.flight || state.flightSeq !== flightSeq) return;
        try { landed(outcome); } catch (_) { /* what it stored stands; its status says so */ }
        emitStatus();
      };
      state.flightJobKey = lanedKey('data', `${label}:${key}`);
      const askers = { always: !stillWanted, wanted: new Set(stillWanted ? [stillWanted] : []) };
      const stillAsked = () => askers.always || [...askers.wanted].some((asker) => { try { return !!asker(); } catch (_) { return false; } });
      state.flightAskers = askers;
      state.flight = scheduler.request({
        key: state.flightJobKey, target: laned(label), budgetKey: spec.budgetKey || budgetKey, reason,
        ...(inForeground(name)
          ? { priority: PRIORITIES[priority] ?? PRIORITIES.normal, visible: mode === 'visible' }
          : { priority: PRIORITIES.background, visible: false }),
        whole: true,
        ...(spec.gate === true ? { gate: true } : {}),
        // Never run, or run again, once this service is disposed or nobody still asks.
        valid: () => !disposed && cadenceFactor(name) !== Infinity && stillAsked(),
        run: attempts.run(async (isCurrent, helpers) => {
          askers.always = true;
          let stopped = false;
          const value = await run(() => {
            const wantedNow = isCurrent();
            if (!wantedNow) stopped = true;
            return wantedNow;
          }, helpers?.storing);
          const outcome = stopped ? STOPPED : value;
          landLate(outcome);
          return outcome;
        }),
      }).then(landed, (error) => {
        // A read dropped because nobody still waited for it says nothing about the source.
        if (error?.code === 'REFRESH_DROPPED' && !stillAsked()) {
          if (state.state === 'refreshing') state.state = 'stale';
          throw error;
        }
        state.state = isOnline() ? 'error' : 'offline'; state.error = { code: error?.code || null, status: error?.status ?? null, message: error?.message || String(error) };
        if (error?.code === 'REFRESH_TIMEOUT' && error?.retryable === true) answeredLate = true;
        throw error;
      }).finally(() => {
        attempts.settled();
        if (state.attempts === attempts) state.attempts = null;
        state.flight = null; state.flightJobKey = null; state.flightAskers = null; state.flightForm = null; state.flightFull = false; state.flightWhole = false; emitStatus();
      });
      return settle(attempts.answer(state.flight));
    } catch (error) {
      release?.();
      throw error;
    }
  }

  const wholeReads = new Map();
  async function readWhole(name, store, raw) {
    const id = JSON.stringify([raw, name, formOf(jobContextNow())]);
    const direct = () => (raw ? store.getAllRaw() : store.getAll());
    const reuseMs = typeof wholeReadReuseMs === 'function' ? wholeReadReuseMs(name) : wholeReadReuseMs;
    if (!(reuseMs > 0) || !feed || !watchChanges(name, store)) {
      const rows = await direct();
      return { rows, own: isOwnCopy(rows) };
    }
    const generation = generationOf(name);
    const kept = wholeReads.get(id);
    if (kept && kept.generation === generation && now() - kept.at < reuseMs) return { rows: await kept.reading, own: false };
    const entry = { generation, at: now(), reading: null };
    entry.reading = Promise.resolve().then(direct);
    wholeReads.set(id, entry);
    try {
      return { rows: await entry.reading, own: false };
    } catch (error) {
      if (wholeReads.get(id) === entry) wholeReads.delete(id);
      throw error;
    }
  }

  const service = {
    namespace,
    async read(collection, key, { raw = false, storageMetadata = false } = {}) {
      live();
      const { name, store } = local(collection);
      const project = storageMetadata ? copyRow : clean;
      const one = async (item) => (raw ? copyRow(await store.getRaw(String(item))) : project(await store.get(String(item))));
      if (Array.isArray(key)) return Promise.all(key.map(one));
      if (key !== undefined && key !== null) return one(key);
      const { rows, own } = await readWhole(name, store, raw);
      if (own) return rows.map(raw || storageMetadata ? asIs : bare);
      return rows.map(raw ? copyRow : project);
    },
    async query(collection, spec = {}) {
      live();
      const { store, decl } = local(collection);
      return runQuery(store, decl?.keyPath || 'id', spec);
    },
    async reconcileWindow(collection, options = {}) {
      live();
      const { name, store, decl } = local(collection);
      return reconcileWindow(name, store, decl?.keyPath || 'id', { ...options, context: jobContextNow() });
    },
    async reconcileRecord(collection, key, { fetch, toRecord = (dto) => dto, keepDirty = false } = {}) {
      live();
      const { name, store, decl } = local(collection);
      const keyPath = decl?.keyPath || 'id';
      const rowKey = String(key);
      const outcome = await guardedRead(name, fetch, async (dto, touched, _startedAt, turn) => {
        if (!dto) return undefined;
        if (touched.has(rowKey)) return (await store.get(rowKey)) || undefined;
        const previous = await store.getRaw(rowKey);
        const record = toRecord(dto, previous ? previousByKey([previous], keyPath).get(rowKey) : undefined);
        if (!record) return undefined;
        let kept = false;
        try {
          const result = await turn.store.reconcile([record], { prune: false, syncedAt: null, ...(keepDirty ? { keepDirty: true } : {}) });
          kept = (Array.isArray(result?.skipped) ? result.skipped : []).map(String).includes(rowKey);
        } catch (_) { /* A refused cache write cannot turn a server answer into a blank detail. */ }
        return kept ? (await store.get(rowKey)) || undefined : record;
      }, { isCurrent: () => !disposed });
      return outcome === DROPPED ? (await store.get(rowKey)) || undefined : outcome;
    },
    // Writes go in the collection's turn, so a read on its way never undoes them.
    writer(collection) {
      live();
      const { name, store } = local(collection);
      return new Proxy(store, {
        get(target, property) {
          const value = target[property];
          if (typeof value !== 'function') return value;
          if (!WRITE_METHODS.has(property)) return value;
          return (...args) => (disposed
            ? Promise.reject(Object.assign(new Error('Data store retired'), { name: 'StorageReadError', reason: 'retired', code: 'DATA_RETIRED' }))
            : tracked(inTurn(name, (turn) => turn.store[property](...args))));
        },
      });
    },
    watch(collection, listener) {
      live();
      const { store, label } = local(collection);
      const fire = (notice) => {
        const keyed = Array.isArray(notice?.keys) ? { keys: notice.keys.map(String) } : null;
        try { listener(keyed); } catch (_) { /* isolated */ }
      };
      const offStore = typeof store.onChange === 'function' ? store.onChange(fire) : store.subscribe(() => fire(null));
      const offFeed = feed?.subscribe((event) => {
        if (!ownsChange(event)) return;
        if (event.type === 'purge' && !event.label) fire(null);
        else if (event.label === label) fire(event.type === 'purge' ? null : event);
        else if (event.labels?.includes(label)) fire(Array.isArray(event.keysByLabel?.[label]) ? { keys: event.keysByLabel[label] } : null);
      });
      return held(() => { offStore?.(); offFeed?.(); });
    },
    subscribe(target, callback, { onError, storageMetadata = false } = {}) {
      live();
      const wanted = targetOf(target);
      const { store, label, decl } = local(wanted.collection);
      if (wanted.query) checkQuery(wanted.query);
      const whole = !wanted.query && (wanted.key === undefined || wanted.key === null);
      let active = true;
      let last;
      let seq = 0;
      const report = (error) => { if (active) { try { onError?.(error); } catch (_) { /* isolated */ } } };
      const emit = () => {
        if (!active) return;
        seq += 1;
        const mine = seq;
        valueOf(wanted, { storageMetadata }).then((value) => {
          if (!active || mine !== seq || (last !== undefined && same(value, last))) return;
          last = value;
          callback(value);
        }).catch(report);
      };
      const keyPath = decl?.keyPath || 'id';
      const project = storageMetadata ? copyRow : clean;
      let lastKeys = null;
      let keyOrdered = false;
      let pending = new Set();
      let pendingWhole = true;
      let draining = false;
      let shown;
      let behind = false;
      let skipped = false;
      const readEveryRow = async () => {
        const rows = await store.getAll();
        const keys = rows.map((row) => String(row?.[keyPath]));
        const value = rows.map(project);
        const ordered = store.keyOrdered === true && keys.every((key, at) => at === 0 || keys[at - 1] < key);
        return { value, keys, ordered, changed: last === undefined || !same(value, last) };
      };
      const readKeys = async (keys) => {
        const found = await Promise.all(keys.map((key) => store.get(key)));
        const at = new Map(lastKeys.map((key, index) => [key, index]));
        const value = last.slice();
        const removed = new Set();
        const added = [];
        let changed = false;
        keys.forEach((key, index) => {
          const row = found[index];
          const place = at.get(key);
          if (place === undefined) {
            if (row !== undefined && row !== null) added.push([key, project(row)]);
          } else if (row === undefined || row === null) {
            removed.add(place);
            changed = true;
          } else {
            const next = project(row);
            if (!same(next, value[place])) { value[place] = next; changed = true; }
          }
        });
        if (added.length && !keyOrdered) return null;
        const kept = removed.size ? value.filter((_, index) => !removed.has(index)) : value;
        const order = removed.size ? lastKeys.filter((_, index) => !removed.has(index)) : lastKeys.slice();
        added.forEach(([key, row]) => {
          let low = 0;
          let high = order.length;
          while (low < high) {
            const mid = Math.floor((low + high) / 2);
            if (order[mid] < key) low = mid + 1; else high = mid;
          }
          order.splice(low, 0, key);
          kept.splice(low, 0, row);
          changed = true;
        });
        return { value: kept, keys: order, ordered: keyOrdered, changed };
      };
      const catchUp = async () => {
        if (draining || !active) return;
        draining = true;
        let failed = false;
        try {
          while (active && (pendingWhole || pending.size)) {
            const readAll = pendingWhole || lastKeys === null;
            const keys = [...pending];
            pending = new Set();
            pendingWhole = false;
            // eslint-disable-next-line no-await-in-loop
            const next = readAll ? await readEveryRow() : await readKeys(keys);
            if (!active) return;
            if (next === null) pendingWhole = true;
            else {
              lastKeys = next.keys;
              keyOrdered = next.ordered;
              if (next.changed) { skipped = behind; behind = true; last = next.value; }
            }
            if (behind && active && !pendingWhole && !pending.size) {
              behind = false;
              const repeat = skipped && shown !== undefined && same(last, shown);
              skipped = false;
              if (!repeat) { shown = last; callback(last.slice()); }
            }
          }
        } catch (error) {
          failed = true;
          pendingWhole = true;
          report(error);
        } finally {
          draining = false;
        }
        if (!failed && active && (pendingWhole || pending.size)) catchUp();
      };
      const changed = (keys) => {
        if (!active) return;
        if (!whole) { emit(); return; }
        if (Array.isArray(keys)) keys.forEach((key) => pending.add(String(key)));
        else pendingWhole = true;
        if (pending.size > KEYED_REREAD_KEYS) { pendingWhole = true; pending = new Set(); }
        catchUp();
      };
      const offStore = typeof store.onChange === 'function'
        ? store.onChange((notice) => changed(notice?.keys)) : store.subscribe(() => changed(null));
      const offFeed = feed?.subscribe((event) => {
        if (!ownsChange(event)) return;
        if (event.type === 'purge' && !event.label) changed(null);
        else if (event.label === label) changed(event.type === 'purge' ? null : event.keys);
        else if (event.labels?.includes(label)) changed(event.keysByLabel?.[label]);
      });
      if (whole) catchUp(); else emit();
      return held(() => { active = false; offStore?.(); offFeed?.(); });
    },
    source(collection, spec) {
      live();
      const { name } = local(collection);
      if (typeof spec?.fetch !== 'function') throw serviceError('source.fetch is required', 'DATA_INVALID');
      if (spec.read !== undefined) checkRead(spec.read);
      if (spec.methods !== undefined) checkMethods(spec.methods);
      if (spec.budgetKey !== undefined && (typeof spec.budgetKey !== 'string' || !spec.budgetKey)) {
        throw serviceError('source.budgetKey must be a name', 'DATA_INVALID');
      }
      if (spec.gate !== undefined && typeof spec.gate !== 'boolean') throw serviceError('source.gate must be a boolean', 'DATA_INVALID');
      const before = sources.get(name) || resolve(name)?.decl?.source;
      sources.set(name, spec);
      if (before !== spec) retireStrictMethods(name, before, spec);
      if (typeof spec.push === 'function') {
        const { label, store, decl } = local(collection);
        tracked(restoreDirty({ name, label, store, decl })).catch(() => {});
      }
      return () => {
        if (sources.get(name) !== spec) return;
        sources.delete(name);
        retireStrictMethods(name, spec, resolve(name)?.decl?.source);
      };
    },
    sends(collection) {
      const { name, decl } = local(collection);
      return typeof pushOf(name, decl) === 'function';
    },
    hasSource(collection) {
      const { name, decl } = local(collection);
      return !!(sources.get(name) || decl?.source);
    },
    refresh(target, options = {}) {
      const asked = options?.mode === 'visible' ? new Error() : null;
      const answer = refreshAs(target, options, jobContextNow());
      if (!asked) return answer;
      return answer.catch((error) => { throw timedOutFor(error, targetOf(target).collection, asked); });
    },
    async ingest(collection, rows, options = {}) {
      live();
      const { name, store, decl } = local(collection);
      const keyPath = decl?.keyPath || 'id';
      const ingestForm = formOf(jobContextNow());
      watchChanges(name, store);
      return inTurn(name, async (turn) => {
        const tracksMeta = !!(sources.get(name) || decl?.source)?.read?.cursor;
        if (options?.ifEmpty === true) {
          if ((await store.getAllRaw()).length) return { written: 0 };
          const { everyRow: _everyRow, ...adopted } = await ingestRows(collection, rows, { complete: false }, turn.raw);
          if (tracksMeta) await adjustMeta(name, null);
          return adopted;
        }
        const small = tracksMeta && !options?.replace && Array.isArray(rows) && rows.length <= PAGE_ROWS;
        const keys = small ? [...new Set(rows.filter((row) => row && typeof row === 'object').map((row) => String(row[keyPath])))] : [];
        const before = small ? await Promise.all(keys.map(async (key) => !!(await store.getRaw(key)))) : [];
        const lossBefore = voidOf(name);
        const { everyRow, ...result } = await ingestRows(collection, rows, options, turn.store);
        if (options?.complete === true || (options?.replace && typeof options?.scope !== 'function')) {
          if (disposed) return result;
          if (everyRow && lossBefore === voidOf(name) && ingestForm === formOf(jobContextNow())) {
            coverageSeq += 1;
            wholeCovers.set(coverKey(ingestForm, name), coverageSeq);
            const state = stateFor(targetKey({ collection: name }));
            state.freshForm = ingestForm;
            state.state = 'fresh'; state.syncedAt = now(); state.error = null;
          } else loseCoverage(name);
          if (!disposed) emitStatus();
        }
        if (small) {
          const after = await Promise.all(keys.map(async (key) => !!(await store.getRaw(key))));
          await adjustMeta(name, {
            added: keys.filter((key, at) => !before[at] && after[at]), removed: keys.filter((key, at) => before[at] && !after[at]),
          });
        } else if (tracksMeta) await adjustMeta(name, null);
        return result;
      });
    },
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
    async replaceSyncedRow(collection, key, record, { when, receipt = null, guardKey = null } = {}) {
      live();
      const generation = fenceGeneration;
      const { name, store } = local(collection);
      if (typeof when !== 'function' || typeof store.replaceSynced !== 'function') {
        throw serviceError('replaceSyncedRow needs a conditional canonical store', 'DATA_INVALID');
      }
      const submitted = record === null ? null : copyStorageRow(record);
      return inTurn(name, ({ store: writer }) => writer.replaceSynced(key, submitted, {
        receipt,
        guardKey,
        when: (previous, guard) => !disposed && generation === fenceGeneration && when(previous, guard) === true,
      }));
    },
    async mutate(collection, command, { wait = false } = {}) {
      live();
      const context = jobContextNow();
      const generation = fenceGeneration;
      const { name, label, store, decl } = local(collection);
      const keyPath = decl?.keyPath || 'id';
      if (!['put', 'patch', 'delete'].includes(command?.op)) throw serviceError('mutate: op must be put, patch or delete', 'DATA_INVALID');
      const key = String(command.op === 'put' ? command.record?.[keyPath] : command.key);
      const push = pushOf(name, decl);
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
          await writer.markRow(key, { _deleted: true }, { dirty: true, body: { [keyPath]: held[keyPath] } });
        } else await writer.delete(key);
        const revision = typeof push !== 'function' ? undefined : (await store.getRaw(key))?._rev;
        return { record, revision };
      }));
      if (typeof push !== 'function') return { key, pushed: false };
      if (generation !== fenceGeneration || disposed) return { key, pushed: false };
      const change = enqueuePush({ name, label, key, store, decl }, {
        command, record: written.record, revision: written.revision, context,
      });
      if (wait) return change;
      change.catch(() => {});
      return { key, pushed: false };
    },
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
        state: heldNow(entry) ? 'queued' : entry.state,
        ...(heldNow(entry) ? { waiting: 'account' } : {}),
        restored: entry.restored,
      }));
    },
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
    retryHeld() {
      return Promise.allSettled([...outbox.values()].filter((entry) => heldNow(entry) && !entry.draining).map((entry) => {
        entry.state = 'queued';
        return drain(entry);
      }));
    },
    // Never resends one refused for access.
    retryFailed() {
      return Promise.allSettled([...outbox.values()].filter((entry) => entry.state === 'failed' && !entry.draining).map((entry) => {
        entry.state = 'queued';
        return drain(entry);
      }));
    },
    fence() {
      fenceGeneration += 1;
      outbox.forEach((entry) => {
        entry.discarded = true;
        entry.changes.splice(0).forEach((change) => change.reject(serviceError('Change fenced', 'DATA_FENCED')));
      });
      outbox.clear();
      try { scheduler.revalidate?.(); } catch (_) { /* a scheduler without it checks before each run */ }
      emitStatus();
    },
    async discard(collection, key) {
      const { name, label } = local(collection);
      await inTurn(name, ({ store: writer }) => serial(`${label}:${String(key)}`, async () => {
        dropPending(label, key);
        await writer.delete(String(key));
      }));
      emitStatus();
    },
    async purge(collection, options = {}) {
      live();
      const invalid = !options || typeof options !== 'object' || Array.isArray(options)
        || Object.keys(options).some((field) => !['force', 'keys', 'query'].includes(field))
        || (options.force !== undefined && typeof options.force !== 'boolean')
        || (options.keys !== undefined && options.keys !== null && !Array.isArray(options.keys))
        || (options.query !== undefined && options.query !== null && (typeof options.query !== 'object' || Array.isArray(options.query)));
      if (invalid) throw serviceError('purge: options are force, keys (an array) and query (an index range)', 'DATA_INVALID');
      const { force = false, keys = null, query = null } = options;
      const origin = storeMutationOrigin(options);
      const {
        name, label, store, decl,
      } = local(collection);
      const keyPath = decl?.keyPath || 'id';
      const range = query ? wholeRange(query, 'purge') : null;
      const whole = !Array.isArray(keys) && !query;
      return inTurn(name, async (turn) => {
        // Recorded so a read on its way never brings a purged row back.
        if (Array.isArray(keys)) recordEffect(name, { changedKeys: keys.map(String) });
        else recordEffect(name, { whole: true });
        if (whole) voidReads(name);
        let entries;
        if (Array.isArray(keys)) {
          entries = (await Promise.all(keys.map((key) => store.getRaw(String(key))))).filter(Boolean)
            .map((row) => ({ key: String(row[keyPath]), dirty: !!row._dirty }));
        } else if (range) entries = await rangeKeys(store, keyPath, range);
        else entries = (await rawRows(store)).map((row) => ({ key: String(row[keyPath]), dirty: !!row._dirty }));
        const removed = await removeRows({
          label, store: turn.store, keys: entries.filter(({ dirty }) => force || !dirty).map(({ key }) => key), force, origin,
        });
        await adjustMeta(name, whole ? null : { added: [], removed });
        forgetMethods(name);
        return { removed };
      });
    },
    // Dirty rows are never removed.
    async trim(collection, spec = {}) {
      live();
      const {
        name, label, store, decl,
      } = local(collection);
      if (typeof spec.index !== 'string' || !Number.isSafeInteger(spec.keep) || spec.keep < 0) throw serviceError('trim: index and keep are required', 'DATA_INVALID');
      const keyPath = decl?.keyPath || 'id';
      const range = wholeRange(spec, 'trim');
      return inTurn(name, async (turn) => {
        const entries = await rangeKeys(store, keyPath, range);
        const older = entries.slice(0, Math.max(0, entries.length - spec.keep)).filter(({ dirty }) => !dirty).map(({ key }) => key);
        const removed = await removeRows({ label, store: turn.store, keys: older, force: false });
        await adjustMeta(name, { added: [], removed });
        forgetMethods(name);
        return { removed };
      });
    },
    status(target, { receipt = false } = {}) {
      const wanted = targetOf(target);
      const { name, store } = local(wanted.collection);
      const observed = receipt && watchChanges(name, store);
      if (wanted.method !== undefined) {
        const spec = sources.get(name) || local(wanted.collection).decl?.source;
        const method = spec?.methods && Object.hasOwn(spec.methods, wanted.method) ? spec.methods[wanted.method] : null;
        if (!method || wanted.key !== undefined || wanted.query !== undefined || wanted.window !== undefined) {
          throw serviceError('status: the method target is outside its declared contract', 'DATA_INVALID');
        }
        const params = methodParams(name, wanted.method, method, wanted.params);
        if (!method.batch) {
          const group = methodGroups.get(JSON.stringify([formOf(jobContextNow()), name, wanted.method, params]));
          return { ...describeMethod(group?.state || { state: 'stale', syncedAt: null, error: null }, method.strictReceipt === true),
            ...(receipt ? { revision: observed ? generationOf(name) : null } : {}) };
        }
      }
      const currentState = stateFor(targetKey({ ...wanted, collection: name }), { allocate: false });
      const status = describeState(principalState(currentState));
      if (!receipt) return status;
      const state = stateFor(targetKey({ ...wanted, collection: name }), { allocate: false });
      const whole = wanted.key == null && !wanted.query && !wanted.window;
      const covered = wholeCovers.get(coverKey(formOf(jobContextNow()), name)) || 0;
      return {
        ...status, revision: observed ? generationOf(name) : null,
        receipt: whole && status.state === 'fresh' && covered > voidOf(name)
          ? JSON.stringify([state.flightSeq || 0, covered, voidOf(name), lossOf(name)]) : null,
      };
    },
    statuses() {
      return [...states.entries()].map(([key, state]) => {
        const [collection, rowKey, window] = JSON.parse(key);
        return { collection, label: labelOf(collection), key: rowKey, window, ...describeState(principalState(state)) };
      });
    },
    methodStatuses() {
      const form = formOf(jobContextNow());
      return [...methodGroups.entries()].flatMap(([groupKey, group]) => {
        const [groupForm, collection, method, params] = JSON.parse(groupKey);
        if (groupForm !== form) return [];
        let declared = null;
        try { declared = (sources.get(collection) || local(collection).decl?.source)?.methods?.[method] || null; } catch (_) { declared = null; }
        if (!declared || declared.batch) return [];
        return [{
          collection, label: labelOf(collection), method, params, ...describeState(group.state),
        }];
      });
    },
    onStatusChange(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    idle() {
      return outbox.size === 0 && writes.size === 0 && turns.size === 0 && working === 0
        && ![...states.values()].some((state) => state.flight) && !methodsWorking();
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
      fenceGeneration += 1;
      outbox.forEach((entry) => {
        entry.discarded = true;
        entry.changes.splice(0).forEach((change) => change.reject(serviceError('Change fenced', 'DATA_FENCED')));
      });
      outbox.clear();
      states.clear();
      targetStates.clear();
      methodGroups.clear();
      methodRefusals.clear();
      coverageVoid.clear();
      coverageLoss.clear();
      wholeCovers.clear();
      knownCollections.clear();
      windowReads.clear();
      try { scheduler.revalidate?.(); } catch (_) { /* a scheduler without it checks before each run */ }
    },
  };
  Object.keys(service).forEach((method) => {
    const call = service[method];
    if (typeof call !== 'function' || DATA_SERVICE_SYNC_METHODS.includes(method)) return;
    const wrapped = (...args) => tracked(call(...args));
    wrapped.tracked = true;
    service[method] = wrapped;
  });
  return service;
}
