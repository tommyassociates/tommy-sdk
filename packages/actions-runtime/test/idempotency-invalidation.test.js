/**
 * idempotency-invalidation.test.js — spec mp-declared-bounds-that-dont-bind
 * Phase 2 (B2).
 *
 * `derived_from_input` hashes the args, so the broker replays a recorded result
 * for identical args forever. That is right while the state the result describes
 * still holds, and wrong the moment a sibling activity clears it: lock records
 * `{locked: true}`, unlock runs under a DIFFERENT activity name and genuinely
 * clears the flags, and a re-lock with identical args then replayed the recorded
 * success with no read and no write — a succeeded run reporting a lock that did
 * not happen.
 *
 * The MP names the dependency because the broker cannot know which activities
 * are inverses, and a blanket "any write clears every key" rule would delete the
 * duplicate suppression the fan-out depends on.
 */
import { describe, it, expect } from 'vitest';
import { createBroker, createFakeIssuer } from '../src/index.js';

const TENANT = 'team-9';
const OTHER_TENANT = 'team-42';

const manifest = {
  id: 'availability',
  version: '1.0.0',
  publisher: { type: 'first_party' },
  triggers: {},
  conditions: {},
  actions: {},
  activities: {
    lock_window: {
      description: 'lock',
      inputSchema: { type: 'object' },
      sideEffect: 'server_write',
      idempotency: 'derived_from_input',
      callerPolicy: 'first_party',
      invalidatesIdempotency: ['unlock_window'],
    },
    unlock_window: {
      description: 'unlock',
      inputSchema: { type: 'object' },
      sideEffect: 'server_write',
      idempotency: 'derived_from_input',
      callerPolicy: 'first_party',
      invalidatesIdempotency: ['lock_window'],
    },
    unrelated_write: {
      description: 'a write that invalidates nothing',
      inputSchema: { type: 'object' },
      sideEffect: 'server_write',
      idempotency: 'derived_from_input',
      callerPolicy: 'first_party',
    },
  },
};

async function world() {
  const calls = { lock_window: 0, unlock_window: 0, unrelated_write: 0 };
  const issuer = createFakeIssuer();
  const broker = createBroker({
    capabilityService: issuer,
    serverInvoke: async ({ activity }) => {
      const name = String(activity).split('.').pop();
      calls[name] += 1;
      return { ok: true, seq: calls[name] };
    },
  });
  broker.registerMp(manifest, { handlers: { conditions: {}, activities: {} } });
  const token = await issuer.issue('availability', '1.0.0', TENANT, [], 'i-1');
  const call = (name, args = { shiftId: 's-1' }, capabilityToken = token, instanceId = 'i-1') => broker.invoke({
    sourceMpId: 'availability', instanceId, capabilityToken,
    activity: `availability.${name}`, args,
  });
  return { broker, issuer, calls, call };
}

describe('declared idempotency invalidation', () => {
  it('replays an identical repeat while nothing has cleared the state', async () => {
    const w = await world();
    await w.call('lock_window');
    const second = await w.call('lock_window');

    expect(second.idempotentReplay).toBe(true);
    expect(w.calls.lock_window).toBe(1); // suppressed — this is the guarantee
  });

  it('re-executes a lock after an unlock cleared what the recorded result described', async () => {
    const w = await world();
    await w.call('lock_window');
    await w.call('unlock_window');
    const relock = await w.call('lock_window');

    // THE DEFECT: this used to come back `{ok: true, seq: 1, idempotentReplay: true}`
    // — a lock that never ran, reported as a success.
    expect(relock.idempotentReplay).toBeUndefined();
    expect(w.calls.lock_window).toBe(2);
  });

  it('leaves an unrelated activity\'s recorded result alone', async () => {
    const w = await world();
    await w.call('unrelated_write');
    await w.call('unlock_window');
    const repeat = await w.call('unrelated_write');

    // Invalidation is NAMED, not "any write clears everything" — the blanket
    // rule would delete the duplicate suppression the fan-out depends on.
    expect(repeat.idempotentReplay).toBe(true);
    expect(w.calls.unrelated_write).toBe(1);
  });

  it('invalidates within one tenant only', async () => {
    const w = await world();
    const otherToken = await w.issuer.issue('availability', '1.0.0', OTHER_TENANT, [], 'i-2');

    await w.call('lock_window');
    await w.call('lock_window', { shiftId: 's-1' }, otherToken, 'i-2');
    // Clear tenant-9's lock record; tenant-42's must survive.
    await w.call('unlock_window');

    const otherRepeat = await w.call('lock_window', { shiftId: 's-1' }, otherToken, 'i-2');
    expect(otherRepeat.idempotentReplay).toBe(true);
  });
});
