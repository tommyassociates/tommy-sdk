import {
  HOST_STORE_VERSION, MAX_ROWS, MAX_READ_BYTES, bytes, closed, integer,
  validateOpen, validateRead, validateCommit, storageError, failureReason, fail, readFailure,
  retirementMatcher, validateQuery, validateMigration, validateInspect, validatePurge,
  indexedValues, indexValues, indexEntry, lruEntry, namespaceLabel, labelDomain, ownerKey, HOST_STORE_FEATURES,
} from './protocol.js';

const handleRegistry = new Set();
const cleanupRegistry = new Set();
const clone = (value) => JSON.parse(JSON.stringify(value));
const next = (value) => { if (!integer(value) || value >= Number.MAX_SAFE_INTEGER) throw storageError('write-failed'); return value + 1; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// Batched keyed read where the database has one (SQLite); per-key otherwise.
const getMany = (tx, table, keys) => (typeof tx.getMany === 'function'
  ? tx.getMany(table, keys)
  : Promise.all(keys.map((key) => tx.get(table, key))));
const SCAN = 100;
// How long a migration's opener holds the store; each write renews it. A
// lease that runs out is a crashed opener, and the next one starts over.
export const MIGRATION_LEASE_MS = 30000;
// Row kinds under one store generation: metadata, body, index entry, LRU entry.
const META = 'm';
const BODY = 'b';
const INDEX = 'x';
const LRU = 't';

/** A host-local port. Database transactions, not handle queues, serialize other tabs. */
export function createHostStorePort({ database, backend = 'indexeddb', now = () => Date.now(), randomId = () => globalThis.crypto.randomUUID() } = {}) {
  if (!database?.transaction || !['indexeddb', 'capacitor_sqlite', 'electron_sqlite', 'volatile'].includes(backend)) throw storageError('unavailable');
  const handles = new Map();
  function getHandle(id) {
    const handle = typeof id === 'string' && handles.get(id);
    if (!handle || handle.closed) throw storageError('retired');
    return handle;
  }
  async function current(tx, handle, expectedEpoch, { migrating = false } = {}) {
    if (handle.closed) throw storageError('retired');
    const owner = await tx.get('owners', handle.owner);
    const store = await tx.get('stores', [handle.owner, handle.namespace]);
    if (!owner || !store || owner.epoch !== expectedEpoch || owner.epoch !== handle.epoch
      || store.generation !== handle.generation || (!migrating && store.migration)) throw storageError('retired');
    return store;
  }
  function prefix(owner, namespace, generation, kind) { return [owner, namespace, generation, kind]; }
  function rowKey(owner, namespace, generation, kind, key) { return [owner, namespace, generation, kind, key]; }
  const storeIndexes = (store) => store.indexes || {};
  // Index and LRU entries follow the row; the metadata keeps what it wrote so
  // a later change or delete can remove exactly those entries.
  async function unlink(tx, store, generation, metadata) {
    const [owner, namespace] = store.key;
    for (const [name, encoded] of Object.entries(metadata.index || {})) {
      await tx.delete('rows', rowKey(owner, namespace, generation, INDEX, indexEntry(name, encoded, metadata.id)));
    }
    if (metadata.lru !== undefined) await tx.delete('rows', rowKey(owner, namespace, generation, LRU, metadata.lru));
  }
  async function link(tx, store, generation, id, value, updatedAt, dirty) {
    const [owner, namespace] = store.key;
    const index = {};
    for (const [name, fields] of Object.entries(storeIndexes(store))) {
      const encoded = indexedValues(fields, value);
      if (encoded === null) continue;
      index[name] = encoded;
      await tx.put('rows', { key: rowKey(owner, namespace, generation, INDEX, indexEntry(name, encoded, id)), target: id });
    }
    let lru;
    if (store.evict === 'lru' && !dirty) {
      lru = lruEntry(updatedAt, id);
      await tx.put('rows', { key: rowKey(owner, namespace, generation, LRU, lru), target: id });
    }
    return { index, lru };
  }
  // `count: false` leaves the store totals to a caller that already projected them.
  async function discard(tx, store, metadata, { count = true } = {}) {
    const [owner, namespace] = store.key;
    await unlink(tx, store, store.generation, metadata);
    await tx.delete('rows', metadata.key);
    await tx.delete('rows', rowKey(owner, namespace, store.generation, BODY, metadata.id));
    if (!count) return;
    store.rowCount -= 1;
    store.bytes -= metadata.bytes;
    if (metadata.dirty) store.dirtyCount = Math.max(0, (store.dirtyCount || 0) - 1);
  }
  async function writeRow(tx, store, generation, { key, value, json }, old, { syncedAt } = {}) {
    const [owner, namespace] = store.key;
    const revision = next(old?.revision || 0);
    const valueBytes = bytes(json);
    const wireBytes = bytes({ key, value, revision, bytes: valueBytes });
    const updatedAt = now();
    const dirty = !!value._dirty;
    if (old) await unlink(tx, store, generation, old);
    const links = await link(tx, store, generation, key, value, updatedAt, dirty);
    await tx.put('rows', { key: rowKey(owner, namespace, generation, META, key), id: key, revision, bytes: valueBytes, wireBytes, dirty, updatedAt,
      ...(Object.keys(links.index).length ? { index: links.index } : {}), ...(links.lru !== undefined ? { lru: links.lru } : {}),
      ...(syncedAt !== undefined ? { syncedAt } : {}) });
    await tx.put('rows', { key: rowKey(owner, namespace, generation, BODY, key), json });
    return { valueBytes, dirty };
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
  // Least recently written first; never dirty, never a row this commit writes.
  async function lruVictims(tx, store, protect, wanted) {
    const [owner, namespace] = store.key;
    const victims = [];
    let after = null;
    while (victims.length < wanted) {
      const entries = await tx.scan('rows', prefix(owner, namespace, store.generation, LRU), { after, limit: SCAN + 1 });
      for (const entry of entries.slice(0, SCAN)) {
        if (victims.length >= wanted) break;
        if (protect.has(entry.target)) continue;
        const metadata = await tx.get('rows', rowKey(owner, namespace, store.generation, META, entry.target));
        if (metadata && !metadata.dirty) victims.push({ metadata, updatedAt: metadata.updatedAt });
      }
      if (entries.length <= SCAN) break;
      after = entries[SCAN - 1].key[4];
    }
    return victims;
  }
  // Within one owner, every LRU cache store of the same domain shares a byte
  // budget; the oldest rows across them go first. Authored stores and dirty
  // rows are never candidates, so drafts and the outbox are never evicted.
  // Returns what left the target store itself, whose totals the caller owns.
  async function domainCapacity(tx, store, projectedBytes, protect, evicted) {
    const own = { rows: 0, bytes: 0 };
    if (store.evict !== 'lru' || store.domainMaxBytes === null || store.domainMaxBytes === undefined) return own;
    const [owner] = store.key;
    const members = (await tx.scan('stores', [owner], { limit: 1001 }))
      .filter((row) => row.evict === 'lru' && row.policy === 'cache' && row.domain === store.domain && !row.migration && !same(row.key, store.key));
    let total = members.reduce((sum, row) => sum + row.bytes, 0) + projectedBytes;
    const touched = new Set();
    const removed = new Set();
    for (let round = 0; total > store.domainMaxBytes && round < 20; round += 1) {
      const heads = [];
      for (const member of [store, ...members]) {
        const victims = await lruVictims(tx, member, member === store ? protect : new Set(), SCAN);
        victims.filter((victim) => !removed.has(JSON.stringify([member.key, victim.metadata.id])))
          .forEach((victim) => heads.push({ member, ...victim }));
      }
      if (!heads.length) break;
      heads.sort((a, b) => a.updatedAt - b.updatedAt);
      for (const victim of heads) {
        if (total <= store.domainMaxBytes) break;
        const isOwn = victim.member === store;
        await discard(tx, victim.member, victim.metadata, { count: !isOwn });
        removed.add(JSON.stringify([victim.member.key, victim.metadata.id]));
        total -= victim.metadata.bytes;
        if (isOwn) { own.rows += 1; own.bytes += victim.metadata.bytes; } else touched.add(victim.member);
        evicted.push({ label: victim.member.label, key: victim.metadata.id });
      }
    }
    for (const member of touched) {
      member.revision = next(member.revision);
      await tx.put('stores', member);
    }
    if (total > store.domainMaxBytes) throw storageError('quota');
    return own;
  }
  async function readRows(tx, handle, store, metadata, { limit, keyed, metadataOnly, cursorOf }) {
    const result = { epoch: handle.epoch, storeRevision: store.revision, rows: [], nextKey: null };
    const included = [];
    let scanned = 0;
    let lastScanned = null;
    let encodedBytes = bytes(result);
    for (const row of metadata) {
      if (scanned >= limit) break;
      if (!row) { scanned += 1; continue; }
      if (handle.options.policy !== 'authored' && !row.dirty && handle.options.limits.maxAgeMs !== null
        && row.updatedAt + handle.options.limits.maxAgeMs <= now()) {
        scanned += 1;
        lastScanned = cursorOf(row);
        continue;
      }
      const rowBytes = metadataOnly ? bytes({ key: row.id, value: null, revision: row.revision, bytes: row.bytes }) : row.wireBytes;
      if (!integer(rowBytes)) throw storageError('read-failed');
      const continuationBytes = keyed ? 0 : bytes(JSON.stringify(cursorOf(row))) - 4;
      if (encodedBytes + rowBytes + (included.length ? 1 : 0) + Math.max(0, continuationBytes) > MAX_READ_BYTES) {
        if (keyed || !scanned) throw storageError('payload-capacity');
        break;
      }
      encodedBytes += rowBytes + (included.length ? 1 : 0);
      included.push(row);
      scanned += 1;
      lastScanned = cursorOf(row);
    }
    if (!keyed && scanned < metadata.length) result.nextKey = lastScanned;
    const [owner, namespace] = [handle.owner, handle.namespace];
    const bodies = metadataOnly ? []
      : await getMany(tx, 'rows', included.map((row) => rowKey(owner, namespace, store.generation, BODY, row.id)));
    for (const [index, row] of included.entries()) {
      let value = null;
      if (!metadataOnly) {
        const body = bodies[index];
        if (!body || typeof body.json !== 'string') throw storageError('read-failed');
        try { value = JSON.parse(body.json); } catch (_) { throw storageError('read-failed'); }
      }
      result.rows.push({ key: row.id, value, revision: row.revision, bytes: row.bytes });
    }
    return result;
  }
  async function principalStores(tx, selector) {
    const matchesSubject = retirementMatcher(selector);
    const principal = JSON.stringify([selector.authorityOrigin, selector.viewerId]);
    const stores = [];
    await tx.eachIndex('owners', 'principal', principal, async (owner) => {
      if (!matchesSubject(owner.identity.subjectKey)) return;
      const rows = await tx.scan('stores', [owner.key], { limit: 1001 });
      rows.forEach((row) => stores.push({ owner, store: row }));
    });
    return stores;
  }
  async function selectedStore(tx, selector, id) {
    let wanted;
    try { wanted = JSON.parse(id); } catch (_) { throw storageError('unserializable'); }
    const found = (await principalStores(tx, selector)).find(({ store }) => same(store.key, wanted));
    if (!found) throw storageError('retired');
    return found;
  }
  async function scanMetadata(tx, store, visit) {
    const [owner, namespace] = store.key;
    let after = null;
    for (;;) {
      const rows = await tx.scan('rows', prefix(owner, namespace, store.generation, META), { after, limit: SCAN + 1 });
      for (const row of rows.slice(0, SCAN)) { if (await visit(row) === false) return; }
      if (rows.length <= SCAN) return;
      after = rows[SCAN - 1].id;
    }
  }
  function describe(owner, store) {
    const { identity } = owner;
    const [, storeName] = JSON.parse(store.key[1]);
    const label = store.label || namespaceLabel({ mpId: identity.mpId, storeName, policy: store.policy });
    return {
      id: JSON.stringify(store.key), label, domain: labelDomain(label), policy: store.policy,
      accountType: identity.accountType, accountId: identity.accountId, tenantId: identity.tenantId,
      schemaVersion: store.schemaVersion, rowCount: store.rowCount, bytes: store.bytes,
      dirtyCount: store.dirtyCount ?? null, touchedAt: store.touchedAt ?? null, syncedAt: store.syncedAt ?? null,
      evict: store.evict || 'none', indexes: Object.keys(store.indexes || {}), migrating: !!store.migration,
    };
  }
  const port = {
    version: HOST_STORE_VERSION,
    features: HOST_STORE_FEATURES,
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
        const label = namespaceLabel({ mpId: input.identity.mpId, storeName: input.storeName, policy: input.policy });
        const declared = { indexes: identity.indexes, evict: identity.evict, domainMaxBytes: identity.domainMaxBytes, label, domain: labelDomain(label) };
        let store = await tx.get('stores', key);
        let migration = null;
        // The declared schema (key, indexes, record schema, version) as the
        // caller fingerprints it. A store opened before it had one adopts it.
        const schemaFingerprint = input.schemaFingerprint ?? null;
        // Only a caller that fingerprints its schema can take a store back to
        // an older version (a rolled-back MP): its caches start empty and its
        // authored rows go through the caller. Anyone else is refused.
        const downgrade = !!store && store.schemaVersion > input.schemaVersion;
        if (store && (store.policy !== input.policy || (downgrade && schemaFingerprint === null))) throw storageError('unavailable');
        if (store && store.dirtyCount === undefined) {
          let dirty = 0;
          await scanMetadata(tx, store, (metadata) => { if (metadata.dirty) dirty += 1; });
          store.dirtyCount = dirty;
        }
        const reshaped = store && (!same(store.indexes || {}, declared.indexes) || (store.evict || 'none') !== declared.evict);
        const schemaChanged = !!store && schemaFingerprint !== null && (store.schemaFingerprint ?? null) !== null
          && store.schemaFingerprint !== schemaFingerprint;
        const versionChanged = !!store && store.schemaVersion !== input.schemaVersion;
        // A migration names the shape its rows come from.
        const source = store?.schemaFingerprint ? { fromFingerprint: store.schemaFingerprint } : {};
        if (store && input.policy === 'authored' && (versionChanged || store.migration || schemaChanged || reshaped)) {
          // Authored rows are never dropped: the caller migrates them.
          migration = { from: store.schemaVersion, to: input.schemaVersion, ...source };
        } else if (store && (store.migration || (input.policy !== 'authored' && (store.fingerprint !== input.cacheFingerprint
          || versionChanged || reshaped || schemaChanged)))) {
          if (store.migration || (store.dirtyCount ?? 0) > 0) {
            // Unsent rows are never dropped either: the caller decides where
            // they go and lets the cached rows go. A changed grant (the cache
            // fingerprint) is named apart from a changed shape, so the caller
            // can treat the two differently.
            const grant = store.fingerprint !== input.cacheFingerprint
              ? { cacheFingerprintChanged: true, fromCacheFingerprint: store.fingerprint ?? null } : {};
            migration = { from: store.schemaVersion, to: input.schemaVersion, ...source, ...grant };
          } else {
            // A cache that changed shape, version or fingerprint starts empty.
            await tx.deletePrefix('rows', [identity.owner, identity.namespace]);
            store = { ...store, generation: next(store.generation), revision: next(store.revision), rowCount: 0, bytes: 0, dirtyCount: 0,
              fingerprint: input.cacheFingerprint, schemaVersion: input.schemaVersion, schemaFingerprint, migration: null, ...declared };
          }
        }
        if (store && !migration && schemaFingerprint !== null && store.schemaFingerprint !== schemaFingerprint) store.schemaFingerprint = schemaFingerprint;
        if (!store) store = { key, generation: 0, revision: 0, rowCount: 0, bytes: 0, dirtyCount: 0, schemaVersion: input.schemaVersion, policy: input.policy, fingerprint: input.cacheFingerprint, schemaFingerprint, ...declared };
        else if (!migration) Object.assign(store, { domainMaxBytes: declared.domainMaxBytes, label, domain: declared.domain });
        store.touchedAt = now();
        await cacheCapacity(tx, store, store.bytes);
        await tx.put('stores', store);
        return { epoch: owner.epoch, generation: store.generation, storeRevision: store.revision, migration };
      });
      Object.assign(handle, state);
      const id = randomId();
      if (typeof id !== 'string' || !id || id.length > 128 || handles.has(id)) throw storageError('unavailable');
      handles.set(id, handle);
      handleRegistry.add(handle);
      return { handle: id, backend, durable: backend !== 'volatile', epoch: state.epoch, storeRevision: state.storeRevision,
        ...(state.migration ? { migration: state.migration } : {}) };
    },
    async read(input) {
      if (!validateRead(input)) return readFailure('unserializable');
      try {
        const handle = getHandle(input.handle);
        return await database.transaction('readonly', async (tx) => {
          const store = await current(tx, handle, input.expectedEpoch, { migrating: !!handle.migration });
          const metadata = input.keys ? (await getMany(tx, 'rows', input.keys.map((key) => rowKey(handle.owner, handle.namespace, store.generation, META, key)))).filter(Boolean)
            : await tx.scan('rows', prefix(handle.owner, handle.namespace, store.generation, META), { after: input.afterKey, limit: input.limit + 1 });
          const result = await readRows(tx, handle, store, metadata, { limit: input.keys ? MAX_ROWS : input.limit, keyed: !!input.keys,
            metadataOnly: !!input.metadataOnly, cursorOf: (row) => row.id });
          if (handle.closed) throw storageError('retired');
          return result;
        });
      } catch (error) { return readFailure(failureReason(error, 'read-failed')); }
    },
    // Rows by a declared secondary index, in index order: `equals` (every
    // field), or a `prefix` of the leading fields and/or an inclusive
    // `lower`/`upper` bound on the next field. `nextKey` continues the scan.
    async query(input) {
      if (!validateQuery(input)) return readFailure('unserializable');
      try {
        const handle = getHandle(input.handle);
        return await database.transaction('readonly', async (tx) => {
          const store = await current(tx, handle, input.expectedEpoch);
          const fields = storeIndexes(store)[input.index];
          const head = input.equals || input.prefix || [];
          const bounded = Object.hasOwn(input, 'lower') || Object.hasOwn(input, 'upper');
          if (!fields || head.length > fields.length || (input.equals && head.length !== fields.length)
            || (bounded && head.length >= fields.length)) throw storageError('unserializable');
          const base = `${input.index}\u0000`;
          const headEncoded = head.length ? indexValues(head) : null;
          // Entries are `index\0v1\u0001v2…\0key`; the head closes with the
          // separator that follows it so `s1` never matches `s12`.
          const headPrefix = headEncoded === null ? base
            : `${base}${headEncoded}${head.length < fields.length ? '\u0001' : '\u0000'}`;
          const lower = Object.hasOwn(input, 'lower') ? indexValues([input.lower]) : null;
          const upper = Object.hasOwn(input, 'upper') ? indexValues([input.upper]) : null;
          const start = lower === null ? headPrefix.slice(0, -1) : `${headPrefix}${lower}`;
          const within = (entry) => {
            if (!entry.startsWith(headPrefix)) return false;
            if (upper === null) return true;
            const rest = entry.slice(headPrefix.length);
            const cut = rest.search(/[\u0000\u0001]/);
            return (cut === -1 ? rest : rest.slice(0, cut)) <= upper;
          };
          const entries = [];
          let after = input.afterKey ?? start;
          let exhausted = false;
          while (entries.length <= input.limit && !exhausted) {
            const page = await tx.scan('rows', prefix(handle.owner, handle.namespace, store.generation, INDEX), { after, limit: SCAN + 1 });
            for (const entry of page.slice(0, SCAN)) {
              if (!within(entry.key[4])) { exhausted = true; break; }
              entries.push(entry);
              if (entries.length > input.limit) break;
            }
            if (page.length <= SCAN) exhausted = true;
            else after = page[SCAN - 1].key[4];
          }
          const metadata = await getMany(tx, 'rows', entries.map((entry) => rowKey(handle.owner, handle.namespace, store.generation, META, entry.target)));
          const ordered = entries.map((entry, index) => metadata[index] && { ...metadata[index], cursor: entry.key[4] });
          const result = await readRows(tx, handle, store, ordered, { limit: input.limit, keyed: false, metadataOnly: false,
            cursorOf: (row) => row.cursor });
          if (handle.closed) throw storageError('retired');
          return result;
        });
      } catch (error) { return readFailure(failureReason(error, 'read-failed')); }
    },
    async commit(input) {
      try {
        const changes = validateCommit(input);
        const handle = getHandle(input.handle);
        if (handle.migration) throw storageError('unavailable');
        return await database.transaction('readwrite', async (tx) => {
          const store = await current(tx, handle, input.expectedEpoch);
          if (store.revision !== input.expectedStoreRevision) throw storageError('conflict');
          const { maxRows, maxBytes } = handle.options.limits;
          const plans = [];
          let rowCount = store.rowCount;
          let totalBytes = store.bytes;
          for (const change of changes) {
            const old = await tx.get('rows', rowKey(handle.owner, handle.namespace, store.generation, META, change.key));
            const valueBytes = change.op === 'put' ? bytes(change.json) : 0;
            rowCount += change.op === 'put' ? (old ? 0 : 1) : (old ? -1 : 0);
            totalBytes += valueBytes - (old?.bytes || 0);
            plans.push({ change, old });
          }
          const evicted = [];
          const protect = new Set(changes.map((change) => change.key));
          const within = () => rowCount <= maxRows && (maxBytes === null || totalBytes <= maxBytes);
          if (store.evict === 'lru' && !within()) {
            const victims = await lruVictims(tx, store, protect, Math.max(rowCount - maxRows, 0) || store.rowCount);
            for (const victim of victims) {
              if (within()) break;
              await discard(tx, store, victim.metadata, { count: false });
              rowCount -= 1;
              totalBytes -= victim.metadata.bytes;
              evicted.push({ label: store.label, key: victim.metadata.id });
            }
          }
          if (rowCount > maxRows && rowCount > store.rowCount) throw storageError('row-capacity');
          if (maxBytes !== null && totalBytes > maxBytes) throw storageError('quota');
          const own = await domainCapacity(tx, store, totalBytes, protect, evicted);
          rowCount -= own.rows;
          totalBytes -= own.bytes;
          await cacheCapacity(tx, store, totalBytes);
          let dirtyCount = store.dirtyCount || 0;
          for (const { change, old } of plans) {
            if (change.op === 'delete') {
              if (old) { await discard(tx, store, old, { count: false }); dirtyCount -= old.dirty ? 1 : 0; }
              continue;
            }
            const { dirty } = await writeRow(tx, store, store.generation, change, old, { syncedAt: input.syncedAt });
            dirtyCount += (dirty ? 1 : 0) - (old?.dirty ? 1 : 0);
          }
          if (handle.closed) throw storageError('retired');
          store.rowCount = rowCount;
          store.bytes = totalBytes;
          store.dirtyCount = Math.max(0, dirtyCount);
          store.revision = next(store.revision);
          store.touchedAt = now();
          if (input.syncedAt !== undefined) store.syncedAt = input.syncedAt;
          await tx.put('stores', store);
          return { ok: true, epoch: handle.epoch, storeRevision: store.revision, ...(evicted.length ? { evicted } : {}) };
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
    // Copy-on-write: `begin` claims the next generation under a lease held by
    // this handle, `write` puts the caller's transformed rows into it,
    // `complete` swaps it in atomically (other handles retire), `abort` drops
    // it. Another opener's `begin` is refused as `busy` while the lease is
    // live (it waits and reopens); a lease that ran out is a crashed opener,
    // so the next `begin` starts over. `write`, `complete` and `abort` from
    // a handle that no longer holds the lease fail as `conflict`.
    async migration(input) {
      const changes = validateMigration(input);
      const handle = getHandle(input.handle);
      if (!handle.migration) throw storageError('unserializable');
      return database.transaction('readwrite', async (tx) => {
        const store = await current(tx, handle, input.expectedEpoch, { migrating: true });
        const [owner, namespace] = store.key;
        const declaredShape = validateOpen(handle.options);
        const target = { ...store, indexes: declaredShape.indexes, evict: declaredShape.evict };
        if (input.phase === 'begin') {
          const held = store.migration;
          if (held && held.token !== handle.migrationToken && (held.leaseUntil ?? 0) > now()) throw storageError('busy');
          const generation = next(Math.max(store.generation, held?.generation ?? 0));
          if (held) await tx.deletePrefix('rows', [owner, namespace, held.generation]);
          handle.migrationToken = randomId();
          store.migration = { from: store.schemaVersion, to: handle.options.schemaVersion, generation, rowCount: 0, bytes: 0, dirtyCount: 0,
            token: handle.migrationToken, leaseUntil: now() + MIGRATION_LEASE_MS };
          await tx.put('stores', store);
          return { ok: true, generation };
        }
        if (!store.migration || store.migration.to !== handle.options.schemaVersion
          || !handle.migrationToken || store.migration.token !== handle.migrationToken) throw storageError('conflict');
        store.migration.leaseUntil = now() + MIGRATION_LEASE_MS;
        const { generation } = store.migration;
        if (input.phase === 'abort') {
          await tx.deletePrefix('rows', [owner, namespace, generation]);
          store.migration = null;
          await tx.put('stores', store);
          return { ok: true };
        }
        if (input.phase === 'write') {
          for (const change of changes) {
            const old = await tx.get('rows', rowKey(owner, namespace, generation, META, change.key));
            const { valueBytes, dirty } = await writeRow(tx, target, generation, change, old);
            store.migration.rowCount += old ? 0 : 1;
            store.migration.bytes += valueBytes - (old?.bytes || 0);
            store.migration.dirtyCount += (dirty ? 1 : 0) - (old?.dirty ? 1 : 0);
          }
          if (store.migration.rowCount > handle.options.limits.maxRows) throw storageError('row-capacity');
          await tx.put('stores', store);
          return { ok: true };
        }
        await tx.deletePrefix('rows', [owner, namespace, store.generation]);
        const done = { ...store, generation, schemaVersion: store.migration.to, indexes: target.indexes, rowCount: store.migration.rowCount,
          bytes: store.migration.bytes, dirtyCount: store.migration.dirtyCount, revision: next(store.revision), migration: null, touchedAt: now(),
          ...(store.policy === 'authored' ? {} : { fingerprint: handle.options.cacheFingerprint }),
          ...(handle.options.schemaFingerprint != null ? { schemaFingerprint: handle.options.schemaFingerprint } : {}),
          evict: target.evict };
        await tx.put('stores', done);
        for (const other of handleRegistry) { if (other !== handle && other.owner === handle.owner && other.namespace === handle.namespace) other.closed = true; }
        handle.generation = generation;
        handle.migration = null;
        return { ok: true, epoch: handle.epoch, storeRevision: done.revision };
      }).catch((error) => fail(failureReason(error)));
    },
    // Host-only inspection for Settings → Data: store listings with counts,
    // bytes and pending rows, and read-only row pages. Never MP-reachable.
    async inspect(input) {
      validateInspect(input);
      try {
        return await database.transaction('readonly', async (tx) => {
          if (input.op === 'stores') {
            const stores = await principalStores(tx, input.selector);
            const described = [];
            for (const { owner, store } of stores) {
              const row = describe(owner, store);
              if (row.dirtyCount === null) {
                let dirty = 0;
                await scanMetadata(tx, store, (metadata) => { if (metadata.dirty) dirty += 1; });
                row.dirtyCount = dirty;
              }
              described.push(row);
            }
            return { ok: true, stores: described.sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0)) };
          }
          const { store } = await selectedStore(tx, input.selector, input.store);
          const limit = input.limit ?? 50;
          const picked = [];
          let nextKey = null;
          const after = input.afterKey ?? null;
          await scanMetadata(tx, store, (metadata) => {
            if (after !== null && metadata.id <= after) return true;
            if (input.op === 'pending' && !metadata.dirty) return true;
            if (picked.length >= limit) { nextKey = picked.at(-1).id; return false; }
            picked.push(metadata);
            return true;
          });
          const [owner, namespace] = store.key;
          const bodies = await getMany(tx, 'rows', picked.map((row) => rowKey(owner, namespace, store.generation, BODY, row.id)));
          const rows = picked.map((row, index) => {
            let value = null;
            try { value = JSON.parse(bodies[index]?.json); } catch (_) { value = null; }
            return { key: row.id, value, revision: row.revision, bytes: row.bytes, dirty: !!row.dirty, updatedAt: row.updatedAt, syncedAt: row.syncedAt ?? null };
          });
          return { ok: true, rows, nextKey };
        });
      } catch (error) { return readFailure(failureReason(error, 'read-failed')); }
    },
    // Clears a store's cached rows, or just `keys`. Dirty rows and authored
    // stores (drafts, outbox, settings) stay unless `force` is set by an
    // explicit confirm.
    async purge(input) {
      validatePurge(input);
      try {
        const removed = await database.transaction('readwrite', async (tx) => {
          const { store } = await selectedStore(tx, input.selector, input.store);
          if (store.policy === 'authored' && !input.force) return [];
          const [owner, namespace] = store.key;
          if (input.keys) {
            const rows = (await getMany(tx, 'rows', input.keys.map((key) => rowKey(owner, namespace, store.generation, META, key))))
              .filter((metadata) => metadata && (input.force || !metadata.dirty));
            for (const metadata of rows) await discard(tx, store, metadata);
            if (rows.length) {
              store.revision = next(store.revision);
              store.touchedAt = now();
              await tx.put('stores', store);
            }
            return rows.map((metadata) => metadata.id);
          }
          if (input.force) {
            const keys = [];
            await scanMetadata(tx, store, (metadata) => { keys.push(metadata.id); });
            await tx.deletePrefix('rows', [owner, namespace]);
            await tx.put('stores', { ...store, generation: next(store.generation), revision: next(store.revision), rowCount: 0, bytes: 0, dirtyCount: 0, touchedAt: now() });
            return keys;
          }
          const doomed = [];
          await scanMetadata(tx, store, (metadata) => { if (!metadata.dirty) doomed.push(metadata); });
          for (const metadata of doomed) await discard(tx, store, metadata);
          store.revision = next(store.revision);
          store.touchedAt = now();
          await tx.put('stores', store);
          return doomed.map((metadata) => metadata.id);
        });
        if (input.force && !input.keys) {
          let wanted;
          try { wanted = JSON.parse(input.store); } catch (_) { wanted = null; }
          for (const handle of handleRegistry) {
            if (wanted && handle.owner === wanted[0] && handle.namespace === wanted[1]) handle.closed = true;
          }
        }
        return { ok: true, removed };
      } catch (error) { return fail(failureReason(error)); }
    },
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

/**
 * The host store's change feed: every successful write, eviction, migration
 * and purge is announced to in-app listeners and, over BroadcastChannel, to
 * the app's other tabs. Events name the namespace and row keys only; values
 * never leave the store.
 */
export const HOST_STORE_CHANNEL = 'tommy-host-store-v2';
const MAX_KEYS = 100;
const randomOrigin = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
const TYPES = new Set(['commit', 'evict', 'migrate', 'purge']);
const eventValid = (event) => event && typeof event === 'object' && TYPES.has(event.type)
  && typeof event.origin === 'string' && (event.principal === undefined || typeof event.principal === 'string');

export function createHostStoreChangeFeed({
  channelName = HOST_STORE_CHANNEL,
  BroadcastChannelImpl = globalThis.BroadcastChannel,
  origin = randomOrigin(),
  now = () => Date.now(),
} = {}) {
  const listeners = new Set();
  let channel = null;
  const deliver = (event) => {
    [...listeners].forEach((listener) => { try { listener(event); } catch (_) { /* listener isolation */ } });
  };
  try { if (typeof BroadcastChannelImpl === 'function') channel = new BroadcastChannelImpl(channelName); } catch (_) { channel = null; }
  // Node's channel would otherwise hold the process open (tests, tooling).
  channel?.unref?.();
  if (channel) {
    channel.onmessage = (message) => {
      const event = message?.data;
      if (eventValid(event) && event.origin !== origin) deliver({ ...event, remote: true });
    };
  }
  return {
    origin,
    crossTab: !!channel,
    publish(event) {
      const stamped = { ...event, keys: (event.keys || []).slice(0, MAX_KEYS), origin, at: now() };
      if (!eventValid(stamped)) return;
      deliver({ ...stamped, remote: false });
      try { channel?.postMessage(stamped); } catch (_) { /* another tab can refresh on focus */ }
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    close() {
      listeners.clear();
      try { channel?.close(); } catch (_) { /* already closed */ }
      channel = null;
    },
  };
}

/** Wraps a port (local or bridged) so its successful mutations reach the feed. */
export function observeHostStorePort(port, feed) {
  const opened = new Map();
  const principalOf = (selector) => JSON.stringify([selector.authorityOrigin, selector.viewerId]);
  const target = (input) => ({
    owner: ownerKey(input.identity),
    label: namespaceLabel({ mpId: input.identity.mpId, storeName: input.storeName, policy: input.policy }),
    principal: principalOf(input.identity),
  });
  const wrapped = { ...port };
  wrapped.open = async (input) => {
    const result = await port.open(input);
    if (result?.handle) opened.set(result.handle, target(input));
    return result;
  };
  wrapped.commit = async (input) => {
    const result = await port.commit(input);
    const namespace = opened.get(input?.handle);
    if (result?.ok !== false && namespace) {
      feed.publish({ type: 'commit', ...namespace, keys: input.changes.map((change) => change.key), storeRevision: result.storeRevision });
      if (result.evicted?.length) {
        feed.publish({ type: 'evict', principal: namespace.principal, owner: namespace.owner, labels: [...new Set(result.evicted.map((row) => row.label))],
          keys: result.evicted.map((row) => row.key) });
      }
    }
    return result;
  };
  wrapped.retire = async (input) => {
    const namespace = opened.get(input?.handle);
    const result = await port.retire(input);
    if (namespace && input.mode === 'close') opened.delete(input.handle);
    if (namespace && result?.purged) feed.publish({ type: 'purge', owner: namespace.owner, principal: namespace.principal });
    return result;
  };
  wrapped.migration = async (input) => {
    const result = await port.migration(input);
    const namespace = opened.get(input?.handle);
    if (namespace && input?.phase === 'complete' && result?.ok !== false) feed.publish({ type: 'migrate', ...namespace });
    return result;
  };
  if (typeof port.purge === 'function') {
    wrapped.purge = async (input) => {
      const result = await port.purge(input);
      if (result?.ok) feed.publish({ type: 'purge', principal: principalOf(input.selector), store: input.store, keys: result.removed });
      return result;
    };
  }
  if (typeof port.retirePrincipal === 'function') {
    wrapped.retirePrincipal = async (selector) => {
      const result = await port.retirePrincipal(selector);
      feed.publish({ type: 'purge', principal: principalOf(selector) });
      return result;
    };
  }
  wrapped.feed = feed;
  return Object.freeze(wrapped);
}
