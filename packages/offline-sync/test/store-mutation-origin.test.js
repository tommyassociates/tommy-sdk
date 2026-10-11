// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import {
  createDataService, createDataStore, createMemoryStoreBackend,
  storeMutationOrigin, withStoreMutationOrigin,
} from '../src/index.js';

const disposers = [];
afterEach(() => disposers.splice(0).reverse().forEach((dispose) => dispose()));
// This sequential memory boundary exercises the service's batch-call context.
// Each row uses the real DataStore predicate and CAS deletion; no physical
// atomic batch or SQLite transaction is exercised by this fixture.
function attachMemoryBatchBoundary(store) {
  store.deleteMany = async (keys, options = {}) => {
    const wanted = [...new Set(keys.map(String))];
    if (wanted.length > 100) throw Object.assign(new Error('Memory batch boundary exceeds 100 rows'), { reason: 'payload-capacity' });
    const keep = options.keep || (() => false);
    return wanted.reduce(async (previous, key) => {
      const removed = await previous;
      const row = await store.getRaw(key);
      if (!row || keep(row)) return removed;
      const revision = Reflect.get(row, '_rev');
      if (!Number.isSafeInteger(revision)) throw new Error('Memory batch row revision unavailable');
      try {
        const deleted = await store.delete(key, withStoreMutationOrigin({
          silent: options.silent === true, expectedRevision: revision, when: (current) => !keep(current),
        }, storeMutationOrigin(options)));
        if (deleted === true) removed.push(key);
      } catch (error) {
        if (error?.reason !== 'conflict') throw error;
      }
      return removed;
    }, Promise.resolve([]));
  };
}
function fixture({ batch = true } = {}) {
  const base = createDataStore({ name: 'chats.messages', backend: createMemoryStoreBackend(), indexes: { bySeq: 'seq' } });
  if (batch) attachMemoryBatchBoundary(base);
  const changes = [];
  const store = new Proxy(base, {
    get(target, property) {
      if (!batch && property === 'deleteMany') return undefined;
      const value = target[property];
      if (property === 'delete' || property === 'deleteMany') {
        return (...args) => {
          changes.push({
            method: property,
            keys: property === 'delete' ? [args[0]] : args[0],
            origin: storeMutationOrigin(args[1]),
            options: args[1],
          });
          return value.apply(target, args);
        };
      }
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const data = createDataService({
    resolve: (name) => (name === 'chats.messages' ? { store, decl: { keyPath: 'id' } } : null),
  });
  disposers.push(() => data.dispose());
  return { data, base, changes };
}
describe('canonical mutation call-context ownership', () => {
  it.each([{ batch: true, force: false }, { batch: false, force: false }, { batch: true, force: true }])('preserves exact opaque context through the existing deletion lane (%j)', async ({ batch, force }) => {
    const { data, base, changes } = fixture({ batch });
    const rows = Array.from({ length: 205 }, (_, at) => ({ id: String(at), seq: at }));
    await data.ingest('chats.messages', rows);
    await base.put({ id: 'dirty', seq: 206, body: 'Authored' });
    const origin = Object.freeze({});
    const options = withStoreMutationOrigin({ keys: [...rows.map((row) => row.id), 'dirty'], force }, origin);
    expect(Object.keys(options).sort()).toEqual(['force', 'keys']);
    const result = await data.purge('chats.messages', options);
    expect(result.removed.length).toBe(force ? 206 : 205);
    expect((await base.getAllRaw()).map((row) => String(row.id))).toEqual(force ? [] : ['dirty']);
    expect(changes.length).toBeGreaterThan(0);
    expect(changes.every((change) => change.origin === origin)).toBe(true);
    if (batch && !force) {
      expect(changes).toHaveLength(3);
      expect(changes.every((change) => change.method === 'deleteMany' && change.keys.length <= 100
        && change.options.silent === true && typeof change.options.keep === 'function')).toBe(true);
    } else {
      expect(changes.every((change) => change.method === 'delete'
        && change.options.silent === true && Number.isSafeInteger(change.options.expectedRevision))).toBe(true);
    }
    if (!force) {
      expect(await base.getRaw('dirty')).toMatchObject({ body: 'Authored', _dirty: true });
    } else {
      expect(await base.getRaw('dirty')).toBeUndefined();
    }
  });
  it('leaves an unmarked ordinary purge and trim unmarked and retains validation', async () => {
    const { data, base, changes } = fixture();
    await data.ingest('chats.messages', [{ id: '1', seq: 1 }, { id: '2', seq: 2 }, { id: '3', seq: 3 }]);
    await data.purge('chats.messages', { keys: ['1'] });
    await data.trim('chats.messages', { index: 'bySeq', keep: 1 });
    expect((await base.getAllRaw()).map((row) => String(row.id))).toEqual(['3']);
    expect(changes.every((change) => change.origin === null)).toBe(true);
    const marked = withStoreMutationOrigin({ keys: ['3'], typo: true }, Object.freeze({}));
    await expect(data.purge('chats.messages', marked)).rejects.toMatchObject({ code: 'DATA_INVALID' });
    expect(storeMutationOrigin(JSON.parse(JSON.stringify(withStoreMutationOrigin({ keys: ['3'] }, {}))))).toBeNull();
  });
  it('does not leak a prior marked context into a failed or later deletion turn', async () => {
    const { data, base, changes } = fixture({ batch: false });
    await data.ingest('chats.messages', [{ id: '1', seq: 1 }]);
    const original = base.delete;
    let once = true;
    base.delete = async (...args) => {
      if (once) { once = false; throw new Error('Storage unavailable'); }
      return original.apply(base, args);
    };
    const origin = {};
    await expect(data.purge('chats.messages', withStoreMutationOrigin({ keys: ['1'] }, origin)))
      .rejects.toThrow('Storage unavailable');
    expect(changes.at(-1).origin).toBe(origin);
    expect((await data.purge('chats.messages', { keys: ['1'] })).removed).toEqual(['1']);
    expect(changes.at(-1).origin).toBeNull();
  });
});
