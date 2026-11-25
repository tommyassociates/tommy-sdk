const DEFAULT_MAX = 500;

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

    keep({ id, owner, fingerprint, condition, answer, at, seq }) {
      const before = entries.get(id);
      if (before && (before.seq ?? 0) > seq) return false;
      write({ id, owner, fingerprint, condition, answer: copy(answer), at, seq, stale: false });
      return true;
    },

    remove,

    markStale(touched) {
      for (const entry of [...entries.values()]) {
        if (entry.stale || !touched(entry.condition)) continue;
        write({ ...entry, stale: true });
      }
    },

    purge(which = null) {
      for (const entry of [...entries.values()]) if (!which || which(entry)) remove(entry.id);
    },

    flush() { return tail; },
    _size() { return entries.size; },
  };
}
