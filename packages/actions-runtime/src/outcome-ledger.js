/**
 * outcome-ledger.js — what happened to each of a Mini Program's
 * `idempotency: client_key` writes, by its key, so the MP can ask after a
 * restart whether a write it sent landed (`writeOutcome`), mark the follow-up
 * it emitted for it (`markOutcomeEmitted`), and send a write that got no
 * settling answer once more under the same key (`confirmWriteOutcome`).
 *
 * One record per (queue owner, qualified activity, hashed key):
 *   { id, owner, activity, state, at, rpcId, refusal?, emitted, confirmSent, request? }
 * `state` is `queued` (waiting in the host queue), `unconfirmed` (a dispatch
 * got no settling answer), `succeeded` or `refused`.
 *
 * NEVER A RESULT PAYLOAD (the same rule as idempotency-ledger.js: a result may
 * carry a live credential). `request` — the write's own envelope
 * `{ sourceMpId, activity, args, idempotencyKey }` — is kept only for an
 * eligible activity (client_key, offline-replayable, no secret input) and only
 * while the record is `queued` or `unconfirmed`, because a confirm re-sends it
 * byte for byte; a settled record keeps none. Keys are hashed into the record
 * id; the raw key lives only inside a kept request.
 *
 * Bounded: at most `maxRows` records (least recently written evicted first)
 * and none older than `ttlMs`. Storage is injected: `{ load(), put(record),
 * remove(id) }`, each sync or async; without one (a kiosk, tests) records live
 * in memory only. Reads are synchronous from memory; `ready()` merges what the
 * store held. Writes to the store never throw into the write path.
 */

const DEFAULT_MAX = 1000;
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const STATES = new Set(['queued', 'unconfirmed', 'succeeded', 'refused']);

/** FNV-1a 32-bit, hex: the record id, so a stored record never names its key. */
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

/**
 * @param {object} [opts]
 * @param {{ load?: Function, put?: Function, remove?: Function }|null} [opts.store]
 * @param {() => number} [opts.now]
 * @param {number} [opts.maxRows]
 * @param {number} [opts.ttlMs]
 */
export function createOutcomeLedger({ store = null, now = () => Date.now(), maxRows = DEFAULT_MAX, ttlMs = DEFAULT_TTL_MS } = {}) {
  /** id -> record. Insertion order is eviction order (least recently written first). */
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
    /** Merge what the store holds; a record already written in memory wins when it is newer. */
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
          // Memory written before the load stays the most recent.
          for (const [id, record] of [...records]) {
            if (!loaded.some((row) => row.id === id)) { records.delete(id); records.set(id, record); }
          }
          evict();
        }).catch(() => { /* an unreadable store leaves memory as it is */ });
      }
      return loading;
    },

    /** The record of one write, or null (never recorded, evicted, expired). */
    get(owner, activity, key) {
      if (!key) return null;
      const record = records.get(idFor(owner, activity, key));
      if (!record) return null;
      if (expired(record)) { evict(); return null; }
      return record;
    },

    /**
     * Record a state for a write. `request` is kept only while the state is
     * queued or unconfirmed (and only when given); a settled record drops it.
     * `emitted` and `confirmSent` carry over from the record already there.
     */
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

    /** Change fields of a record that exists; null when there is none. */
    patch(owner, activity, key, fields) {
      const before = this.get(owner, activity, key);
      if (!before) return null;
      return write({ ...before, ...fields });
    },

    /** Drop every record (sign-out). */
    clear() {
      const ids = [...records.keys()];
      records.clear();
      for (const id of ids) persist(() => store.remove?.(id));
    },

    /** Resolves once every store write asked for so far has run. */
    flush() { return tail; },

    _size() { evict(); return records.size; },
  };
}
