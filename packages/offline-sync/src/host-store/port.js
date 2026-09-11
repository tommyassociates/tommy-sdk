import {
  HOST_STORE_VERSION, MAX_ROWS, MAX_READ_BYTES, bytes, closed, integer,
  validateOpen, validateRead, validateCommit, storageError, failureReason, fail, readFailure,
  retirementMatcher,
} from './protocol.js';

const handleRegistry = new Set();
const cleanupRegistry = new Set();
const clone = (value) => JSON.parse(JSON.stringify(value));
const next = (value) => { if (!integer(value) || value >= Number.MAX_SAFE_INTEGER) throw storageError('write-failed'); return value + 1; };
/** A host-local port. Database transactions, not handle queues, serialize other tabs. */
export function createHostStorePort({ database, backend = 'indexeddb', now = () => Date.now(), randomId = () => globalThis.crypto.randomUUID() } = {}) {
  if (!database?.transaction || !['indexeddb', 'capacitor_sqlite', 'electron_sqlite', 'volatile'].includes(backend)) throw storageError('unavailable');
  const handles = new Map();
  function getHandle(id) {
    const handle = typeof id === 'string' && handles.get(id);
    if (!handle || handle.closed) throw storageError('retired');
    return handle;
  }
  async function current(tx, handle, expectedEpoch) {
    if (handle.closed) throw storageError('retired');
    const owner = await tx.get('owners', handle.owner);
    const store = await tx.get('stores', [handle.owner, handle.namespace]);
    if (!owner || !store || owner.epoch !== expectedEpoch || owner.epoch !== handle.epoch
      || store.generation !== handle.generation || store.migration) throw storageError('retired');
    return store;
  }
  function prefix(handle, generation, kind) { return [handle.owner, handle.namespace, generation, kind]; }
  function rowKey(handle, generation, kind, key) { return [...prefix(handle, generation, kind), key]; }
  async function discard(tx, handle, store, metadata) {
    await tx.delete('rows', metadata.key);
    await tx.delete('rows', rowKey(handle, store.generation, 'b', metadata.id));
    store.rowCount -= 1;
    store.bytes -= metadata.bytes;
  }
  async function purgeOwner(tx, ownerKey) {
    const owner = await tx.get('owners', ownerKey);
    if (!owner) return;
    await tx.put('owners', { ...owner, epoch: next(owner.epoch) });
    await tx.deletePrefix('rows', [ownerKey]);
    await tx.deletePrefix('stores', [ownerKey]);
  }
  async function cacheCapacity(tx, target, targetBytes) {
    if (target.policy !== 'ordinary_chat_fragments') return;
    const stored = await tx.byIndex('stores', 'policy', 'ordinary_chat_fragments', 22);
    const others = stored.filter((row) => JSON.stringify(row.key) !== JSON.stringify(target.key)).sort((a, b) => a.touchedAt - b.touchedAt);
    let total = targetBytes + others.reduce((sum, row) => sum + row.bytes, 0);
    let count = others.length + 1;
    while ((total > 64 * 1024 * 1024 || count > 20) && others.length) {
      const evicted = others.shift();
      // Only ordinary subjects may share an evictable owner. Authored owners
      // are a different host-reserved subject and never enter this index.
      const siblings = await tx.scan('stores', [evicted.key[0]], { limit: 2 });
      if (siblings.some((row) => row.policy !== 'ordinary_chat_fragments')) throw storageError('quota');
      await purgeOwner(tx, evicted.key[0]);
      total -= evicted.bytes;
      count -= 1;
    }
    if (total > 64 * 1024 * 1024 || count > 20) throw storageError('quota');
  }
  const port = {
    version: HOST_STORE_VERSION,
    async open(input) {
      const identity = validateOpen(input);
      const frozen = clone(input);
      const handle = { ...identity, options: frozen, closed: false, port };
      const state = await database.transaction('readwrite', async (tx) => {
        let owner = await tx.get('owners', identity.owner);
        if (!owner) { owner = { key: identity.owner, epoch: 0, principal: JSON.stringify([input.identity.authorityOrigin, input.identity.viewerId]), identity: clone(input.identity) }; await tx.put('owners', owner); }
        const key = [identity.owner, identity.namespace];
        if (input.policy === 'ordinary_chat_fragments') {
          const siblings = await tx.scan('stores', [identity.owner], { limit: 2 });
          if (siblings.some((row) => JSON.stringify(row.key) !== JSON.stringify(key))) throw storageError('unserializable');
        }
        let store = await tx.get('stores', key);
        if (store && (store.schemaVersion !== input.schemaVersion || store.policy !== input.policy || store.migration)) throw storageError('unavailable');
        if (!store) store = { key, generation: 0, revision: 0, rowCount: 0, bytes: 0, schemaVersion: input.schemaVersion, policy: input.policy, fingerprint: input.cacheFingerprint };
        else if (input.policy !== 'authored' && store.fingerprint !== input.cacheFingerprint) {
          await tx.deletePrefix('rows', [identity.owner, identity.namespace]);
          store = { ...store, generation: next(store.generation), revision: next(store.revision), rowCount: 0, bytes: 0, fingerprint: input.cacheFingerprint };
        }
        store.touchedAt = now();
        await cacheCapacity(tx, store, store.bytes);
        await tx.put('stores', store);
        return { epoch: owner.epoch, generation: store.generation, storeRevision: store.revision };
      });
      Object.assign(handle, state);
      const id = randomId();
      if (typeof id !== 'string' || !id || id.length > 128 || handles.has(id)) throw storageError('unavailable');
      handles.set(id, handle);
      handleRegistry.add(handle);
      return { handle: id, backend, durable: backend !== 'volatile', epoch: state.epoch, storeRevision: state.storeRevision };
    },
    async read(input) {
      if (!validateRead(input)) return readFailure('unserializable');
      try {
        const handle = getHandle(input.handle);
        return await database.transaction('readonly', async (tx) => {
          const store = await current(tx, handle, input.expectedEpoch);
          const metadata = input.keys ? (await Promise.all(input.keys.map((key) => tx.get('rows', rowKey(handle, store.generation, 'm', key))))).filter(Boolean)
            : await tx.scan('rows', prefix(handle, store.generation, 'm'), { after: input.afterKey, limit: input.limit + 1 });
          const result = { epoch: handle.epoch, storeRevision: store.revision, rows: [], nextKey: null };
          const included = [];
          let scanned = 0;
          let lastScanned = null;
          let encodedBytes = bytes(result);
          const limit = input.keys ? MAX_ROWS : input.limit;
          for (const row of metadata) {
            if (scanned >= limit) break;
            if (handle.options.policy !== 'authored' && !row.dirty && handle.options.limits.maxAgeMs !== null
              && row.updatedAt + handle.options.limits.maxAgeMs <= now()) {
              scanned += 1;
              lastScanned = row.id;
              continue;
            }
            const rowBytes = input.metadataOnly ? bytes({ key: row.id, value: null, revision: row.revision, bytes: row.bytes }) : row.wireBytes;
            if (!integer(rowBytes)) throw storageError('read-failed');
            const continuationBytes = input.keys ? 0 : bytes(JSON.stringify(row.id)) - 4;
            if (encodedBytes + rowBytes + (included.length ? 1 : 0) + Math.max(0, continuationBytes) > MAX_READ_BYTES) {
              if (input.keys || !scanned) throw storageError('payload-capacity');
              break;
            }
            encodedBytes += rowBytes + (included.length ? 1 : 0);
            included.push(row);
            scanned += 1;
            lastScanned = row.id;
          }
          if (!input.keys && scanned < metadata.length) result.nextKey = lastScanned;
          for (const row of included) {
            let value = null;
            if (!input.metadataOnly) {
              const body = await tx.get('rows', rowKey(handle, store.generation, 'b', row.id));
              if (!body || typeof body.json !== 'string') throw storageError('read-failed');
              try { value = JSON.parse(body.json); } catch (_) { throw storageError('read-failed'); }
            }
            result.rows.push({ key: row.id, value, revision: row.revision, bytes: row.bytes });
          }
          if (handle.closed) throw storageError('retired');
          return result;
        });
      } catch (error) { return readFailure(failureReason(error, 'read-failed')); }
    },
    async commit(input) {
      try {
        const changes = validateCommit(input);
        const handle = getHandle(input.handle);
        return await database.transaction('readwrite', async (tx) => {
          const store = await current(tx, handle, input.expectedEpoch);
          if (store.revision !== input.expectedStoreRevision) throw storageError('conflict');
          const plans = [];
          let rowCount = store.rowCount;
          let totalBytes = store.bytes;
          for (const change of changes) {
            const old = await tx.get('rows', rowKey(handle, store.generation, 'm', change.key));
            const valueBytes = change.op === 'put' ? bytes(change.json) : 0;
            rowCount += change.op === 'put' ? (old ? 0 : 1) : (old ? -1 : 0);
            totalBytes += valueBytes - (old?.bytes || 0);
            plans.push({ change, old, valueBytes });
          }
          if (rowCount > handle.options.limits.maxRows && rowCount > store.rowCount) throw storageError('row-capacity');
          if (handle.options.limits.maxBytes !== null && totalBytes > handle.options.limits.maxBytes) throw storageError('quota');
          await cacheCapacity(tx, store, totalBytes);
          for (const { change, old, valueBytes } of plans) {
            if (change.op === 'delete') { if (old) await discard(tx, handle, store, old); continue; }
            const revision = next(old?.revision || 0);
            const wireBytes = bytes({ key: change.key, value: change.value, revision, bytes: valueBytes });
            await tx.put('rows', { key: rowKey(handle, store.generation, 'm', change.key), id: change.key, revision, bytes: valueBytes, wireBytes, dirty: !!change.value._dirty, updatedAt: now() });
            await tx.put('rows', { key: rowKey(handle, store.generation, 'b', change.key), json: change.json });
          }
          if (handle.closed) throw storageError('retired');
          store.rowCount = rowCount;
          store.bytes = totalBytes;
          store.revision = next(store.revision);
          store.touchedAt = now();
          await tx.put('stores', store);
          return { ok: true, epoch: handle.epoch, storeRevision: store.revision };
        });
      } catch (error) { return fail(failureReason(error)); }
    },
    async retire(input) {
      if (!closed(input, ['handle', 'mode']) || !['close', 'purge_owner'].includes(input.mode)) throw storageError('unserializable');
      const handle = handles.get(input.handle);
      if (!handle) throw storageError('retired');
      if (input.mode === 'close') { handle.closed = true; handleRegistry.delete(handle); return { retired: true, purged: false }; }
      for (const other of handleRegistry) { if (other.owner === handle.owner) other.closed = true; }
      await database.transaction('readwrite', async (tx) => {
        await purgeOwner(tx, handle.owner);
      });
      for (const other of handleRegistry) { if (other.owner === handle.owner) handleRegistry.delete(other); }
      return { retired: true, purged: true };
    },
    async migration() { throw storageError('unavailable'); },
  };
  cleanupRegistry.add(async (selector) => {
    const { authorityOrigin, viewerId } = selector;
    const matchesSubject = retirementMatcher(selector);
    const principal = JSON.stringify([authorityOrigin, viewerId]);
    for (const handle of handleRegistry) {
      const identity = handle.options.identity;
      if (identity.authorityOrigin === authorityOrigin && identity.viewerId === viewerId && matchesSubject(identity.subjectKey)) handle.closed = true;
    }
    await database.transaction('readwrite', (tx) => tx.eachIndex('owners', 'principal', principal, async (owner) => {
      if (matchesSubject(owner.identity.subjectKey)) await purgeOwner(tx, owner.key);
    }));
  });
  return Object.freeze(port);
}

/** Trusted host logout/session hook; no MP or renderer-selected namespace API. */
export async function retireHostStorePrincipal(selector) {
  retirementMatcher(selector);
  let failure;
  // Separate adapters can target the same SQLite file; retire them sequentially.
  // One unavailable adapter must not prevent the remaining owners being fenced.
  for (const cleanup of cleanupRegistry) {
    try { await cleanup(selector); } catch (error) { failure ||= error; }
  }
  if (failure) throw failure;
}
