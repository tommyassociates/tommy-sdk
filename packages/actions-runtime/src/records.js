// Lives in the broker's own store, never an MP-reachable one.

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
    async releaseFields(runId, fields) {
      const current = rows.get(runId);
      if (!current) return;
      const copy = { ...current };
      for (const field of fields) delete copy[field];
      rows.set(runId, copy);
    },
  };
}

// Fields a persisted record never carries.
const REDACTED_FIELDS = ['args', 'result', 'payload', 'lateResult', 'capabilityTokenId'];

const WINDOW_RELEASED_FIELDS = ['result', 'payload', 'lateResult'];

function redact(record, fields = REDACTED_FIELDS) {
  const copy = { ...record };
  for (const field of fields) delete copy[field];
  return copy;
}

const PERSIST_MAX = 200;
const FULL_FIDELITY_MAX = 200;
const STORAGE_KEY = 'mp-action-records';

function webStorage() {
  try {
    return (typeof globalThis !== 'undefined' && globalThis.localStorage) || null;
  } catch (_) {
    return null;
  }
}

// Full fidelity in memory, a redacted projection on disk: payloads never persist.
export function createWebStorageBackend({ storage, max = PERSIST_MAX } = {}) {
  const store = () => (storage === undefined ? webStorage() : storage);
  const rows = new Map();

  let persisted;
  const pending = new Map();
  let timer;
  let eventWindow;
  let eventDocument;
  const stopListening = [];

  function loadPersisted(storage) {
    const raw = storage?.getItem(STORAGE_KEY);
    try {
      const parsed = JSON.parse(raw || 'null');
      if (!Array.isArray(parsed)) return new Map();
      return new Map(parsed.filter((r) => r && r.runId).map((r) => [r.runId, r]));
    } catch (_) {
      return new Map();
    }
  }

  function persistedRows() {
    if (!persisted) {
      try {
        persisted = loadPersisted(store());
      } catch (_) {
        persisted = new Map();
      }
    }
    return persisted;
  }

  function flush() {
    if (timer === undefined) return;
    clearTimeout(timer);
    timer = undefined;
    stopListening.splice(0).forEach((stop) => { try { stop(); } catch (_) { /* the page is gone */ } });
    eventWindow = undefined;
    eventDocument = undefined;
    const storage = store();
    if (!storage) return;
    try {
      const latest = loadPersisted(storage);
      for (const [id, record] of pending) {
        if (record === null) latest.delete(id);
        else latest.set(id, record);
      }
      const all = [...latest.values()].sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0));
      const snapshot = all.slice(-max).map((record) => redact(record));
      storage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
      persisted = new Map(snapshot.map((record) => [record.runId, record]));
      pending.clear();
    } catch (_) {
      // Keep the pending changes for the next flush if storage is briefly unavailable.
    }
  }

  function onVisibilityChange() {
    if (eventDocument?.visibilityState === 'hidden') flush();
  }

  function scheduleFlush() {
    if (timer !== undefined) return;
    timer = setTimeout(flush, 1000);
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      eventWindow = window;
      eventDocument = typeof document !== 'undefined' ? document : undefined;
      const page = eventWindow;
      const doc = eventDocument;
      page.addEventListener('pagehide', flush);
      stopListening.push(page.removeEventListener.bind(page, 'pagehide', flush));
      if (typeof doc?.addEventListener === 'function') {
        doc.addEventListener('visibilitychange', onVisibilityChange);
        stopListening.push(doc.removeEventListener.bind(doc, 'visibilitychange', onVisibilityChange));
      }
    }
  }

  function merged() {
    const out = new Map(persistedRows());
    for (const [id, record] of rows) out.set(id, record);
    return out;
  }

  return {
    async put(record) {
      rows.set(record.runId, record);
      const redacted = redact(record);
      persistedRows().set(record.runId, redacted);
      pending.set(record.runId, redacted);
      scheduleFlush();
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
      persistedRows().delete(runId);
      pending.set(runId, null);
      scheduleFlush();
    },
  };
}

function defaultBackend() {
  return webStorage() ? createWebStorageBackend() : createMemoryBackend();
}

export function createRecordStore({
  backend = defaultBackend(), now = () => Date.now(), retentionMax = 5000, fullFidelityMax = FULL_FIDELITY_MAX,
} = {}) {
  const fullWindow = [];
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
        // eslint-disable-next-line no-await-in-loop
        const old = await backend.get(fallen);
        // eslint-disable-next-line no-await-in-loop
        if (old) await backend.put(redact(old, WINDOW_RELEASED_FIELDS));
      }
    }
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
      // Outside the window a late patch must not resurrect released payloads.
      await backend.put(inWindow.has(runId) ? next : redact(next, WINDOW_RELEASED_FIELDS));
      return next;
    },

    async get(runId) { return backend.get(runId); },

    async query(filter = {}) {
      const all = await backend.all();
      return all
        .filter((r) => Object.entries(filter).every(([k, v]) => r[k] === v))
        .sort((a, b) => b.startedAt - a.startedAt);
    },
  };
}
