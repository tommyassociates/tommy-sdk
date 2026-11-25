import { describe, it, expect, vi } from 'vitest';
import { createBroker, createFakeIssuer } from '../src/index.js';

const TENANT = 'team-1';

const pairResult = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' }, code: { type: 'string' }, message: { type: 'string' }, childAttendanceId: { type: 'string' },
  },
};
const write = (resultSchema) => ({
  description: 'a paired write',
  inputSchema: { type: 'object', properties: { childShiftId: { type: 'string' } } },
  resultSchema,
  sideEffect: 'server_write',
  idempotency: 'client_key',
  offlineReplayable: true,
  retry: { maxAttempts: 1 },
});

async function page(serverInvoke) {
  const issuer = createFakeIssuer();
  const broker = createBroker({
    capabilityService: issuer,
    serverInvoke,
    online: true,
    queueOwner: () => ({ tenantId: TENANT }),
    sleep: async () => {},
  });
  broker.registerMp({
    id: 'time-clock', version: '1.0.0', publisher: { type: 'first_party' }, triggers: {}, conditions: {},
    activities: {
      record_booking_clock: write(pairResult),
      record_untyped: write({ type: 'object', properties: { ok: { type: 'boolean' }, message: { type: 'string' } } }),
    },
    actions: {},
  }, { handlers: { activities: {} } });
  const capabilityToken = await issuer.issue('time-clock', '1.0.0', TENANT, [], 'i-tc');
  const invoke = (activity, key) => broker.invoke({
    sourceMpId: 'time-clock', capabilityToken, instanceId: 'i-tc', activity: `time-clock.${activity}`, args: { childShiftId: '7741' }, idempotencyKey: key,
  });
  const outcome = (activity, key) => broker.writeOutcome('time-clock', activity, key);
  return { invoke, outcome };
}

const refusal = { ok: false, code: 'PAIR_FAILED', message: 'That booking is no longer on the roster.' };

describe('a typed refusal the executor marks', () => {
  it('is recorded as refused, and the MP gets the same answer as before', async () => {
    const { invoke, outcome } = await page(vi.fn(async () => ({ status: 'succeeded', result: { ...refusal }, typedRefusal: true })));
    const answer = await invoke('record_booking_clock', 'pair-1');

    expect(answer).toEqual({ rpcId: expect.any(String), status: 'succeeded', result: refusal });
    expect(answer).not.toHaveProperty('typedRefusal');
    expect(outcome('record_booking_clock', 'pair-1')).toMatchObject({
      state: 'refused',
      rpcId: answer.rpcId,
      refusal: { code: 'PAIR_FAILED', status: null, message: 'That booking is no longer on the roster.' },
      confirmable: false,
    });
  });

  it('answers a repeat of the same key from the broker as before, still refused', async () => {
    const serverInvoke = vi.fn(async () => ({ status: 'succeeded', result: { ...refusal }, typedRefusal: true }));
    const { invoke, outcome } = await page(serverInvoke);
    await invoke('record_booking_clock', 'pair-1');
    const again = await invoke('record_booking_clock', 'pair-1');

    expect(serverInvoke).toHaveBeenCalledTimes(1);
    expect(again).toMatchObject({ status: 'succeeded', result: refusal, idempotentReplay: true });
    expect(outcome('record_booking_clock', 'pair-1').state).toBe('refused');
  });
});

describe('everything else stays succeeded', () => {
  it('an ok: true answer, marked or not', async () => {
    const { invoke, outcome } = await page(vi.fn(async () => ({ status: 'succeeded', result: { ok: true, childAttendanceId: '9' }, typedRefusal: true })));
    await invoke('record_booking_clock', 'pair-2');
    expect(outcome('record_booking_clock', 'pair-2').state).toBe('succeeded');
  });

  it('an ok: false answer the executor does not mark', async () => {
    const { invoke, outcome } = await page(vi.fn(async () => ({ status: 'succeeded', result: { ...refusal } })));
    await invoke('record_booking_clock', 'pair-3');
    expect(outcome('record_booking_clock', 'pair-3').state).toBe('succeeded');
  });

  it('a marked answer with no code', async () => {
    const { invoke, outcome } = await page(vi.fn(async () => ({ status: 'succeeded', result: { ok: false, message: 'no' }, typedRefusal: true })));
    await invoke('record_booking_clock', 'pair-4');
    expect(outcome('record_booking_clock', 'pair-4').state).toBe('succeeded');
  });

  it('a marked answer of an activity whose declared result has no code', async () => {
    const { invoke, outcome } = await page(vi.fn(async () => ({ status: 'succeeded', result: { ok: false, code: 'PAIR_FAILED' }, typedRefusal: true })));
    await invoke('record_untyped', 'untyped-1');
    expect(outcome('record_untyped', 'untyped-1').state).toBe('succeeded');
  });
});
