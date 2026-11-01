/**
 * D1 (ruled 30 Oct) — pending work after a reload is shown from the action
 * queue's OWN receipts, never a second draft list.
 *
 * A Mini Program's surface reads its own waiting writes (`queuedWrites`) from
 * the durable queue: what is waiting, in order, and whether it is waiting,
 * being sent now, or was tried and not sent. It can discard one that is not on
 * its way (`discardQueuedWrite`). Another Mini Program's rows, and rows of
 * another person or account, are never listed or discarded.
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

const activity = () => ({
  description: 'a',
  inputSchema: { type: 'object' },
  sideEffect: 'server_write',
  idempotency: 'client_key',
  offlineReplayable: true,
  retry: { maxAttempts: 1 },
});

const networkDown = () => Object.assign(new Error('Network request failed'), { name: 'MpApiError', status: 0 });
const settle = () => new Promise((resolve) => { setTimeout(resolve, 0); });

let storage;

/** One page: a broker over the device's storage, as `person`. */
async function page(serverInvoke, { online = false, person = '5', held = new Set() } = {}) {
  const issuer = createFakeIssuer();
  const broker = createBroker({
    capabilityService: issuer,
    serverInvoke,
    online,
    offlineQueue: createDurableQueue({ storage, held }),
    queueOwner: () => ({ tenantId: TENANT, person, accountType: 'Team', accountId: '3' }),
    sleep: async () => {},
  });
  const register = (id) => broker.registerMp({
    id, version: '1.0.0', publisher: { type: 'first_party' }, triggers: {}, conditions: {},
    activities: { save: activity() }, actions: {},
  }, { handlers: { activities: {} } });
  register('timesheets');
  register('leave');
  const tokens = {
    timesheets: await issuer.issue('timesheets', '1.0.0', TENANT, [], 'i-t'),
    leave: await issuer.issue('leave', '1.0.0', TENANT, [], 'i-l'),
  };
  const invoke = (mp, args, key) => broker.invoke({
    sourceMpId: mp, instanceId: mp === 'timesheets' ? 'i-t' : 'i-l', capabilityToken: tokens[mp],
    activity: `${mp}.save`, args, idempotencyKey: key,
  });
  return { broker, invoke };
}

beforeEach(() => { storage = fakeStorage(); });

describe('queued write receipts survive a reload and belong to their Mini Program', () => {
  it('lists this Mini Program\'s waiting writes after a reload, in order, with their args', async () => {
    const first = await page(async () => ({ ok: true }));
    await first.invoke('timesheets', { timesheetId: '11' }, 'k-1');
    await first.invoke('leave', { leaveId: '9' }, 'k-2');
    await first.invoke('timesheets', { timesheetId: '12' }, 'k-3');

    const reloaded = await page(async () => ({ ok: true }));
    const receipts = reloaded.broker.queuedWrites('timesheets');
    expect(receipts.map((row) => [row.activity, row.args.timesheetId, row.state, row.attempts]))
      .toEqual([['timesheets.save', '11', 'queued', 0], ['timesheets.save', '12', 'queued', 0]]);
    expect(receipts.every((row) => typeof row.id === 'string' && typeof row.queuedAt === 'number')).toBe(true);
    expect(reloaded.broker.queuedWrites('leave').map((row) => row.args.leaveId)).toEqual(['9']);
  });

  it('never lists another person\'s waiting writes', async () => {
    const theirs = await page(async () => ({ ok: true }), { person: '6' });
    await theirs.invoke('timesheets', { timesheetId: '11' }, 'k-1');
    const mine = await page(async () => ({ ok: true }));
    expect(mine.broker.queuedWrites('timesheets')).toEqual([]);
  });

  it('a receipt is a copy: changing it changes nothing queued', async () => {
    const first = await page(async () => ({ ok: true }));
    await first.invoke('timesheets', { timesheetId: '11' }, 'k-1');
    first.broker.queuedWrites('timesheets')[0].args.timesheetId = '99';
    expect(first.broker.queuedWrites('timesheets')[0].args.timesheetId).toBe('11');
  });

  it('a write tried and not sent reads failed, after a reload too; a sent one leaves the list', async () => {
    let down = true;
    const sent = [];
    const serverInvoke = async (envelope) => {
      if (down) throw networkDown();
      sent.push(envelope.args.timesheetId);
      return { ok: true };
    };
    const first = await page(serverInvoke);
    await first.invoke('timesheets', { timesheetId: '11' }, 'k-1');
    await first.invoke('timesheets', { timesheetId: '12' }, 'k-2');
    first.broker.setOnline(true);
    await first.broker.drainOfflineQueue();
    // The first was tried; the one behind it waits its turn.
    expect(first.broker.queuedWrites('timesheets').map((row) => [row.state, row.attempts]))
      .toEqual([['failed', 1], ['queued', 0]]);

    const reloaded = await page(serverInvoke, { online: true });
    expect(reloaded.broker.queuedWrites('timesheets')[0]).toMatchObject({ state: 'failed', attempts: 1 });
    down = false;
    await reloaded.broker.drainOfflineQueue();
    expect(sent).toEqual(['11', '12']);
    expect(reloaded.broker.queuedWrites('timesheets')).toEqual([]);
  });

  it('a write on its way reads sending and cannot be discarded', async () => {
    const calls = [];
    const serverInvoke = () => new Promise((resolve) => { calls.push(resolve); });
    const first = await page(serverInvoke, { online: true });
    const running = first.invoke('timesheets', { timesheetId: '11' }, 'k-1');
    await settle();
    const [receipt] = first.broker.queuedWrites('timesheets');
    expect(receipt.state).toBe('sending');
    expect(await first.broker.discardQueuedWrite('timesheets', receipt.id)).toBe(false);
    calls[0]({ ok: true });
    await running;
    expect(first.broker.queuedWrites('timesheets')).toEqual([]);
  });

  it('a row being replayed by a drain reads sending and cannot be discarded', async () => {
    const first = await page(async () => ({ ok: true }));
    await first.invoke('timesheets', { timesheetId: '11' }, 'k-1');
    const calls = [];
    const reloaded = await page(() => new Promise((resolve) => { calls.push(resolve); }), { online: true });
    const drain = reloaded.broker.drainOfflineQueue();
    await settle();
    const [receipt] = reloaded.broker.queuedWrites('timesheets');
    expect(receipt.state).toBe('sending');
    expect(await reloaded.broker.discardQueuedWrite('timesheets', receipt.id)).toBe(false);
    calls[0]({ ok: true });
    await drain;
    expect(reloaded.broker.queuedWrites('timesheets')).toEqual([]);
  });

  it('discards only its own Mini Program\'s waiting row, which is then never sent', async () => {
    const sent = [];
    const first = await page(async (envelope) => { sent.push(envelope.args); return { ok: true }; });
    await first.invoke('timesheets', { timesheetId: '11' }, 'k-1');
    await first.invoke('leave', { leaveId: '9' }, 'k-2');

    const reloaded = await page(async (envelope) => { sent.push(envelope.args); return { ok: true }; });
    const [leaveRow] = reloaded.broker.queuedWrites('leave');
    expect(await reloaded.broker.discardQueuedWrite('timesheets', leaveRow.id)).toBe(false);
    expect(await reloaded.broker.discardQueuedWrite('timesheets', 'no-such-row')).toBe(false);
    const [mine] = reloaded.broker.queuedWrites('timesheets');
    expect(reloaded.broker.discardQueuedWrite('timesheets', 'missing')).toBeInstanceOf(Promise);
    expect(await reloaded.broker.discardQueuedWrite('timesheets', mine.id)).toBe(true);
    expect(reloaded.broker.queuedWrites('timesheets')).toEqual([]);
    expect(reloaded.broker.queueStats().bySource).toEqual({ leave: 1 });

    reloaded.broker.setOnline(true);
    await reloaded.broker.drainOfflineQueue();
    expect(sent).toEqual([{ leaveId: '9' }]);
  });

  it('never discards another person\'s row by its id', async () => {
    const theirs = await page(async () => ({ ok: true }), { person: '6' });
    await theirs.invoke('timesheets', { timesheetId: '11' }, 'k-1');
    const [row] = theirs.broker.queuedWrites('timesheets');
    const mine = await page(async () => ({ ok: true }));
    expect(await mine.broker.discardQueuedWrite('timesheets', row.id)).toBe(false);
    expect(theirs.broker.queuedWrites('timesheets')).toHaveLength(1);
  });
});
