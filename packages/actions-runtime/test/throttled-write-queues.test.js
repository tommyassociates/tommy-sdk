/**
 * A keyed, replayable server write the server throttles (429) did not run, so
 * it is kept queued under its key instead of dead-lettered: it shows as a
 * waiting write, its next send waits for the server's Retry-After (or the
 * queue's own spacing when none is given), and it is sent once when due. A
 * write that is not replayable still fails, with the throttle and its wait on
 * the error, so its screen can say when to try again.
 */
import { describe, it, expect } from 'vitest';
import { TommyError } from '@tommy/sdk';
import { createBroker, createFakeIssuer } from '../src/index.js';
import { queueResendDelayMs } from '../src/constants.js';

const TENANT = 'team-1';

const sendMessage = {
  description: 'send',
  inputSchema: { type: 'object' },
  resultSchema: { type: 'object' },
  sideEffect: 'server_write',
  idempotency: 'client_key',
  offlineReplayable: true,
  retry: { maxAttempts: 3, backoff: 'exponential' },
};
const sendMedia = {
  ...sendMessage, description: 'media', offlineReplayable: false, retry: { maxAttempts: 1, backoff: 'none' },
};

// What the host's chat transport throws for a throttled send, wrapped as the host adapter wraps it.
const throttled = (fields = {}) => new TommyError({
  code: 'ActivityFailed',
  message: "host adapter for 'team-comms.send_message' failed: rate limited",
  retryable: true,
  cause: Object.assign(new Error('Too many messages'), { status: 429, code: 'RATE_LIMITED', retryable: true, ...fields }),
});
const cut = () => Object.assign(new TommyError({ code: 'Offline', message: 'Network request failed', retryable: true }), { status: 0 });

function deviceStore() {
  const rows = new Map();
  return {
    load: async () => [...rows.values()],
    put: async (row) => { rows.set(row.id, JSON.parse(JSON.stringify(row))); },
    remove: async (id) => { rows.delete(id); },
  };
}

async function world() {
  const clock = { t: 1000000 };
  const timers = [];
  const sent = [];
  const link = { answer: () => ({ status: 'succeeded', result: { messageId: '9' } }) };
  const issuer = createFakeIssuer();
  const broker = createBroker({
    capabilityService: issuer,
    outcomeStore: deviceStore(),
    queueOwner: () => ({ tenantId: TENANT }),
    sleep: async () => {},
    now: () => clock.t,
    setTimer: (fn, ms) => { const timer = { fn, ms }; timers.push(timer); return timer; },
    clearTimer: (timer) => { const at = timers.indexOf(timer); if (at >= 0) timers.splice(at, 1); },
    serverInvoke: async (envelope) => {
      sent.push({ activity: envelope.activity, key: envelope.idempotencyKey, body: envelope.args.body });
      return link.answer(envelope);
    },
  });
  broker.registerMp({
    id: 'team-comms', version: '1.0.0', publisher: { type: 'first_party' },
    triggers: {}, conditions: {}, activities: { send_message: sendMessage, send_media: sendMedia }, actions: {},
  }, { handlers: { activities: {} } });
  const token = await issuer.issue('team-comms', '1.0.0', TENANT, [], 'i-1');
  const invoke = (activity, body, key) => broker.invoke({
    sourceMpId: 'team-comms', instanceId: 'i-1', capabilityToken: token, activity: `team-comms.${activity}`, args: { body }, idempotencyKey: key,
  });
  return { broker, invoke, clock, timers, sent, link };
}

const outcomeOf = (w, key) => w.broker.writeOutcome('team-comms', 'send_message', key)?.state ?? null;

describe('a throttled send (429) is kept queued, never dead-lettered', () => {
  it('online: is sent once, queued under its key, shown as waiting, and its outcome reads queued', async () => {
    const w = await world();
    w.link.answer = () => { throw throttled({ retryAfterMs: 7000 }); };
    const answer = await w.invoke('send_message', 'hello', 'msg-1');
    expect(answer.status).toBe('queued_offline');
    expect(w.sent).toEqual([{ activity: 'team-comms.send_message', key: 'msg-1', body: 'hello' }]);
    expect(w.broker.queueStats().total).toBe(1);
    expect(w.broker.queueStats().bySource['team-comms']).toBe(1);
    await w.broker.outcomesReady();
    expect(outcomeOf(w, 'msg-1')).toBe('queued');
  });

  it('waits for Retry-After before the next send, then sends it once under the same key', async () => {
    const w = await world();
    w.link.answer = () => { throw throttled({ retryAfterMs: 7000 }); };
    await w.invoke('send_message', 'hello', 'msg-1');
    expect(w.timers.map((timer) => timer.ms)).toEqual([7000]);

    w.link.answer = () => ({ status: 'succeeded', result: { messageId: '9' } });
    w.clock.t += 6999;
    expect(await w.broker.drainOfflineQueue()).toEqual([]);
    expect(w.sent).toHaveLength(1);

    w.clock.t += 1;
    const drained = await w.broker.drainOfflineQueue();
    expect(drained).toHaveLength(1);
    expect(drained[0].ok).toBe(true);
    expect(w.sent.map((send) => send.key)).toEqual(['msg-1', 'msg-1']);
    expect(w.broker.queueStats().total).toBe(0);
    await w.broker.outcomesReady();
    expect(outcomeOf(w, 'msg-1')).toBe('succeeded');
  });

  it('reads the wait from the Retry-After header or the body when the transport did not', async () => {
    const header = await world();
    header.link.answer = () => { throw throttled({ data: { code: 'RATE_LIMITED', _headers: { 'Retry-After': '30' } } }); };
    await header.invoke('send_message', 'a', 'msg-h');
    expect(header.timers.map((timer) => timer.ms)).toEqual([30000]);

    const body = await world();
    body.link.answer = () => { throw throttled({ data: { code: 'RATE_LIMITED', details: { retry_after_seconds: 12 } } }); };
    await body.invoke('send_message', 'b', 'msg-b');
    expect(body.timers.map((timer) => timer.ms)).toEqual([12000]);
  });

  it('spaces the resend as the queue does when the server names no wait', async () => {
    const w = await world();
    w.link.answer = () => { throw throttled(); };
    await w.invoke('send_message', 'hello', 'msg-1');
    expect(w.timers.map((timer) => timer.ms)).toEqual([queueResendDelayMs(1)]);
  });

  it('a queued send throttled when the queue replays it stays queued and waits for Retry-After', async () => {
    const w = await world();
    w.link.answer = () => { throw cut(); };
    expect((await w.invoke('send_message', 'offline', 'msg-q')).status).toBe('queued_offline');

    w.link.answer = () => { throw throttled({ retryAfterMs: 20000 }); };
    w.clock.t += queueResendDelayMs(1);
    const replayed = await w.broker.drainOfflineQueue();
    expect(replayed).toHaveLength(1);
    expect(replayed[0].ok).toBe(false);
    expect(w.sent).toHaveLength(2);
    expect(w.broker.queueStats().total).toBe(1);
    await w.broker.outcomesReady();
    expect(outcomeOf(w, 'msg-q')).toBe('queued');

    w.link.answer = () => ({ status: 'succeeded', result: { messageId: '9' } });
    w.clock.t += 19999;
    expect(await w.broker.drainOfflineQueue()).toEqual([]);
    w.clock.t += 1;
    expect((await w.broker.drainOfflineQueue())[0].ok).toBe(true);
    expect(w.sent.map((send) => send.key)).toEqual(['msg-q', 'msg-q', 'msg-q']);
    expect(w.broker.queueStats().total).toBe(0);
  });

  it('a send that is not replayable still fails, carrying the throttle and its wait to its screen', async () => {
    const w = await world();
    w.link.answer = () => { throw throttled({ retryAfterMs: 9000 }); };
    const failure = await w.invoke('send_media', 'photo', 'media-1').catch((error) => error);
    expect(failure).toMatchObject({ code: 'ActivityFailed' });
    const chain = [];
    for (let cause = failure; cause; cause = cause.cause) chain.push(cause);
    expect(chain.some((cause) => cause.status === 429 && cause.retryAfterMs === 9000)).toBe(true);
    expect(w.sent).toHaveLength(1);
    expect(w.broker.queueStats().total).toBe(0);
  });
});
