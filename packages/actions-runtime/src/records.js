/**
 * records.js — the action-run record store (actions-runtime.md §5).
 *
 * Lives in the BROKER'S OWN store (`tommy-broker` — offline-sync.md §1),
 * never an MP-reachable one. The backend PICKS ITSELF: Web Storage where it
 * exists, memory in node and tests. `recordBackend` on `createBroker` still
 * overrides it.
 *
 * ⚠ IT DID NOT ALWAYS. This header used to claim "an IndexedDB backend in the
 * shell (the loader supplies it)" — and the shell half was never passed, so
 * for the platform's whole life every run record died with the tab while this
 * file told readers the opposite. That is why the default now detects storage
 * instead of waiting to be handed one: a seam that needs the host to remember
 * something is a seam that rots, and it rotted here first (D.43).
 *
 * What is persisted is REDACTED — no `args`, `result` or `payload`. See
 * createWebStorageBackend: a record is diagnostics, not a pending write, and
 * it answers "what ran, when, did it fail" without the tenant payload. The
 * same projection now bounds the IN-MEMORY tier too (memory audit): only the
 * newest records keep payloads — createRecordStore's full-fidelity window.
 *
 * Client→api sync of these records is the runs/sync drain
 * (contract §3), owned by the loader/inspector stream — this store exposes
 * the query + replay surface the inspector consumes.
 *
 * Record schema pinned at actions-runtime.md:73-84 + §7.1 chain stamps.
 */

let runSeq = 0;
export const nextRunId = () => `run-${Date.now().toString(36)}-${(runSeq += 1)}`;

export function createMemoryBackend() {
  const rows = new Map();
  return {
    async put(record) { rows.set(record.runId, record); },
    async get(runId) { return rows.get(runId); },
    async all() { return [...rows.values()]; },
    async count() { return rows.size; },
    async delete(runId) { rows.delete(runId); },
    /** Atomic field release — see createRecordStore's window: a read-then-write
     *  would clobber a concurrent update() (adversarial review 2026-08-31). */
    async releaseFields(runId, fields) {
      const current = rows.get(runId);
      if (!current) return;
      const copy = { ...current };
      for (const field of fields) delete copy[field];
      rows.set(runId, copy);
    },
  };
}

/** Fields a persisted record NEVER carries — see createWebStorageBackend. */
const REDACTED_FIELDS = ['args', 'result', 'payload'];

/**
 * What the in-memory FULL-FIDELITY WINDOW releases — `result`/`payload` only.
 * `args` STAYS: `broker.replay(runId)` re-dispatches from `record.args`, so
 * releasing them made every run older than the window unreplayable, and worse,
 * an activity with a permissive/absent inputSchema would have re-dispatched a
 * real write with `args === undefined` (adversarial review 2026-08-31).
 * Persistence still drops all three — that tier is disk, this one is not.
 */
const WINDOW_RELEASED_FIELDS = ['result', 'payload'];

/**
 * THE redaction — the persisted tier's projection, and (memory audit) the
 * in-memory tier's too once a record leaves the full-fidelity window below.
 * ONE rule, shared: a second redaction rule is how the two tiers drift.
 */
function redact(record, fields = REDACTED_FIELDS) {
  const copy = { ...record };
  for (const field of fields) delete copy[field];
  return copy;
}

const PERSIST_MAX = 200;
/** How many of the NEWEST records keep full `args`/`result` in memory (memory
 *  audit): a day-long session held payloads for all 5000 retained records. */
const FULL_FIDELITY_MAX = 200;
const STORAGE_KEY = 'mp-action-records';

/** The runtime's Web Storage, or null (node, or access throws when locked down). */
function webStorage() {
  try {
    return (typeof globalThis !== 'undefined' && globalThis.localStorage) || null;
  } catch (_) {
    return null;
  }
}

/**
 * A TIERED backend: full-fidelity in memory for this session, a REDACTED
 * projection on disk so the run history survives a reload (D.43).
 *
 * ⚠ THE REDACTION IS THE POINT, AND IT IS A DELIBERATE DEVIATION FROM THE
 * QUEUE NEXT DOOR. The offline queue persists full envelopes because a queue
 * row IS the pending write — strip the args and you have destroyed the thing
 * you were trying not to lose. A run RECORD is diagnostics: it answers "what
 * ran, when, and did it fail", and it answers that just as well without the
 * payload. So `args`, `result` and `payload` are dropped before anything is
 * written, and the same reasoning that made the idempotency ledger keys-only
 * applies here — there is no reason to put tenant data on disk for a store
 * whose job is observability.
 *
 * In-session reads are still front-run by the memory tier; how long a record
 * KEEPS its payloads there is the record store's call, not this backend's —
 * createRecordStore re-puts records through `redact` once they leave its
 * full-fidelity window (memory audit), and this tier stores what it is given.
 * A reload returns the redacted history, which is strictly more than the
 * nothing it returned before.
 */
export function createWebStorageBackend({ storage, max = PERSIST_MAX } = {}) {
  const store = () => (storage === undefined ? webStorage() : storage);
  const rows = new Map(); // runId -> record AS GIVEN (this session only)

  function loadPersisted() {
    const s = store();
    if (!s) return new Map();
    try {
      const parsed = JSON.parse(s.getItem(STORAGE_KEY) || 'null');
      if (!Array.isArray(parsed)) return new Map();
      return new Map(parsed.filter((r) => r && r.runId).map((r) => [r.runId, r]));
    } catch (_) {
      return new Map(); // corrupt — behave as empty rather than poisoning the path
    }
  }

  function savePersisted(map) {
    const s = store();
    if (!s) return;
    try {
      const all = [...map.values()].sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0));
      s.setItem(STORAGE_KEY, JSON.stringify(all.slice(-max)));
    } catch (_) {
      /* quota / disabled — degrade to memory-until-reload */
    }
  }

  /** Persisted rows merged UNDER the session's full ones (memory wins). */
  function merged() {
    const out = new Map(loadPersisted());
    for (const [id, record] of rows) out.set(id, record);
    return out;
  }

  return {
    async put(record) {
      rows.set(record.runId, record);
      const persisted = loadPersisted();
      persisted.set(record.runId, redact(record));
      savePersisted(persisted);
    },
    async get(runId) {
      return merged().get(runId);
    },
    async all() {
      return [...merged().values()];
    },
    async count() {
      return merged().size;
    },
    async delete(runId) {
      rows.delete(runId);
      const persisted = loadPersisted();
      persisted.delete(runId);
      savePersisted(persisted);
    },
  };
}

/**
 * Default backend picks itself (D.43): Web Storage where it exists, memory in
 * node and tests. Deliberately NOT an injected seam — this store spent the
 * platform's whole life documenting a shell-supplied backend that the shell
 * never passed, which is the failure mode a self-detecting default removes.
 */
function defaultBackend() {
  return webStorage() ? createWebStorageBackend() : createMemoryBackend();
}

export function createRecordStore({
  backend = defaultBackend(), now = () => Date.now(), retentionMax = 5000, fullFidelityMax = FULL_FIDELITY_MAX,
} = {}) {
  // Full-fidelity window (memory audit): only the NEWEST `fullFidelityMax`
  // records keep `args`/`result`/`payload` in the backend. A record that falls
  // out is not lost — it is re-put through `redact`, the SAME projection the
  // persisted tier writes, so the inspector still gets the record (what ran,
  // when, did it fail), minus the tenant payload. The record COUNT cap
  // (`retentionMax`) is unchanged.
  const fullWindow = []; // runIds in open order — oldest first
  const inWindow = new Set();

  async function put(record) {
    await backend.put(record);
    fullWindow.push(record.runId);
    inWindow.add(record.runId);
    while (fullWindow.length > fullFidelityMax) {
      const fallen = fullWindow.shift();
      inWindow.delete(fallen);
      if (backend.releaseFields) {
        // eslint-disable-next-line no-await-in-loop
        await backend.releaseFields(fallen, WINDOW_RELEASED_FIELDS);
      } else {
        // Fallback for a backend without the atomic seam: re-read as LATE as
        // possible so a concurrent update() is the thing we redact, not the
        // thing we clobber.
        // eslint-disable-next-line no-await-in-loop
        const old = await backend.get(fallen);
        // eslint-disable-next-line no-await-in-loop
        if (old) await backend.put(redact(old, WINDOW_RELEASED_FIELDS));
      }
    }
    // Bounded retention (harden assumption): drop oldest beyond the cap.
    if ((await backend.count()) > retentionMax) {
      const all = await backend.all();
      all.sort((a, b) => a.startedAt - b.startedAt);
      const excess = all.length - retentionMax;
      for (let i = 0; i < excess; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        if (backend.delete) await backend.delete(all[i].runId);
        if (inWindow.delete(all[i].runId)) fullWindow.splice(fullWindow.indexOf(all[i].runId), 1);
      }
    }
    return record;
  }

  return {
    /** Open a new run record (status pending). Returns the record. */
    async open(fields) {
      const record = {
        runId: nextRunId(),
        parentRunId: fields.parentRunId,
        txnId: fields.txnId,
        kind: fields.kind,
        triggerName: fields.triggerName,
        conditionName: fields.conditionName,
        activityName: fields.activityName,
        sourceMpId: fields.sourceMpId,
        sourceMpVersion: fields.sourceMpVersion,
        targetMpId: fields.targetMpId,
        tenantId: fields.tenantId,
        capabilityTokenId: fields.capabilityTokenId,
        args: fields.args,
        idempotencyKey: fields.idempotencyKey,
        status: 'pending',
        attempts: 0,
        startedAt: now(),
        online: fields.online !== false,
        // §7.1 chain stamps
        rootRunId: fields.rootRunId,
        depth: fields.depth || 0,
        chainPath: fields.chainPath || [],
      };
      if (!record.rootRunId) record.rootRunId = record.runId;
      await put(record);
      return record;
    },

    async update(runId, patch) {
      const record = await backend.get(runId);
      if (!record) return undefined;
      const next = { ...record, ...patch };
      if (patch.status && ['succeeded', 'failed', 'dead_letter'].includes(patch.status)) {
        next.finishedAt = now();
        next.durationMs = next.finishedAt - next.startedAt;
      }
      // Outside the window a late patch must not resurrect released payloads —
      // but the CALLER still gets what it computed (returning the redacted copy
      // silently dropped `result` from the return value; adversarial review).
      await backend.put(inWindow.has(runId) ? next : redact(next, WINDOW_RELEASED_FIELDS));
      return next;
    },

    async get(runId) { return backend.get(runId); },

    /** Inspector query surface: filter by any record field, newest first. */
    async query(filter = {}) {
      const all = await backend.all();
      return all
        .filter((r) => Object.entries(filter).every(([k, v]) => r[k] === v))
        .sort((a, b) => b.startedAt - a.startedAt);
    },
  };
}
