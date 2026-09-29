/**
 * reconcile.js — the fetch → reconcile step behind windowCache.sync,
 * liveQuery.revalidate and the data service's refresh: fetch the fresh DTOs,
 * map them through `toRecord` (with the previous row when `keyOf` is given, so
 * a thin DTO keeps rich fields) and reconcile them into the store under
 * `scope`. Dirty rows are never pruned.
 */
import { assertCompleteSet, StorageReadError } from './transactional-store.js';

export function windowKeyOf(window) {
  if (window == null || typeof window !== 'object') return undefined;
  const keys = Object.keys(window).sort();
  if (!keys.length) return undefined;
  try {
    return JSON.stringify(keys.map((k) => [k, window[k]]));
  } catch (_) {
    return undefined; // unserialisable window — no key, no window retention
  }
}

/** Drop the sync-metadata stamps so a row is safe to SPREAD into a record. */
const stripMeta = (row) => Object.fromEntries(
  Object.entries(row).filter(([k]) => !k.startsWith('_')),
);

/** Tell the host a fetched DTO could not be cached, and why. */
function reportRejected(store, reasons, onPersistError) {
  if (typeof onPersistError !== 'function') return;
  try {
    onPersistError({
      event: 'record_rejected',
      store: store?.name,
      reason: 'recordSchema',
      rejected: reasons.length,
      detail: reasons[0],
    });
  } catch (_) { /* the reporter's problem, not the sync's */ }
}

/**
 * The fetch → reconcile step shared by windowCache.sync, liveQuery.revalidate
 * and the data service's refresh.
 */
export async function reconcileFetched(store, keyPath, { fetch, toRecord, keyOf }, scope, window, windowKey, { onPersistError, rethrow = false } = {}) {
  let dtos = null;
  try {
    dtos = typeof fetch === 'function' ? await fetch(window) : null;
  } catch (error) {
    // Offline or failed: the cache stays and its paint holds. The data service
    // asks for the error so its scheduler can back off and report status.
    if (rethrow) throw error;
    dtos = null;
  }
  if (Array.isArray(dtos)) {
    assertCompleteSet(dtos);
    let prevByKey = null;
    if (keyOf) {
      // ⚠ getAllRaw, NOT getAll, AND STRIPPED. Two defects met on this line.
      //
      // (1) `getAll()` applies the paint ceiling, so since that landed a row
      //     older than 7 days was INVISIBLE to the merge map — `toRecord(dto,
      //     undefined)` then ran as though the row were new and silently
      //     dropped exactly the rich fields this map exists to preserve. The
      //     MP-side rule already says a writer building a `prevById` map must
      //     read `getAllRaw()`; this is the SDK's own copy of that shape.
      // (2) The rows carry `_rev/_dirty/_updatedAt`, and `prev` is documented
      //     to be SPREAD into the new record. Every MP cache declares
      //     `additionalProperties: false`, so the documented pattern poisoned
      //     its own record: the write threw, the `try` below swallowed it, and
      //     the STALE row came back as though the sync had succeeded.
      const existing = [];
      const keys = [...new Set(dtos.map((dto) => String(keyOf(dto))))];
      let bytes = 2;
      for (const key of keys) {
        const row = await store.getRaw(key);
        if (!row) continue;
        bytes += new TextEncoder().encode(JSON.stringify(row)).byteLength + 1;
        if (bytes > 8 * 1024 * 1024) throw new StorageReadError('scan-required');
        existing.push(row);
      }
      prevByKey = new Map(existing.map((row) => [String(row[keyPath]), stripMeta(row)]));
    }
    const records = dtos.map(
      (dto) => toRecord(dto, prevByKey ? prevByKey.get(String(keyOf(dto))) : undefined),
    );

    // ⚠ THE MISSING HALF WAS THE REPORT, NOT THE SURVIVAL. The spec inherited
    // a claim from sdk commit e7b4cbe that one malformed DTO left the store
    // half-written with the prune never run. That was TRUE of the code that
    // commit was written against and is NOT true of this branch: `reconcile`
    // already catches a `recordSchema` rejection per record, skips that row
    // and carries on, so the valid rows land and the prune still runs
    // (data-store.js, the `catch` inside the reconcile loop). Verified by
    // removing this partition — the valid rows and the prune both survived.
    //
    // What it does NOT do is tell anyone. A row silently vanishing from a
    // cache because the server changed a field's type is exactly the kind of
    // drift that goes unnoticed for months. Partitioning here keeps the write
    // path free of throw/catch churn AND gives the rejects somewhere to go.
    const valid = [];
    const rejected = [];
    for (const record of records) {
      const why = typeof store.validateRecord === 'function' ? store.validateRecord(record) : null;
      if (why) rejected.push(why); else valid.push(record);
    }
    // Dropping a malformed row is a judgement call; dropping it SILENTLY is
    // not. The rejects go out the same channel as every other data loss.
    if (rejected.length) reportRejected(store, rejected, onPersistError);
    try {
      await store.reconcile(valid, { scope, ...(windowKey != null ? { windowKey } : {}) });
    } catch (error) {
      // A failed durable write or incomplete read cannot certify the cache
      // as the complete fresh result. Consumers must retain their error path.
      if (error?.name === 'StorageReadError' || (error?.name === 'PersistError' && error.retained === false)) throw error;
    }
  }
  return store.readWhere(scope);
}
