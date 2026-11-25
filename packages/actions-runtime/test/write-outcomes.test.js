/**
 * Write outcomes by key: what happened to a Mini Program's own client_key
 * write survives a restart (`writeOutcome`), its follow-up emit is marked once
 * (`markOutcomeEmitted`), and a write that got no settling answer is sent once
 * more under the same key with its recorded arguments byte for byte
 * (`confirmWriteOutcome`), within the bounds: eligible activities only, a
 * recorded request, once per key, within 24 hours. No result is ever kept.
 * Replays the contract fixtures J4-outcome-hit-succeeded, J4-outcome-miss,
 * J6-outcome-unconfirmed-confirm-replayed and J6-confirm-outcome-bounds-refused.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TommyError } from '@tommy/sdk';
import { createBroker, createFakeIssuer, createOutcomeLedger } from '../src/index.js';

const TENANT = 'team-1';
const fixture = (name) => JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/hds-contract/${name}.json`, import.meta.url)), 'utf8'));

const recordAttendance = {
  description: 'a punch',
  inputSchema: {
    type: 'object',
    properties: { teamMemberId: { type: 'string' }, status: { type: 'string' }, at: { type: 'string' } },
  },
  sideEffect: 'server_write',
  idempotency: 'client_key',
  offlineReplayable: true,
  retry: { maxAttempts: 1 },
};
const verifyKioskPin = {
  description: 'checks a PIN',
  inputSchema: { type: 'object', properties: { pin: { type: 'string' } } },
  sideEffect: 'server_write',
  idempotency: 'derived_from_input',
  offlineReplayable: false,
  retry: { maxAttempts: 1 },
};
const saveLeave = { ...recordAttendance, description: 'a leave save' };

/** A device store for `account.mp_outcomes`: rows survive a "restart" (a new broker over the same rows). */
function deviceStore(seed = []) {
  const rows = new Map(seed.map((row) => [row.id, JSON.parse(JSON.stringify(row))]));
  return {
    rows,
    load: async () => [...rows.values()].map((row) => JSON.parse(JSON.stringify(row))),
    put: async (row) => { rows.set(row.id, JSON.parse(JSON.stringify(row))); },
    remove: async (id) => { rows.delete(id); },
  };
}

/** A stored record as the broker writes it, for the given activity, key and fields. */
function seedRecord(activity, key, fields) {
  const ledger = createOutcomeLedger({ now: () => fields.at });
  const made = ledger.record('*', activity, key, { state: fields.state, rpcId: fields.rpcId ?? null, request: fields.request });
  return { ...made, emitted: fields.emitted === true, confirmSent: fields.confirmSent === true };
}

async function page({ store, now, online = true, serverInvoke = vi.fn(async () => ({ result: { ok: true } })) } = {}) {
  const issuer = createFakeIssuer();
  const clock = { now };
  let identities = {};
  const broker = createBroker({
    capabilityService: issuer,
    serverInvoke,
    online,
    now: () => clock.now,
    outcomeStore: store,
    sleep: async () => {},
    // As the host does: a confirm's request gets this page's identity and token.
    replayEnvelope: async (envelope) => ({ ...envelope, ...identities[envelope.sourceMpId] }),
  });
  broker.registerMp({
    id: 'time-clock', version: '1.0.0', publisher: { type: 'first_party' }, triggers: {}, conditions: {},
    activities: { record_attendance: recordAttendance, verify_kiosk_pin: verifyKioskPin }, actions: {},
  }, { handlers: { activities: {} } });
  broker.registerMp({
    id: 'leave', version: '1.0.0', publisher: { type: 'first_party' }, triggers: {}, conditions: {},
    activities: { save: saveLeave }, actions: {},
  }, { handlers: { activities: {} } });
  const tokens = {
    'time-clock': await issuer.issue('time-clock', '1.0.0', TENANT, [], 'i-tc'),
    leave: await issuer.issue('leave', '1.0.0', TENANT, [], 'i-lv'),
  };
  identities = {
    'time-clock': { capabilityToken: tokens['time-clock'], instanceId: 'i-tc' },
    leave: { capabilityToken: tokens.leave, instanceId: 'i-lv' },
  };
  const invoke = (activity, args, idempotencyKey, mp = 'time-clock') => broker.invoke({
    sourceMpId: mp, ...identities[mp], activity, args, idempotencyKey,
  });
  return { broker, invoke, serverInvoke, clock };
}

const lostAnswer = () => new TommyError({ code: 'Timeout', message: 'no answer within the deadline', retryable: false });

describe('writeOutcome (J4-outcome-hit-succeeded, J4-outcome-miss)', () => {
  it('answers a succeeded record synchronously, without a result, and sends nothing', async () => {
    const f = fixture('J4-outcome-hit-succeeded');
    const given = f.given.record;
    const store = deviceStore([seedRecord(given.activity, given.key, given)]);
    const { broker, serverInvoke } = await page({ store, now: given.at + 60000 });
    await broker.outcomesReady();
    expect(broker.writeOutcome('time-clock', 'record_attendance', given.key)).toEqual(f.timeline[0].payload);
    expect(serverInvoke).not.toHaveBeenCalled();
    for (const row of store.rows.values()) expect(row).not.toHaveProperty('result');
  });

  it('answers null for a key never recorded, and for another Mini Program\'s activity', async () => {
    const f = fixture('J4-outcome-miss');
    const hit = fixture('J4-outcome-hit-succeeded').given.record;
    const store = deviceStore([seedRecord(hit.activity, hit.key, hit)]);
    const { broker } = await page({ store, now: hit.at + 60000 });
    await broker.outcomesReady();
    expect(broker.writeOutcome('time-clock', 'record_attendance', 'tc-55-stop-never-sent')).toBe(f.timeline[0].payload);
    expect(broker.writeOutcome('leave', 'record_attendance', hit.key)).toBeNull();
    expect(broker.writeOutcome('leave', 'time-clock.record_attendance', hit.key)).toBeNull();
    await expect(broker.markOutcomeEmitted('leave', 'time-clock.record_attendance', hit.key)).rejects.toMatchObject({ code: 'WriteNotFound' });
    await expect(broker.confirmWriteOutcome('leave', 'record_attendance', hit.key)).rejects.toMatchObject({ code: 'WriteNotFound' });
  });
});

describe('another Mini Program\'s outcome (J4-outcome-other-mp-not-found)', () => {
  it('answers null, rejects WriteNotFound, and sends nothing, even when a record exists', async () => {
    const f = fixture('J4-outcome-other-mp-not-found');
    const given = f.given.record['account.mp_outcomes'];
    const [read, marked, confirmed] = f.timeline;
    const store = deviceStore([seedRecord(given.activity, given.key, { ...given, at: 1000 })]);
    const { broker, serverInvoke } = await page({ store, now: 2000 });
    await broker.outcomesReady();
    const [, activity] = f.call.api[0].match(/writeOutcome\('([^']+)'/);
    expect(broker.writeOutcome(f.given.caller, activity, given.key)).toBe(read.payload);
    await expect(broker.markOutcomeEmitted(f.given.caller, activity, given.key)).rejects.toMatchObject(marked.payload);
    await expect(broker.confirmWriteOutcome(f.given.caller, activity, given.key)).rejects.toMatchObject(confirmed.payload);
    expect(serverInvoke).not.toHaveBeenCalled();
  });
});

describe('a clock-out whose answer was lost (J6-outcome-unconfirmed-confirm-replayed)', () => {
  it('is unconfirmed after a restart, confirmed once with its recorded request, then marked emitted', async () => {
    const f = fixture('J6-outcome-unconfirmed-confirm-replayed');
    const given = f.given.record;
    const [, request, resolved, , marked] = f.timeline;
    const store = deviceStore();

    // Sent online; the server committed it, but the answer never arrived.
    const first = await page({ store, now: given.at, serverInvoke: vi.fn(async () => { throw lostAnswer(); }) });
    await expect(first.invoke(given.activity, request.payload.args, given.key)).rejects.toMatchObject({ code: 'ActivityFailed' });
    await first.broker.outcomesReady();

    // The app restarted.
    const serverInvoke = vi.fn(async () => ({ result: resolved.payload.result, replayed: true }));
    const second = await page({ store, now: given.at + 10 * 60000, serverInvoke });
    await second.broker.outcomesReady();
    expect(second.broker.writeOutcome('time-clock', 'record_attendance', given.key)).toEqual(f.timeline[0].payload);

    const answer = await second.broker.confirmWriteOutcome('time-clock', 'record_attendance', given.key);
    expect(serverInvoke).toHaveBeenCalledTimes(1);
    const [sent] = serverInvoke.mock.calls[0];
    expect(sent.idempotencyKey).toBe(request.payload.idempotencyKey);
    expect(sent.activity).toBe(given.activity);
    // Byte for byte: the recorded body, the original client time inside it.
    expect(JSON.stringify(sent.args)).toBe(JSON.stringify(request.payload.args));
    expect(answer).toEqual({ ...resolved.payload, rpcId: expect.any(String) });

    expect(await second.broker.markOutcomeEmitted('time-clock', 'record_attendance', given.key)).toBe(marked.payload);
    expect(second.broker.writeOutcome('time-clock', 'record_attendance', given.key)).toMatchObject({ state: 'succeeded', emitted: true, confirmable: false });
    // Once per key: a second confirm sends nothing.
    await expect(second.broker.confirmWriteOutcome('time-clock', 'record_attendance', given.key))
      .rejects.toMatchObject({ code: 'WriteNotConfirmable', details: { reason: 'no_request' } });

    // A second restart finds it emitted: Time Clock does not emit again.
    const third = await page({ store, now: given.at + 20 * 60000 });
    await third.broker.outcomesReady();
    expect(third.broker.writeOutcome('time-clock', 'record_attendance', given.key)).toMatchObject({ state: 'succeeded', emitted: true });
    expect(serverInvoke).toHaveBeenCalledTimes(1);
    for (const row of store.rows.values()) {
      expect(row).not.toHaveProperty('result');
      expect(row).not.toHaveProperty('request');
    }
  });
});

describe('confirm bounds (J6-confirm-outcome-bounds-refused)', () => {
  const f = fixture('J6-confirm-outcome-bounds-refused');
  const byCase = Object.fromEntries(f.given.records.map((record) => [record.case, record]));
  const NOW = 1764057300000 + 10 * 60000;
  const args = { teamMemberId: '55', status: 'stop', at: '2026-11-25T19:05:00+11:00' };
  const seeded = () => deviceStore([
    seedRecord(byCase.already_confirmed.activity, byCase.already_confirmed.key, {
      ...byCase.already_confirmed, request: { sourceMpId: 'time-clock', activity: byCase.already_confirmed.activity, args, idempotencyKey: byCase.already_confirmed.key },
    }),
    seedRecord(byCase.expired.activity, byCase.expired.key, {
      ...byCase.expired, request: { sourceMpId: 'time-clock', activity: byCase.expired.activity, args, idempotencyKey: byCase.expired.key },
    }),
  ]);
  const nameOf = (activity) => activity.split('.')[1];

  for (const step of f.timeline) {
    it(`${step.case}: rejects ${step.payload.code} and sends nothing`, async () => {
      const { broker, serverInvoke } = await page({ store: seeded(), now: NOW });
      const record = byCase[step.case];
      await expect(broker.confirmWriteOutcome('time-clock', nameOf(record.activity), record.key)).rejects.toMatchObject(step.payload);
      expect(serverInvoke).not.toHaveBeenCalled();
    });
  }

  it('writeOutcome answers confirmable: false for the confirmed and the expired record', async () => {
    const { broker } = await page({ store: seeded(), now: NOW });
    await broker.outcomesReady();
    for (const name of ['already_confirmed', 'expired']) {
      expect(broker.writeOutcome('time-clock', 'record_attendance', byCase[name].key)).toMatchObject({ state: 'unconfirmed', confirmable: false });
    }
  });

  it('an ineligible write is never kept for a confirm', async () => {
    const store = deviceStore();
    const { invoke } = await page({ store, now: NOW, serverInvoke: vi.fn(async () => { throw lostAnswer(); }) });
    await expect(invoke('time-clock.verify_kiosk_pin', { pin: '1234' }, undefined)).rejects.toBeTruthy();
    expect([...store.rows.values()]).toEqual([]);
    expect(JSON.stringify([...store.rows.values()])).not.toContain('1234');
  });
});

describe('confirm edges', () => {
  const args = { teamMemberId: '55', status: 'stop', at: '2026-11-25T19:05:00+11:00' };

  it('offline sends nothing and does not count; online later it confirms', async () => {
    const store = deviceStore();
    const first = await page({ store, now: 1000, serverInvoke: vi.fn(async () => { throw lostAnswer(); }) });
    await expect(first.invoke('time-clock.record_attendance', args, 'k-off')).rejects.toBeTruthy();
    const serverInvoke = vi.fn(async () => ({ result: { attendanceId: '1' } }));
    const { broker } = await page({ store, now: 2000, online: false, serverInvoke });
    const offline = await broker.confirmWriteOutcome('time-clock', 'record_attendance', 'k-off');
    expect(offline).toMatchObject({ state: 'unconfirmed', error: { code: 'DATA_OFFLINE' } });
    expect(serverInvoke).not.toHaveBeenCalled();
    expect(broker.writeOutcome('time-clock', 'record_attendance', 'k-off')).toMatchObject({ confirmable: true });
    broker.setOnline(true);
    expect(await broker.confirmWriteOutcome('time-clock', 'record_attendance', 'k-off')).toMatchObject({ state: 'succeeded', replayed: false });
    expect(serverInvoke).toHaveBeenCalledTimes(1);
  });

  it('two confirms at once send one request', async () => {
    const store = deviceStore();
    const first = await page({ store, now: 1000, serverInvoke: vi.fn(async () => { throw lostAnswer(); }) });
    await expect(first.invoke('time-clock.record_attendance', args, 'k-twice')).rejects.toBeTruthy();
    let answer;
    const serverInvoke = vi.fn(() => new Promise((resolve) => { answer = resolve; }));
    const { broker } = await page({ store, now: 2000, serverInvoke });
    await broker.outcomesReady();
    const one = broker.confirmWriteOutcome('time-clock', 'record_attendance', 'k-twice');
    const two = broker.confirmWriteOutcome('time-clock', 'record_attendance', 'k-twice');
    await expect(two).rejects.toMatchObject({ details: { reason: 'already_confirmed' } });
    await vi.waitFor(() => expect(serverInvoke).toHaveBeenCalledTimes(1));
    answer({ result: { attendanceId: '2' } });
    await expect(one).resolves.toMatchObject({ state: 'succeeded' });
  });

  it('a confirm the server refuses answers refused, and the record says so', async () => {
    const store = deviceStore();
    const first = await page({ store, now: 1000, serverInvoke: vi.fn(async () => { throw lostAnswer(); }) });
    await expect(first.invoke('time-clock.record_attendance', args, 'k-refused')).rejects.toBeTruthy();
    const refusal = Object.assign(new Error('Shift already closed'), { status: 422, data: { code: 'SHIFT_CLOSED' } });
    const { broker } = await page({ store, now: 2000, serverInvoke: vi.fn(async () => { throw refusal; }) });
    await broker.outcomesReady();
    expect(await broker.confirmWriteOutcome('time-clock', 'record_attendance', 'k-refused'))
      .toMatchObject({ state: 'refused', refusal: { code: 'SHIFT_CLOSED', status: 422 } });
    expect(broker.writeOutcome('time-clock', 'record_attendance', 'k-refused'))
      .toMatchObject({ state: 'refused', refusal: { code: 'SHIFT_CLOSED', status: 422 }, confirmable: false });
  });

  it('a write queued offline reads queued, then succeeded once the queue sends it', async () => {
    const store = deviceStore();
    const serverInvoke = vi.fn(async () => ({ result: { attendanceId: '3' } }));
    const { broker, invoke } = await page({ store, now: 1000, online: false, serverInvoke });
    expect((await invoke('time-clock.record_attendance', args, 'k-queued')).status).toBe('queued_offline');
    expect(broker.writeOutcome('time-clock', 'record_attendance', 'k-queued')).toMatchObject({ state: 'queued', rpcId: null, confirmable: true });
    broker.setOnline(true);
    await broker.drainOfflineQueue();
    expect(broker.writeOutcome('time-clock', 'record_attendance', 'k-queued')).toMatchObject({ state: 'succeeded', confirmable: false });
  });

  it('records stay bounded: at most 1,000, the least recently written evicted', () => {
    let t = 0;
    const ledger = createOutcomeLedger({ now: () => t });
    for (let i = 0; i < 1001; i += 1) { t += 1; ledger.record('*', 'time-clock.record_attendance', `k-${i}`, { state: 'succeeded' }); }
    expect(ledger._size()).toBe(1000);
    expect(ledger.get('*', 'time-clock.record_attendance', 'k-0')).toBeNull();
    expect(ledger.get('*', 'time-clock.record_attendance', 'k-1000')).not.toBeNull();
  });

  it('records expire after 7 days', () => {
    let t = 0;
    const ledger = createOutcomeLedger({ now: () => t });
    ledger.record('*', 'time-clock.record_attendance', 'k-old', { state: 'succeeded' });
    t = 7 * 24 * 60 * 60 * 1000 + 1;
    expect(ledger.get('*', 'time-clock.record_attendance', 'k-old')).toBeNull();
  });
});
