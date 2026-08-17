/**
 * idempotency-ledger.js — D.39 ruling (c): a DURABLE half for the broker's
 * idempotency ledger, so `client_key` means what it advertises across a reload.
 *
 * THE DEFECT. `processedKeys` (broker.js) is a Map in closure scope, and its own
 * comment says so: "lives only for the lifetime of this broker (no
 * persistence)". `client_key` advertises caller-supplied exactly-once, and the
 * guarantee therefore evaporates across a reload, an app restart, or a retry
 * after a timeout. Fourteen activities declare it. One is user-visible harm:
 * `time-clock.issue_kiosk_pin` ROTATES the PIN, so a double-invocation
 * invalidates the PIN the user just wrote down; three others send a second
 * email.
 *
 * TWO DELIBERATE NARROWINGS, both of which change what this is allowed to hold.
 *
 * 1. KEYS ONLY — NEVER RESULTS (ruled by Gav 2026-08-17). The in-memory ledger
 *    stores each activity's full result so a replay can RETURN it, and making
 *    that durable would write result payloads to localStorage.
 *    `issue_kiosk_pin`'s resultSchema is `{ issued, pin }` — the live credential
 *    — on a device that is frequently a shared kiosk. So the durable layer
 *    SUPPRESSES a repeat rather than replaying it: the caller gets a typed
 *    already-applied with no payload. That is the actual promise of
 *    `client_key` (the write happens once), and re-reading a PIN off disk is
 *    not a behaviour worth preserving. Full in-session replay is untouched —
 *    the Map still front-runs this.
 *
 * 2. `client_key` ONLY. "Keys only" is NOT by itself "no tenant data at rest",
 *    and that is easy to miss: `derived_from_input` keys are
 *    `d-${JSON.stringify(args)}`, so the ARGS ARE INSIDE THE KEY, and
 *    `verify_kiosk_pin` takes `pin` as an input — its key embeds the PIN
 *    verbatim. `natural_key` keys embed an identity value for the same reason.
 *    Only `client_key` keys are caller-supplied opaque tokens, so only those
 *    are persisted. The other strategies keep exactly today's in-memory
 *    behaviour, which is also all D.39 asked for.
 *
 * Keys are HASHED before storage as defence in depth. It is not the primary
 * control — a low-entropy secret stays brute-forceable through any digest,
 * which is precisely why narrowing (2) does the real work and this does not.
 *
 * NO HOST WIRING REQUIRED, deliberately. The record store next door
 * (`records.js`) documents "an IndexedDB backend in the shell" and the shell
 * half was never passed, so its records die with the tab while its header says
 * otherwise (filed as D.43). This detects storage itself and degrades to
 * memory, so there is no second half to forget.
 */

const DEFAULT_MAX = 1000;
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — a "retry" a week later is a new intent.
const STORAGE_KEY = 'mp-idempotency-ledger';

/** The runtime's Web Storage, or null (node, or access throws when locked down). */
function webStorage() {
  try {
    return (typeof globalThis !== 'undefined' && globalThis.localStorage) || null;
  } catch (_) {
    return null;
  }
}

/**
 * FNV-1a, 32-bit, rendered hex. Synchronous by design — the alternative is
 * `crypto.subtle.digest`, which is async and would push an await into the
 * dispatch hot path for a control that is explicitly NOT the one being relied
 * on (see the header). Collisions suppress a write that should have run; at
 * 1000 retained keys the probability is ~1e-4, and the same activity+args would
 * have to collide with an unrelated entry in the same tenant.
 */
function digest(value) {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

/**
 * A bounded, TTL'd set of processed idempotency keys that survives a reload.
 *
 * Reads and writes NEVER throw: storage that is absent, corrupt, disabled or
 * over quota degrades to in-memory-until-reload, which is exactly today's
 * behaviour. A ledger that threw would turn a durability improvement into an
 * outage on the write path.
 *
 * @param {object} [opts]
 * @param {number} [opts.max]    retained entries (FIFO eviction of the oldest)
 * @param {number} [opts.ttlMs]  entry lifetime
 * @param {function} [opts.now]  clock, injectable for tests
 * @param {object|null} [opts.storage] Web Storage override (tests)
 */
export function createIdempotencyLedger({
  max = DEFAULT_MAX,
  ttlMs = DEFAULT_TTL_MS,
  now = () => Date.now(),
  storage,
} = {}) {
  const store = () => (storage === undefined ? webStorage() : storage);

  /** hash -> expiry epoch ms. Insertion order IS eviction order. */
  function load() {
    const s = store();
    if (!s) return new Map();
    try {
      const raw = s.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || typeof parsed !== 'object') return new Map();
      return new Map(Object.entries(parsed).filter(([, exp]) => typeof exp === 'number'));
    } catch (_) {
      return new Map(); // corrupt — behave as empty rather than poisoning the path
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

  /** Drop expired entries, then evict oldest-first down to `max`. */
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
    /** Has this key been processed in a previous (or this) session? */
    has(key) {
      if (!key) return false;
      const map = load();
      const exp = map.get(digest(key));
      if (exp === undefined) return false;
      if (exp <= now()) {          // expired: treat as absent AND reclaim it
        map.delete(digest(key));
        save(map);
        return false;
      }
      return true;
    },

    /** Record a key as processed. */
    add(key) {
      if (!key) return;
      const map = load();
      const h = digest(key);
      map.delete(h);               // re-insert so insertion order stays LRU-ish
      map.set(h, now() + ttlMs);
      save(prune(map));
    },

    /** Test/diagnostic surface — never used on the dispatch path. */
    _size() {
      return prune(load()).size;
    },
    _clear() {
      save(new Map());
    },
  };
}
