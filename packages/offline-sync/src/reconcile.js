import { assertCompleteSet, StorageReadError } from './transactional-store.js';
import { jsonBytes } from './bytes.js';

export function windowKeyOf(window) {
  if (window == null || typeof window !== 'object') return undefined;
  const keys = Object.keys(window).sort();
  if (!keys.length) return undefined;
  try {
    return JSON.stringify(keys.map((k) => [k, window[k]]));
  } catch (_) {
    return undefined;
  }
}

const stripMeta = (row) => Object.fromEntries(
  Object.entries(row).filter(([k]) => !k.startsWith('_')),
);

export function previousByKey(rows, keyPath) {
  return new Map((rows || []).filter((row) => row && typeof row === 'object')
    .map((row) => [String(row[keyPath]), stripMeta(row)]));
}

export function reportRejected(store, reasons, onPersistError) {
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

// `skip`: keys changed since the read began that the answer must not write or remove.
export async function reconcileFetched(store, keyPath, { fetch, toRecord, keyOf }, scope, window, windowKey, {
  onPersistError, rethrow = false, keepDirty = false, syncedAt, skip = null,
} = {}) {
  let dtos = null;
  try {
    dtos = typeof fetch === 'function' ? await fetch(window) : null;
  } catch (error) {
    // Offline or failed: the cache stays and its paint holds.
    if (rethrow) throw error;
    dtos = null;
  }
  // An answer counts only when every entry is a row with a key.
  const invalidAnswer = () => Object.assign(new Error('An answered entry is not a row with a key'), { name: 'DataServiceError', code: 'DATA_INVALID' });
  if (Array.isArray(dtos) && dtos.some((dto) => !dto || typeof dto !== 'object')) {
    if (rethrow) throw invalidAnswer();
    dtos = null;
  }
  if (Array.isArray(dtos)) {
    assertCompleteSet(dtos);
    let prevByKey = null;
    if (keyOf) {
      const existing = [];
      const keys = [...new Set(dtos.map((dto) => String(keyOf(dto))))];
      let bytes = 2;
      for (const key of keys) {
        const row = await store.getRaw(key);
        if (!row) continue;
        bytes += jsonBytes(row) + 1;
        if (bytes > 8 * 1024 * 1024) throw new StorageReadError('scan-required');
        existing.push(row);
      }
      prevByKey = previousByKey(existing, keyPath);
    }
    const records = dtos.map(
      (dto) => toRecord(dto, prevByKey ? prevByKey.get(String(keyOf(dto))) : undefined),
    );
    if (records.some((record) => !record || typeof record !== 'object' || record[keyPath] === undefined || record[keyPath] === null)) {
      if (rethrow) throw invalidAnswer();
      return store.readWhere(scope);
    }

    // One invalid record is skipped so the valid rows land and the prune still runs.
    const valid = [];
    const rejected = [];
    const skipped = (row) => !!skip && skip.has(String(row?.[keyPath]));
    for (const record of records) {
      if (skipped(record)) continue; // eslint-disable-line no-continue
      const why = typeof store.validateRecord === 'function' ? store.validateRecord(record) : null;
      if (why) rejected.push(why); else valid.push(record);
    }
    if (rejected.length) reportRejected(store, rejected, onPersistError);
    try {
      const pruned = skip && skip.size && typeof scope === 'function' ? (row) => scope(row) && !skipped(row) : scope;
      await store.reconcile(valid, {
        scope: pruned, ...(windowKey != null ? { windowKey } : {}), ...(keepDirty ? { keepDirty: true } : {}), ...(syncedAt !== undefined ? { syncedAt } : {}),
      });
    } catch (error) {
      // A failed durable write or incomplete read cannot certify the cache as complete.
      if (error?.name === 'StorageReadError' || (error?.name === 'PersistError' && error.retained === false)) throw error;
    }
  }
  return store.readWhere(scope);
}
