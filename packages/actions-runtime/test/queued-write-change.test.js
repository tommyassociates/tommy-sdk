import { describe, it, expect, vi } from 'vitest';
import { createBroker, createFakeIssuer, createDurableQueue, createHostStoreQueue } from '../src/index.js';

const owner = (accountId = '1') => ({ tenantId: `team-${accountId}`, person: '5', accountType: 'Team', accountId });
const entry = (n = 1, accountId = '1') => ({ sourceMpId: 'timesheets', owner: owner(accountId), bytes: 10,
  envelope: { activity: 'timesheets.save', args: { n }, idempotencyKey: `key-${n}` } });
function device() {
  const rows = new Map();
  const backend = {
    async page() { return { epoch: 1, storeRevision: 0, rows: [...rows].map(([key, value]) => ({ key, value })), nextKey: null }; },
    async commit(_before, changes) {
      changes.forEach(({ op, key, value }) => op === 'delete' ? rows.delete(key) : rows.set(key, value));
      return { ok: true };
    },
  };
  return { rows, backend };
}
const brokerFor = (queue, accountId = '1') => createBroker({ capabilityService: createFakeIssuer(), offlineQueue: queue, queueOwner: () => owner(accountId) });
const tick = () => new Promise((done) => setTimeout(done, 0));

describe('committed queue change subscriptions', () => {
  it('notifies after the durable commit and the receipt view, never on a failed commit', async () => {
    const d = device(); const queue = createHostStoreQueue({ backend: d.backend });
    const broker = brokerFor(queue); const seen = [];
    const changed = vi.fn(() => seen.push(broker.queuedWrites('timesheets').length));
    broker.onQueuedWritesChange('timesheets', changed);
    let finish;
    const commit = d.backend.commit;
    vi.spyOn(d.backend, 'commit').mockImplementationOnce(async (...args) => {
      await new Promise((done) => { finish = done; });
      return commit(...args);
    });
    const pending = queue.push(entry());
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    expect(changed).not.toHaveBeenCalled();
    finish(); await pending; await tick();
    expect(changed).toHaveBeenCalledExactlyOnceWith();
    expect(seen).toEqual([1]);
    vi.spyOn(d.backend, 'commit').mockResolvedValueOnce({ ok: false, reason: 'quota' });
    await expect(queue.push(entry(2))).rejects.toMatchObject({ name: 'QueueNotKept' });
    await tick(); expect(changed).toHaveBeenCalledTimes(1);
  });

  it('coalesces a burst, isolates account and MP, and stops on unsubscribe or retirement', async () => {
    const queue = createDurableQueue({ storage: null });
    const a = brokerFor(queue); const b = brokerFor(queue, '2');
    const mine = vi.fn(); const theirs = vi.fn(); const otherMp = vi.fn();
    const off = a.onQueuedWritesChange('timesheets', mine);
    b.onQueuedWritesChange('timesheets', theirs);
    a.onQueuedWritesChange('leave', otherMp);
    queue.push(entry(1)); queue.push(entry(2));
    expect(mine).not.toHaveBeenCalled();
    await tick(); expect(mine).toHaveBeenCalledExactlyOnceWith();
    expect(theirs).not.toHaveBeenCalled(); expect(otherMp).not.toHaveBeenCalled();
    queue.push(entry(3, '2')); await tick();
    expect(theirs).toHaveBeenCalledExactlyOnceWith(); expect(mine).toHaveBeenCalledTimes(1);
    off(); queue.push(entry(4)); await tick(); expect(mine).toHaveBeenCalledTimes(1);
    queue.push(entry(5, '2')); await b.teardown(); await tick(); expect(theirs).toHaveBeenCalledTimes(1);
  });

  it('notifies imported admissions, failed attempts, durable discard and expiry', async () => {
    const d = device(); const queue = createHostStoreQueue({ backend: d.backend, now: () => 100, ttlMs: 10 });
    const broker = brokerFor(queue); const changed = vi.fn(); broker.onQueuedWritesChange('timesheets', changed);
    await queue.importRow({ ...entry(), id: 'imported', seq: 1, queuedAt: 99 }); await tick();
    expect(changed).toHaveBeenCalledTimes(1);
    await queue.noteAttempt(queue.all()[0].seq); await tick(); expect(changed).toHaveBeenCalledTimes(2);
    await broker.discardQueuedWrite('timesheets', 'imported'); await tick(); expect(changed).toHaveBeenCalledTimes(3);
    d.rows.set('stale', { ...entry(2), id: 'stale', seq: 2, queuedAt: 1 });
    const restored = createHostStoreQueue({ backend: d.backend, now: () => 100, ttlMs: 10 });
    const expired = vi.fn(); brokerFor(restored).onQueuedWritesChange('timesheets', expired);
    await restored.ready(); await tick(); expect(expired).toHaveBeenCalledExactlyOnceWith();
    expect(d.rows.size).toBe(0);
  });

  it('does not notify when Web Storage refuses a commit', async () => {
    const queue = createDurableQueue({ storage: { getItem: () => null, setItem() { throw new Error('quota'); } } });
    const changed = vi.fn(); brokerFor(queue).onQueuedWritesChange('timesheets', changed);
    expect(() => queue.push(entry())).toThrow(); await tick(); expect(changed).not.toHaveBeenCalled();
  });
});


it('reports held admission only after the sending state is visible, then its release', async () => {
  const queue = createHostStoreQueue({ backend: device().backend });
  const broker = brokerFor(queue); const seen = [];
  broker.onQueuedWritesChange('timesheets', () => seen.push(broker.queuedWrites('timesheets')[0]?.state));
  const seq = await queue.push({ ...entry(), held: true }); await tick();
  expect(seen).toEqual(['sending']);
  queue.release(seq); await tick(); expect(seen).toEqual(['sending', 'queued']);
});

it('does not acknowledge or notify a failed Web Storage removal', async () => {
  let raw = null; let full = false;
  const queue = createDurableQueue({ storage: { getItem: () => raw, setItem(_key, value) { if (full) throw new Error('disk'); raw = value; } } });
  const broker = brokerFor(queue); const changed = vi.fn(); broker.onQueuedWritesChange('timesheets', changed);
  queue.push(entry()); await tick(); changed.mockClear();
  full = true;
  expect(await broker.discardQueuedWrite('timesheets', queue.all()[0].id)).toBe(false);
  await tick(); expect(changed).not.toHaveBeenCalled(); expect(queue.all()).toHaveLength(1);
});

it.each(['sent', 'refused', 'failed'])('invalidates receipts when replay is %s', async (outcome) => {
  const queue = createHostStoreQueue({ backend: device().backend });
  const issuer = createFakeIssuer(); let token;
  const broker = createBroker({ capabilityService: issuer, offlineQueue: queue, online: false,
    replayEnvelope: async (envelope) => ({ ...envelope, sourceMpId: 'timesheets', instanceId: 'live', capabilityToken: token }),
    serverInvoke: async () => {
      if (outcome !== 'sent') throw Object.assign(new Error(outcome), { status: outcome === 'refused' ? 422 : 503 });
      return {};
    } });
  broker.registerMp({ id: 'timesheets', version: '1.0.0', publisher: { type: 'first_party' }, activities: {
    save: { inputSchema: { type: 'object' }, sideEffect: 'server_write', idempotency: 'client_key', offlineReplayable: true, retry: { maxAttempts: 1 } }
  } });
  token = await issuer.issue('timesheets', '1.0.0', 'team-1', [], 'live');
  await broker.invoke({ ...entry().envelope, sourceMpId: 'timesheets', instanceId: 'live', capabilityToken: token });
  const states = [];
  broker.onQueuedWritesChange('timesheets', () => states.push(broker.queuedWrites('timesheets').map((row) => row.state)));
  broker.setOnline(true); await broker.drainOfflineQueue(); await tick();
  expect(states.at(-1)).toEqual(outcome === 'failed' ? ['failed'] : []);
});

it('notifies the owning broker when another Web Storage handle commits or expires its row', async () => {
  let raw = null;
  const storage = { getItem: () => raw, setItem(_key, value) { raw = value; } };
  const queue = createDurableQueue({ storage, now: () => 1 });
  const broker = brokerFor(queue); const changed = vi.fn(); broker.onQueuedWritesChange('timesheets', changed);
  createDurableQueue({ storage, now: () => 1 }).push(entry()); await tick();
  expect(changed).toHaveBeenCalledTimes(1); expect(broker.queuedWrites('timesheets')).toHaveLength(1);
  createDurableQueue({ storage, now: () => 100, ttlMs: 10 }); await tick();
  expect(changed).toHaveBeenCalledTimes(2); expect(broker.queuedWrites('timesheets')).toHaveLength(0);
});

it('fences a changed owner even when its identity object is mutated in place', async () => {
  const queue = createDurableQueue({ storage: null }); const identity = owner();
  const broker = createBroker({ capabilityService: createFakeIssuer(), offlineQueue: queue, queueOwner: () => identity });
  const changed = vi.fn(); broker.onQueuedWritesChange('timesheets', changed);
  queue.push(entry(1, '2')); Object.assign(identity, owner('2')); await tick();
  expect(changed).not.toHaveBeenCalled();
});
