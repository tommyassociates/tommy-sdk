const DEFAULT_MAX = 1000;
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const STATES = new Set(['queued', 'unconfirmed', 'succeeded', 'refused']);

// The record id is a digest so a stored record never names its key.
function digest(value) {
  let h = 0x811c9dc5;
  const text = String(value);
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const copy = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

function wellFormed(record) {
  return record && typeof record === 'object' && typeof record.id === 'string' && typeof record.owner === 'string'
    && typeof record.activity === 'string' && STATES.has(record.state) && Number.isFinite(record.at);
}

export function createOutcomeLedger({ store = null, now = () => Date.now(), maxRows = DEFAULT_MAX, ttlMs = DEFAULT_TTL_MS } = {}) {
  const records = new Map();
  let loading = null;
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
    evict();
    if (records.get(record.id) === record) {
      const kept = copy(record);
      persist(() => store.put?.(kept));
    }
    return record;
  }

  const idFor = (owner, activity, key) => digest(`${owner}\u0000${activity}\u0000${key}`);

  return {
    ready() {
      if (!store?.load) return Promise.resolve();
      if (!loading) {
        loading = Promise.resolve().then(() => store.load()).then((rows) => {
          const loaded = (Array.isArray(rows) ? rows : []).filter(wellFormed).sort((a, b) => a.at - b.at);
          for (const row of loaded) {
            const held = records.get(row.id);
            if (held && held.at >= row.at) continue;
            records.delete(row.id);
            records.set(row.id, copy(row));
          }
          for (const [id, record] of [...records]) {
            if (!loaded.some((row) => row.id === id)) { records.delete(id); records.set(id, record); }
          }
          evict();
        }).catch(() => { /* an unreadable store leaves memory as it is */ });
      }
      return loading;
    },

    get(owner, activity, key) {
      if (!key) return null;
      const record = records.get(idFor(owner, activity, key));
      if (!record) return null;
      if (expired(record)) { evict(); return null; }
      return record;
    },

    record(owner, activity, key, { state, rpcId = null, refusal, request } = {}) {
      if (!key || !STATES.has(state)) return null;
      const id = idFor(owner, activity, key);
      const before = records.get(id);
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
      const before = this.get(owner, activity, key);
      if (!before) return null;
      return write({ ...before, ...fields });
    },

    clear() {
      const ids = [...records.keys()];
      records.clear();
      for (const id of ids) persist(() => store.remove?.(id));
    },

    flush() { return tail; },

    _size() { evict(); return records.size; },
  };
}
