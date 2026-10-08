// @vitest-environment node
import {
  afterEach, describe, expect, it, vi,
} from 'vitest';
import {
  createDataService, createDataStore, createMemoryStoreBackend,
} from '../src/index.js'; // eslint-disable-line import/extensions
import { utf8Bytes } from '../src/bytes.js'; // eslint-disable-line import/extensions

const COLLECTION = 'forms.named_schemas';
const wholeKey = JSON.stringify([COLLECTION, null, null, null]);
const keyOf = (name) => JSON.stringify([COLLECTION, name, null, null]);
const held = () => {
  let release;
  const promise = new Promise((resolve) => { release = resolve; });
  return { promise, release };
};
const services = [];
afterEach(() => services.splice(0).forEach((data) => data.dispose()));

function fixture({ budget = { maxEntries: 4, maxBytes: 4096 }, fetch, scheduler, principal } = {}) {
  const store = createDataStore({ name: COLLECTION, keyPath: 'name', backend: createMemoryStoreBackend() });
  const data = createDataService({
    resolve: (name) => (name === COLLECTION ? { store, decl: { keyPath: 'name', targetStateBudget: budget } } : null),
    now: () => 1000000,
    ...(scheduler ? { scheduler } : {}),
    ...(principal ? { principal } : {}),
  });
  const read = vi.fn(fetch || (async (target) => (target.key === undefined ? [] : { name: target.key, fields: {} })));
  data.source(COLLECTION, { fetch: read });
  services.push(data);
  const target = (name) => ({ collection: COLLECTION, key: name });
  const ask = (name, options = {}) => data.refresh(target(name), { mode: 'visible', ...options });
  return { data, store, read, target, ask };
}

describe('opt-in exact target status budgets', () => {
  it('does not allocate unknown exact statuses, and retains the whole status separately', () => {
    const { data, target } = fixture();
    for (let index = 0; index < 100; index += 1) {
      expect(data.status(target(`never asked ${index}`))).toEqual({ state: 'stale', syncedAt: null, error: null });
    }
    expect(data.statuses()).toEqual([]);
    expect(data.status(COLLECTION)).toEqual({ state: 'stale', syncedAt: null, error: null });
    expect(data.statuses()).toHaveLength(1);
  });

  it('bounds historical exact statuses while keeping canonical rows and rereading evicted freshness', async () => {
    const { data, ask, target, read } = fixture();
    for (let index = 0; index < 20; index += 1) await ask(`schema ${index}`); // eslint-disable-line no-await-in-loop
    expect(data.statuses()).toHaveLength(4);
    expect(data.statuses().map((entry) => entry.key)).toEqual([null, 'schema 17', 'schema 18', 'schema 19']);
    expect(await data.read(COLLECTION, 'schema 0')).toMatchObject({ name: 'schema 0' });
    expect(data.status(target('schema 0'))).toMatchObject({ syncedAt: null });
    await ask('schema 0', { maxAge: 60000 });
    expect(read.mock.calls.filter(([requested]) => requested.key === 'schema 0')).toHaveLength(2);
    expect(data.statuses()).toHaveLength(4);
  });

  it('touches settled freshness in LRU order without normalizing significant names', async () => {
    const { data, ask, target, read } = fixture({ budget: { maxEntries: 3, maxBytes: 4096 } });
    await ask(' leading/slash ');
    await ask('second');
    expect(data.status(target(' leading/slash ')).state).toBe('fresh');
    await ask('third');
    expect(data.status(target('second')).syncedAt).toBeNull();
    await ask(' leading/slash ', { maxAge: 60000 });
    expect(read.mock.calls.filter(([requested]) => requested.key === ' leading/slash ')).toHaveLength(1);
  });

  it('measures serialized keys in UTF-8 and evicts idle entries to stay within the byte bound', async () => {
    const name = 'การดูแล/🙂';
    const maxBytes = utf8Bytes(wholeKey) + utf8Bytes(keyOf(name));
    const { data, ask, target } = fixture({ budget: { maxEntries: 5, maxBytes } });
    await ask('short');
    await ask(name);
    expect(data.statuses().map((entry) => entry.key)).toEqual([null, name]);
    expect(data.status(target('short')).syncedAt).toBeNull();
    expect(data.statuses().reduce((sum, entry) => sum + utf8Bytes(keyOf(entry.key)), 0)).toBeLessThanOrEqual(maxBytes);
  });

  it('refuses an oversized key before fetching or allocating it', async () => {
    const { data, ask, read } = fixture({ budget: { maxEntries: 5, maxBytes: 100 } });
    await expect(Promise.resolve().then(() => ask('🙂'.repeat(100)))).rejects.toMatchObject({
      code: 'DATA_TARGET_LIMIT', retryable: true,
    });
    expect(read).not.toHaveBeenCalled();
    expect(data.statuses().filter((entry) => entry.key !== null)).toEqual([]);
  });

  it.each([
    { maxEntries: 0, maxBytes: 100 },
    { maxEntries: 1.5, maxBytes: 100 },
    { maxEntries: 2, maxBytes: Infinity },
    { maxEntries: 2 },
  ])('refuses invalid declared budget %j', async (budget) => {
    const { ask, read } = fixture({ budget });
    await expect(Promise.resolve().then(() => ask('one'))).rejects.toMatchObject({ code: 'DATA_INVALID' });
    expect(read).not.toHaveBeenCalled();
  });

  it('pins active and queued reads, coalesces the same key, and recovers capacity after settlement', async () => {
    const gate = held();
    const { data, ask, read, target } = fixture({
      budget: { maxEntries: 2, maxBytes: 4096 },
      fetch: async (requested) => { await gate.promise; return { name: requested.key, fields: {} }; },
    });
    const first = ask('one');
    const shared = ask('one');
    const following = ask('one', { fromNow: true });
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    const saturated = Promise.resolve().then(() => ask('two')).catch((error) => error);
    expect(data.status(target('one')).state).toBe('refreshing');
    gate.release();
    await Promise.all([first, shared, following]);
    expect(await saturated).toMatchObject({ code: 'DATA_TARGET_LIMIT' });
    expect(read).toHaveBeenCalledTimes(2);
    await ask('two');
    expect(data.status(target('two')).state).toBe('fresh');
    expect(data.status(target('one')).syncedAt).toBeNull();
  });

  it('keeps whole access errors pinned while keyed answers succeed and old keys are evicted', async () => {
    const denied = Object.assign(new Error('No access'), { status: 403 });
    const { data, ask } = fixture({
      budget: { maxEntries: 2, maxBytes: 4096 },
      fetch: async (target) => { if (target.key === undefined) throw denied; return { name: target.key, fields: {} }; },
    });
    await expect(data.refresh(COLLECTION, { mode: 'visible' })).rejects.toBe(denied);
    const original = data.status(COLLECTION).error;
    await ask('one');
    await ask('two');
    expect(data.status(COLLECTION).error).toBe(original);
    expect(data.status(COLLECTION).error.status).toBe(403);
    expect(data.statuses()).toHaveLength(2);
  });

  it('keeps a retrying flight pinned after its first failed attempt answers callers', async () => {
    let queued;
    const completion = held();
    const scheduler = {
      request(job) {
        if (queued) return Promise.resolve().then(() => job.run(() => true));
        queued = job;
        Promise.resolve().then(() => job.run(() => true)).catch(() => {});
        return completion.promise;
      },
    };
    const unavailable = Object.assign(new Error('Offline transport'), { status: 0 });
    const fetch = vi.fn().mockRejectedValueOnce(unavailable).mockImplementation(async (requested) => ({ name: requested.key }));
    const { data, ask } = fixture({ budget: { maxEntries: 2, maxBytes: 4096 }, scheduler, fetch });
    await expect(ask('one')).rejects.toBe(unavailable);
    expect(data.idle()).toBe(false);
    const capacity = await Promise.resolve().then(() => ask('two')).catch((error) => error);
    await queued.run(() => true);
    completion.release();
    await vi.waitFor(() => expect(data.idle()).toBe(true));
    expect(capacity).toMatchObject({ code: 'DATA_TARGET_LIMIT' });
    expect(fetch).toHaveBeenCalledTimes(2);
    await ask('two');
  });

  it('bounds absent schema witnesses just like present schemas, without converting evicted status into absence', async () => {
    const { data, ask, target } = fixture({
      budget: { maxEntries: 2, maxBytes: 4096 },
      fetch: async (requested) => ({ name: requested.key, schema: null }),
    });
    await ask('missing one');
    await ask('missing two');
    expect(data.statuses()).toHaveLength(2);
    expect(data.status(target('missing one')).syncedAt).toBeNull();
    expect(await data.read(COLLECTION, 'missing one')).toEqual({ name: 'missing one', schema: null });
    expect(data.statuses()).toHaveLength(2);
  });

  it('does not evict an answer during the final status notification before its callers receive it', async () => {
    const { data, ask, target } = fixture({ budget: { maxEntries: 2, maxBytes: 4096 } });
    let pressure;
    const stop = data.onStatusChange(() => {
      if (data.status(target('one')).state !== 'fresh' || pressure) return;
      pressure = Promise.resolve().then(() => ask('two')).catch((error) => error);
    });
    await ask('one');
    stop();
    expect(await pressure).toMatchObject({ code: 'DATA_TARGET_LIMIT' });
    expect(data.status(target('one')).state).toBe('fresh');
    await ask('two');
  });

  it('bounds retained failure text while preserving pinned whole refusal and stable status pointers', async () => {
    const code = `PermissionDenied${'x'.repeat(10000)}`;
    const message = '🙂'.repeat(10000);
    const { data, ask, target } = fixture({
      budget: { maxEntries: 2, maxBytes: 4096 },
      fetch: async () => { throw Object.assign(new Error(message), { status: 403, code }); },
    });
    await expect(data.refresh(COLLECTION, { mode: 'visible' })).rejects.toMatchObject({ status: 403 });
    const whole = data.status(COLLECTION).error;
    expect(whole.status).toBe(403);
    expect(whole.code.startsWith('PermissionDenied')).toBe(true);
    expect(utf8Bytes(whole.code)).toBeLessThanOrEqual(256);
    expect(utf8Bytes(whole.message)).toBeLessThanOrEqual(2048);
    await expect(ask('one')).rejects.toMatchObject({ status: 403 });
    const exact = data.status(target('one')).error;
    expect(utf8Bytes(exact.message)).toBeLessThanOrEqual(2048);
    expect(data.status(target('one')).error).toBe(exact);
    await expect(ask('two')).rejects.toMatchObject({ status: 403 });
    expect(data.status(COLLECTION).error).toBe(whole);
    expect(data.status(target('one')).error).toBeNull();
  });

  it('releases a request pin if the scheduler throws before accepting a flight', async () => {
    let first = true;
    const scheduler = {
      request(job) {
        if (first) { first = false; throw new Error('Not accepted'); }
        return Promise.resolve().then(() => job.run(() => true));
      },
    };
    const { data, ask, target } = fixture({ budget: { maxEntries: 2, maxBytes: 4096 }, scheduler });
    await expect(Promise.resolve().then(() => ask('one'))).rejects.toThrow('Not accepted');
    await ask('two');
    expect(data.status(target('two')).state).toBe('fresh');
    expect(data.statuses()).toHaveLength(2);
  });

  it('does not change unopted collection status allocation or retained freshness', async () => {
    const ordinary = createDataStore({ name: 'ordinary', backend: createMemoryStoreBackend() });
    const unbounded = createDataService({ resolve: () => ({ store: ordinary, decl: { keyPath: 'id' } }) });
    services.push(unbounded);
    unbounded.source('ordinary', { fetch: async (requested) => ({ id: requested.key }) });
    for (let index = 0; index < 10; index += 1) unbounded.status({ collection: 'ordinary', key: `unread ${index}` });
    expect(unbounded.statuses()).toHaveLength(10);
    await unbounded.refresh({ collection: 'ordinary', key: 'one' }, { mode: 'visible' });
    expect(unbounded.status({ collection: 'ordinary', key: 'one' }).state).toBe('fresh');
  });

  it('reserves a single-entry budget for the collection and refuses exact targets honestly', async () => {
    const { data, ask, read } = fixture({ budget: { maxEntries: 1, maxBytes: 4096 } });
    await data.refresh(COLLECTION, { mode: 'visible' });
    await expect(Promise.resolve().then(() => ask('one'))).rejects.toMatchObject({ code: 'DATA_TARGET_LIMIT' });
    expect(data.status(COLLECTION).state).toBe('fresh');
    expect(data.statuses()).toHaveLength(1);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('keeps each queued form request pinned and sends it with its originally captured principal', async () => {
    let principal = { accountType: 'Team', accountId: '1' };
    const gate = held();
    const sent = [];
    const { data, ask } = fixture({
      budget: { maxEntries: 2, maxBytes: 4096 },
      principal: () => principal,
      fetch: async (requested, context) => {
        sent.push(context.principal);
        if (sent.length === 1) await gate.promise;
        return { name: requested.key };
      },
    });
    const original = ask('one');
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    principal = { accountType: 'TeamMember', accountId: '2' };
    const next = ask('one');
    const limit = Promise.resolve().then(() => ask('two')).catch((error) => error);
    gate.release();
    await Promise.all([original, next]);
    expect(await limit).toMatchObject({ code: 'DATA_TARGET_LIMIT' });
    expect(sent).toEqual([{ accountType: 'Team', accountId: '1' }, { accountType: 'TeamMember', accountId: '2' }]);
    expect(data.statuses()).toHaveLength(2);
  });

  it('does not recreate retired opted-in metadata when a silent held request settles', async () => {
    const gate = held();
    const { data, read, store, target } = fixture({ fetch: async (requested) => { await gate.promise; return { name: requested.key }; } });
    const answer = data.refresh(target('one'));
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    data.dispose();
    gate.release();
    expect(await answer).toMatchObject({ syncedAt: null });
    expect(data.statuses()).toEqual([]);
    expect(data.status(target('one')).syncedAt).toBeNull();
    expect(data.status(COLLECTION).syncedAt).toBeNull();
    expect(data.statuses()).toEqual([]);
    expect(await store.getAll()).toEqual([]);
  });

  it('clears bounded status bookkeeping on dispose and refuses a held retired answer', async () => {
    const gate = held();
    const { data, store, ask, read } = fixture({ fetch: async (requested) => { await gate.promise; return { name: requested.key }; } });
    const answer = ask('one').catch((error) => error);
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    data.dispose();
    gate.release();
    expect(await answer).toMatchObject({ code: 'DATA_RETIRED' });
    expect(data.statuses()).toEqual([]);
    expect(await store.getAll()).toEqual([]);
  });
});
