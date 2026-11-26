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
    archive_declared: activity({ naturalKeyField: 'token' }),
    archive_undeclared: activity(),
    archive_nested: activity({ naturalKeyField: 'invitation.token' }),
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
    expect(w.applied).toHaveLength(1);
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
    const w = await world();
    await w.call('archive_declared', { token: 'tok-1' });
    const sameDeclared = await w.call('archive_declared', { token: 'tok-1' });
    await w.call('archive_undeclared', { token: 'tok-1' });
    const sameUndeclared = await w.call('archive_undeclared', { token: 'tok-1' });
    expect(sameDeclared.idempotentReplay).toBe(true);
    expect(sameUndeclared.idempotentReplay).toBe(true);
  });
});
