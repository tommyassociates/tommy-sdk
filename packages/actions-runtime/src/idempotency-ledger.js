// Durable so client_key still dedupes across a reload.

const DEFAULT_MAX = 1000;
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days: a "retry" a week later is a new intent.
const STORAGE_KEY = 'mp-idempotency-ledger';

function webStorage() {
  try {
    return (typeof globalThis !== 'undefined' && globalThis.localStorage) || null;
  } catch (_) {
    return null;
  }
}

function digest(value) {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

// Reads and writes never throw: bad storage degrades to in-memory until reload.
export function createIdempotencyLedger({
  max = DEFAULT_MAX,
  ttlMs = DEFAULT_TTL_MS,
  now = () => Date.now(),
  storage,
} = {}) {
  const store = () => (storage === undefined ? webStorage() : storage);

  function load() {
    const s = store();
    if (!s) return new Map();
    try {
      const raw = s.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || typeof parsed !== 'object') return new Map();
      return new Map(Object.entries(parsed).filter(([, exp]) => typeof exp === 'number'));
    } catch (_) {
      return new Map();
    }
  }

  function save(map) {
    const s = store();
    if (!s) return;
    try {
      s.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(map)));
    } catch (_) {
      /* quota / disabled — degrade to in-memory-until-reload */
    }
  }

  function prune(map) {
    const t = now();
    for (const [k, exp] of map) if (exp <= t) map.delete(k);
    while (map.size > max) {
      const oldest = map.keys().next();
      if (oldest.done) break;
      map.delete(oldest.value);
    }
    return map;
  }

  return {
    has(key) {
      if (!key) return false;
      const map = load();
      const exp = map.get(digest(key));
      if (exp === undefined) return false;
      if (exp <= now()) {
        map.delete(digest(key));
        save(map);
        return false;
      }
      return true;
    },

    add(key) {
      if (!key) return;
      const map = load();
      const h = digest(key);
      map.delete(h);
      map.set(h, now() + ttlMs);
      save(prune(map));
    },

    // Test/diagnostic surface; never used on the dispatch path.
    _size() {
      return prune(load()).size;
    },
    _clear() {
      save(new Map());
    },
  };
}

const EPOCHS_STORAGE_KEY = 'mp-invalidation-epochs';
const EPOCHS_MAX = 500;

// Invalidation epochs must survive a reload too.
export function createInvalidationEpochs({ storage } = {}) {
  const store = () => (storage === undefined ? webStorage() : storage);
  // Storage that silently drops writes would read back 0, so memory is kept and merged.
  const memory = new Map();

  function load() {
    const s = store();
    if (!s) return new Map(memory);
    let disk = new Map();
    try {
      const raw = s.getItem(EPOCHS_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === 'object') {
        disk = new Map(Object.entries(parsed).filter(([, n]) => Number.isFinite(n)));
      }
    } catch (_) {
      disk = new Map();
    }
    // Merge memory over disk even when storage exists but the write failed; never walk an epoch backwards.
    for (const [k, v] of memory) if (!disk.has(k) || v > disk.get(k)) disk.set(k, v);
    return disk;
  }

  function save(map) {
    memory.clear();
    for (const [k, v] of map) memory.set(k, v);
    const s = store();
    if (!s) return;
    try {
      s.setItem(EPOCHS_STORAGE_KEY, JSON.stringify(Object.fromEntries(map)));
    } catch (_) {
      /* quota / disabled — degrade to in-memory-until-reload, never throw on
         the dispatch path. A lost epoch costs a stale replay; a throw here
         would cost the write itself. */
    }
  }

  return {
    get(key) {
      if (!key) return 0;
      return load().get(key) || 0;
    },
    bump(key) {
      if (!key) return 0;
      const map = load();
      const next = (map.get(key) || 0) + 1;
      map.delete(key);
      map.set(key, next);
      while (map.size > EPOCHS_MAX) {
        const oldest = map.keys().next();
        if (oldest.done) break;
        map.delete(oldest.value);
      }
      save(map);
      return next;
    },
    _clear() { memory.clear(); save(new Map()); },
  };
}
