/**
 * HDF 6b — a replayable server write is kept on the device WHILE it is in
 * flight, not only once its request has failed.
 *
 * On a hung connection (requests never answer, the device still reports itself
 * online) the request neither succeeds nor fails, so a write that entered the
 * durable queue only on a network error was held in memory alone: closing the
 * app lost it. Now its row is in the durable queue before the request goes:
 *   - a restart replays it once, with its ORIGINAL idempotency key;
 *   - while it is still running in this page, a drain leaves it (and the rows
 *     its Mini Program queued after it) alone, so it is never sent twice at once;
 *   - an answered write (applied, or refused) takes its row out again;
 *   - a write whose request never reached the server keeps its row, which the
 *     next drain sends once.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createBroker, createFakeIssuer, createDurableQueue } from '../src/index.js';

const TENANT = 'team-1';

function fakeStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

const activity = (extra = {}) => ({
  description: 'a',
  inputSchema: { type: 'object' },
  resultSchema: { type: 'object' },
  sideEffect: 'server_write',
  idempotency: 'client_key',
  offlineReplayable: true,
  retry: { maxAttempts: 2 },
  ...extra,
});

const networkDown = () => Object.assign(new Error('Network request failed'), { name: 'MpApiError', status: 0 });
const refused = () => Object.assign(new Error('invalid'), { name: 'MpApiError', status: 422 });

/** A request that answers only when the test says so. */
function hungServer() {
  const calls = [];
  const serverInvoke = (envelope) => new Promise((resolve, reject) => {
    calls.push({ envelope, resolve, reject });
  });
  return { calls, serverInvoke };
}

const settle = () => new Promise((resolve) => { setTimeout(resolve, 0); });

let storage;

/** One page: a broker over the device's storage, with this page's own held set. */
async function page(serverInvoke, { activities = { punch: activity() }, held = new Set(), online = true } = {}) {
  const issuer = createFakeIssuer();
  const queue = createDurableQueue({ storage, held });
  const broker = createBroker({
    capabilityService: issuer, serverInvoke, online, offlineQueue: queue, sleep: async () => {},
  });
  broker.registerMp({
    id: 'timeclock', version: '1.0.0', publisher: { type: 'first_party' },
    triggers: {}, conditions: {}, activities, actions: {},
  }, { handlers: { activities: {} } });
  const token = await issuer.issue('timeclock', '1.0.0', TENANT, [], 'i-1');
  const invoke = (name, args = {}, extra = {}) => broker.invoke({
    sourceMpId: 'timeclock', instanceId: 'i-1', capabilityToken: token, activity: `timeclock.${name}`, args, ...extra,
  });
  return { broker, invoke, queue };
}

const storedRows = () => JSON.parse(storage.getItem('mp-offline-queue') || '{"rows":[]}').rows;

beforeEach(() => { storage = fakeStorage(); });

describe('a replayable write in flight is kept on the device', () => {
  it('is in the durable queue while its request hangs, and a restart replays it once with its original key', async () => {
    const hung = hungServer();
    const before = await page(hung.serverInvoke);
    before.invoke('punch', { at: 't1' }, { idempotencyKey: 'k-1' }).catch(() => {});
    await settle();
    expect(hung.calls).toHaveLength(1);
    expect(storedRows()).toHaveLength(1);
    expect(storedRows()[0].envelope.idempotencyKey).toBe('k-1');

    // The app is closed mid-hang: a new page over the same storage.
    const sent = [];
    const after = await page(async (envelope) => {
      sent.push(envelope);
      return { status: 'succeeded', result: { ok: true } };
    });
    expect(after.broker.queueStats().total).toBe(1);
    const drained = await after.broker.drainOfflineQueue();
    expect(drained).toEqual([{ ok: true, result: expect.objectContaining({ status: 'succeeded' }) }]);
    expect(sent).toHaveLength(1);
    expect(sent[0].idempotencyKey).toBe('k-1');
    expect(sent[0].args).toEqual({ at: 't1' });
    expect(storedRows()).toEqual([]);

    await after.broker.drainOfflineQueue();
    expect(sent).toHaveLength(1);
  });

  it('is not sent again by a drain while it is still running in this page', async () => {
    const hung = hungServer();
    const w = await page(hung.serverInvoke);
    const outcome = w.invoke('punch', { at: 't1' }, { idempotencyKey: 'k-1' });
    await settle();
    expect(w.broker.queueStats().total).toBe(1);

    const drained = await w.broker.drainOfflineQueue();
    expect(drained).toEqual([]);
    expect(hung.calls).toHaveLength(1);

    hung.calls[0].resolve({ status: 'succeeded', result: { ok: true } });
    await expect(outcome).resolves.toMatchObject({ status: 'succeeded' });
    expect(w.broker.queueStats().total).toBe(0);
    expect(storedRows()).toEqual([]);
    await w.broker.drainOfflineQueue();
    expect(hung.calls).toHaveLength(1);
  });

  it('is not sent by a second broker of the same page either', async () => {
    const hung = hungServer();
    const held = new Set();
    const w = await page(hung.serverInvoke, { held });
    w.invoke('punch', {}, { idempotencyKey: 'k-1' }).catch(() => {});
    await settle();

    const sent = [];
    const rebuilt = await page(async (envelope) => { sent.push(envelope); return { status: 'succeeded', result: {} }; }, { held });
    await rebuilt.broker.drainOfflineQueue();
    expect(sent).toEqual([]);
    expect(storedRows()).toHaveLength(1);
  });

  it('holds back the rows its Mini Program queued after it', async () => {
    const hung = hungServer();
    const held = new Set();
    const w = await page(hung.serverInvoke, { held });
    w.invoke('punch', { at: 'in' }, { idempotencyKey: 'k-in' }).catch(() => {});
    await settle();
    // A clock-out queued by another page's broker, after the clock-in.
    const offline = await page(async () => ({ status: 'succeeded', result: {} }), { held, online: false });
    await offline.invoke('punch', { at: 'out' }, { idempotencyKey: 'k-out' });
    expect(storedRows().map((row) => row.envelope.args.at)).toEqual(['in', 'out']);

    offline.broker.setOnline(true);
    const drained = await offline.broker.drainOfflineQueue();
    expect(drained).toEqual([]);
    expect(storedRows().map((row) => row.envelope.args.at)).toEqual(['in', 'out']);
  });

  it('is taken out when the server refuses it', async () => {
    const hung = hungServer();
    const w = await page(hung.serverInvoke);
    const outcome = w.invoke('punch', {}, { idempotencyKey: 'k-1' });
    await settle();
    hung.calls[0].reject(refused());
    await expect(outcome).rejects.toMatchObject({ code: 'ActivityFailed' });
    expect(w.broker.queueStats().total).toBe(0);
    expect(storedRows()).toEqual([]);
  });

  it('keeps its row when the request never reached the server, and the next drain sends it once', async () => {
    let up = false;
    const sent = [];
    const w = await page(async (envelope) => {
      if (!up) throw networkDown();
      sent.push(envelope);
      return { status: 'succeeded', result: { ok: true } };
    });
    await expect(w.invoke('punch', { at: 't1' }, { idempotencyKey: 'k-1' })).resolves.toMatchObject({ status: 'queued_offline' });
    expect(storedRows()).toHaveLength(1);

    up = true;
    const drained = await w.broker.drainOfflineQueue();
    expect(drained).toHaveLength(1);
    expect(sent).toHaveLength(1);
    expect(sent[0].idempotencyKey).toBe('k-1');
    expect(storedRows()).toEqual([]);
  });

  it('still runs, held in memory as before, when the device cannot keep its row', async () => {
    const full = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem: () => {} };
    storage = full;
    const w = await page(async () => ({ status: 'succeeded', result: { ok: true } }));
    await expect(w.invoke('punch', {}, { idempotencyKey: 'k-1' })).resolves.toMatchObject({ status: 'succeeded' });
    expect(w.broker.queueStats().total).toBe(0);
  });

  it('is not kept for a write that is not replayable, or that only writes locally', async () => {
    const hung = hungServer();
    const w = await page(hung.serverInvoke, {
      activities: { once: activity({ offlineReplayable: false }) },
    });
    w.invoke('once', {}, { idempotencyKey: 'k-1' }).catch(() => {});
    await settle();
    expect(hung.calls).toHaveLength(1);
    expect(storedRows()).toEqual([]);
  });
});
