/**
 * condition-answers.js — the last answered value of each `heldFirst`
 * condition, per (queue owner, viewer role fingerprint, condition, canonical
 * arguments), so an asker that passes `onRead` gets it at once while the
 * handler runs again in the background.
 *
 * One entry: { id, owner, fingerprint, condition, answer, at, seq, stale }.
 * `at` is when the answer was read; `seq` orders the reads that produced
 * entries (a read that started before the one an entry came from never
 * replaces it); `stale` is set when a landed write touched a collection the
 * condition reads, and cleared by the next answer.
 *
 * Only answers that validated against the condition's `returnSchema` and do
 * not carry `unresolved: true` are kept (the broker decides). Bounded: at most
 * `maxRows` entries, the least recently written evicted first; no TTL — an old
 * answer is still shown, marked aged. Storage is injected (`{ load(),
 * put(entry), remove(id) }`, sync or async); without one (a kiosk, tests)
 * entries live in memory only. Reads are synchronous from memory after
 * `ready()`; store writes never throw into a read.
 */

const DEFAULT_MAX = 500;

/** FNV-1a 32-bit, hex: the entry id, so a stored entry names no arguments. */
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

function wellFormed(entry) {
  return entry && typeof entry === 'object' && typeof entry.id === 'string' && typeof entry.owner === 'string'
    && typeof entry.condition === 'string' && Number.isFinite(entry.at) && 'answer' in entry;
}

export function createConditionAnswers({ store = null, maxRows = DEFAULT_MAX } = {}) {
  /** id -> entry; insertion order is eviction order. */
  const entries = new Map();
  let loading = null;
  let tail = Promise.resolve();
  const persist = (work) => {
    if (!store) return;
    tail = tail.then(work).catch(() => { /* the memory entry stands */ });
  };

  function evict() {
    while (entries.size > maxRows) {
      const oldest = entries.keys().next();
      if (oldest.done) break;
      entries.delete(oldest.value);
      persist(() => store.remove?.(oldest.value));
    }
  }

  function write(entry) {
    entries.delete(entry.id);
    entries.set(entry.id, entry);
    evict();
    if (entries.get(entry.id) === entry) {
      const kept = copy(entry);
      persist(() => store.put?.(kept));
    }
    return entry;
  }

  function remove(id) {
    if (!entries.delete(id)) return;
    persist(() => store.remove?.(id));
  }

  return {
    idFor: (owner, fingerprint, condition, argsJson) => digest(`${owner}\u0000${fingerprint}\u0000${condition}\u0000${argsJson}`),

    /** Merge what the store holds; an entry already written in memory wins when it is newer. */
    ready() {
      if (!store?.load) return Promise.resolve();
      if (!loading) {
        loading = Promise.resolve().then(() => store.load()).then((rows) => {
          for (const row of (Array.isArray(rows) ? rows : []).filter(wellFormed).sort((a, b) => a.at - b.at)) {
            const held = entries.get(row.id);
            if (held && (held.seq ?? 0) >= (row.seq ?? 0) && held.at >= row.at) continue;
            entries.delete(row.id);
            entries.set(row.id, copy(row));
          }
          evict();
        }).catch(() => { /* an unreadable store leaves memory as it is */ });
      }
      return loading;
    },

    get(id) { return entries.get(id) || null; },

    /** Keep an answer unless an entry from a later-started read is already there. True when kept. */
    keep({ id, owner, fingerprint, condition, answer, at, seq }) {
      const before = entries.get(id);
      if (before && (before.seq ?? 0) > seq) return false;
      write({ id, owner, fingerprint, condition, answer: copy(answer), at, seq, stale: false });
      return true;
    },

    remove,

    /** Mark stale every entry whose condition `touched(condition)` says a landed write affected. */
    markStale(touched) {
      for (const entry of [...entries.values()]) {
        if (entry.stale || !touched(entry.condition)) continue;
        write({ ...entry, stale: true });
      }
    },

    /** Drop every entry, or those `which(entry)` selects. */
    purge(which = null) {
      for (const entry of [...entries.values()]) if (!which || which(entry)) remove(entry.id);
    },

    flush() { return tail; },
    _size() { return entries.size; },
  };
}
