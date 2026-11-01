import { QUEUE_MAX_ENTRIES, QUEUE_MAX_BYTES } from './constants.js';

const HELD = new Set();
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
let ids = 0;
const copy = (value) => JSON.parse(JSON.stringify(value));
const notKept = (cause) => Object.assign(new Error('the offline queue could not be kept on this device'), { name: 'QueueNotKept', cause });
const failure = (result) => Object.assign(new Error(result.reason), { reason: result.reason });
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
    let fence;
    do {
      const page = await backend.page({ afterKey, limit: 100, aged: true });
      if (page.ok === false) throw failure(page);
      if (fence && (fence.epoch !== page.epoch || fence.storeRevision !== page.storeRevision)) throw failure({ reason: 'conflict' });
      fence = page;
      found.push(...page.rows.map((row) => row.value));
      afterKey = page.nextKey;
    } while (afterKey !== null);
    return { ...fence, rows: found.filter(valid) };
  }
  async function change(plan) {
    for (let attempt = 0; ; attempt += 1) {
      try {
        const before = await snapshot();
        const action = plan(before.rows);
        if (action.changes.length) {
          const result = await backend.commit(before, action.changes);
          if (result.ok === false) throw failure(result);
        }
        rows = action.rows.sort((a, b) => a.seq - b.seq);
        seq = Math.max(seq, ...rows.map((row) => row.seq), 0);
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
        const partition = found.filter((row) => row.sourceMpId === input.sourceMpId);
        if (partition.length >= QUEUE_MAX_ENTRIES || partition.reduce((sum, row) => sum + (row.bytes || 0), 0) + input.bytes > QUEUE_MAX_BYTES) throw notKept();
        const next = Math.max(seq, ...found.map((row) => row.seq), 0) + 1;
        const row = { id, seq: next, sourceMpId: input.sourceMpId, envelope: envelopeOf(input.envelope), bytes: input.bytes,
          queuedAt: imported ? input.queuedAt : now(), ...(input.owner ? { owner: copy(input.owner) } : {}),
          ...(imported && input.attempts ? { attempts: input.attempts } : {}) };
        return { rows: [...found, row], changes: [{ op: 'put', key: id, value: row }], result: next };
      });
      if (input.held) { held.add(id); heldHere.set(assigned, id); }
      return assigned;
    } catch (cause) { throw cause.name === 'QueueNotKept' ? cause : notKept(cause); }
  }
  function release(rowSeq) {
    const id = heldHere.get(rowSeq) ?? rows.find((row) => row.seq === rowSeq)?.id;
    heldHere.delete(rowSeq);
    if (id) held.delete(id);
  }
  return {
    ready: () => serial(restore),
    all: () => rows,
    push: (input) => serial(() => admit(input)),
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
    close: () => backend.close?.(),
  };
}
