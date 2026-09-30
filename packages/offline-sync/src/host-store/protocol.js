/** Closed host storage boundary; no physical names or handles cross into an MP. */
export const HOST_STORE_VERSION = 1;
// What this engine accepts beyond version 1's open/read/commit/retire. A port
// without a feature (an older desktop engine) is never sent its inputs.
export const HOST_STORE_FEATURES = Object.freeze(['collections', 'indexes', 'eviction', 'migration', 'inspect', 'purge', 'synced-at', 'schema-fingerprint', 'aged-reads', 'open-epoch']);
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

// Namespaces. A host domain collection is `<domain>.<collection>` (e.g.
// `chats.rows`) stored under the reserved HOST_DATA_MP_ID; an MP store keeps
// its declared plain name and is labelled `mp.<mpId>.<store>`. Both map onto the
// same owner/subject keys, so principal and owner purges cover every namespace.
export const HOST_DATA_MP_ID = 'platform-data';
export const FRAGMENT_LABEL = 'chats.fragments';
const PLAIN_STORE = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;
const DOMAIN = /^[a-z][a-z0-9_]{0,31}$/;
const COLLECTION = /^[a-z][a-z0-9_]{0,63}$/;
export function storeNameValid(name) {
  if (typeof name !== 'string') return false;
  if (PLAIN_STORE.test(name)) return true;
  const parts = name.split('.');
  return parts.length === 2 && DOMAIN.test(parts[0]) && parts[0] !== 'mp' && COLLECTION.test(parts[1]);
}
export function collectionName(domain, collection) {
  const name = `${domain}.${collection}`;
  if (!storeNameValid(name) || !name.includes('.')) throw storageError('unserializable');
  return name;
}
export function namespaceLabel({ mpId, storeName, policy }) {
  if (policy === 'ordinary_chat_fragments') return FRAGMENT_LABEL;
  return mpId === HOST_DATA_MP_ID ? storeName : `mp.${mpId}.${storeName}`;
}
export function labelDomain(label) {
  const parts = String(label).split('.');
  return parts[0] === 'mp' ? parts.slice(0, 2).join('.') : parts[0];
}

// Secondary indexes: `{ name: field | [field, ...] }` over top-level record
// fields, at most 8 per collection and 4 fields each. Values encode so that
// string order is the value order (numbers sort numerically, below strings).
const INDEX_NAME = /^[a-z][a-zA-Z0-9_]{0,31}$/;
const INDEX_FIELD = /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/;
export const MAX_INDEXES = 8;
export function validateIndexes(indexes) {
  if (indexes === undefined || indexes === null) return {};
  if (!record(indexes) || Object.keys(indexes).length > MAX_INDEXES) throw storageError('unserializable');
  return Object.fromEntries(Object.entries(indexes).map(([name, fields]) => {
    const list = Array.isArray(fields) ? fields : [fields];
    if (!INDEX_NAME.test(name) || !list.length || list.length > 4
      || !list.every((field) => typeof field === 'string' && INDEX_FIELD.test(field))) throw storageError('unserializable');
    return [name, [...list]];
  }).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}
function sortableNumber(value) {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value === 0 ? 0 : value);
  let high = view.getUint32(0);
  let low = view.getUint32(4);
  if (high & 0x80000000) { high = ~high >>> 0; low = ~low >>> 0; } else high = (high | 0x80000000) >>> 0;
  return high.toString(16).padStart(8, '0') + low.toString(16).padStart(8, '0');
}
export function indexValue(value) {
  if (value === null || value === undefined) return '0';
  if (typeof value === 'boolean') return value ? 'b1' : 'b0';
  if (typeof value === 'number' && Number.isFinite(value)) return `n${sortableNumber(value)}`;
  if (typeof value === 'string' && value.length <= 256 && !/[\u0000\u0001]/.test(value)) return `s${value}`;
  throw storageError('unserializable');
}
export const indexValues = (values) => values.map(indexValue).join('\u0001');
export const indexEntry = (name, encoded, key) => `${name}\u0000${encoded}\u0000${key}`;
export function indexedValues(fields, row) {
  try { return indexValues(fields.map((field) => row[field])); } catch (_) { return null; }
}
export const LRU_WIDTH = 16;
export const lruEntry = (updatedAt, key) => `${String(updatedAt).padStart(LRU_WIDTH, '0')}\u0000${key}`;
export function validateQuery(input) {
  if (!closed(input, ['handle', 'expectedEpoch', 'index', 'limit'], ['equals', 'prefix', 'lower', 'upper', 'afterKey', 'includeAged'])
    || (input.includeAged !== undefined && typeof input.includeAged !== 'boolean')
    || !integer(input.expectedEpoch) || !INDEX_NAME.test(input.index)
    || !Number.isInteger(input.limit) || input.limit < 1 || input.limit > MAX_ROWS
    || (input.afterKey !== undefined && input.afterKey !== null && (typeof input.afterKey !== 'string' || input.afterKey.length > 2048))
    || (Object.hasOwn(input, 'equals') && (Object.hasOwn(input, 'prefix') || Object.hasOwn(input, 'lower') || Object.hasOwn(input, 'upper')))) return false;
  const arrays = ['equals', 'prefix'].filter((key) => Object.hasOwn(input, key));
  return arrays.every((key) => Array.isArray(input[key]) && input[key].length >= 1 && input[key].length <= 4);
}
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
  if (!closed(input, ['identity', 'storeName', 'policy', 'schemaVersion', 'cacheFingerprint', 'limits'], ['indexes', 'schemaFingerprint', 'expectedEpoch'])
    || (input.expectedEpoch !== undefined && !integer(input.expectedEpoch))
    || (input.schemaFingerprint !== undefined && input.schemaFingerprint !== null
      && (typeof input.schemaFingerprint !== 'string' || !input.schemaFingerprint || input.schemaFingerprint.length > 128))
    || !storeNameValid(input.storeName)
    || !['authored', 'cache', 'ordinary_chat_fragments'].includes(input.policy)
    || !integer(input.schemaVersion) || input.schemaVersion < 1
    || !closed(input.limits, ['maxRows', 'maxAgeMs', 'maxBytes'], ['evict', 'domainMaxBytes'])
    || !integer(input.limits.maxRows) || input.limits.maxRows < 1
    || !['maxAgeMs', 'maxBytes'].every((key) => input.limits[key] === null || integer(input.limits[key]))
    || (input.limits.evict !== undefined && !['none', 'lru'].includes(input.limits.evict))
    || (input.limits.domainMaxBytes !== undefined && input.limits.domainMaxBytes !== null && !integer(input.limits.domainMaxBytes))
    || (input.cacheFingerprint !== null && (typeof input.cacheFingerprint !== 'string' || !input.cacheFingerprint || input.cacheFingerprint.length > 512))) throw storageError('unserializable');
  if (input.policy === 'authored' && (input.cacheFingerprint !== null || input.limits.maxAgeMs !== null || input.limits.maxBytes !== null)) throw storageError('unserializable');
  // Eviction is a cache policy: drafts, outbox and other authored rows are never evicted.
  const evict = input.limits.evict || 'none';
  if (evict === 'lru' && input.policy !== 'cache') throw storageError('unserializable');
  if ((input.limits.domainMaxBytes ?? null) !== null && (evict !== 'lru' || !input.storeName.includes('.'))) throw storageError('unserializable');
  const indexes = validateIndexes(input.indexes);
  return { namespace: JSON.stringify([identityKey(input.identity), input.storeName]), owner: ownerKey(input.identity),
    indexes, evict, domainMaxBytes: input.limits.domainMaxBytes ?? null };
}
export function validateRead(input) {
  if (!closed(input, ['handle', 'expectedEpoch'], ['keys', 'afterKey', 'limit', 'metadataOnly', 'includeAged'])
    || !integer(input.expectedEpoch) || (input.metadataOnly !== undefined && typeof input.metadataOnly !== 'boolean')
    || (input.includeAged !== undefined && typeof input.includeAged !== 'boolean')) return false;
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
  if (!closed(input, ['handle', 'expectedEpoch', 'expectedStoreRevision', 'changes'], ['syncedAt'])
    || (input.syncedAt !== undefined && !integer(input.syncedAt))
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
// Migrations: an authored store opened at a newer schemaVersion copies its rows,
// transformed by the caller, into the next generation and swaps atomically on
// `complete`. A cache store opened at a newer version starts empty instead.
export function validateMigration(input) {
  if (!closed(input, ['handle', 'expectedEpoch', 'phase'], ['changes'])
    || !integer(input.expectedEpoch) || !['begin', 'write', 'complete', 'abort'].includes(input.phase)
    || (input.phase === 'write') !== Object.hasOwn(input, 'changes')) throw storageError('unserializable');
  if (input.phase !== 'write') return [];
  const changes = validateCommit({ handle: input.handle, expectedEpoch: input.expectedEpoch, expectedStoreRevision: 0, changes: input.changes });
  if (changes.some((change) => change.op !== 'put')) throw storageError('unserializable');
  return changes;
}
// Host inspection and cache clearing for Settings → Data. Selectors name one
// principal; a store id comes from a listing and is opaque to callers.
export function validateInspect(input) {
  if (!closed(input, ['op', 'selector'], ['store', 'afterKey', 'limit'])
    || !['stores', 'rows', 'pending'].includes(input.op)) throw storageError('unserializable');
  retirementMatcher(input.selector);
  if (input.op !== 'stores' && (typeof input.store !== 'string' || input.store.length > 4096)) throw storageError('unserializable');
  if (input.afterKey !== undefined && input.afterKey !== null && !keyValid(input.afterKey)) throw storageError('unserializable');
  if (input.limit !== undefined && (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > MAX_ROWS)) throw storageError('unserializable');
  return input;
}
export function validatePurge(input) {
  if (!closed(input, ['selector', 'store'], ['force', 'keys']) || typeof input.store !== 'string' || input.store.length > 4096
    || (input.force !== undefined && typeof input.force !== 'boolean')
    || (input.keys !== undefined && (!Array.isArray(input.keys) || !input.keys.length || input.keys.length > MAX_ROWS
      || !input.keys.every(keyValid) || new Set(input.keys).size !== input.keys.length))) throw storageError('unserializable');
  retirementMatcher(input.selector);
  return input;
}
export function failureReason(error, fallback = 'write-failed') {
  if (error?.code === 'SQLITE_FULL' || /database or disk is full/i.test(error?.message || '')) return 'quota';
  if (error?.code === 'SQLITE_BUSY' || /database is locked/i.test(error?.message || '')) return 'unavailable';
  return error?.reason || ({ QuotaExceededError: 'quota', DataCloneError: 'unserializable', VersionError: 'unavailable' }[error?.name]) || fallback;
}
