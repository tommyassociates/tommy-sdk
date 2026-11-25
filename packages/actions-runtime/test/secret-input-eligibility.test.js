import { describe, it, expect, vi } from 'vitest';
import { createBroker, createFakeIssuer } from '../src/index.js';

const TENANT = 'team-1';

const write = (inputSchema) => ({
  description: 'a write',
  inputSchema,
  sideEffect: 'server_write',
  idempotency: 'client_key',
  offlineReplayable: true,
  retry: { maxAttempts: 1 },
});

let depth = { type: 'object', properties: { password: { type: 'string' } } };
for (let i = 0; i < 10; i += 1) depth = { type: 'object', properties: { inner: depth } };

const SCHEMAS = {
  'a password under a local $ref': {
    type: 'object', properties: { login: { $ref: '#/$defs/login' } }, $defs: { login: { type: 'object', properties: { password: { type: 'string' } } } },
  },
  'a writeOnly field under a local $ref': {
    type: 'object', properties: { code: { $ref: '#/definitions/code' } }, definitions: { code: { type: 'string', writeOnly: true } },
  },
  'a remote $ref it cannot read': { type: 'object', properties: { login: { $ref: 'https://example.test/login.json' } } },
  'a password past the inspected depth': depth,
  'a PIN under additionalProperties': { type: 'object', additionalProperties: { type: 'object', properties: { pin: { type: 'string' } } } },
  'a token under patternProperties': { type: 'object', patternProperties: { '^x-': { type: 'object', properties: { token: { type: 'string' } } } } },
  'a secret in prefixItems': { type: 'array', prefixItems: [{ type: 'object', properties: { secret: { type: 'string' } } }] },
  'a writeOnly field under a draft-07 schema dependency': {
    type: 'object', properties: { note: { type: 'string' } }, dependencies: { note: { properties: { credential: { type: 'string', writeOnly: true } } } },
  },
};

async function brokerWith(inputSchema) {
  const issuer = createFakeIssuer();
  const broker = createBroker({
    capabilityService: issuer,
    serverInvoke: vi.fn(async () => { throw Object.assign(new Error('no answer'), { code: 'Timeout' }); }),
    sleep: async () => {},
    queueOwner: () => ({ tenantId: TENANT }),
    replayEnvelope: async (envelope) => envelope,
  });
  broker.registerMp({
    id: 'kiosk', version: '1.0.0', publisher: { type: 'first_party' }, triggers: {}, conditions: {},
    activities: { sign_in: write(inputSchema) }, actions: {},
  }, { handlers: { activities: {} } });
  const token = await issuer.issue('kiosk', '1.0.0', TENANT, [], 'i-1');
  return { broker, token };
}

describe('a write whose schema cannot be fully inspected is never kept for a confirm', () => {
  it.each(Object.entries(SCHEMAS))('%s', async (_, inputSchema) => {
    const { broker } = await brokerWith(inputSchema);
    await expect(broker.confirmWriteOutcome('kiosk', 'sign_in', 'k-1')).rejects.toMatchObject({ details: { reason: 'not_eligible' } });
  });

  it('the request of such a write is not kept', async () => {
    const { broker, token } = await brokerWith(SCHEMAS['a password under a local $ref']);
    await broker.invoke({
      sourceMpId: 'kiosk', instanceId: 'i-1', capabilityToken: token, activity: 'kiosk.sign_in', args: {}, idempotencyKey: 'k-1',
    }).catch(() => {});
    expect(broker.writeOutcome('kiosk', 'sign_in', 'k-1')).toMatchObject({ state: 'unconfirmed', confirmable: false });
  });

  it('a plain schema stays eligible', async () => {
    const { broker, token } = await brokerWith({ type: 'object', properties: { note: { $ref: '#/$defs/note' } }, $defs: { note: { type: 'string' } } });
    await broker.invoke({
      sourceMpId: 'kiosk', instanceId: 'i-1', capabilityToken: token, activity: 'kiosk.sign_in', args: {}, idempotencyKey: 'k-1',
    }).catch(() => {});
    expect(broker.writeOutcome('kiosk', 'sign_in', 'k-1')).toMatchObject({ state: 'unconfirmed', confirmable: true });
  });
});
