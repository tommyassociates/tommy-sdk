/**
 * durable-queue.js — D.43 ruling: the broker's offline queue survives a reload.
 *
 * THE DEFECT. `const queue = []` (broker.js) is a plain array in closure scope.
 * An MP calls `invoke`, the broker is offline, the write is accepted, the MP's
 * promise RESOLVES as queued — and the row then evaporates on reload with no
 * error, no dead-letter and no trace. That is DATA LOSS, not duplication, which
 * makes it strictly worse than the idempotency defect next door. 123 of the
 * estate's 199 activities declare `offlineReplayable: true`.
 *
 * ⚠ THIS STORE HOLDS TENANT DATA AT REST, AND THAT IS THE RULED TRADE.
 * The ledger next door could be narrowed to opaque keys; a queue row cannot.
 * A row IS the pending write — its full envelope, args included — so there is
 * no "keys only" version of persisting it. Gav ruled 2026-08-17 that losing an
 * accepted write is worse than storing it on the device that authored it, with
 * a cap and a TTL as the price. Recorded here because the next person to widen
 * this file needs to know the payload exposure was decided, not overlooked:
 *
 *   - it persists ONLY to the device that already accepted the write (Web
 *     Storage is origin+device scoped — nothing leaves the machine);
 *   - rows are DELETED as they drain, so the resting set is exactly the
 *     not-yet-applied writes and not a history;
 *   - a row older than the TTL is dropped rather than replayed (below).
 *
 * TTL SEMANTICS ARE A REAL CHOICE, NOT A CLEANUP DETAIL. Replaying a write from
 * an arbitrarily old session can be WRONG — a shift edit queued three weeks ago
 * may apply over later truth. Expiry therefore drops the row; it is the one
 * place this file knowingly discards a write, and it is bounded by the same
 * 7 days the ledger uses so the two cannot disagree about what "stale" means.
 *
 * SELF-DETECTING, like the ledger and NOT like `records.js` — whose header
 * claimed a shell-supplied IndexedDB backend that was never passed for the
 * platform's whole life (D.43 again). A seam that needs the host to remember
 * something is a seam that eventually rots, so there is no second half here.
 * Absent, corrupt, disabled or over-quota storage degrades to in-memory — i.e.
 * exactly today's behaviour — and NEVER throws: a durability improvement must
 * not become an outage on the write path.
 */

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const STORAGE_KEY = 'mp-offline-queue';

/** The runtime's Web Storage, or null (node, or access throws when locked down). */
function webStorage() {
  try {
    return (typeof globalThis !== 'undefined' && globalThis.localStorage) || null;
  } catch (_) {
    return null;
  }
}

/**
 * A FIFO offline queue that survives a reload.
 *
 * The in-memory array stays the working copy — every read on the dispatch path
 * is unchanged, and storage is written only when the queue MUTATES. Restoring
 * happens once, at construction, so a reload resumes with the rows the previous
 * session accepted.
 *
 * @param {object} [opts]
 * @param {number} [opts.ttlMs]   row lifetime; older rows are DROPPED on load
 * @param {function} [opts.now]   clock, injectable for tests
 * @param {object|null} [opts.storage] Web Storage override (tests)
 */
export function createDurableQueue({ ttlMs = DEFAULT_TTL_MS, now = () => Date.now(), storage } = {}) {
  const store = () => (storage === undefined ? webStorage() : storage);

  let rows = [];
  let seq = 0;
  let expired = 0;

  function persist() {
    const s = store();
    if (!s) return;
    try {
      s.setItem(STORAGE_KEY, JSON.stringify({ seq, rows }));
    } catch (_) {
      /* quota / disabled — degrade to in-memory-until-reload */
    }
  }

  // Restore once, at construction.
  (function restore() {
    const s = store();
    if (!s) return;
    let parsed;
    try {
      const raw = s.getItem(STORAGE_KEY);
      parsed = raw ? JSON.parse(raw) : null;
    } catch (_) {
      return; // corrupt — behave as empty rather than poisoning the write path
    }
    if (!parsed || !Array.isArray(parsed.rows)) return;
    const t = now();
    const kept = parsed.rows.filter((row) => (
      row && typeof row === 'object' && row.envelope && typeof row.queuedAt === 'number'
        && t - row.queuedAt < ttlMs
    ));
    expired = parsed.rows.length - kept.length;
    rows = kept;
    seq = typeof parsed.seq === 'number' ? parsed.seq : kept.length;
    if (expired) persist(); // reclaim the dropped rows' bytes immediately
  }());

  return {
    /** Live rows — the dispatch path reads this array directly. */
    all() {
      return rows;
    },

    /** Append a row; assigns the FIFO sequence. */
    push({ sourceMpId, envelope, bytes }) {
      seq += 1;
      rows.push({ sourceMpId, envelope, bytes, seq, queuedAt: now() });
      persist();
      return seq;
    },

    /** Remove and return every row (the drain). */
    takeAll() {
      const taken = rows;
      rows = [];
      persist();
      return taken;
    },

    /**
     * Rows dropped at load for exceeding the TTL. Surfaced rather than silent:
     * this is the one path that discards an accepted write, so the host can
     * report it instead of the write simply never appearing.
     */
    expiredOnLoad() {
      return expired;
    },

    /** Test/diagnostic surface — never used on the dispatch path. */
    _clear() {
      rows = [];
      seq = 0;
      expired = 0;
      persist();
    },
  };
}
