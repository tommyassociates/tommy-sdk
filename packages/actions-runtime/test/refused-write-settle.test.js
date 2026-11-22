/**
 * A queued write the server refuses for good is handed to the queue's
 * `settle` before anything else hears of it, so a host can keep the refusal in
 * the same commit that removes the row. A page that dies straight after that
 * commit (before `onOfflineOutcome` runs) still has the refusal on the device.
 */
import { describe, it, expect, vi } from 'vitest';
import { createBroker, createFakeIssuer, createHostStoreQueue } from '../src/index.js';

const copy = (v) => JSON.parse(JSON.stringify(v));
function device() {
  let revision = 0;
  const rows = new Map();
  const backend = {
    async page() { return { epoch: 1, storeRevision: revision, rows: [...rows].map(([key, value]) => ({ key, value: copy(value) })), nextKey: null }; },
    async commit(snapshot, changes) {
      if (snapshot.storeRevision !== revision) return { ok: false, reason: 'conflict' };
      changes.forEach(({ op, key, value }) => { if (op === 'delete') rows.delete(key); else rows.set(key, copy(value)); });
      revision += 1;
      return { ok: true, storeRevision: revision };
    },
  };
  return { backend, rows };
}

const ACTIVITY = {
  description: 'save', inputSchema: { type: 'object' }, resultSchema: { type: 'object' }, sideEffect: 'server_write',
  idempotency: 'client_key', offlineReplayable: true, retry: { maxAttempts: 1 },
};

// A host queue that keeps a refusal as a receipt row in the settling commit.
function keepingQueue(backend) {
  const queue = createHostStoreQueue({ backend });
  return {
    ...queue,
    settle: vi.fn((seq, { envelope, outcome }) => queue.settle(seq, {
      receipt: {
        key: `refused:${envelope.idempotencyKey}`,
        value: { id: `refused:${envelope.idempotencyKey}`, kind: 'refused', activity: envelope.activity, refused: outcome.ok === false },
      },
    })),
    remove: vi.fn((seq) => queue.remove(seq)),
  };
}

async function world(queue, { serverInvoke, onOfflineOutcome } = {}) {
  const issuer = createFakeIssuer();
  const broker = createBroker({
    capabilityService: issuer, offlineQueue: queue, online: false, serverInvoke, onOfflineOutcome, idempotencyLedger: null,
    replayEnvelope: async (envelope) => ({ ...envelope, instanceId: 'live', capabilityToken: token }),
  });
  broker.registerMp({ id: 'forms', version: '1.0.0', publisher: { type: 'first_party' }, activities: { save: ACTIVITY } });
  const token = await issuer.issue('forms', '1.0.0', 'team-3', [], 'live');
  const invoke = (n) => broker.invoke({
    sourceMpId: 'forms', activity: 'forms.save', args: { n }, idempotencyKey: `k-${n}`, instanceId: 'live', capabilityToken: token,
  });
  return { broker, invoke };
}

describe('a queued write refused for good', () => {
  it('is settled by the queue before the outcome observer runs, and never removed on its own', async () => {
    const d = device();
    const queue = keepingQueue(d.backend);
    const order = [];
    queue.settle.mockImplementation(((settle) => (...args) => { order.push('settle'); return settle(...args); })(queue.settle.getMockImplementation()));
    const onOfflineOutcome = vi.fn(() => { order.push('observer'); });
    const w = await world(queue, { serverInvoke: async () => { throw Object.assign(new Error('stale'), { status: 409 }); }, onOfflineOutcome });
    await w.invoke(1);
    w.broker.setOnline(true);
    await w.broker.drainOfflineQueue();
    expect(order).toEqual(['settle', 'observer']);
    expect(queue.remove).not.toHaveBeenCalled();
    expect(queue.settle).toHaveBeenCalledWith(expect.any(Number), expect.objectContaining({
      envelope: expect.objectContaining({ activity: 'forms.save', idempotencyKey: 'k-1' }),
      outcome: expect.objectContaining({ ok: false }),
    }));
    expect(queue.all()).toEqual([]);
  });

  it('keeps its refusal on the device when the page dies straight after the queue settles it', async () => {
    const d = device();
    const queue = keepingQueue(d.backend);
    // The page dies after the broker's queue step: the observer never runs.
    const w = await world(queue, {
      serverInvoke: async () => { throw Object.assign(new Error('locked'), { status: 409 }); },
      onOfflineOutcome: () => { throw new Error('page gone'); },
    });
    await w.invoke(1);
    w.broker.setOnline(true);
    await w.broker.drainOfflineQueue();
    const reopened = createHostStoreQueue({ backend: d.backend });
    await reopened.ready();
    expect(reopened.all()).toEqual([]);
    expect([...d.rows.values()]).toEqual([{ id: 'refused:k-1', kind: 'refused', activity: 'forms.save', refused: true }]);
  });

  it('is removed as before by a queue without settle, and an accepted write is always removed', async () => {
    const d = device();
    const plain = createHostStoreQueue({ backend: d.backend });
    const remove = vi.spyOn(plain, 'remove');
    const w = await world({ ...plain, settle: undefined, remove }, { serverInvoke: async () => { throw Object.assign(new Error('no'), { status: 422 }); } });
    await w.invoke(1);
    w.broker.setOnline(true);
    await w.broker.drainOfflineQueue();
    expect(remove).toHaveBeenCalledTimes(1);
    expect(d.rows.size).toBe(0);

    const kept = keepingQueue(device().backend);
    const ok = await world(kept, { serverInvoke: async () => ({ status: 'succeeded', result: {} }) });
    await ok.invoke(2);
    ok.broker.setOnline(true);
    await ok.broker.drainOfflineQueue();
    expect(kept.settle).not.toHaveBeenCalled();
    expect(kept.remove).toHaveBeenCalledTimes(1);
  });

  it('stays queued when the server did not refuse it for good', async () => {
    const queue = keepingQueue(device().backend);
    const w = await world(queue, { serverInvoke: async () => { throw Object.assign(new Error('gateway'), { status: 502 }); } });
    await w.invoke(1);
    w.broker.setOnline(true);
    await w.broker.drainOfflineQueue();
    expect(queue.settle).not.toHaveBeenCalled();
    expect(queue.all()).toHaveLength(1);
  });
});

describe('createHostStoreQueue settle', () => {
  const entry = (n) => ({ sourceMpId: 'forms', envelope: { sourceMpId: 'forms', activity: 'forms.save', args: { n }, idempotencyKey: `k-${n}` }, bytes: 10 });

  it('removes the row and writes the receipt in one commit, and queue listeners hear only the row', async () => {
    const d = device();
    const queue = createHostStoreQueue({ backend: d.backend });
    const seq = await queue.push(entry(1));
    const commit = vi.spyOn(d.backend, 'commit');
    const heard = vi.fn();
    queue.onChange(heard);
    await expect(queue.settle(seq, { receipt: { key: 'refused:k-1', value: { id: 'refused:k-1', kind: 'refused' } } })).resolves.toBe(true);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit.mock.calls[0][1].map((change) => [change.op, change.key])).toEqual([['delete', expect.any(String)], ['put', 'refused:k-1']]);
    expect([...d.rows.values()]).toEqual([{ id: 'refused:k-1', kind: 'refused' }]);
    await Promise.resolve();
    expect(heard).toHaveBeenCalledTimes(1);
    expect(heard.mock.calls[0][0].map((row) => row.envelope?.args?.n)).toEqual([1]);
  });

  it('keeps the receipt when the row has already gone, and refuses a receipt that would read as a queued row', async () => {
    const d = device();
    const queue = createHostStoreQueue({ backend: d.backend });
    const seq = await queue.push(entry(1));
    await queue.remove(seq);
    await expect(queue.settle(seq, { receipt: { key: 'refused:k-1', value: { id: 'refused:k-1' } } })).resolves.toBe(false);
    expect([...d.rows.keys()]).toEqual(['refused:k-1']);
    await expect(queue.settle(seq, { receipt: { key: 'x', value: { id: 'x', seq: 4 } } })).rejects.toThrow(/without seq/);
    await expect(queue.settle(seq, { receipt: { key: '', value: { id: 'y' } } })).rejects.toThrow(/needs a key/);
  });

  it('without a receipt it removes like remove', async () => {
    const d = device();
    const queue = createHostStoreQueue({ backend: d.backend });
    const seq = await queue.push({ ...entry(1), held: true });
    await expect(queue.settle(seq)).resolves.toBe(true);
    expect(d.rows.size).toBe(0);
    expect(queue.all()).toEqual([]);
  });
});
