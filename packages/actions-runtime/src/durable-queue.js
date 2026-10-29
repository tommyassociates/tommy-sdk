/**
 * durable-queue.js — the broker's offline queue survives a reload.
 *
 * WHY. An MP calls `invoke` while the broker is offline, the write is accepted
 * and the MP's promise RESOLVES as queued; a queue held only in memory would
 * lose that row on reload with no error, no dead-letter and no trace — DATA
 * LOSS, strictly worse than duplication. 123 of the estate's 199 activities
 * declare `offlineReplayable: true`.
 *
 * ⚠ THIS STORE HOLDS TENANT DATA AT REST, AND THAT IS THE CHOSEN TRADE.
 * The ledger next door could be narrowed to opaque keys; a queue row cannot.
 * A row IS the pending write — its full envelope, args included — so there is
 * no "keys only" version of persisting it. Losing an accepted write is worse
 * than storing it on the device that authored it, with a cap and a TTL as the
 * price. The payload exposure is deliberate, not overlooked:
 *
 *   - it persists ONLY to the device that already accepted the write (Web
 *     Storage is origin+device scoped — nothing leaves the machine);
 *   - a row is DELETED once the server has answered it (applied, or refused
 *     with a 4xx), so the resting set is exactly the not-yet-applied writes
 *     and not a history;
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
 * Absent, corrupt or disabled storage degrades to in-memory and never throws.
 * Storage that is there but cannot take a new row (its quota is spent, e.g. by
 * the photos of a form) refuses that row: `push` throws `QueueNotKept` with
 * the row taken back out, so the write is never reported as queued while it
 * would be gone at the next reload. Rows already held stay as they were.
 *
 * ONE STORE, SEVERAL INSTANCES. The host keeps a broker per warm world, and
 * each builds a queue over the same storage key. Every instance therefore
 * reads what storage holds before it changes or lists the rows, so one never
 * writes back its stale copy over rows another queued or sent.
 *
 * HELD ROWS. A replayable write is pushed `held` while its request is
 * in flight, so closing the app mid-request still leaves its row. Being held
 * is a fact about THIS page, never stored: the set of held row ids is shared
 * by the page's queues (default) and is empty after a restart, when the row is
 * an ordinary queued write that the next drain sends.
 */

// Rows held by a write still running in this page (see HELD ROWS above).
const HELD_IN_THIS_PAGE = new Set();
let rowIds = 0;
const newRowId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${(rowIds += 1)}`;

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
 * @param {Set} [opts.held] ids of the rows held by a write running in this
 *   page; shared by the page's queues by default (tests pass a fresh set to
 *   stand for a restart)
 */
export function createDurableQueue({
  ttlMs = DEFAULT_TTL_MS, now = () => Date.now(), storage, held = HELD_IN_THIS_PAGE,
} = {}) {
  const store = () => (storage === undefined ? webStorage() : storage);

  let rows = [];
  let seq = 0;
  let expired = 0;
  // The stored text `rows` and `seq` were last read from or written as.
  let seen = null;
  // seq -> id of the rows this queue pushed held, so a release finds its id
  // even once another queue over the storage has removed the row.
  const heldHere = new Map();

  // Whether storage holds the rows now: true with no storage at all (memory
  // is all there is), false when storage is there and refused the write.
  function persist() {
    const s = store();
    if (!s) return true;
    try {
      const text = JSON.stringify({ seq, rows });
      s.setItem(STORAGE_KEY, text);
      seen = text;
      return true;
    } catch (_) {
      return false;
    }
  }

  const wellFormed = (row) => row && typeof row === 'object' && row.envelope && typeof row.queuedAt === 'number';

  // The stored text, or undefined when storage is absent or cannot be read.
  function storedText() {
    const s = store();
    if (!s) return undefined;
    try { return s.getItem(STORAGE_KEY); } catch (_) { return undefined; }
  }

  function parse(raw) {
    try {
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && Array.isArray(parsed.rows) ? parsed : null;
    } catch (_) {
      return null; // corrupt — behave as empty rather than poisoning the write path
    }
  }

  // Take up what storage holds now when another queue over it changed it (or
  // deleted it); this queue's own copy otherwise. The TTL is applied once,
  // at construction, as before.
  function refresh() {
    const raw = storedText();
    if (raw === undefined || raw === seen) return;
    seen = raw;
    const parsed = parse(raw);
    rows = parsed ? parsed.rows.filter(wellFormed) : [];
    seq = parsed && typeof parsed.seq === 'number' ? Math.max(parsed.seq, seq) : seq;
  }

  // Restore once, at construction.
  (function restore() {
    const raw = storedText();
    if (raw === undefined) return;
    seen = raw;
    const parsed = parse(raw);
    if (!parsed) return;
    const t = now();
    const kept = parsed.rows.filter((row) => wellFormed(row) && t - row.queuedAt < ttlMs);
    expired = parsed.rows.length - kept.length;
    rows = kept;
    seq = typeof parsed.seq === 'number' ? parsed.seq : kept.length;
    if (expired) persist(); // reclaim the dropped rows' bytes immediately
  }());

  const rowAt = (rowSeq) => rows.findIndex((row) => row.seq === rowSeq);

  function release(rowSeq) {
    refresh();
    const id = heldHere.get(rowSeq) ?? rows[rowAt(rowSeq)]?.id;
    heldHere.delete(rowSeq);
    if (id) held.delete(id);
  }

  return {
    /** Live rows — the dispatch path reads this array directly. */
    all() {
      refresh();
      return rows;
    },

    /**
     * Append a row; assigns the FIFO sequence. Throws `QueueNotKept`, with
     * the row taken back out, when storage is there but cannot take it.
     * `held`: the row belongs to a write still running in this page, which
     * no drain sends until it is released (or the page restarts).
     */
    push({ sourceMpId, envelope, bytes, owner, held: holding = false }) {
      refresh();
      seq += 1;
      const id = newRowId();
      rows.push({ sourceMpId, envelope, bytes, seq, id, queuedAt: now(), ...(owner ? { owner } : {}) });
      if (!persist()) {
        rows.pop();
        seq -= 1;
        throw Object.assign(new Error('the offline queue could not be kept on this device'), { name: 'QueueNotKept' });
      }
      if (holding) {
        held.add(id);
        heldHere.set(seq, id);
      }
      return seq;
    },

    /**
     * Remove one row, by its sequence, once its send has settled. Rows stay in
     * storage while they are being sent, so a reload mid-send still has them.
     */
    remove(rowSeq) {
      release(rowSeq);
      const at = rowAt(rowSeq);
      if (at === -1) return false;
      rows.splice(at, 1);
      persist();
      return true;
    },

    /**
     * A drain sent this row and it was not settled: count the attempt on the
     * row, so its receipt reads as tried and not sent, after a reload too.
     * Best effort: a row storage cannot rewrite keeps the count in memory.
     */
    noteAttempt(rowSeq) {
      refresh();
      const row = rows[rowAt(rowSeq)];
      if (!row) return false;
      row.attempts = (Number(row.attempts) || 0) + 1;
      persist();
      return true;
    },

    /** The write holding this row stopped running here; the row stays queued. */
    release,

    /** Whether a write running in this page holds the row. */
    isHeld(row) {
      return !!row?.id && held.has(row.id);
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
      for (const row of rows) if (row.id) held.delete(row.id);
      for (const id of heldHere.values()) held.delete(id);
      heldHere.clear();
      rows = [];
      seq = 0;
      expired = 0;
      persist();
    },
  };
}
