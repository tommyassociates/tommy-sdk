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
import { createBroker, createFakeIssuer, createInvalidationEpochs } from '../src/index.js';

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

/**
 * PHASE 1 (mp-bounds-the-scanner-cannot-see) — the invalidation reaches the
 * SERVER's ledger too, not only the client's memory.
 *
 * `invalidatesIdempotency` cleared `processedKeys` and `appliedKeysOverflow` and
 * was documented as though that were the whole story. It is not: the server
 * keeps its own ledger of succeeded invocations, looked up by (team, activity,
 * idempotency_key) and replayed verbatim (invoke_executor.rb find_succeeded).
 * So the runtime cleared one ledger and claimed both, and a repeat invoke after
 * an invalidation still got the stale result back over the wire.
 */
describe('the invalidation epoch reaches the server ledger', () => {
  /** Same world, but recording the key the SERVER is asked about. */
  async function keyRecordingWorld() {
    const keys = [];
    const issuer = createFakeIssuer();
    const broker = createBroker({
      capabilityService: issuer,
      serverInvoke: async ({ activity, idempotencyKey }) => {
        keys.push({ activity: String(activity), idempotencyKey });
        return { ok: true };
      },
    });
    broker.registerMp(manifest, { handlers: { conditions: {}, activities: {} } });
    const token = await issuer.issue('availability', '1.0.0', TENANT, [], 'i-1');
    const call = (name, args = { shiftId: 's-1' }) => broker.invoke({
      sourceMpId: 'availability', instanceId: 'i-1', capabilityToken: token,
      activity: `availability.${name}`, args,
    });
    const lastKeyFor = (name) => [...keys].reverse().find((k) => k.activity.endsWith(name))?.idempotencyKey;
    return { call, keys, lastKeyFor };
  }

  it('presents a key the server has not seen after an invalidation', async () => {
    const w = await keyRecordingWorld();
    await w.call('lock_window');
    const first = w.lastKeyFor('lock_window');

    await w.call('unlock_window');
    await w.call('lock_window');
    const after = w.lastKeyFor('lock_window');

    // Same activity, same args — but the key the SERVER is asked about differs,
    // so find_succeeded misses and the write genuinely runs again.
    expect(after).not.toBe(first);
    expect(after.startsWith('e1.')).toBe(true);
  });

  it('leaves a non-invalidated activity\'s key untouched', async () => {
    const w = await keyRecordingWorld();
    await w.call('unrelated_write', { x: 1 });
    const before = w.lastKeyFor('unrelated_write');
    await w.call('unlock_window');
    await w.call('unrelated_write', { x: 1 });

    // The epoch is PER ACTIVITY. A shared epoch would churn every unrelated
    // write's key on any invalidation, writing a new server row each time.
    expect(w.lastKeyFor('unrelated_write')).toBe(before);
  });

  it('is byte-identical to the old key until something invalidates', async () => {
    const w = await keyRecordingWorld();
    await w.call('lock_window', { shiftId: 's-9' });
    // Epoch 0 carries no stamp, so an install that has never invalidated writes
    // exactly the keys it always did — no new Mp::Invocation rows, no churn.
    expect(w.lastKeyFor('lock_window')).toBe(`d-${JSON.stringify({ shiftId: 's-9' })}`);
  });
});

/**
 * BSC-1 — the epoch must survive a reload, or it undoes itself.
 *
 * Held in a closure Map, the epoch worked until the shell reloaded: the counter
 * reset to 0, the next invoke re-presented the ORIGINAL derived key, and the
 * server replayed the stale result. That is the exact defect the epoch exists to
 * stop, one refresh away.
 */
describe('the invalidation epoch survives a reload', () => {
  const fakeStorage = () => {
    const map = new Map();
    return {
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => map.set(k, String(v)),
      removeItem: (k) => map.delete(k),
    };
  };

  async function brokerOver(storage) {
    const keys = [];
    const issuer = createFakeIssuer();
    const broker = createBroker({
      capabilityService: issuer,
      invalidationEpochs: createInvalidationEpochs({ storage }),
      serverInvoke: async ({ activity, idempotencyKey }) => {
        keys.push({ activity: String(activity), idempotencyKey });
        return { ok: true };
      },
    });
    broker.registerMp(manifest, { handlers: { conditions: {}, activities: {} } });
    const token = await issuer.issue('availability', '1.0.0', TENANT, [], 'i-1');
    const call = (name, args = { shiftId: 's-1' }) => broker.invoke({
      sourceMpId: 'availability', instanceId: 'i-1', capabilityToken: token,
      activity: `availability.${name}`, args,
    });
    return { call, lastKey: () => keys.at(-1)?.idempotencyKey };
  }

  it('still stamps the key after the shell reloads', async () => {
    const storage = fakeStorage();               // survives the "reload"
    const first = await brokerOver(storage);
    await first.call('lock_window');
    await first.call('unlock_window');           // invalidates

    // A SECOND broker over the same storage — a shell reload.
    const second = await brokerOver(storage);
    await second.call('lock_window');

    expect(second.lastKey().startsWith('e1.')).toBe(true);
  });

  it('degrades to session-scoped rather than throwing without storage', async () => {
    // A runtime with no Web Storage must still invalidate WITHIN the session —
    // the first cut wrote the epoch nowhere and read back 0, which broke the
    // in-session guarantee too.
    const w = await brokerOver(null);
    await w.call('lock_window');
    await w.call('unlock_window');
    await w.call('lock_window');
    expect(w.lastKey().startsWith('e1.')).toBe(true);
  });
});
