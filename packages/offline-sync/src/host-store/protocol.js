/** Closed host storage boundary; no physical names or handles cross into an MP. */
export const HOST_STORE_VERSION = 1;
export const HOST_STORE_DATABASE = 'tommy-host-store-v2';
export const MAX_ROWS = 100;
export const MAX_READ_BYTES = 8 * 1024 * 1024;
export const MAX_ROW_BYTES = 4 * 1024 * 1024;
export const COMPLETE_ROWS = 1000;
const encoder = new TextEncoder();
export const bytes = (value) => encoder.encode(typeof value === 'string' ? value : JSON.stringify(value)).byteLength;
export const integer = (value) => Number.isSafeInteger(value) && value >= 0;
export const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
export function closed(value, required, optional = []) {
  return record(value) && required.every((key) => Object.hasOwn(value, key))
    && Object.keys(value).every((key) => required.includes(key) || optional.includes(key));
}
export function fail(reason) { return { ok: false, reason, retained: false }; }
export function readFailure(reason) { return { ok: false, reason }; }
export function retirementMatcher(selector) {
  if (!closed(selector, ['authorityOrigin', 'viewerId'], ['cacheSession'])
    || typeof selector.viewerId !== 'string' || !/^[1-9][0-9]*$/.test(selector.viewerId)) throw storageError('unserializable');
  try { if (new URL(selector.authorityOrigin).origin !== selector.authorityOrigin || !/^https?:/.test(selector.authorityOrigin)) throw new Error(); } catch (_) { throw storageError('unserializable'); }
  if (!Object.hasOwn(selector, 'cacheSession')) return () => true;
  const session = selector.cacheSession;
  if (!closed(session, ['id', 'generation']) || typeof session.id !== 'string' || !/^[1-9][0-9]*$/.test(session.id)
    || !integer(session.generation) || session.generation < 1) throw storageError('unserializable');
  return (subjectKey) => {
    try { const subject = JSON.parse(subjectKey); return Array.isArray(subject) && subject[0] === 'chat-fragments-v1' && subject[1] === session.id && subject[2] === session.generation; } catch (_) { return false; }
  };
}
export function storageError(reason) {
  return Object.assign(new Error(`Storage read failed (${reason})`), { name: 'StorageReadError', reason });
}
export function keyValid(key) { return typeof key === 'string' && key.length > 0 && key.length <= 512; }
export function identityKey(identity) {
  const fields = ['version', 'authorityOrigin', 'viewerId', 'accountType', 'accountId', 'tenantId', 'mpId', 'subjectKey'];
  if (!closed(identity, fields) || identity.version !== 2 || !['User', 'Team', 'TeamMember'].includes(identity.accountType)
    || !/^[1-9][0-9]*$/.test(identity.viewerId) || !/^[1-9][0-9]*$/.test(identity.accountId)
    || typeof identity.viewerId !== 'string' || typeof identity.accountId !== 'string'
    || ![identity.tenantId, identity.mpId].every((v) => typeof v === 'string' && v.length > 0)
    || (identity.subjectKey !== null && (typeof identity.subjectKey !== 'string' || !identity.subjectKey))) throw storageError('unserializable');
  try { const origin = new URL(identity.authorityOrigin); if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== identity.authorityOrigin) throw new Error(); } catch (_) { throw storageError('unserializable'); }
  return JSON.stringify(fields.map((key) => identity[key]));
}
export function ownerKey(identity) {
  identityKey(identity);
  return JSON.stringify([identity.authorityOrigin, identity.viewerId, identity.accountType, identity.accountId, identity.subjectKey]);
}
export function validateOpen(input) {
  if (!closed(input, ['identity', 'storeName', 'policy', 'schemaVersion', 'cacheFingerprint', 'limits'])
    || !/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(input.storeName)
    || !['authored', 'cache', 'ordinary_chat_fragments'].includes(input.policy)
    || !integer(input.schemaVersion) || input.schemaVersion < 1
    || !closed(input.limits, ['maxRows', 'maxAgeMs', 'maxBytes'])
    || !integer(input.limits.maxRows) || input.limits.maxRows < 1
    || !['maxAgeMs', 'maxBytes'].every((key) => input.limits[key] === null || integer(input.limits[key]))
    || (input.cacheFingerprint !== null && (typeof input.cacheFingerprint !== 'string' || !input.cacheFingerprint || input.cacheFingerprint.length > 512))) throw storageError('unserializable');
  if (input.policy === 'authored' && (input.cacheFingerprint !== null || input.limits.maxAgeMs !== null || input.limits.maxBytes !== null)) throw storageError('unserializable');
  return { namespace: JSON.stringify([identityKey(input.identity), input.storeName]), owner: ownerKey(input.identity) };
}
export function validateRead(input) {
  if (!closed(input, ['handle', 'expectedEpoch'], ['keys', 'afterKey', 'limit', 'metadataOnly'])
    || !integer(input.expectedEpoch) || (input.metadataOnly !== undefined && typeof input.metadataOnly !== 'boolean')) return false;
  if (Object.hasOwn(input, 'keys')) return !Object.hasOwn(input, 'afterKey') && !Object.hasOwn(input, 'limit')
    && Array.isArray(input.keys) && input.keys.length <= MAX_ROWS && input.keys.every(keyValid) && new Set(input.keys).size === input.keys.length;
  return (input.afterKey === null || keyValid(input.afterKey)) && Number.isInteger(input.limit) && input.limit > 0 && input.limit <= MAX_ROWS;
}
/** Reject lossy JSON instead of dropping user data (functions, holes, cycles, dates). */
export function jsonRecord(value) {
  const seen = new Set();
  function check(entry) {
    if (entry === null || typeof entry === 'string' || typeof entry === 'boolean') return;
    if (typeof entry === 'number' && Number.isFinite(entry)) return;
    if (!entry || typeof entry !== 'object' || seen.has(entry) || Object.getOwnPropertySymbols(entry).length) throw storageError('unserializable');
    const proto = Object.getPrototypeOf(entry);
    if (!Array.isArray(entry) && proto !== Object.prototype && proto !== null) throw storageError('unserializable');
    seen.add(entry);
    if (Array.isArray(entry)) { for (let i = 0; i < entry.length; i += 1) { if (!Object.hasOwn(entry, i)) throw storageError('unserializable'); check(entry[i]); } }
    else Object.keys(entry).forEach((key) => check(entry[key]));
    seen.delete(entry);
  }
  if (!record(value)) throw storageError('unserializable');
  check(value);
  return JSON.stringify(value);
}
export function validateCommit(input) {
  if (!closed(input, ['handle', 'expectedEpoch', 'expectedStoreRevision', 'changes'])
    || !integer(input.expectedEpoch) || !integer(input.expectedStoreRevision)
    || !Array.isArray(input.changes) || !input.changes.length || input.changes.length > MAX_ROWS
    || new Set(input.changes.map((change) => change?.key)).size !== input.changes.length) throw storageError('unserializable');
  const changes = input.changes.map((change) => {
    if (!keyValid(change?.key)) throw storageError('unserializable');
    if (change.op === 'delete' && closed(change, ['op', 'key'])) return { ...change };
    if (change.op !== 'put' || !closed(change, ['op', 'key', 'value'])) throw storageError('unserializable');
    const json = jsonRecord(change.value);
    if (bytes(json) > MAX_ROW_BYTES) throw storageError('payload-capacity');
    return { ...change, json };
  });
  if (bytes(input) > MAX_READ_BYTES) throw storageError('payload-capacity');
  return changes;
}
export function failureReason(error, fallback = 'write-failed') {
  if (error?.code === 'SQLITE_FULL' || /database or disk is full/i.test(error?.message || '')) return 'quota';
  if (error?.code === 'SQLITE_BUSY' || /database is locked/i.test(error?.message || '')) return 'unavailable';
  return error?.reason || ({ QuotaExceededError: 'quota', DataCloneError: 'unserializable', VersionError: 'unavailable' }[error?.name]) || fallback;
}
