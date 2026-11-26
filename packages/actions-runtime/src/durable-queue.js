import { createQueueChanges } from './queue-changes.js';
import { QUEUE_TTL_MS } from './constants.js';

// Queued writes resolve to the MP as accepted, so the queue must survive a reload.

const HELD_IN_THIS_PAGE = new Set();
const CHANGES_BY_STORAGE = new WeakMap();
let rowIds = 0;
const newRowId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${(rowIds += 1)}`;

const DEFAULT_TTL_MS = QUEUE_TTL_MS;
const STORAGE_KEY = 'mp-offline-queue';

function webStorage() {
  try {
    return (typeof globalThis !== 'undefined' && globalThis.localStorage) || null;
  } catch (_) {
    return null;
  }
}

// The in-memory array is the working copy; storage is written only when the queue mutates.
const OWNER_KEYS = ['tenantId', 'person', 'accountType', 'accountId'];
const sameOwner = (a, b) => !a || !b || OWNER_KEYS.every((key) => String(a[key] ?? '') === String(b[key] ?? ''));

export function createDurableQueue({
  ttlMs = DEFAULT_TTL_MS, now = () => Date.now(), storage, held = HELD_IN_THIS_PAGE,
} = {}) {
  const store = () => (storage === undefined ? webStorage() : storage);

  const changeStorage = store();
  if (changeStorage && !CHANGES_BY_STORAGE.has(changeStorage)) CHANGES_BY_STORAGE.set(changeStorage, createQueueChanges());
  const changes = changeStorage ? CHANGES_BY_STORAGE.get(changeStorage) : createQueueChanges();
  let rows = [];
  let seq = 0;
  let expired = 0;
  let seen = null;
  const heldHere = new Map();

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
      return null;
    }
  }

  function refresh() {
    const raw = storedText();
    if (raw === undefined || raw === seen) return;
    seen = raw;
    const parsed = parse(raw);
    rows = parsed ? parsed.rows.filter(wellFormed) : [];
    seq = parsed && typeof parsed.seq === 'number' ? Math.max(parsed.seq, seq) : seq;
  }

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
    if (expired && persist()) changes.committed(parsed.rows.filter((row) => !kept.includes(row)));
  }());

  const rowAt = (rowSeq) => rows.findIndex((row) => row.seq === rowSeq);

  function release(rowSeq, notify = true) {
    refresh();
    const id = heldHere.get(rowSeq) ?? rows[rowAt(rowSeq)]?.id;
    heldHere.delete(rowSeq);
    if (id && held.delete(id) && notify) {
      const row = rows.find((candidate) => candidate.id === id);
      if (row) changes.committed([row]);
    }
  }

  return {
    onChange: (callback) => changes.subscribe(callback),
    all() {
      refresh();
      return rows;
    },

    push({ sourceMpId, envelope, bytes, owner, held: holding = false, subject }) {
      refresh();
      // Rows of other accounts never block this one.
      if (typeof subject === 'string' && rows.some((row) => row.subject === subject
        && row.sourceMpId === sourceMpId && row.envelope?.activity === envelope?.activity && sameOwner(row.owner, owner))) return null;
      seq += 1;
      const id = newRowId();
      rows.push({
        sourceMpId, envelope, bytes, seq, id, queuedAt: now(), ...(owner ? { owner } : {}), ...(typeof subject === 'string' ? { subject } : {}),
      });
      if (!persist()) {
        rows.pop();
        seq -= 1;
        throw Object.assign(new Error('the offline queue could not be kept on this device'), { name: 'QueueNotKept' });
      }
      if (holding) {
        held.add(id);
        heldHere.set(seq, id);
      }
      changes.committed([rows[rows.length - 1]]);
      return seq;
    },

    claim(input) {
      return this.push({ ...input, subject: String(input.subject) });
    },

    markUnsettled(rowSeq, unsettled) {
      refresh();
      const row = rows[rowAt(rowSeq)];
      if (!row) return false;
      const before = row.unsettled;
      row.unsettled = { ...unsettled };
      if (!persist()) { if (before === undefined) delete row.unsettled; else row.unsettled = before; return false; }
      changes.committed([row]);
      return true;
    },

    /** Keep a row the server refused for good (`{ refusal, at }`): no drain sends it again; it reads as a refused receipt. */
    markRefused(rowSeq, refused) {
      refresh();
      const row = rows[rowAt(rowSeq)];
      if (!row) return false;
      const before = row.refused;
      row.refused = { refusal: { ...(refused?.refusal || {}) }, at: refused?.at };
      if (!persist()) { if (before === undefined) delete row.refused; else row.refused = before; return false; }
      changes.committed([row]);
      return true;
    },

    /** Hold a queued row for a write running in this page; false when held already or gone. */
    hold(rowSeq) {
      refresh();
      const id = rows[rowAt(rowSeq)]?.id;
      if (!id || held.has(id)) return false;
      held.add(id);
      heldHere.set(rowSeq, id);
      return true;
    },

    remove(rowSeq) {
      refresh();
      const at = rowAt(rowSeq);
      if (at === -1) { release(rowSeq, false); return false; }
      const removed = rows.splice(at, 1);
      if (!persist()) { rows.splice(at, 0, ...removed); return false; }
      release(rowSeq, false);
      changes.committed(removed);
      return true;
    },

    // Best effort: a row storage cannot rewrite keeps the count in memory.
    noteAttempt(rowSeq) {
      refresh();
      const row = rows[rowAt(rowSeq)];
      if (!row) return false;
      row.attempts = (Number(row.attempts) || 0) + 1;
      if (persist()) changes.committed([row]);
      return true;
    },

    release,

    isHeld(row) {
      return !!row?.id && held.has(row.id);
    },

    // Surfaced rather than silent: this is the one path that discards an accepted write.
    expiredOnLoad() {
      return expired;
    },

    // Test/diagnostic surface; never used on the dispatch path.
    _clear() {
      for (const row of rows) if (row.id) held.delete(row.id);
      for (const id of heldHere.values()) held.delete(id);
      heldHere.clear();
      const removed = rows;
      rows = [];
      seq = 0;
      expired = 0;
      if (persist()) changes.committed(removed);
    },
  };
}
