import { sha256Hex } from './digest.js';

const DEFAULT_MAX = 500;
const ID = /^[0-9a-f]{64}$/;

const copy = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().filter((key) => value[key] !== undefined).map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

// The definition an answer was kept under: an answer kept for another version or shape is never served.
export function conditionSignature(version, conditionDef) {
  return sha256Hex(canonical({
    version: version ?? null, inputSchema: conditionDef?.inputSchema ?? null, returnSchema: conditionDef?.returnSchema ?? null,
  }));
}

function wellFormed(entry) {
  return entry && typeof entry === 'object' && typeof entry.id === 'string' && ID.test(entry.id) && typeof entry.owner === 'string'
    && typeof entry.condition === 'string' && Number.isFinite(entry.at) && 'answer' in entry;
}

export function createConditionAnswers({ store = null, maxRows = DEFAULT_MAX } = {}) {
  const entries = new Map();
  let loading = null;
  let loaded = false;
  // Purges, removals and stale marks made before the stored rows arrived, applied to them when they do.
  const whileLoading = { purges: [], removed: new Set(), stale: [] };
  // Moves whenever what is held for a condition is purged, removed or marked stale, so a read begun before cannot keep its answer.
  let epochAll = 0;
  const epochs = new Map();
  const bump = (condition) => { epochs.set(condition, (epochs.get(condition) || 0) + 1); };
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
    whileLoading.removed.delete(entry.id);
    evict();
    if (entries.get(entry.id) === entry) {
      const kept = copy(entry);
      persist(() => store.put?.(kept));
    }
    return entry;
  }

  function remove(id) {
    if (!loaded) whileLoading.removed.add(id);
    const entry = entries.get(id);
    if (!entry) return;
    entries.delete(id);
    bump(entry.condition);
    persist(() => store.remove?.(id));
  }

  const matches = (entry, expected) => !expected || ['owner', 'fingerprint', 'condition', 'sig']
    .every((field) => expected[field] === undefined || entry[field] === expected[field]);

  return {
    idFor: (owner, fingerprint, condition, argsJson) => sha256Hex(`${owner}\u0000${fingerprint}\u0000${condition}\u0000${argsJson}`),

    ready() {
      if (!store?.load) { loaded = true; return Promise.resolve(); }
      if (!loading) {
        loading = Promise.resolve().then(() => store.load()).then((rows) => {
          const given = Array.isArray(rows) ? rows : [];
          for (const row of given) {
            if (!wellFormed(row) && typeof row?.id === 'string') persist(() => store.remove?.(row.id));
          }
          for (const stored of given.filter(wellFormed).sort((a, b) => a.at - b.at)) {
            // A sequence orders reads within one session only; every stored answer is older than this session's reads.
            const row = { ...stored, seq: 0 };
            const held = entries.get(row.id);
            if (!held && (whileLoading.removed.has(row.id) || whileLoading.purges.some((which) => !which || which(row)))) {
              persist(() => store.remove?.(row.id));
              continue;
            }
            if (held && held.at >= row.at) continue;
            const stale = row.stale === true || whileLoading.stale.some((touched) => touched(row.condition));
            entries.delete(row.id);
            entries.set(row.id, copy({ ...row, stale }));
          }
          evict();
        }).catch(() => { /* an unreadable store leaves memory as it is */ })
          .finally(() => {
            loaded = true;
            whileLoading.purges = [];
            whileLoading.removed.clear();
            whileLoading.stale = [];
          });
      }
      return loading;
    },

    get(id, expected = null) {
      const entry = entries.get(id);
      return entry && matches(entry, expected) ? entry : null;
    },

    epoch(condition) { return `${epochAll}.${epochs.get(condition) || 0}`; },

    keep({
      id, owner, fingerprint, condition, sig, answer, at, seq,
    }) {
      const before = entries.get(id);
      if (before && (before.seq ?? 0) > seq) return false;
      write({
        id, owner, fingerprint, condition, ...(sig !== undefined ? { sig } : {}), answer: copy(answer), at, seq, stale: false,
      });
      return true;
    },

    remove,

    markStale(touched) {
      if (!loaded) whileLoading.stale.push(touched);
      for (const entry of [...entries.values()]) {
        if (!touched(entry.condition)) continue;
        bump(entry.condition);
        if (!entry.stale) write({ ...entry, stale: true });
      }
    },

    // Bumps a condition's epoch without an entry to mark: a read in flight for it must not keep its answer.
    touch(condition) { bump(condition); },

    purge(which = null) {
      if (!loaded) whileLoading.purges.push(which);
      if (!which) epochAll += 1;
      for (const entry of [...entries.values()]) if (!which || which(entry)) remove(entry.id);
    },

    flush() { return tail; },
    _size() { return entries.size; },
  };
}
