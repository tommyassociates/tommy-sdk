import { jsonBytes, utf8Bytes, boundedBatches, WRITE_BATCH_BYTES } from './bytes.js';
import { MAX_ROW_BYTES } from './host-store/protocol.js';
import { unchangedServerRow, heldProvenance, holdRowFields } from './unchanged-row.js';
// Most rows one whole-collection read returns, page by page.
export const WHOLE_READ_ROWS = 20000;
// Large rows are never all held in memory at once.
export const WHOLE_READ_BYTES = 32 * 1024 * 1024;
const WHOLE_READ_LIMITS = Object.freeze({ rows: WHOLE_READ_ROWS, bytes: WHOLE_READ_BYTES });
const COMPLETE_ROWS = 1000;
export class StorageReadError extends Error {
  constructor(reason) { super(`Storage read failed (${reason})`); this.name = 'StorageReadError'; this.reason = reason; }
}
const strip = (row) => Object.fromEntries(Object.entries(row).filter(([key]) => !key.startsWith('_')));
export const copyStorageRow = (row) => {
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
const copy = copyStorageRow;
const ownCopies = new WeakSet();
export const isOwnCopy = (rows) => ownCopies.has(rows);
const owned = (rows) => { ownCopies.add(rows); return rows; };
export function assertCompleteSet(rows, { maxRows = 1000, maxBytes = 8 * 1024 * 1024 } = {}) {
  if (!Array.isArray(rows) || rows.length > maxRows) throw new StorageReadError('scan-required');
  let bytes = 2;
  for (const row of rows) {
    const json = JSON.stringify(row);
    if (typeof json !== 'string') throw new StorageReadError('unserializable');
    bytes += utf8Bytes(json) + 1;
    if (bytes > maxBytes) throw new StorageReadError('scan-required');
  }
}
const keyString = (key) => String(key);
const MAX_BATCH_ROWS = 100;
const upsertBatches = (incoming) => boundedBatches([...incoming], { maxItems: MAX_BATCH_ROWS, sizeOf: (entry) => jsonBytes(entry[1]) });
const TOO_LARGE = Symbol('too large for one commit');
const NOTICE_KEYS = 1000;
const nextRevision = (value = 0) => { if (!Number.isSafeInteger(value) || value < 0 || value >= Number.MAX_SAFE_INTEGER) throw new StorageReadError('write-failed'); return value + 1; };
// A key written again after removal never takes a revision it held before.
const acknowledged = (previous) => (Number.isSafeInteger(previous?._ackRev) ? { _ackRev: previous._ackRev } : {});
const rowRevision = (previous, storeRevision) => nextRevision(Math.max(previous?._rev || 0, Number.isSafeInteger(storeRevision) ? storeRevision : 0));

export function createTransactionalDataStore({ name, keyPath, backend, validate, paintable, now, PersistError, onPersistError, maxWindows, indexes = {}, queryRows = null, heldFields = [], ignoredFields = [] }) {
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
  let held = null;
  // Visible and aged reads can prove the bound from different sets of rows.
  const wholeReadRefusals = { visible: null, aged: null };
  const ageLimit = () => (backend.policy !== 'authored' && Number.isFinite(backend.limits?.maxAgeMs) ? backend.limits.maxAgeMs : null);
  const looksAged = (entry, limit) => limit !== null && !entry.dirty && entry.updatedAt + limit <= now();
  function track(snapshot, changes, result) {
    if (!held) return;
    if (result?.ok === false) return;
    if (held.epoch !== snapshot.epoch || held.revision !== snapshot.storeRevision || result?.evicted?.length
      || !Number.isSafeInteger(result?.storeRevision)) { held = null; return; }
    const at = now();
    changes.forEach((change) => {
      held.bytes -= held.rows.get(change.key)?.bytes || 0;
      if (change.op === 'delete') held.rows.delete(change.key);
      else {
        if (!held.rows.has(change.key)) held.sorted = false;
        const json = JSON.stringify(change.value);
        const size = utf8Bytes(json);
        held.rows.set(change.key, {
          value: JSON.parse(json), updatedAt: at, exact: true, dirty: !!change.value?._dirty, bytes: size,
        });
        held.bytes += size;
      }
    });
    held.revision = result.storeRevision;
    if (Number.isSafeInteger(result.epoch)) held.epoch = result.epoch;
    if (held.rows.size > WHOLE_READ_ROWS || held.bytes > WHOLE_READ_BYTES) held = null;
  }
  let noticeKeys = new Set();
  function noted(changes, result) {
    if (result?.ok === false || noticeKeys === null) return;
    const evicted = (result?.evicted || []).map((row) => (row && typeof row === 'object' ? row.key : row));
    if (evicted.some((key) => key === undefined || key === null)) { noticeKeys = null; return; }
    evicted.forEach((key) => noticeKeys.add(key));
    changes.forEach((change) => noticeKeys.add(change.key));
    if (noticeKeys.size > NOTICE_KEYS) noticeKeys = null;
  }
  async function commit(snapshot, changes, extra) {
    writes += 1;
    const result = await backend.commit(snapshot, changes, extra);
    track(snapshot, changes, result);
    noted(changes, result);
    return result;
  }
  async function mutation(keys, transform, { retry = false, syncedAt } = {}) {
    for (let attempt = 0; attempt < (retry ? 3 : 1); attempt += 1) {
      live();
      let snapshot;
      try { snapshot = await backend.snapshot(keys, { aged: true }); } catch (error) {
        if (error?.reason === 'payload-capacity' && keys.length > 1) throw TOO_LARGE;
        failure({ reason: error.reason || 'read-failed', retained: false }, keys[0]);
      }
      const previous = new Map(snapshot.rows.map((row) => [row.key, row.value]));
      const changes = transform(previous, snapshot.storeRevision);
      if (!changes.length && (keys.length || syncedAt === undefined || syncedAt === null)) return;
      if (keys.length > 1 && jsonBytes(changes) > WRITE_BATCH_BYTES) throw TOO_LARGE;
      const result = await commit(snapshot, changes, syncedAt === undefined || syncedAt === null ? undefined : { syncedAt });
      live();
      if (result.ok !== false) return;
      if (result.reason !== 'conflict' || !retry || attempt === 2) failure(result, keys[0]);
    }
  }
  let paged = false;
  const freshRows = new WeakSet();
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
  async function completeRows(aged) {
    for (let attempt = 1; ; attempt += 1) {
      try {
        // eslint-disable-next-line no-await-in-loop
        return await backend.getAll({ aged, ...(backend.wholeReadBounds === true ? { wholeReadLimits: WHOLE_READ_LIMITS } : {}) });
      } catch (error) {
        if (error?.reason !== 'conflict' || attempt === 3) throw error;
        live();
      }
    }
  }
  function keepWholeReadProof(mode, proof) {
    if (proof?.wholeReadRefusal !== true || !Number.isSafeInteger(proof.epoch) || !Number.isSafeInteger(proof.storeRevision)) return false;
    if (proof.expiresAt !== null && !Number.isSafeInteger(proof.expiresAt)) return false;
    const until = proof.expiresAt === null ? Infinity : proof.expiresAt;
    if (!(until > now())) return false;
    wholeReadRefusals[mode] = { epoch: proof.epoch, revision: proof.storeRevision, until };
    return true;
  }
  // A read that may predate a write is never handed to a later caller; shared only briefly so a stall never holds.
  const WHOLE_SHARE_MS = 30000;
  let writes = 0;
  let wholeFlight = null;
  function wholeRows({ aged = false } = {}) {
    if (!wholeFlight || wholeFlight.aged !== aged || wholeFlight.writes !== writes || Date.now() - wholeFlight.at >= WHOLE_SHARE_MS) {
      const flight = { aged, writes, at: Date.now(), waiters: [] };
      wholeFlight = flight;
      const done = (answer) => {
        if (wholeFlight === flight) wholeFlight = null;
        flight.waiters.forEach((waiter, at) => answer(waiter, at));
      };
      readWholeRows({ aged }).then(
        (rows) => done(({ resolve }, at) => {
          if (at === 0 || !freshRows.has(rows)) { resolve(rows); return; }
          const fresh = JSON.parse(JSON.stringify(rows));
          freshRows.add(fresh);
          resolve(fresh);
        }),
        (error) => done(({ reject }) => reject(error))
      );
    }
    const flight = wholeFlight;
    return new Promise((resolve, reject) => { flight.waiters.push({ resolve, reject }); });
  }
  async function readWholeRows({ aged = false } = {}) {
    const refusalMode = aged ? 'aged' : 'visible';
    const refusal = wholeReadRefusals[refusalMode];
    if (refusal && refusal.until <= now()) wholeReadRefusals[refusalMode] = null;
    if ((held || wholeReadRefusals[refusalMode]) && typeof backend.page === 'function') {
      const head = await backend.page({ afterKey: null, limit: 1, aged: true, metadataOnly: true });
      live();
      if (refusal && wholeReadRefusals[refusalMode] === refusal) {
        if (head.epoch === refusal.epoch && head.storeRevision === refusal.revision && now() < refusal.until) {
          throw new StorageReadError('scan-required');
        }
        wholeReadRefusals[refusalMode] = null;
      }
      if (held && head.epoch === held.epoch && head.storeRevision === held.revision) {
        const rows = heldRows(aged);
        if (rows) return rows;
      } else held = null;
    }
    if (!paged || typeof backend.page !== 'function') {
      try { return await completeRows(aged); } catch (error) {
        if (error?.reason !== 'scan-required' || typeof backend.page !== 'function') throw error;
        live();
        if (backend.wholeReadBounds === true && keepWholeReadProof(refusalMode, error.bound)) {
          paged = true;
          throw new StorageReadError('scan-required');
        }
      }
    }
    paged = true;
    const includeExpiry = backend.readExpiry === true;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const rows = [];
      let size = 0;
      let afterKey = null;
      let fence = null;
      let moved = false;
      let until = Infinity;
      let expiryKnown = true;
      const entries = [];
      do {
        const request = { afterKey, limit: 100, aged, ...(includeExpiry ? { includeExpiry: true } : {}) };
        const proofRequested = afterKey === null && backend.wholeReadBounds === true;
        // eslint-disable-next-line no-await-in-loop
        let page = await backend.page({ ...request, ...(proofRequested ? { wholeReadLimits: WHOLE_READ_LIMITS } : {}) });
        live();
        if (page.wholeReadRefusal === true) {
          if (proofRequested && keepWholeReadProof(refusalMode, page)) throw new StorageReadError('scan-required');
          // An expiry may pass between the native check and delivery.
          // eslint-disable-next-line no-await-in-loop
          page = await backend.page(request);
          live();
          if (page.wholeReadRefusal === true) throw new StorageReadError('read-failed');
        }
        if (fence && (page.epoch !== fence.epoch || page.storeRevision !== fence.revision)) { moved = true; break; }
        fence = { epoch: page.epoch, revision: page.storeRevision };
        if (Number.isFinite(page.expiresAt)) until = Math.min(until, page.expiresAt);
        else if (page.expiresAt !== null) expiryKnown = false;
        rows.push(...page.rows.map((row) => row.value));
        if (aged) entries.push(...page.rows);
        size += page.rows.reduce((total, row) => total + (Number.isSafeInteger(row.bytes) ? row.bytes : jsonBytes(row.value)), 0);
        if (rows.length > WHOLE_READ_ROWS || size > WHOLE_READ_BYTES) {
          if (includeExpiry && expiryKnown && Number.isSafeInteger(fence.epoch) && Number.isSafeInteger(fence.revision)) {
            wholeReadRefusals[refusalMode] = { ...fence, until };
          }
          throw new StorageReadError('scan-required');
        }
        afterKey = page.nextKey;
      } while (afterKey !== null);
      if (!moved) {
        if (rows.length <= COMPLETE_ROWS / 2) paged = false;
        if (aged && fence) {
          let bytes = 0;
          held = {
            epoch: fence.epoch,
            revision: fence.revision,
            sorted: true,
            rows: new Map(entries.map((row) => {
              const json = JSON.stringify(row.value);
              const size = Number.isSafeInteger(row.bytes) ? row.bytes : utf8Bytes(json);
              bytes += size;
              return [row.key, {
                value: JSON.parse(json), updatedAt: Date.parse(row.value?._updatedAt || '') || 0, exact: false, dirty: !!row.value?._dirty, bytes: size,
              }];
            })),
            bytes: 0,
          };
          held.bytes = bytes;
        }
        return rows;
      }
    }
    throw new StorageReadError('conflict');
  }
  async function inParts(keys, write) {
    try { await write(keys); } catch (error) {
      if (error !== TOO_LARGE) throw error;
      const half = Math.ceil(keys.length / 2);
      await inParts(keys.slice(0, half), write);
      await inParts(keys.slice(half), write);
    }
  }
  const NOTIFY_READS = 3;
  async function notify({ unknown = false } = {}) {
    live();
    publication += 1;
    const mine = publication;
    const notice = unknown || noticeKeys === null ? null : { keys: [...noticeKeys] };
    noticeKeys = new Set();
    for (const listener of changeListeners) { try { listener(notice); } catch (_) { /* isolated consumer */ } }
    if (!queries.size && !subscribers.size) return;
    let rows;
    for (let attempt = 1; ; attempt += 1) {
      try {
        // eslint-disable-next-line no-await-in-loop
        rows = (await wholeRows()).filter(paintable);
        break;
      } catch (error) {
        if (error?.reason === 'conflict' && attempt < NOTIFY_READS && !retired && publication === mine) continue; // eslint-disable-line no-continue
        if (publication !== mine) return;
        for (const query of queries) { try { query.onError?.(error); } catch (_) { /* isolated consumer */ } }
        return;
      }
    }
    // A later change's own read tells them; this older one never follows it.
    if (retired || publication !== mine) return;
    // A subscriber error never turns the committed operation into a failed write.
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
    ageLimitMs: () => ageLimit(),
    fitsWhole(records = []) {
      const maxBytes = backend.limits?.maxBytes;
      const budget = Number.isFinite(maxBytes);
      const stamp = { _rev: Number.MAX_SAFE_INTEGER, _dirty: false, _updatedAt: new Date(now()).toISOString() };
      let total = 0;
      for (const record of records) {
        const size = jsonBytes({ ...record, ...stamp });
        if (size > MAX_ROW_BYTES || (budget && size > maxBytes)) return 'payload-capacity';
        total += size;
        if (budget && total > maxBytes) return 'quota';
      }
      return null;
    },
    keyOrdered: true,
    hasIndex: (index) => typeof backend.query === 'function' && Array.isArray(backend.indexes) && backend.indexes.includes(index),
    async readRevision() {
      live();
      const { storeRevision } = await backend.snapshot([], { aged: true });
      live();
      if (!Number.isSafeInteger(storeRevision)) throw new StorageReadError('read-failed');
      return storeRevision;
    },
    async get(key) { live(); const row = await backend.get(keyString(key)); live(); return paintable(row) ? copy(row) : undefined; },
    async getRaw(key) { live(); const row = await backend.get(keyString(key), { aged: true }); live(); return copy(row); },
    async getAll() { live(); const rows = await wholeRows(); live(); return owned(freshRows.has(rows) ? rows.filter(paintable) : rows.filter(paintable).map(copy)); },
    async getAllRaw() { live(); const rows = await wholeRows({ aged: true }); live(); return owned(freshRows.has(rows) ? rows : rows.map(copy)); },
    async readWhere(predicate = () => true) { return (await api.getAll()).filter(predicate).map(strip); },
    selectFrom(rows, predicate = () => true) { return (rows || []).filter(paintable).filter(predicate).map(strip); },
    scan: (options) => scan(options, false),
    scanRaw: (options) => scan(options, true),
    async put(record, { dedupeKey, silent = false, when = null } = {}) {
      requiredRecord(record);
      const submitted = copy(record);
      const key = keyString(record[keyPath]);
      return exclusive(async () => {
        let refused = false;
        await mutation([key], (rows, storeRevision) => {
          const previous = rows.get(key);
          refused = typeof when === 'function' && when(previous) !== true;
          if (refused) return [];
          // A refusal for access stays until a retry.
          const refusal = previous?._pushRefused != null ? { _pushRefused: previous._pushRefused } : {};
          const stamped = { ...holdRowFields(submitted, previous, heldFields), ...(previous?._window != null ? { _window: previous._window } : {}), ...acknowledged(previous), ...refusal, _rev: rowRevision(previous, storeRevision), _dirty: true, _updatedAt: new Date(now()).toISOString(), ...(dedupeKey ? { _dedupeKey: dedupeKey } : {}) };
          return [{ op: 'put', key, value: stamped }];
        }, { retry: true });
        if (refused) return undefined;
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
    deleteMany(keys, { keep = () => false, silent = false } = {}) {
      const wanted = [...new Set(keys.map(keyString))];
      if (wanted.length > 100) return Promise.reject(new StorageReadError('payload-capacity'));
      return exclusive(async () => {
        const removed = [];
        await inParts(wanted, async (part) => {
          let gone = [];
          await mutation(part, (rows) => {
            gone = part.filter((key) => rows.has(key) && !keep(rows.get(key)));
            return gone.map((key) => ({ op: 'delete', key }));
          }, { retry: true });
          removed.push(...gone);
        });
        if (!silent && removed.length) await notify();
        return removed;
      });
    },
    // Receipts stay in storage metadata and never make an outbox entry.
    /* eslint-disable no-underscore-dangle */
    replaceSynced(key, record, { when, receipt = null, guardKey = null } = {}) {
      if ((guardKey !== null && (typeof guardKey !== 'string' || !guardKey || guardKey.length > 1024))
        || typeof when !== 'function' || (receipt !== null && (typeof receipt !== 'string' || !receipt || receipt.length > 128))) {
        return Promise.reject(Object.assign(new Error('replaceSynced needs an ownership predicate and a bounded receipt'), { code: 'DATA_INVALID' }));
      }
      if (record !== null && (!record || keyString(record[keyPath]) !== keyString(key) || Object.keys(record).some((field) => field.startsWith('_')))) {
        return Promise.reject(Object.assign(new Error('replaceSynced needs a domain row with the requested key'), { code: 'DATA_INVALID' }));
      }
      if (record !== null) requiredRecord(record);
      const submitted = record === null ? null : copy(record);
      return exclusive(async () => {
        let replaced = false;
        await mutation(guardKey === null ? [keyString(key)] : [keyString(key), guardKey], (rows, storeRevision) => {
          const previous = rows.get(keyString(key));
          replaced = !previous?._dirty && when(previous, guardKey === null ? undefined : rows.get(guardKey)) === true && (submitted !== null || !!previous);
          if (!replaced) return [];
          if (submitted === null) return [{ op: 'delete', key: keyString(key) }];
          return [{
            op: 'put',
            key: keyString(key),
            value: {
              ...holdRowFields(submitted, previous, heldFields),
              ...(previous?._window != null ? { _window: previous._window } : {}),
              ...acknowledged(previous),
              ...(receipt !== null ? { _writeReceipt: receipt } : {}),
              _rev: rowRevision(previous, storeRevision),
              _dirty: false,
              _updatedAt: new Date(now()).toISOString(),
            },
          }];
        }, { retry: true, syncedAt: null });
        if (replaced) await notify();
        return { replaced };
      });
    },
    /* eslint-enable no-underscore-dangle */
    markRow(key, patch, { dirty = false, body = null } = {}) {
      return exclusive(async () => {
        let found = false;
        await mutation([keyString(key)], (rows, storeRevision) => {
          const row = rows.get(keyString(key));
          if (!row) return [];
          found = true;
          const meta = Object.fromEntries(Object.entries(row).filter(([field]) => field.startsWith('_')));
          const next = body ? { ...holdRowFields(body, row, heldFields), ...meta } : { ...row };
          Object.entries(patch).forEach(([field, value]) => { if (value === null) delete next[field]; else next[field] = value; });
          if (dirty) Object.assign(next, { _dirty: true, _rev: rowRevision(row, storeRevision), _updatedAt: new Date(now()).toISOString() });
          return [{ op: 'put', key: keyString(key), value: next }];
        }, { retry: true });
        if (found) await notify();
        return found;
      });
    },
    // Revision-checked: a write that lands first makes it read the rows again.
    patchSynced(keys, patch) {
      const wanted = [...new Set((keys || []).map(keyString))];
      if (wanted.length > 100) return Promise.reject(new StorageReadError('payload-capacity'));
      return exclusive(async () => {
        const outcome = { patched: [], unsaved: [], skipped: [], refused: [] };
        await inParts(wanted, async (part) => {
          let partOutcome;
          await mutation(part, (rows, storeRevision) => {
            partOutcome = { patched: [], unsaved: [], skipped: [], refused: [] };
            const changes = [];
            part.forEach((key) => {
              const row = rows.get(key);
              if (!row || row._deleted) { partOutcome.skipped.push({ key, reason: 'gone' }); return; }
              if (row._dirty) { partOutcome.skipped.push({ key, reason: 'unsent' }); return; }
              const meta = Object.fromEntries(Object.entries(row).filter(([field]) => field.startsWith('_')));
              const record = { ...Object.fromEntries(Object.entries(row).filter(([field]) => !field.startsWith('_'))), ...patch };
              const why = validateRecord(record);
              if (why) { partOutcome.refused.push({ key, reason: why }); return; }
              partOutcome.patched.push(key);
              changes.push({ op: 'put', key, value: { ...record, ...meta, _rev: rowRevision(row, storeRevision), _dirty: false, _updatedAt: new Date(now()).toISOString() } });
            });
            return changes;
          }, { retry: true, syncedAt: null });
          Object.keys(outcome).forEach((field) => { outcome[field].push(...partOutcome[field]); });
        });
        if (outcome.patched.length) await notify();
        return outcome;
      });
    },
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
    async reconcile(submittedRecords = [], { scope, windowKey, syncedAt = now(), prune = true, keepDirty = false } = {}) {
      const records = submittedRecords.map((record) => {
        if (!record || typeof record !== 'object' || !Object.hasOwn(record, '_writeReceipt')) return record;
        const { _writeReceipt: _receipt, ...domain } = record;
        return domain;
      });
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
        const stamp = (row, previous, storeRevision) => ({ ...heldProvenance(row, previous), ...row, ...acknowledged(previous), _rev: rowRevision(previous, storeRevision), _dirty: false, _updatedAt: new Date(now()).toISOString(), ...windowOf(previous) });
        const unchanged = (row, previous) => unchangedServerRow(row, previous, { paintable, now, windowKey, ignoredFields });
        const restamp = (previous) => ({ ...previous, _updatedAt: new Date(now()).toISOString() });
        const quiet = syncedAt === null || syncedAt === undefined;
        const confirms = (previous) => !quiet && ageLimit() !== null && !(Date.parse(previous._updatedAt) + ageLimit() / 2 >= now());
        let changed = false;
        let wrote = false;
        for (const batch of upsertBatches(incoming)) {
          // eslint-disable-next-line no-await-in-loop
          await inParts(batch.map(([key]) => key), async (keys) => {
            const part = batch.filter(([key]) => keys.includes(key));
            let left = [];
            let partChanged = false;
            let partWrote = false;
            await mutation(keys, (rows, storeRevision) => {
              left = keepDirty ? part.filter(([key]) => rows.get(key)?._dirty).map(([key]) => key) : [];
              partChanged = false;
              partWrote = false;
              return part.filter(([key]) => !left.includes(key)).flatMap(([key, submitted]) => {
                const previous = rows.get(key);
                const row = holdRowFields(submitted, previous, heldFields);
                if (unchanged(row, previous)) {
                  if (!confirms(previous)) return [];
                  partWrote = true;
                  return [{ op: 'put', key, value: restamp(previous) }];
                }
                partChanged = true;
                partWrote = true;
                return [{ op: 'put', key, value: stamp(row, previous, storeRevision) }];
              });
            }, { syncedAt, retry: true });
            upserted += part.length - left.length;
            if (partChanged) changed = true;
            if (partWrote) wrote = true;
            left.forEach((key) => skipped.add(key));
          });
        }
        if (!wrote && !quiet && (incoming.size ? upserted : !prune)) {
          await mutation([], () => [], { syncedAt, retry: true });
        }
        const counts = skipped.size ? { skipped: [...skipped] } : {};
        if (windowKey != null) { windows.delete(String(windowKey)); windows.set(String(windowKey), now()); }
        if (!prune) {
          if (changed) await notify();
          return { upserted, pruned: 0, ...counts };
        }
        const retainedWindows = new Set([...windows.keys()].slice(-maxWindows));
        let afterKey = null;
        let pruned = 0;
        const prunedKeys = [];
        do {
          const page = await backend.page({ afterKey, limit: 100, aged: true });
          const changes = page.rows.filter(({ key, value }) => !value._dirty && !incoming.has(key)
            && ((!scope || scope(value)) || (value._window != null && !retainedWindows.has(value._window) && windows.has(value._window))))
            .map(({ key }) => ({ op: 'delete', key }));
          if (changes.length) {
            const result = await commit(page, changes);
            if (result.ok === false) failure(result);
            pruned += changes.length;
            prunedKeys.push(...changes.map(({ key }) => key));
          }
          afterKey = page.nextKey;
        } while (afterKey !== null);
        if (changed || pruned) await notify();
        return { upserted, pruned, ...(prunedKeys.length ? { prunedKeys } : {}), ...counts };
      });
    },
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
    revalidateSubscribers() { return notify({ unknown: true }); },
    subscribe(handler) { live(); subscribers.add(handler); return () => subscribers.delete(handler); },
    onChange(listener) { live(); changeListeners.add(listener); return () => changeListeners.delete(listener); },
    subscribeQuery(selector, handler, { onError } = {}) {
      live();
      const query = { selector, handler, onError, previous: undefined };
      queries.add(query);
      const captured = publication;
      wholeRows().then((rows) => {
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
      wholeFlight = null;
      subscribers.clear();
      queries.clear();
      changeListeners.clear();
      cursors.clear();
      return backend.close({ purge });
    },
  };
  return api;
}
