/**
 * natural-key-field.test.js (L22) — a manifest-declared `naturalKeyField` is
 * actually honoured by the broker, and omitting it keeps today's behaviour.
 *
 * The defect: `idempotencyKeyFor` has always read
 * `activityDef.naturalKeyField || 'id'`, but the manifest schema's activity
 * object is `additionalProperties: false` and did not list the field, so no
 * manifest could set it. With no `args.id` — which is true of ALL 108
 * `natural_key` activities in the estate — the broker fell through to hashing
 * the whole args, making `natural_key` indistinguishable from
 * `derived_from_input`. These tests exercise the runtime half of the fix that
 * `@tommy/manifest`'s schema half unlocks.
 */
import { describe, it, expect } from 'vitest';
import { createBroker, createFakeIssuer } from '../src/index.js';

const activity = (extra = {}) => ({
  description: 'a',
  inputSchema: { type: 'object' },
  sideEffect: 'local_write',
  offlineReplayable: false,
  retry: { maxAttempts: 1 },
  idempotency: 'natural_key',
  ...extra,
});

const manifest = {
  id: 'team',
  version: '1.0.0',
  publisher: { type: 'first_party' },
  triggers: {},
  conditions: {},
  activities: {
    // The real shape: team.archive_invitation keys on the invitation TOKEN.
    archive_declared: activity({ naturalKeyField: 'token' }),
    // The same activity without the declaration — today's estate-wide default.
    archive_undeclared: activity(),
    // A dotted path, which dottedGet resolves.
    archive_nested: activity({ naturalKeyField: 'invitation.token' }),
    // The default when args DO carry an id.
    delete_by_id: activity(),
  },
  actions: {},
};

async function world() {
  const issuer = createFakeIssuer();
  const broker = createBroker({ capabilityService: issuer });
  const applied = [];
  const handler = (name) => (args) => { applied.push([name, args]); return { ran: applied.length }; };
  broker.registerMp(manifest, {
    handlers: {
      activities: Object.fromEntries(
        Object.keys(manifest.activities).map((n) => [n, handler(n)]),
      ),
    },
  });
  const token = await issuer.issue('team', '1.0.0', 'team-A', [], 'i-a');
  return {
    applied,
    call: (name, args) => broker.invoke({
      sourceMpId: 'team', instanceId: 'i-a', capabilityToken: token, activity: `team.${name}`, args,
    }),
  };
}

describe('L22 — naturalKeyField is honoured by the broker', () => {
  it('DECLARED: two calls sharing the key are one fact, even though the rest of the args differ', async () => {
    const w = await world();
    const first = await w.call('archive_declared', { token: 'tok-1', reason: 'left the team' });
    const second = await w.call('archive_declared', { token: 'tok-1', reason: 'typo fix' });

    expect(first.idempotentReplay).toBeUndefined();
    expect(second.idempotentReplay).toBe(true);
    expect(second.result).toEqual(first.result);
    expect(w.applied).toHaveLength(1); // the second never reached the handler
  });

  it('DECLARED: a DIFFERENT key is a different fact and still applies', async () => {
    const w = await world();
    await w.call('archive_declared', { token: 'tok-1' });
    const other = await w.call('archive_declared', { token: 'tok-2' });
    expect(other.idempotentReplay).toBeUndefined();
    expect(w.applied.map((a) => a[1].token)).toEqual(['tok-1', 'tok-2']);
  });

  it('UNDECLARED is the bug this fixes: the same invitation archived twice is treated as TWO facts', async () => {
    const w = await world();
    const first = await w.call('archive_undeclared', { token: 'tok-1', reason: 'left the team' });
    const second = await w.call('archive_undeclared', { token: 'tok-1', reason: 'typo fix' });
    // No args.id ⇒ whole-args hash ⇒ natural_key degrades to derived_from_input.
    expect(first.idempotentReplay).toBeUndefined();
    expect(second.idempotentReplay).toBeUndefined();
    expect(w.applied).toHaveLength(2);
  });

  it('a DOTTED naturalKeyField resolves into nested args', async () => {
    const w = await world();
    await w.call('archive_nested', { invitation: { token: 'tok-1' }, note: 'a' });
    const replay = await w.call('archive_nested', { invitation: { token: 'tok-1' }, note: 'b' });
    expect(replay.idempotentReplay).toBe(true);
    expect(w.applied).toHaveLength(1);
  });

  it('omitting it still defaults to args.id — the schema change is purely additive', async () => {
    const w = await world();
    await w.call('delete_by_id', { id: 'x-1', extra: 1 });
    const replay = await w.call('delete_by_id', { id: 'x-1', extra: 2 });
    expect(replay.idempotentReplay).toBe(true);
    expect(w.applied).toHaveLength(1);
  });

  it('EQUIVALENCE — for a single-property activity, declaring the field changes the key STRING but not which calls collide', async () => {
    // This is the safety argument for the 33 declarations made in this wave:
    // where inputSchema has exactly one required property, `n-<value>` and
    // `n-<JSON of the whole args>` partition the call space identically.
    const w = await world();
    await w.call('archive_declared', { token: 'tok-1' });
    const sameDeclared = await w.call('archive_declared', { token: 'tok-1' });
    await w.call('archive_undeclared', { token: 'tok-1' });
    const sameUndeclared = await w.call('archive_undeclared', { token: 'tok-1' });
    expect(sameDeclared.idempotentReplay).toBe(true);
    expect(sameUndeclared.idempotentReplay).toBe(true);
  });
});
