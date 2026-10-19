/**
 * action-client-key.test.js — an Action-dispatched client_key activity gets a
 * key derived from the trigger payload as well as the assembled args: a replay
 * of the same emission is absorbed, while two distinct emissions whose args
 * happen to match (a constant prompt) are two writes.
 */
import { describe, it, expect } from 'vitest';
import { createBroker, createFakeIssuer } from '../src/index.js';

const TENANT = 'team-3';

const source = {
  id: 'reports',
  version: '1.0.0',
  publisher: { type: 'first_party' },
  triggers: {
    week_closed: {
      description: 'a week closed',
      payloadSchema: { type: 'object', required: ['week'], properties: { week: { type: 'string' } } },
      emission: 'async',
    },
  },
  conditions: {},
  activities: {},
  actions: {},
};

const target = {
  id: 'team-comms',
  version: '1.0.0',
  publisher: { type: 'first_party' },
  triggers: {},
  conditions: {},
  activities: {
    ask: {
      description: 'ask a question',
      inputSchema: { type: 'object', required: ['prompt'], properties: { prompt: { type: 'string' } } },
      resultSchema: { type: 'object' },
      // local, so the test needs no server executor; the key derivation is
      // the same for every side effect.
      sideEffect: 'local_write',
      idempotency: 'client_key',
      offlineReplayable: false,
      authorizedCallers: ['team-comms', 'reports'],
      retry: { maxAttempts: 1 },
    },
  },
  actions: {
    ask_on_week_closed: {
      title: 'Ask for a summary when a week closes',
      trigger: { mp: 'reports', name: 'week_closed' },
      conditions: [],
      activity: { name: 'ask', inputMap: { prompt: { const: 'Summarise the week' } } },
      enabledByDefault: true,
      required: true,
      userConfigurable: false,
    },
  },
};

async function world() {
  const issuer = createFakeIssuer();
  const broker = createBroker({ capabilityService: issuer });
  const asked = [];
  broker.registerMp(target, { handlers: { activities: { ask: (args) => { asked.push(args); return {}; } } } });
  broker.registerMp(source, { handlers: {} });
  const token = await issuer.issue('reports', '1.0.0', TENANT, [], 'i-1');
  const emit = async (week) => {
    await broker.emit({
      sourceMpId: 'reports', instanceId: 'i-1', capabilityToken: token,
      trigger: 'reports.week_closed', payload: { week },
    });
    await new Promise((resolve) => { setTimeout(resolve, 10); });
  };
  return { emit, asked };
}

describe('Action-derived client keys', () => {
  it('two distinct emissions with the same args are two writes', async () => {
    const w = await world();
    await w.emit('2026-W42');
    await w.emit('2026-W43');
    expect(w.asked).toHaveLength(2);
  });

  it('a replay of the same emission is absorbed', async () => {
    const w = await world();
    await w.emit('2026-W42');
    await w.emit('2026-W42');
    expect(w.asked).toHaveLength(1);
  });
});
