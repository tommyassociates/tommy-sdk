import { createQueueChanges } from './queue-changes.js';
import { QUEUE_MAX_ENTRIES, QUEUE_MAX_BYTES } from './constants.js';

const HELD = new Set();
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
let ids = 0;
const copy = (value) => JSON.parse(JSON.stringify(value));
const notKept = (cause) => Object.assign(new Error('the offline queue could not be kept on this device'), { name: 'QueueNotKept', cause });
const failure = (result) => Object.assign(new Error(result.reason), { reason: result.reason });
// A settled receipt is small and bounded, so it never makes the settling
// commit too large for the store.
export const SETTLE_RECEIPT_MAX_BYTES = 64 * 1024;
const utf8Bytes = (value) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
// The store's refusals that mean a write does not fit (a row, a payload, the
// quota); any other refusal (busy, unavailable, write failed) is passing.
export const DOES_NOT_FIT = Object.freeze(['row-capacity', 'payload-capacity', 'quota']);
const receiptShape = (receipt) => !!receipt && typeof receipt.key === 'string' && !!receipt.key && !!receipt.value
  && typeof receipt.value === 'object' && receipt.value.seq === undefined;
const valid = (row) => row && typeof row.id === 'string' && row.envelope && Number.isFinite(row.queuedAt) && Number.isSafeInteger(row.seq);
// The request's data and stable key survive; authority and deadlines belong to
// the live world that sends it, never to device storage.
const envelopeOf = (envelope) => copy(Object.fromEntries([
  'sourceMpId', 'activity', 'args', 'trigger', 'payload', 'idempotencyKey', 'txnId', 'chain',
].filter((key) => envelope[key] !== undefined).map((key) => [key, envelope[key]])));

/**
 * A row-oriented queue over the host's existing transactional store backend.
 * ready() restores its synchronous receipt view; every mutation reads the
 * current revision and resolves only after the port confirms its commit.
 */
export function createHostStoreQueue({ backend, now = Date.now, ttlMs = TTL_MS, held = HELD } = {}) {
  const changes = createQueueChanges();
  let rows = [];
  let seq = 0;
  let expired = 0;
  let loaded = false;
  let tail = Promise.resolve();
  const heldHere = new Map();
  const serial = (work) => {
    const run = tail.then(work);
    tail = run.catch(() => {});
    return run;
  };
  async function snapshot() {
    const found = [];
    let afterKey = null;
    const keys = new Set();
    let fence;
    do {
      const page = await backend.page({ afterKey, limit: 100, aged: true });
      if (page.ok === false) throw failure(page);
      if (fence && (fence.epoch !== page.epoch || fence.storeRevision !== page.storeRevision)) throw failure({ reason: 'conflict' });
      fence = page;
      found.push(...page.rows.map((row) => row.value));
      page.rows.forEach((row) => keys.add(row.key));
      afterKey = page.nextKey;
    } while (afterKey !== null);
    return { ...fence, rows: found.filter(valid), keys };
  }
  async function change(plan) {
    for (let attempt = 0; ; attempt += 1) {
      try {
        const before = await snapshot();
        const action = plan(before.rows, before);
        if (action.changes.length) {
          const result = await backend.commit(before, action.changes);
          if (result.ok === false) throw failure(result);
        }
        rows = action.rows.sort((a, b) => a.seq - b.seq);
        seq = Math.max(seq, ...rows.map((row) => row.seq), 0);
        action.afterCommit?.();
        if (action.changes.length) {
          // A settled receipt is not a queued row: queue listeners hear only rows.
          changes.committed(action.changes.filter((made) => !action.quiet?.has(made.key))
            .map((made) => made.value || before.rows.find((row) => row.id === made.key)).filter(Boolean));
        }
        return action.result;
      } catch (error) {
        if (error.reason !== 'conflict' || attempt >= 3) throw error;
      }
    }
  }
  async function restore() {
    let count;
    do {
      count = await change((found) => {
        const stale = !loaded ? found.filter((row) => now() - row.queuedAt >= ttlMs).slice(0, 100) : [];
        const dropped = new Set(stale.map((row) => row.id));
        return { rows: found.filter((row) => !dropped.has(row.id)),
          changes: stale.map((row) => ({ op: 'delete', key: row.id })), result: stale.length };
      });
      expired += count;
    } while (count === 100);
    loaded = true;
  }
  async function admit(input, imported = false) {
    const id = imported ? input.id : `${now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${++ids}`;
    try {
      if (!loaded) await restore();
      if (imported && now() - input.queuedAt >= ttlMs) { expired += 1; return null; }
      const assigned = await change((found) => {
        const existing = found.find((row) => row.id === id);
        if (existing) return { rows: found, changes: [], result: existing.seq };
        // A claim for a subject another row of the same activity holds takes nothing.
        if (typeof input.subject === 'string' && found.some((row) => row.subject === input.subject
          && row.sourceMpId === input.sourceMpId && row.envelope?.activity === input.envelope?.activity)) {
          return { rows: found, changes: [], result: null };
        }
        const partition = found.filter((row) => row.sourceMpId === input.sourceMpId);
        if (partition.length >= QUEUE_MAX_ENTRIES || partition.reduce((sum, row) => sum + (row.bytes || 0), 0) + input.bytes > QUEUE_MAX_BYTES) throw notKept();
        const next = Math.max(seq, ...found.map((row) => row.seq), 0) + 1;
        const row = { id, seq: next, sourceMpId: input.sourceMpId, envelope: envelopeOf(input.envelope), bytes: input.bytes,
          queuedAt: imported ? input.queuedAt : now(), ...(input.owner ? { owner: copy(input.owner) } : {}),
          ...(imported && input.attempts ? { attempts: input.attempts } : {}),
          ...(typeof input.subject === 'string' ? { subject: input.subject } : {}),
          ...(imported && input.unsettled ? { unsettled: copy(input.unsettled) } : {}) };
        return { rows: [...found, row], changes: [{ op: 'put', key: id, value: row }], result: next,
          afterCommit: () => { if (input.held) { held.add(id); heldHere.set(next, id); } } };
      });
      if (input.held && assigned !== null) { held.add(id); heldHere.set(assigned, id); }
      return assigned;
    } catch (cause) { throw cause.name === 'QueueNotKept' ? cause : notKept(cause); }
  }
  function release(rowSeq) {
    const id = heldHere.get(rowSeq) ?? rows.find((row) => row.seq === rowSeq)?.id;
    heldHere.delete(rowSeq);
    if (id && held.delete(id)) {
      const row = rows.find((candidate) => candidate.id === id);
      if (row) changes.committed([row]);
    }
  }
  return {
    onChange: (callback) => changes.subscribe(callback),
    ready: () => serial(restore),
    all: () => rows,
    push: (input) => serial(() => admit(input)),
    /**
     * Push a row for `subject` only while no row of the same Mini Program and
     * activity holds that subject, judged in the same revision-checked
     * commit. Resolves its seq, or null when the subject is taken.
     */
    claim: (input) => serial(() => admit({ ...input, subject: String(input.subject) })),
    /**
     * Mark a row as unsettled (`{ reason, at }`): the server's answer did not
     * say whether its write went. It stays queued and no drain sends it.
     */
    markUnsettled(rowSeq, unsettled) {
      const id = rows.find((row) => row.seq === rowSeq)?.id;
      return serial(() => change((found) => {
        const row = found.find((candidate) => candidate.id === id);
        const next = row && { ...row, unsettled: copy(unsettled) };
        return { rows: found.map((candidate) => (candidate.id === id ? next : candidate)),
          changes: next ? [{ op: 'put', key: id, value: next }] : [], result: !!next };
      }));
    },
    /** Hold a queued row for a write running in this page; false when it is held already or gone. */
    hold(rowSeq) {
      const id = rows.find((row) => row.seq === rowSeq)?.id;
      if (!id || held.has(id)) return false;
      held.add(id);
      heldHere.set(rowSeq, id);
      return true;
    },
    importRow: (row) => serial(() => admit(row, true)),
    remove(rowSeq) {
      const id = rows.find((row) => row.seq === rowSeq)?.id;
      return serial(async () => {
        const removed = await change((found) => ({ rows: found.filter((row) => row.id !== id),
          changes: id && found.some((row) => row.id === id) ? [{ op: 'delete', key: id }] : [], result: !!id && found.some((row) => row.id === id) }));
        release(rowSeq);
        return removed;
      });
    },
    /**
     * Settle a queued write the server refused for good: its row is removed
     * and, when `receipt` ({ key, value }, a row without `seq`) is given, the
     * receipt is written in the same commit, so the store never holds neither.
     * The receipt is written even when the row has already gone. With
     * `keepExisting`, a receipt already stored under that key is kept as it
     * is, judged in the same revision-checked commit. A receipt larger than
     * SETTLE_RECEIPT_MAX_BYTES, or one the store refuses as not fitting
     * (DOES_NOT_FIT), is replaced by `fallback` and then by none. Any other
     * store failure rejects at once with the row still queued (the caller
     * asks again later), so a passing failure never drops a refusal and never
     * holds the queue's turn. A key that names a queued write is never
     * written. Resolves
     * `{ removed, receipt: 'written' | 'kept' | 'none' }`.
     */
    settle(rowSeq, { receipt, fallback, keepExisting = false } = {}) {
      const id = rows.find((row) => row.seq === rowSeq)?.id;
      if ((receipt && !receiptShape(receipt)) || (fallback && !receiptShape(fallback))) {
        return Promise.reject(Object.assign(new Error('a settled receipt needs a key and a row without seq'), { name: 'TypeError' }));
      }
      const candidates = [receipt, fallback].filter((one) => one && utf8Bytes(one.value) <= SETTLE_RECEIPT_MAX_BYTES);
      const attempt = (kept) => change((found, before) => {
        const present = !!id && found.some((row) => row.id === id);
        const usable = kept && kept.key !== id && !found.some((row) => row.id === kept.key) ? kept : null;
        const existing = !!usable && keepExisting && before.keys.has(usable.key);
        const writes = usable && !existing ? [{ op: 'put', key: usable.key, value: copy(usable.value) }] : [];
        let written = 'none';
        if (existing) written = 'kept';
        else if (writes.length) written = 'written';
        return {
          rows: found.filter((row) => row.id !== id),
          changes: [...(present ? [{ op: 'delete', key: id }] : []), ...writes],
          quiet: usable ? new Set([usable.key]) : null,
          result: { removed: present, receipt: written },
        };
      });
      // Only a receipt that does not fit falls to the next, smaller one; a
      // refusal of the removal alone is the caller's to handle.
      const tryFrom = (index) => {
        const kept = index < candidates.length ? candidates[index] : null;
        return attempt(kept).catch((error) => {
          if (!kept || !DOES_NOT_FIT.includes(error?.reason)) throw error;
          return tryFrom(index + 1);
        });
      };
      return serial(async () => {
        const settled = await tryFrom(0);
        release(rowSeq);
        return settled;
      });
    },
    noteAttempt(rowSeq) {
      const id = rows.find((row) => row.seq === rowSeq)?.id;
      return serial(() => change((found) => {
        const row = found.find((candidate) => candidate.id === id);
        const next = row && { ...row, attempts: (Number(row.attempts) || 0) + 1 };
        return { rows: found.map((candidate) => candidate.id === id ? next : candidate),
          changes: next ? [{ op: 'put', key: id, value: next }] : [], result: !!next };
      }));
    },
    release,
    isHeld: (row) => !!row?.id && held.has(row.id),
    expiredOnLoad: () => expired,
    close() { changes.clear(); return backend.close?.(); },
  };
}
