/**
 * D.39 (c) — the durable idempotency ledger.
 *
 * The test that matters is `survives a reload`: it builds a SECOND broker over
 * the SAME storage, which is what a page reload actually is. Everything else
 * here exists to pin the two narrowings the ruling was given under — keys only,
 * never results; and `client_key` only, because every other strategy derives
 * its key from the args and would put tenant data on disk inside the key.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createBroker, createFakeIssuer, createIdempotencyLedger } from '../src/index.js';

/** A localStorage stand-in that PERSISTS across broker instances, like the real one. */
function fakeStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    _raw: data,
  };
}

const activity = (extra = {}) => ({
  description: 'a',
  inputSchema: { type: 'object' },
  sideEffect: 'local_write',
  offlineReplayable: false,
  retry: { maxAttempts: 1 },
  ...extra,
});

const MANIFEST = {
  id: 'time-clock',
  version: '1.0.0',
  publisher: { type: 'first_party' },
  triggers: {},
  conditions: {},
  activities: {
    issue_kiosk_pin: activity({ idempotency: 'client_key' }),
    update_thing: activity({ idempotency: 'derived_from_input' }),
  },
  actions: {},
};

describe('D.39 (c) — durable idempotency ledger', () => {
  let storage;
  let calls;

  const makeBroker = async () => {
    const issuer = createFakeIssuer();
    const broker = createBroker({
      capabilityService: issuer,
      idempotencyLedger: createIdempotencyLedger({ storage }),
    });
    broker.registerMp(MANIFEST, {
      handlers: {
        activities: {
          issue_kiosk_pin: () => { calls.push('pin'); return { pin: '4321' }; },
          update_thing: () => { calls.push('thing'); return { ok: true }; },
        },
      },
    });
    const token = await issuer.issue('time-clock', '1.0.0', 'team-A', [], 'i-a');
    return (name, key, args = {}) => broker.invoke({
      sourceMpId: 'time-clock', instanceId: 'i-a', capabilityToken: token,
      activity: `time-clock.${name}`, args, idempotencyKey: key,
    });
  };

  beforeEach(() => { storage = fakeStorage(); calls = []; });

  it('SURVIVES A RELOAD — a second broker over the same storage suppresses the repeat', async () => {
    const first = await makeBroker();
    await first('issue_kiosk_pin', 'press-1');
    expect(calls).toEqual(['pin']);

    // A reload: brand-new broker, brand-new in-memory Map, SAME storage.
    const second = await makeBroker();
    const replay = await second('issue_kiosk_pin', 'press-1');

    expect(calls).toEqual(['pin']);          // the PIN was NOT rotated a second time
    expect(replay.idempotentReplay).toBe(true);
    expect(replay.resultRetained).toBe(false);
  });

  it('a DIFFERENT key still executes — re-issue stays deliberately repeatable', async () => {
    const call = await makeBroker();
    await call('issue_kiosk_pin', 'press-1');
    await call('issue_kiosk_pin', 'press-2');
    expect(calls).toEqual(['pin', 'pin']);
  });

  it('NEVER writes a result to storage — not even the key it was stored under', () => {
    const ledger = createIdempotencyLedger({ storage });
    ledger.add('t1:time-clock.issue_kiosk_pin:press-1');
    const dumped = JSON.stringify([...storage._raw.entries()]);
    expect(dumped).not.toContain('press-1');   // the raw key is hashed, not stored
    expect(dumped).not.toContain('4321');      // and no result ever reaches it
  });

  it('in-session replay is UNCHANGED — the Map still returns the stored result', async () => {
    const call = await makeBroker();
    const a1 = await call('issue_kiosk_pin', 'press-1');
    const a2 = await call('issue_kiosk_pin', 'press-1');
    expect(a2.idempotentReplay).toBe(true);
    expect(a2.result).toEqual(a1.result);      // full fidelity within the session
    expect(a2.resultRetained).toBeUndefined(); // the durable path was never reached
  });

  it('does NOT persist non-client_key strategies — their keys embed the args', async () => {
    const first = await makeBroker();
    await first('update_thing', undefined, { pin: '4321' });
    expect(JSON.stringify([...storage._raw.entries()])).not.toContain('4321');

    // Across a reload it re-executes, exactly as before this change.
    const second = await makeBroker();
    await second('update_thing', undefined, { pin: '4321' });
    expect(calls).toEqual(['thing', 'thing']);
  });

  it('degrades to memory when storage is absent — never throws on the write path', () => {
    const ledger = createIdempotencyLedger({ storage: null });
    expect(() => ledger.add('k')).not.toThrow();
    expect(ledger.has('k')).toBe(false);
  });

  it('degrades to empty when storage is CORRUPT rather than poisoning dispatch', () => {
    const s = fakeStorage();
    s.setItem('mp-idempotency-ledger', '{not json');
    const ledger = createIdempotencyLedger({ storage: s });
    expect(ledger.has('k')).toBe(false);
    expect(() => ledger.add('k')).not.toThrow();
    expect(ledger.has('k')).toBe(true);
  });

  it('expires entries past the TTL — a retry a week later is a new intent', () => {
    let t = 1_000_000;
    const ledger = createIdempotencyLedger({ storage, ttlMs: 100, now: () => t });
    ledger.add('k');
    expect(ledger.has('k')).toBe(true);
    t += 101;
    expect(ledger.has('k')).toBe(false);
  });

  it('is BOUNDED — oldest keys evict first so it cannot grow without limit', () => {
    const ledger = createIdempotencyLedger({ storage, max: 3 });
    for (const k of ['a', 'b', 'c', 'd']) ledger.add(k);
    expect(ledger._size()).toBe(3);
    expect(ledger.has('a')).toBe(false); // evicted
    expect(ledger.has('d')).toBe(true);
  });
});
