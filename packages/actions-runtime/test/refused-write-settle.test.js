/**
 * A queued write the server refuses for good is handed to the queue's
 * `settle` before anything else hears of it, so a host can keep the refusal in
 * the same commit that removes the row. A page that dies straight after that
 * commit (before `onOfflineOutcome` runs) still has the refusal on the device.
 */
import { describe, it, expect, vi } from 'vitest';
import { createBroker, createFakeIssuer, createHostStoreQueue } from '../src/index.js';
import { SETTLE_RECEIPT_MAX_BYTES } from '../src/host-store-queue.js';

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
  it('commits the settlement before the outcome observer runs, and never removes the row on its own', async () => {
    const d = device();
    const queue = keepingQueue(d.backend);
    const onOfflineOutcome = vi.fn();
    const w = await world(queue, { serverInvoke: async () => { throw Object.assign(new Error('stale'), { status: 409 }); }, onOfflineOutcome });
    await w.invoke(1);
    // Hold the settling commit (the one that writes the receipt) open.
    let release;
    const commit = d.backend.commit;
    vi.spyOn(d.backend, 'commit').mockImplementation(async (snapshot, changes) => {
      if (changes.some((change) => change.key === 'refused:k-1')) await new Promise((done) => { release = done; });
      return commit(snapshot, changes);
    });
    w.broker.setOnline(true);
    const drain = w.broker.drainOfflineQueue();
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    await new Promise((done) => { setTimeout(done, 20); });
    expect(onOfflineOutcome).not.toHaveBeenCalled();
    expect(d.rows.has('refused:k-1')).toBe(false);
    release();
    await drain;
    expect(onOfflineOutcome).toHaveBeenCalledTimes(1);
    expect(d.rows.has('refused:k-1')).toBe(true);
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
    await expect(queue.settle(seq, { receipt: { key: 'refused:k-1', value: { id: 'refused:k-1', kind: 'refused' } } })).resolves.toEqual({ removed: true, receipt: 'written' });
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
    await expect(queue.settle(seq, { receipt: { key: 'refused:k-1', value: { id: 'refused:k-1' } } })).resolves.toEqual({ removed: false, receipt: 'written' });
    expect([...d.rows.keys()]).toEqual(['refused:k-1']);
    await expect(queue.settle(seq, { receipt: { key: 'x', value: { id: 'x', seq: 4 } } })).rejects.toThrow(/without seq/);
    await expect(queue.settle(seq, { receipt: { key: '', value: { id: 'y' } } })).rejects.toThrow(/needs a key/);
  });

  it('without a receipt it removes like remove', async () => {
    const d = device();
    const queue = createHostStoreQueue({ backend: d.backend });
    const seq = await queue.push({ ...entry(1), held: true });
    await expect(queue.settle(seq)).resolves.toEqual({ removed: true, receipt: 'none' });
    expect(d.rows.size).toBe(0);
    expect(queue.all()).toEqual([]);
  });

  it('a receipt too large for the bound gives way to the smaller fallback, then to none, so the queue moves on', async () => {
    const d = device();
    const queue = createHostStoreQueue({ backend: d.backend });
    const big = { key: 'refused:k-1', value: { id: 'refused:k-1', args: 'x'.repeat(SETTLE_RECEIPT_MAX_BYTES) } };
    const small = { key: 'refused:k-1', value: { id: 'refused:k-1', argsOmitted: true } };
    const first = await queue.push(entry(1));
    await expect(queue.settle(first, { receipt: big, fallback: small })).resolves.toEqual({ removed: true, receipt: 'written' });
    expect(d.rows.get('refused:k-1')).toEqual(small.value);
    const second = await queue.push(entry(2));
    await expect(queue.settle(second, { receipt: { ...big, key: 'refused:k-2' } })).resolves.toEqual({ removed: true, receipt: 'none' });
    expect(queue.all()).toEqual([]);
  });

  it('a receipt the store refuses (too large for a row) is retried smaller in a new commit, and the row still goes', async () => {
    const d = device();
    const queue = createHostStoreQueue({ backend: d.backend });
    const seq = await queue.push(entry(1));
    const commit = d.backend.commit;
    vi.spyOn(d.backend, 'commit').mockImplementation(async (snapshot, changes) => (changes.some((change) => change.value?.full)
      ? { ok: false, reason: 'row-capacity' } : commit(snapshot, changes)));
    await expect(queue.settle(seq, {
      receipt: { key: 'refused:k-1', value: { id: 'refused:k-1', full: true } },
      fallback: { key: 'refused:k-1', value: { id: 'refused:k-1' } },
    })).resolves.toEqual({ removed: true, receipt: 'written' });
    expect([...d.rows.values()]).toEqual([{ id: 'refused:k-1' }]);
  });

  it('never writes a receipt over a queued write', async () => {
    const d = device();
    const queue = createHostStoreQueue({ backend: d.backend });
    const one = await queue.push(entry(1));
    await queue.push(entry(2));
    const other = queue.all().find((row) => row.seq !== one);
    await expect(queue.settle(one, { receipt: { key: other.id, value: { id: other.id, kind: 'refused' } } })).resolves.toEqual({ removed: true, receipt: 'none' });
    const reopened = createHostStoreQueue({ backend: d.backend });
    await reopened.ready();
    expect(reopened.all().map((row) => row.envelope.args.n)).toEqual([2]);
  });

  it('keeps an existing receipt, judged in the same commit as the removal', async () => {
    const d = device();
    const queue = createHostStoreQueue({ backend: d.backend });
    const seq = await queue.push(entry(1));
    d.rows.set('refused:k-1', { id: 'refused:k-1', first: true });
    await expect(queue.settle(seq, { receipt: { key: 'refused:k-1', value: { id: 'refused:k-1' } }, keepExisting: true }))
      .resolves.toEqual({ removed: true, receipt: 'kept' });
    expect(d.rows.get('refused:k-1')).toEqual({ id: 'refused:k-1', first: true });
    // Another handle removes the receipt between the read and the commit: the
    // revision fence makes the settlement read again and write it.
    const seq2 = await queue.push(entry(2));
    d.rows.set('refused:k-2', { id: 'refused:k-2', first: true });
    const commit = d.backend.commit;
    let raced = false;
    vi.spyOn(d.backend, 'commit').mockImplementation(async (snapshot, changes) => {
      if (!raced && changes.some((change) => change.key !== undefined)) {
        raced = true;
        await commit({ storeRevision: snapshot.storeRevision }, [{ op: 'delete', key: 'refused:k-2' }]);
      }
      return commit(snapshot, changes);
    });
    await expect(queue.settle(seq2, { receipt: { key: 'refused:k-2', value: { id: 'refused:k-2' } }, keepExisting: true }))
      .resolves.toEqual({ removed: true, receipt: 'written' });
    expect(d.rows.get('refused:k-2')).toEqual({ id: 'refused:k-2' });
  });

  it('a passing store failure rejects at once with the row still queued, holding no turn', async () => {
    const d = device();
    const queue = createHostStoreQueue({ backend: d.backend });
    const seq = await queue.push(entry(1));
    const commit = d.backend.commit;
    let unavailable = 1;
    vi.spyOn(d.backend, 'commit').mockImplementation(async (snapshot, changes) => {
      if (unavailable > 0 && changes.some((change) => change.op === 'put')) { unavailable -= 1; return { ok: false, reason: 'unavailable' }; }
      return commit(snapshot, changes);
    });
    await expect(queue.settle(seq, { receipt: { key: 'refused:k-1', value: { id: 'refused:k-1', full: true } } })).rejects.toMatchObject({ reason: 'unavailable' });
    expect(queue.all()).toHaveLength(1);
    // The queue's turn is free at once: another write goes in.
    await queue.push(entry(2));
    await expect(queue.settle(seq, { receipt: { key: 'refused:k-1', value: { id: 'refused:k-1', full: true } } })).resolves.toEqual({ removed: true, receipt: 'written' });
  });

  function twoMpWorld(queue) {
    const issuer = createFakeIssuer();
    const sent = [];
    const tokens = {};
    const broker = createBroker({
      capabilityService: issuer, offlineQueue: queue, online: false, idempotencyLedger: null,
      serverInvoke: async (envelope) => {
        const mp = String(envelope.activity).split('.')[0];
        sent.push(mp);
        if (mp === 'forms') throw Object.assign(new Error('refused'), { status: 409 });
        return { status: 'succeeded', result: {} };
      },
      replayEnvelope: async (envelope) => ({ ...envelope, instanceId: 'live', capabilityToken: tokens[envelope.sourceMpId] }),
    });
    const queueBoth = async () => {
      for (const id of ['forms', 'notes']) {
        if (!tokens[id]) {
          broker.registerMp({ id, version: '1.0.0', publisher: { type: 'first_party' }, activities: { save: ACTIVITY } });
          // eslint-disable-next-line no-await-in-loop
          tokens[id] = await issuer.issue(id, '1.0.0', 'team-3', [], 'live');
        }
        // eslint-disable-next-line no-await-in-loop
        await broker.invoke({ sourceMpId: id, activity: `${id}.save`, args: {}, idempotencyKey: `k-${id}`, instanceId: 'live', capabilityToken: tokens[id] });
      }
    };
    return { broker, sent, queueBoth };
  }

  it('a settlement the store cannot take holds only its Mini Program; the next drain settles it without sending it again', async () => {
    vi.useFakeTimers();
    try {
      const d = device();
      const queue = createHostStoreQueue({ backend: d.backend });
      const { broker, sent, queueBoth } = twoMpWorld(queue);
      await queueBoth();
      const commit = d.backend.commit;
      let failing = true;
      vi.spyOn(d.backend, 'commit').mockImplementation(async (snapshot, changes) => (failing && changes.some((change) => change.op === 'delete' && queue.all().find((row) => row.id === change.key)?.sourceMpId === 'forms')
        ? { ok: false, reason: 'unavailable' } : commit(snapshot, changes)));
      broker.setOnline(true);
      await broker.drainOfflineQueue();
      expect(sent.sort()).toEqual(['forms', 'notes']);
      expect(queue.all().map((row) => row.sourceMpId)).toEqual(['forms']);
      // The store recovers; the scheduled drain settles the refusal and sends nothing again.
      failing = false;
      await vi.advanceTimersByTimeAsync(2000);
      await vi.waitFor(() => expect(queue.all()).toEqual([]));
      expect(sent.filter((mp) => mp === 'forms')).toHaveLength(1);
      // A drain on reconnect sends nothing either.
      await broker.drainOfflineQueue();
      expect(sent.filter((mp) => mp === 'forms')).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('teardown cancels the scheduled drain: no commit after it', async () => {
    vi.useFakeTimers();
    try {
      const d = device();
      const queue = createHostStoreQueue({ backend: d.backend });
      const { broker, queueBoth } = twoMpWorld(queue);
      await queueBoth();
      const commit = d.backend.commit;
      const spy = vi.spyOn(d.backend, 'commit').mockImplementation(async (snapshot, changes) => (changes.some((change) => change.op === 'delete' && queue.all().find((row) => row.id === change.key)?.sourceMpId === 'forms')
        ? { ok: false, reason: 'unavailable' } : commit(snapshot, changes)));
      broker.setOnline(true);
      await broker.drainOfflineQueue();
      await broker.teardown();
      const before = spy.mock.calls.length;
      await vi.advanceTimersByTimeAsync(10000);
      expect(spy.mock.calls.length).toBe(before);
    } finally {
      vi.useRealTimers();
    }
  });
});
