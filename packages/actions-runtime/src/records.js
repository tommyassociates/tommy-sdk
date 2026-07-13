/**
 * records.js — the action-run record store (actions-runtime.md §5).
 *
 * Lives in the BROKER'S OWN store (`tommy-broker` — offline-sync.md §1),
 * never an MP-reachable one. Storage backend is injected: an in-memory
 * backend for tests and node, an IndexedDB backend in the shell (the loader
 * supplies it). Client→api sync of these records is the runs/sync drain
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

export function createRecordStore({ backend = createMemoryBackend(), now = () => Date.now(), retentionMax = 5000 } = {}) {
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
