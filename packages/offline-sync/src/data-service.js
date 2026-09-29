/**
 * data-service.js — the small data surface over DataStores:
 *
 *   read(collection, key?)            rows as stored (the paint ceiling applies)
 *   query(collection, spec)           rows by a declared index, in index order
 *   subscribe(target, callback)       the current value now, then on every change
 *   refresh(target, options)          a scheduled, coalesced background sync
 *   mutate(collection, command)       an optimistic write, pushed when possible
 *   purge(collection, options)        clear cached rows (never dirty ones unless forced)
 *   status(target)                    fresh | stale | refreshing | offline | error
 *
 * The host builds one over its domain collections (`<domain>.<collection>`);
 * an MP's DataApi builds one over its own manifest stores, confined to
 * `mp.<mpId>.*`. Rows on disk are display candidates: anything that acts still
 * needs a fresh server answer. Views render from subscriptions; network
 * results are written into the stores first and observed from there.
 */
import { reconcileFetched, windowKeyOf } from './reconcile.js';

export const DATA_STATES = Object.freeze(['fresh', 'stale', 'refreshing', 'offline', 'error']);
const PRIORITIES = { visible: 0, high: 1, normal: 2, background: 3 };
export const DEFAULT_STALE_AFTER_MS = 5 * 60000;

/** Runs work at once, one flight per key. Hosts inject their scheduler instead. */
export function createImmediateScheduler() {
  const flights = new Map();
  return {
    request(job) {
      if (flights.has(job.key)) return flights.get(job.key);
      const flight = Promise.resolve().then(() => job.run(() => true)).finally(() => flights.delete(job.key));
      flights.set(job.key, flight);
      return flight;
    },
  };
}

const serviceError = (message, code) => Object.assign(new Error(message), { name: 'DataServiceError', code });
const same = (a, b) => {
  try { return JSON.stringify(a) === JSON.stringify(b); } catch (_) { return false; }
};

export function createDataService({
  namespace = null,
  resolve,
  scheduler = createImmediateScheduler(),
  feed = null,
  labelOf = (name) => name,
  now = () => Date.now(),
  isOnline = () => true,
  staleAfterMs = DEFAULT_STALE_AFTER_MS,
  onPersistError,
  budgetKey = namespace || 'host',
} = {}) {
  if (typeof resolve !== 'function') throw serviceError('createDataService: resolve(collection) is required', 'DATA_INVALID');
  const sources = new Map();
  const states = new Map();
  const pending = new Map();
  const listeners = new Set();
  let disposed = false;
  const live = () => { if (disposed) throw serviceError('Data service retired', 'DATA_RETIRED'); };

  /** A collection name within this service's namespace, or a thrown refusal. */
  function local(name) {
    if (typeof name !== 'string' || !name) throw serviceError('A collection name is required', 'DATA_INVALID');
    let bare = name;
    if (namespace) {
      if (name.startsWith(`${namespace}.`)) bare = name.slice(namespace.length + 1);
      else if (name.includes('.')) throw serviceError(`'${name}' is outside ${namespace}`, 'DATA_FORBIDDEN');
    }
    const found = resolve(bare);
    if (!found?.store) throw serviceError(`Collection '${name}' is not declared`, 'DATA_UNDECLARED');
    return { name: bare, label: labelOf(bare), ...found };
  }
  const targetOf = (target) => (typeof target === 'string' ? { collection: target } : { ...target });
  const targetKey = (target) => JSON.stringify([target.collection, target.key ?? null, target.window ?? null, target.query ?? null]);
  function stateFor(key) {
    if (!states.has(key)) states.set(key, { state: 'stale', syncedAt: null, error: null, flight: null });
    return states.get(key);
  }
  function describeState(state) {
    let value = state.state;
    if (value !== 'refreshing' && !isOnline()) value = 'offline';
    else if (value === 'fresh' && (state.syncedAt === null || now() - state.syncedAt > staleAfterMs)) value = 'stale';
    return { state: value, syncedAt: state.syncedAt, error: state.error };
  }
  const emitStatus = () => { [...listeners].forEach((listener) => { try { listener(); } catch (_) { /* listener isolation */ } }); };

  async function valueOf(target) {
    const { store } = local(target.collection);
    if (target.query) return (await store.query(target.query.index, target.query, { limit: target.query.limit || 50 })).rows;
    if (target.key !== undefined && target.key !== null) return (await store.get(String(target.key))) ?? null;
    return store.getAll();
  }

  const service = {
    namespace,
    async read(collection, key) {
      live();
      const { store } = local(collection);
      if (Array.isArray(key)) return Promise.all(key.map((item) => store.get(String(item))));
      if (key !== undefined && key !== null) return (await store.get(String(key))) ?? null;
      return store.getAll();
    },
    async query(collection, spec = {}) {
      live();
      const { store } = local(collection);
      const { index, limit = 50, cursor = null, where, ...range } = spec;
      if (index) return store.query(index, range, { limit, cursor });
      const rows = (await store.getAll()).filter((row) => (typeof where === 'function' ? where(row) : true));
      return { rows: rows.slice(0, limit), nextCursor: null, complete: rows.length <= limit };
    },
    /**
     * `target`: a collection name, `{ collection, key }` or
     * `{ collection, query: { index, … } }`. Fires with the current value, then
     * whenever it changes — in this tab or another.
     */
    subscribe(target, callback, { onError } = {}) {
      live();
      const wanted = targetOf(target);
      const { store, label } = local(wanted.collection);
      let active = true;
      let last;
      let seq = 0;
      const emit = () => {
        if (!active) return;
        seq += 1;
        const mine = seq;
        valueOf(wanted).then((value) => {
          if (!active || mine !== seq || (last !== undefined && same(value, last))) return;
          last = value;
          callback(value);
        }).catch((error) => { if (active) { try { onError?.(error); } catch (_) { /* isolated */ } } });
      };
      const offStore = store.subscribe(() => emit());
      const offFeed = feed?.subscribe((event) => {
        if (event.label === label || event.labels?.includes(label) || (event.type === 'purge' && !event.label)) emit();
      });
      emit();
      return () => { active = false; offStore?.(); offFeed?.(); };
    },
    /**
     * Registers how a collection syncs: `fetch(target) → DTO[] | DTO | null`,
     * `toRecord(dto, prev)`, optional `keyOf(dto)` and `scope(target) →
     * row predicate` for list targets (rows in scope that the server no longer
     * returns are pruned; dirty rows never are).
     */
    source(collection, spec) {
      live();
      const { name } = local(collection);
      if (typeof spec?.fetch !== 'function') throw serviceError('source.fetch is required', 'DATA_INVALID');
      sources.set(name, spec);
      return () => { if (sources.get(name) === spec) sources.delete(name); };
    },
    /** Whether `collection` can refresh (a source is registered or declared). */
    hasSource(collection) {
      const { name, decl } = local(collection);
      return !!(sources.get(name) || decl?.source);
    },
    /**
     * A background sync of `target` through the scheduler, coalesced by target.
     * `mode: 'silent'` never rejects (status carries the error); `'visible'`
     * rejects so a surface with nothing to show can say why. `maxAge` skips
     * the fetch while the last successful sync is younger than it.
     */
    refresh(target, { mode = 'silent', priority = 'normal', maxAge = 0, reason = null } = {}) {
      live();
      const wanted = targetOf(target);
      const { name, label, store, decl } = local(wanted.collection);
      const spec = sources.get(name) || decl?.source;
      const key = targetKey({ ...wanted, collection: name });
      const state = stateFor(key);
      const settle = (promise) => (mode === 'visible' ? promise : promise.then(() => service.status(target), () => service.status(target)));
      if (!spec) return settle(Promise.reject(serviceError(`'${wanted.collection}' has no source`, 'DATA_NO_SOURCE')));
      if (maxAge > 0 && state.syncedAt !== null && now() - state.syncedAt < maxAge && state.state !== 'error') return settle(Promise.resolve());
      if (!isOnline()) {
        state.state = 'offline';
        emitStatus();
        return settle(Promise.reject(serviceError('Offline', 'DATA_OFFLINE')));
      }
      if (state.flight) return settle(state.flight);
      state.state = 'refreshing';
      emitStatus();
      const keyPath = decl?.keyPath || 'id';
      const run = async (isCurrent) => {
        if (wanted.key !== undefined && wanted.key !== null) {
          const dto = await spec.fetch(wanted);
          if (!isCurrent()) return;
          const prev = await store.getRaw?.(String(wanted.key));
          if (!dto) {
            if (prev && !prev._dirty) await store.delete(String(wanted.key));
            return;
          }
          const record = (spec.toRecord || ((value) => value))(dto, prev);
          await store.reconcile([record], { scope: () => false });
          return;
        }
        const scope = typeof spec.scope === 'function' ? spec.scope(wanted) : () => true;
        await reconcileFetched(store, keyPath, { fetch: () => spec.fetch(wanted), toRecord: spec.toRecord || ((dto) => dto), keyOf: spec.keyOf },
          scope, wanted.window, windowKeyOf(wanted.window), { onPersistError, rethrow: true });
      };
      state.flight = scheduler.request({
        key: `data:${label}:${key}`, target: label, budgetKey, reason,
        priority: PRIORITIES[priority] ?? PRIORITIES.normal, visible: mode === 'visible', run,
      }).then(() => {
        state.state = 'fresh'; state.syncedAt = now(); state.error = null;
      }, (error) => {
        state.state = isOnline() ? 'error' : 'offline'; state.error = { code: error?.code || null, status: error?.status ?? null, message: error?.message || String(error) };
        throw error;
      }).finally(() => { state.flight = null; emitStatus(); });
      return settle(state.flight);
    },
    /**
     * `{ op: 'put', record } | { op: 'patch', key, patch } | { op: 'delete', key }`.
     * The row is written at once (dirty until the server confirms). With a
     * collection `push(command, record)`, the push runs through the scheduler;
     * `wait: true` resolves after it.
     */
    async mutate(collection, command, { wait = false } = {}) {
      live();
      const { name, label, store, decl } = local(collection);
      const keyPath = decl?.keyPath || 'id';
      let record = null;
      let key;
      if (command?.op === 'put') {
        record = command.record;
        key = String(record?.[keyPath]);
        await store.put(record);
      } else if (command?.op === 'patch') {
        key = String(command.key);
        const previous = await store.getRaw(key);
        record = Object.fromEntries(Object.entries({ ...(previous || {}), ...command.patch }).filter(([field]) => !field.startsWith('_')));
        await store.put(record);
      } else if (command?.op === 'delete') {
        key = String(command.key);
        await store.delete(key);
      } else throw serviceError('mutate: op must be put, patch or delete', 'DATA_INVALID');
      const push = (sources.get(name) || decl?.source)?.push || decl?.push;
      if (typeof push !== 'function') return { key, pushed: false };
      const id = `${label}:${key}`;
      const entry = { collection: name, label, key, op: command.op, attempts: 0, lastError: null, state: 'queued', command, record };
      pending.set(id, entry);
      emitStatus();
      const attempt = () => scheduler.request({
        key: `push:${id}`, target: `push:${label}`, budgetKey, priority: PRIORITIES.high, visible: false,
        run: async (isCurrent) => {
          entry.state = 'sending'; entry.attempts += 1; emitStatus();
          await push(command, record);
          if (!isCurrent()) return;
          if (command.op !== 'delete') await store.markSynced(key);
        },
      }).then(() => { pending.delete(id); emitStatus(); return { key, pushed: true }; }, (error) => {
        entry.state = 'failed'; entry.lastError = { code: error?.code || null, status: error?.status ?? null, message: error?.message || String(error) };
        emitStatus();
        throw error;
      });
      entry.retry = attempt;
      const flight = attempt();
      if (wait) return flight;
      flight.catch(() => {});
      return { key, pushed: false };
    },
    /** Queued and failed pushes, for a pending-sync view. */
    pending(collection = null) {
      return [...pending.values()].filter((entry) => collection === null || entry.collection === local(collection).name)
        .map(({ retry, ...entry }) => ({ ...entry }));
    },
    retry(collection, key) {
      const entry = pending.get(`${local(collection).label}:${String(key)}`);
      return entry ? entry.retry() : Promise.resolve({ key, pushed: false });
    },
    /** Drops a pending local change after an explicit confirm. */
    async discard(collection, key) {
      const { label, store } = local(collection);
      pending.delete(`${label}:${String(key)}`);
      await store.delete(String(key));
      emitStatus();
    },
    /** Clears a collection's cached rows. Dirty rows stay unless `force`. */
    async purge(collection, { force = false } = {}) {
      live();
      const { store } = local(collection);
      const rows = await (store.getAllRaw ? store.getAllRaw() : store.getAll());
      const keyPath = local(collection).decl?.keyPath || 'id';
      const doomed = rows.filter((row) => force || !row._dirty).map((row) => String(row[keyPath]));
      for (const key of doomed) await store.delete(key, { silent: true });
      await store.revalidateSubscribers?.();
      return { removed: doomed };
    },
    status(target) {
      const wanted = targetOf(target);
      const { name } = local(wanted.collection);
      return describeState(stateFor(targetKey({ ...wanted, collection: name })));
    },
    /** Status of every target this service has refreshed. */
    statuses() {
      return [...states.entries()].map(([key, state]) => {
        const [collection, rowKey, window] = JSON.parse(key);
        return { collection, label: labelOf(collection), key: rowKey, window, ...describeState(state) };
      });
    },
    onStatusChange(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    dispose() { disposed = true; listeners.clear(); sources.clear(); pending.clear(); },
  };
  return service;
}
