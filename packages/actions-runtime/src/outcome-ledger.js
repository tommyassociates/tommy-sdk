import { sha256Hex } from './digest.js';

const DEFAULT_MAX = 1000;
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const STATES = new Set(['queued', 'unconfirmed', 'succeeded', 'refused']);
const ID = /^[0-9a-f]{64}$/;

const copy = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

function wellFormed(record) {
  return record && typeof record === 'object' && typeof record.id === 'string' && ID.test(record.id) && typeof record.owner === 'string'
    && typeof record.activity === 'string' && STATES.has(record.state) && Number.isFinite(record.at);
}

export function createOutcomeLedger({ store = null, now = () => Date.now(), maxRows = DEFAULT_MAX, ttlMs = DEFAULT_TTL_MS } = {}) {
  const records = new Map();
  let loading = null;
  let loaded = false;
  // What was cleared or removed before the stored rows arrived, so the load cannot bring it back.
  let clearedWhileLoading = false;
  const removedWhileLoading = new Set();
  let tail = Promise.resolve();

  const persist = (work) => {
    if (!store) return;
    tail = tail.then(work).catch(() => { /* the memory record stands; the next write tries again */ });
  };

  const expired = (record) => record.at + ttlMs <= now();

  function evict() {
    for (const [id, record] of records) {
      if (!expired(record)) continue;
      records.delete(id);
      persist(() => store.remove?.(id));
    }
    while (records.size > maxRows) {
      const oldest = records.keys().next();
      if (oldest.done) break;
      records.delete(oldest.value);
      persist(() => store.remove?.(oldest.value));
    }
  }

  function write(record) {
    records.delete(record.id);
    records.set(record.id, record);
    removedWhileLoading.delete(record.id);
    evict();
    if (records.get(record.id) === record) {
      const kept = copy(record);
      persist(() => store.put?.(kept));
    }
    return record;
  }

  function forget(id) {
    if (!loaded) removedWhileLoading.add(id);
    if (!records.delete(id)) return;
    persist(() => store.remove?.(id));
  }

  // The digest is the whole identity, so a stored record never names its key; owner and activity are checked too.
  const idFor = (owner, activity, key) => sha256Hex(`${owner}\u0000${activity}\u0000${key}`);

  function find(owner, activity, key) {
    if (!key) return null;
    const record = records.get(idFor(owner, activity, key));
    if (!record || record.owner !== owner || record.activity !== activity) return null;
    if (expired(record)) { evict(); return null; }
    return record;
  }

  return {
    ready() {
      if (!store?.load) { loaded = true; return Promise.resolve(); }
      if (!loading) {
        loading = Promise.resolve().then(() => store.load()).then((rows) => {
          const given = Array.isArray(rows) ? rows : [];
          for (const row of given) {
            if (!wellFormed(row) && typeof row?.id === 'string') persist(() => store.remove?.(row.id));
          }
          const kept = given.filter(wellFormed).sort((a, b) => a.at - b.at);
          for (const row of kept) {
            const held = records.get(row.id);
            if (!held && (clearedWhileLoading || removedWhileLoading.has(row.id))) {
              persist(() => store.remove?.(row.id));
              continue;
            }
            if (held && held.at >= row.at) continue;
            records.delete(row.id);
            records.set(row.id, copy(row));
          }
          for (const [id, record] of [...records]) {
            if (!kept.some((row) => row.id === id)) { records.delete(id); records.set(id, record); }
          }
          evict();
        }).catch(() => { /* an unreadable store leaves memory as it is */ })
          .finally(() => { loaded = true; clearedWhileLoading = false; removedWhileLoading.clear(); });
      }
      return loading;
    },

    get(owner, activity, key) { return find(owner, activity, key); },

    record(owner, activity, key, { state, rpcId = null, refusal, request } = {}) {
      if (!key || !STATES.has(state)) return null;
      const id = idFor(owner, activity, key);
      const before = find(owner, activity, key);
      const open = state === 'queued' || state === 'unconfirmed';
      const kept = open ? (request ? copy(request) : before?.request) : undefined;
      return write({
        id,
        owner,
        activity,
        state,
        at: now(),
        rpcId: rpcId ?? null,
        ...(state === 'refused' && refusal ? { refusal: copy(refusal) } : {}),
        emitted: before?.emitted === true,
        confirmSent: before?.confirmSent === true,
        ...(kept ? { request: kept } : {}),
      });
    },

    patch(owner, activity, key, fields) {
      const before = find(owner, activity, key);
      if (!before) return null;
      return write({ ...before, ...fields });
    },

    remove(owner, activity, key) {
      if (!key) return false;
      const id = idFor(owner, activity, key);
      const before = find(owner, activity, key);
      forget(id);
      return !!before;
    },

    clear() {
      if (!loaded) clearedWhileLoading = true;
      const ids = [...records.keys()];
      records.clear();
      for (const id of ids) persist(() => store.remove?.(id));
    },

    flush() { return tail; },

    _size() { evict(); return records.size; },
  };
}
