/**
 * An activity that declares `holdUnsettled` has its write kept in the host
 * queue from before its request goes until an answer settles it: one row per
 * Mini Program, activity and subject (the values of its key fields), claimed
 * atomically. A final answer (applied, or a coded refusal it does not hold
 * for) removes the row. An unknown outcome (no answer, a timeout, a 5xx, an
 * uncoded refusal, a hold or keep code) keeps it, marked with why and when,
 * and no drain sends it again. A check again is a dispatch under the row's
 * own key. Rows carry the account captured when they were claimed, and only
 * that account reads or checks them.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createBroker, createFakeIssuer, createDurableQueue, createHostStoreQueue } from '../src/index.js';

const TENANT = 'team-1';
const HOLD = {
  key: ['documentType', 'documentId'], holdCodes: ['SEND_IN_PROGRESS'], keepCodes: ['NOT_FOUND'], settleCodes: ['MAIL_HANDOFF_FAILED'],
};
const send = {
  description: 'send',
  inputSchema: { type: 'object' },
  resultSchema: { type: 'object' },
  sideEffect: 'server_write',
  idempotency: 'client_key',
  offlineReplayable: false,
  retry: { maxAttempts: 1 },
  holdUnsettled: HOLD,
};
const answer = (status, code) => Object.assign(new Error(code || `status ${status}`), {
  name: 'MpApiError', status, ...(code ? { data: { code, message: code } } : {}),
});
const noAnswer = () => Object.assign(new Error('Network request failed'), { name: 'MpApiError', status: 0 });
const settle = () => new Promise((resolve) => { setTimeout(resolve, 0); });

function fakeStorage() {
  const data = new Map();
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
}

let storage;
beforeEach(() => { storage = fakeStorage(); });

async function page(serverInvoke, { owner = { tenantId: TENANT, person: '7', accountType: 'TeamMember', accountId: '5' }, queue } = {}) {
  const issuer = createFakeIssuer();
  const offlineQueue = queue || createDurableQueue({ storage, held: new Set() });
  let holder = owner;
  const broker = createBroker({
    capabilityService: issuer, serverInvoke, online: true, offlineQueue, sleep: async () => {}, queueOwner: () => holder,
  });
  broker.registerMp({
    id: 'invoicing', version: '1.0.0', publisher: { type: 'first_party' }, triggers: {}, conditions: {}, activities: { send_document: send }, actions: {},
  }, { handlers: { activities: {} } });
  const token = await issuer.issue('invoicing', '1.0.0', TENANT, [], 'i-1');
  const invoke = (args, key) => broker.invoke({
    sourceMpId: 'invoicing', instanceId: 'i-1', capabilityToken: token, activity: 'invoicing.send_document', args, idempotencyKey: key,
  });
  const held = (keyFields = { documentType: 'invoice', documentId: '7003' }) => broker.heldWrite('invoicing', 'invoicing.send_document', keyFields);
  return { broker, invoke, held, queue: offlineQueue, become: (next) => { holder = next; } };
}
const body = (extra = {}) => ({ documentType: 'invoice', documentId: '7003', method: 'email', to: ['a@b.test'], message: 'Hi', ...extra });

describe('a held write in the host queue', () => {
  it('claims one row per subject: a second dispatch while one runs is refused and sends nothing', async () => {
    const calls = [];
    const p = await page((envelope) => new Promise((resolve) => { calls.push({ envelope, resolve }); }));
    const first = p.invoke(body(), 'k-1');
    await settle();
    await expect(p.invoke(body({ message: 'again' }), 'k-2')).rejects.toMatchObject({ code: 'WriteHeld' });
    expect(calls).toHaveLength(1);
    expect(p.held()).toMatchObject({ key: 'k-1', reason: 'sending', input: body() });
    calls[0].resolve({ status: 'succeeded', result: { sendId: '1' } });
    await first;
    expect(p.held()).toBe(null);
    expect(p.queue.all()).toHaveLength(0);
  });

  it('an unknown outcome keeps the row, marked with why and when, and no drain sends it again', async () => {
    const sent = [];
    const answers = [noAnswer(), answer(409, 'SEND_IN_PROGRESS'), answer(503), answer(422), answer(404, 'NOT_FOUND')];
    const reasons = ['unconfirmed', 'SEND_IN_PROGRESS', 'unconfirmed', 'unconfirmed', 'NOT_FOUND'];
    for (let at = 0; at < answers.length; at += 1) {
      storage = fakeStorage();
      // eslint-disable-next-line no-await-in-loop
      const p = await page(async (envelope) => { sent.push(envelope); throw answers[at]; });
      // eslint-disable-next-line no-await-in-loop
      const failure = await p.invoke(body(), `k-${at}`).catch((error) => error);
      expect(failure.unsettled, reasons[at]).toEqual({ reason: reasons[at] });
      expect(p.held()).toMatchObject({ key: `k-${at}`, reason: reasons[at], input: body() });
      expect(Number.isFinite(p.held().heldAt)).toBe(true);
      const before = sent.length;
      // eslint-disable-next-line no-await-in-loop
      await p.broker.drainOfflineQueue();
      expect(sent.length).toBe(before);
      expect(p.broker.queuedWrites('invoicing')).toEqual([]);
    }
  });

  it('a final answer removes the row: applied, a coded refusal, or a 5xx it settles for', async () => {
    for (const outcome of [null, answer(409, 'DUPLICATE_SEND'), answer(502, 'MAIL_HANDOFF_FAILED')]) {
      storage = fakeStorage();
      // eslint-disable-next-line no-await-in-loop
      const p = await page(async () => { if (outcome) throw outcome; return { status: 'succeeded', result: { sendId: '1' } }; });
      // eslint-disable-next-line no-await-in-loop
      const result = await p.invoke(body(), 'k-1').catch((error) => error);
      if (outcome) expect(result.unsettled).toBeUndefined();
      expect(p.held()).toBe(null);
      expect(p.queue.all()).toHaveLength(0);
    }
  });

  it('a check again is a dispatch under the row\'s own key, run once at a time, and settles the row', async () => {
    const sent = [];
    let next = noAnswer();
    const p = await page(async (envelope) => { sent.push(envelope); if (next) throw next; return { status: 'succeeded', result: { sendId: '1' } }; });
    await p.invoke(body(), 'k-1').catch(() => {});
    expect(p.held().reason).toBe('unconfirmed');
    // Another key for the same subject is refused while the row is held.
    await expect(p.invoke(body(), 'k-2')).rejects.toMatchObject({ code: 'WriteHeld' });
    next = answer(409, 'SEND_IN_PROGRESS');
    await p.invoke(p.held().input, p.held().key).catch(() => {});
    expect(p.held().reason).toBe('SEND_IN_PROGRESS');
    next = null;
    await p.invoke(p.held().input, 'k-1');
    expect(p.held()).toBe(null);
    expect(sent.map((envelope) => envelope.idempotencyKey)).toEqual(['k-1', 'k-1', 'k-1']);
  });

  it('a row left by a page that closed mid-send reads as unconfirmed in the next page, and is never sent by itself', async () => {
    const hung = [];
    const before = await page((envelope) => new Promise(() => { hung.push(envelope); }));
    before.invoke(body(), 'k-1').catch(() => {});
    await settle();
    const sent = [];
    const after = await page(async (envelope) => { sent.push(envelope); return { status: 'succeeded', result: { sendId: '1' } }; });
    expect(after.held()).toMatchObject({ key: 'k-1', reason: 'unconfirmed' });
    await after.broker.drainOfflineQueue();
    expect(sent).toEqual([]);
  });

  it('only the account that claimed a row reads or checks it', async () => {
    const p = await page(async () => { throw noAnswer(); });
    await p.invoke(body(), 'k-1').catch(() => {});
    expect(p.held()).not.toBe(null);
    p.become({ tenantId: TENANT, person: '7', accountType: 'TeamMember', accountId: '9' });
    expect(p.held()).toBe(null);
    expect(p.broker.heldWrites('invoicing')).toEqual([]);
  });

  it('the host-store queue claims atomically: two claims for one subject keep one row', async () => {
    const rows = new Map();
    let revision = 0;
    const backend = {
      page: async () => ({ ok: true, epoch: 1, storeRevision: revision, rows: [...rows].map(([key, value]) => ({ key, value })), nextKey: null }),
      commit: async (snapshot, changes) => {
        if (snapshot.storeRevision !== revision) return { ok: false, reason: 'conflict' };
        changes.forEach((change) => (change.op === 'delete' ? rows.delete(change.key) : rows.set(change.key, change.value)));
        revision += 1;
        return { ok: true };
      },
    };
    const queue = createHostStoreQueue({ backend, held: new Set() });
    await queue.ready();
    const row = (key) => ({ sourceMpId: 'invoicing', envelope: { activity: 'invoicing.send_document', args: body(), idempotencyKey: key }, bytes: 10, subject: '["invoice","7003"]' });
    const claims = await Promise.all([queue.claim(row('k-1')), queue.claim(row('k-2'))]);
    expect(claims.filter((claimed) => claimed !== null)).toHaveLength(1);
    expect(rows.size).toBe(1);
    expect(await queue.markUnsettled(claims.find((claimed) => claimed !== null), { reason: 'unconfirmed', at: 5 })).toBe(true);
    expect([...rows.values()][0].unsettled).toEqual({ reason: 'unconfirmed', at: 5 });
  });

  it('a success whose row removal failed is cleared by the next check again under that key', async () => {
    const queue = createDurableQueue({ storage, held: new Set() });
    const realRemove = queue.remove.bind(queue);
    let failRemove = true;
    queue.remove = async (seq) => { if (failRemove) { failRemove = false; throw new Error('storage busy'); } return realRemove(seq); };
    const { invoke, held } = await page(async () => ({ status: 'succeeded', result: { sendId: '1' } }), { queue });
    await invoke(body(), 'k-1');
    expect(held()).not.toBe(null);
    const again = await invoke(body(), 'k-1');
    expect(again.idempotentReplay).toBe(true);
    expect(held()).toBe(null);
    // A new send for that document is no longer refused as held.
    await expect(invoke(body(), 'k-2')).resolves.toMatchObject({ status: 'succeeded' });
  });

  it('a check again under the held key with another body is refused and sends nothing', async () => {
    const calls = [];
    const { invoke, held } = await page(async (input) => { calls.push(input); throw noAnswer(); });
    await expect(invoke(body(), 'k-1')).rejects.toMatchObject({ unsettled: { reason: 'unconfirmed' } });
    const sent = calls.length;
    await expect(invoke(body({ to: ['other@b.test'] }), 'k-1')).rejects.toMatchObject({ code: 'WriteHeld' });
    expect(calls.length).toBe(sent);
    expect(held().input.to).toEqual(['a@b.test']);
  });
});
