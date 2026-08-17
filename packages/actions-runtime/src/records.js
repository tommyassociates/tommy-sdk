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
 * it answers "what ran, when, did it fail" without the tenant payload.
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
  };
}

/** Fields a persisted record NEVER carries — see createWebStorageBackend. */
const REDACTED_FIELDS = ['args', 'result', 'payload'];

const PERSIST_MAX = 200;
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
 * In-session behaviour is UNCHANGED: the memory tier front-runs every read, so
 * the inspector still sees full records for everything this session produced.
 * A reload returns the redacted history, which is strictly more than the
 * nothing it returned before.
 */
export function createWebStorageBackend({ storage, max = PERSIST_MAX } = {}) {
  const store = () => (storage === undefined ? webStorage() : storage);
  const rows = new Map(); // runId -> FULL record (this session only)

  function redact(record) {
    const copy = { ...record };
    for (const field of REDACTED_FIELDS) delete copy[field];
    return copy;
  }

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

export function createRecordStore({ backend = defaultBackend(), now = () => Date.now(), retentionMax = 5000 } = {}) {
  async function put(record) {
    await backend.put(record);
    // Bounded retention (harden assumption): drop oldest beyond the cap.
    if ((await backend.count()) > retentionMax) {
      const all = await backend.all();
      all.sort((a, b) => a.startedAt - b.startedAt);
      const excess = all.length - retentionMax;
      for (let i = 0; i < excess; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        if (backend.delete) await backend.delete(all[i].runId);
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
      await backend.put(next);
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
