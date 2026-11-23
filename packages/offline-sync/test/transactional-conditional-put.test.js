// @vitest-environment node
/**
 * A conditional put on a host-store collection (`when(previous)`) is judged
 * on the row read for its commit, and the commit is checked against the store
 * revision, so two handles on the same collection (two tabs) claiming one key
 * at once end with exactly one claim; the other resolves undefined and leaves
 * the row as the winner wrote it.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createDataStore } from '../src/index.js';
import { createHostStorePort } from '../src/host-store/index.js';
import { DATABASES, identity } from './helpers/host-databases.js';

function backendOf(port, options) {
  let handle;
  const ready = () => (handle ||= port.open(options));
  const read = async (input) => {
    const h = await ready();
    const result = await port.read({ handle: h.handle, expectedEpoch: h.epoch, ...input });
    if (result.ok === false) throw Object.assign(new Error(result.reason), { reason: result.reason });
    return result;
  };
  return {
    transactional: true,
    policy: options.policy,
    limits: options.limits,
    snapshot: (keys) => read({ keys }),
    async get(key) {
      const answer = await read({ keys: [String(key)] });
      return answer.rows[0]?.value;
    },
    async getAll() {
      const page = await read({ afterKey: null, limit: 100 });
      return page.rows.map((row) => row.value);
    },
    async commit(snapshot, changes, extra) {
      const h = await ready();
      return port.commit({
        handle: h.handle, expectedEpoch: snapshot.epoch, expectedStoreRevision: snapshot.storeRevision, changes, ...(extra || {}),
      });
    },
    async close() {},
  };
}

const closers = [];
afterEach(async () => { await Promise.all(closers.splice(0).map((close) => close())); });

describe.each(DATABASES)('a conditional put on a host-store collection (%s)', (_name, create) => {
  it('two handles claiming one key at once end with one claim', async () => {
    const database = create();
    closers.push(() => database.close());
    const port = createHostStorePort({ database, backend: database.kind === 'sqlite' ? 'electron_sqlite' : 'indexeddb' });
    const options = {
      identity: identity(), storeName: 'settings', policy: 'authored', schemaVersion: 1, cacheFingerprint: null,
      limits: { maxRows: 1000, maxAgeMs: null, maxBytes: null },
    };
    const tabA = createDataStore({ name: 'settings', keyPath: 'key', backend: backendOf(port, options), syncStrategy: 'last_write_wins' });
    const tabB = createDataStore({ name: 'settings', keyPath: 'key', backend: backendOf(port, options), syncStrategy: 'last_write_wins' });
    const absent = (previous) => previous === undefined || previous === null;
    const [a, b] = await Promise.all([
      tabA.put({ key: 'slot', value: 'a' }, { when: absent }),
      tabB.put({ key: 'slot', value: 'b' }, { when: absent }),
    ]);
    expect([a, b].filter((result) => result === 'slot')).toHaveLength(1);
    expect([a, b].filter((result) => result === undefined)).toHaveLength(1);
    const winner = a === 'slot' ? 'a' : 'b';
    expect((await tabA.get('slot')).value).toBe(winner);
    expect((await tabB.get('slot')).value).toBe(winner);
  });
});
