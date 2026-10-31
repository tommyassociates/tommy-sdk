import { describe, it, expect, vi } from 'vitest';
import { createBroker, createFakeIssuer, createHostStoreQueue } from '../src/index.js';

const copy = (v) => JSON.parse(JSON.stringify(v));
function device() {
  let revision = 0;
  const rows = new Map();
  const backend = {
    async page() { return { epoch: 1, storeRevision: revision, rows: [...rows].map(([key, value]) => ({ key, value: copy(value) })), nextKey: null }; },
    async snapshot(keys) { return { epoch: 1, storeRevision: revision, rows: keys.filter((k) => rows.has(k)).map((key) => ({ key, value: copy(rows.get(key)) })) }; },
    async commit(snapshot, changes) {
      if (snapshot.storeRevision !== revision) return { ok: false, reason: 'conflict' };
      changes.forEach(({ op, key, value }) => { if (op === 'delete') rows.delete(key); else rows.set(key, copy(value)); });
      revision += 1;
      return { ok: true, storeRevision: revision };
    },
  };
  return { backend, rows };
}
const entry = (n = 1) => ({ sourceMpId: 'forms', envelope: { sourceMpId: 'forms', activity: 'forms.save', args: { n }, idempotencyKey: `k-${n}`, capabilityToken: 'secret', identity: { tenantId: 'team-3', tokenId: 'secret' } }, bytes: 10 });
const tick = () => new Promise((done) => setTimeout(done, 0));
async function world(queue, { online = false, serverInvoke = vi.fn(), replayEnvelope } = {}) {
  const issuer = createFakeIssuer();
  const broker = createBroker({ capabilityService: issuer, offlineQueue: queue, online, serverInvoke, replayEnvelope, idempotencyLedger: null });
  broker.registerMp({ id: 'forms', version: '1.0.0', publisher: { type: 'first_party' }, activities: { save: { description: 'save', inputSchema: { type: 'object' }, resultSchema: { type: 'object' }, sideEffect: 'server_write', idempotency: 'client_key', offlineReplayable: true, retry: { maxAttempts: 1 } } } });
  const token = await issuer.issue('forms', '1.0.0', 'team-3', [], 'live');
  return { broker, token, invoke: (n) => broker.invoke({ ...entry(n).envelope, identity: undefined, instanceId: 'live', capabilityToken: token }) };
}

describe('the broker queue on a transactional host backend', () => {
  it('waits for a durable commit before reporting queued, and rejects a failed commit', async () => {
    const d = device();
    let resolve;
    const commit = vi.spyOn(d.backend, 'commit').mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const w = await world(createHostStoreQueue({ backend: d.backend }));
    let settled = false;
    const waiting = w.invoke(1).finally(() => { settled = true; });
    await vi.waitFor(() => expect(commit).toHaveBeenCalled());
    expect(settled).toBe(false);
    resolve({ ok: false, reason: 'quota' });
    await expect(waiting).rejects.toMatchObject({ code: 'Offline_QueueFull' });
    expect(w.broker.queueStats().total).toBe(0);
  });

  it('shares FIFO across two worlds, restores held rows and stores no authority', async () => {
    const d = device();
    const a = createHostStoreQueue({ backend: d.backend });
    const b = createHostStoreQueue({ backend: d.backend });
    await Promise.all([a.push({ ...entry(1), held: true }), b.push(entry(2))]);
    const restarted = createHostStoreQueue({ backend: d.backend, held: new Set() });
    await restarted.ready();
    expect(restarted.all().map((r) => r.envelope.args.n)).toEqual([1, 2]);
    expect(restarted.all().every((r) => !restarted.isHeld(r))).toBe(true);
    expect(JSON.stringify([...d.rows.values()])).not.toContain('secret');
  });

  it('retains transient failures, removes only final refusals and reissues live authority', async () => {
    const d = device();
    const queue = createHostStoreQueue({ backend: d.backend });
    let status = 503;
    let live;
    const serverInvoke = vi.fn(async (envelope) => {
      expect(envelope.capabilityToken).toBe(live.token.token);
      throw Object.assign(new Error('refused'), { status });
    });
    live = await world(queue, { serverInvoke, replayEnvelope: async (envelope) => ({ ...envelope, instanceId: 'live', capabilityToken: live.token }) });
    await live.invoke(1); await live.invoke(2);
    live.broker.setOnline(true);
    await live.broker.drainOfflineQueue();
    expect(queue.all()).toHaveLength(2);
    expect(queue.all()[0].attempts).toBe(1);
    status = 422;
    serverInvoke.mockImplementationOnce(async () => { throw Object.assign(new Error('final'), { status }); })
      .mockImplementationOnce(async () => { throw Object.assign(new Error('retry'), { status: 503 }); });
    await live.broker.drainOfflineQueue();
    expect(queue.all().map((r) => r.envelope.args.n)).toEqual([2]);
  });

  it('waits for removal and joins concurrent drains', async () => {
    const d = device();
    const queue = createHostStoreQueue({ backend: d.backend });
    const w = await world(queue, { serverInvoke: async () => ({ status: 'succeeded', result: {} }) });
    await w.invoke(1);
    let release;
    const original = d.backend.commit;
    vi.spyOn(d.backend, 'commit').mockImplementationOnce(async (...args) => { await new Promise((done) => { release = done; }); return original(...args); });
    w.broker.setOnline(true);
    const drain = w.broker.drainOfflineQueue();
    expect(w.broker.drainOfflineQueue()).toBe(drain);
    let done = false; drain.then(() => { done = true; });
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    await tick(); expect(done).toBe(false);
    release(); await drain;
    expect(queue.all()).toEqual([]);
  });
});


it('acknowledges discard only after commit and retains a row on removal failure', async () => {
  const d = device(); const queue = createHostStoreQueue({ backend: d.backend });
  const w = await world(queue); await w.invoke(1);
  const [receipt] = w.broker.queuedWrites('forms');
  let release;
  vi.spyOn(d.backend, 'commit').mockImplementationOnce(() => new Promise((done) => { release = done; }));
  let settled = false;
  const removing = w.broker.discardQueuedWrite('forms', receipt.id).finally(() => { settled = true; });
  await vi.waitFor(() => expect(release).toBeTypeOf('function'));
  expect(settled).toBe(false); expect(queue.all()).toHaveLength(1);
  release({ ok: false, reason: 'quota' });
  expect(await removing).toBe(false); expect(queue.all()).toHaveLength(1);
  expect(await w.broker.discardQueuedWrite('forms', receipt.id)).toBe(true);
  expect(queue.all()).toEqual([]);
});

it('reports false when another handle already removed the same stable row', async () => {
  const d = device(); const a = createHostStoreQueue({ backend: d.backend });
  await a.push(entry(1));
  const b = createHostStoreQueue({ backend: d.backend }); await b.ready();
  const seq = a.all()[0].seq;
  expect(await a.remove(seq)).toBe(true);
  expect(await b.remove(seq)).toBe(false);
});


it('still sends an online write when the optional held-row store cannot restore', async () => {
  const d = device();
  d.backend.page = async () => { throw new Error('device store unavailable'); };
  const serverInvoke = vi.fn(async () => ({ status: 'succeeded', result: {} }));
  const w = await world(createHostStoreQueue({ backend: d.backend }), { online: true, serverInvoke });
  await expect(w.invoke(1)).resolves.toMatchObject({ status: 'succeeded' });
  expect(serverInvoke).toHaveBeenCalledTimes(1);
});
