import { describe, it, expect } from 'vitest';
import { createBroker, createFakeIssuer } from '../src/index.js';

const TENANT = 'team-1';

const condition = () => ({
  description: 'c', inputSchema: { type: 'object' }, returnSchema: { type: 'string' }, latencyBudgetMs: 100,
});
const activity = () => ({
  description: 'a',
  sideEffect: 'local_write',
  idempotency: 'client_key',
  inputSchema: { type: 'object' },
  resultSchema: { type: 'object' },
});

const provider = {
  id: 'leave',
  version: '1.0.0',
  publisher: { type: 'first_party' },
  triggers: {},
  conditions: { leave_requests: condition() },
  activities: { request_leave: activity() },
  actions: {},
};

const consumer = {
  id: 'availability',
  version: '1.0.0',
  publisher: { type: 'first_party' },
  triggers: {},
  conditions: {},
  activities: {},
  actions: {},
};

const registerProvider = (broker) => broker.registerMp(provider, {
  handlers: {
    conditions: { leave_requests: () => 'requests' },
    activities: { request_leave: () => ({ ok: true }) },
  },
});

const registerProviderLate = (broker, ms = 15) => setTimeout(() => registerProvider(broker), ms);

async function world({ registrationTimeoutMs = 8000 } = {}) {
  const issuer = createFakeIssuer();
  const broker = createBroker({ capabilityService: issuer, registrationTimeoutMs });
  broker.registerMp(consumer, { handlers: {} });
  const token = await issuer.issue('availability', '1.0.0', TENANT, ['invoke:leave.request_leave'], 'i-av');
  return {
    broker,
    query: () => broker.query({
      sourceMpId: 'availability', instanceId: 'i-av', capabilityToken: token, condition: 'leave.leave_requests', args: {},
    }),
    invoke: () => broker.invoke({
      sourceMpId: 'availability', instanceId: 'i-av', capabilityToken: token, activity: 'leave.request_leave', args: {}, idempotencyKey: 'k1',
    }),
  };
}

describe('provider readiness — an ANNOUNCED MP is waited for', () => {
  it('THE `availability/main` DEFECT: a read that lands before the provider registers waits, then succeeds', async () => {
    const w = await world();
    w.broker.expectMps(['leave']);

    const pending = w.query();
    registerProviderLate(w.broker);

    expect(await pending).toBe('requests');
  });

  it('the WRITE half of the same race waits too', async () => {
    const w = await world();
    w.broker.expectMps(['leave']);

    const pending = w.invoke();
    registerProviderLate(w.broker);

    expect((await pending).result).toEqual({ ok: true });
  });

  it('several callers racing the same provider all resolve on one registration', async () => {
    const w = await world();
    w.broker.expectMps(['leave']);

    const pending = [w.query(), w.query(), w.query()];
    registerProviderLate(w.broker);

    expect(await Promise.all(pending)).toEqual(['requests', 'requests', 'requests']);
  });

  it('an already-registered provider does NOT wait — announcing it is a no-op', async () => {
    const w = await world({ registrationTimeoutMs: 30_000 });
    registerProvider(w.broker);
    w.broker.expectMps(['leave']);

    const started = Date.now();
    expect(await w.query()).toBe('requests');
    expect(Date.now() - started).toBeLessThan(1_000);
  });
});

describe('provider readiness — an UNANNOUNCED MP still fails fast', () => {
  it('a read for an MP the host never announced raises UnknownCondition immediately', async () => {
    const w = await world({ registrationTimeoutMs: 60_000 });
    const rejection = await w.query().catch((e) => e);

    expect(rejection.code).toBe('UnknownCondition');
    expect(rejection.message).toContain("'leave.leave_requests' is not registered");
  });

  it('a write for an MP the host never announced raises UnknownActivity immediately', async () => {
    const w = await world({ registrationTimeoutMs: 60_000 });
    const rejection = await w.invoke().catch((e) => e);

    expect(rejection.code).toBe('UnknownActivity');
  });

  it('a REGISTERED provider missing the condition fails immediately, announced or not', async () => {
    const w = await world({ registrationTimeoutMs: 60_000 });
    w.broker.expectMps(['leave']);
    registerProvider(w.broker);

    const rejection = await w.broker.query({
      sourceMpId: 'availability',
      instanceId: 'i-av',
      capabilityToken: await createFakeIssuer().issue('availability', '1.0.0', TENANT, [], 'i-av'),
      condition: 'leave.no_such_condition',
      args: {},
    }).catch((e) => e);

    expect(rejection.code).toBe('UnknownCondition');
  });
});

describe('provider readiness — an announcement is a promise the host must keep', () => {
  it('a provider that never arrives fails with the ordinary error once the timeout elapses', async () => {
    const w = await world({ registrationTimeoutMs: 30 });
    w.broker.expectMps(['leave']);

    const rejection = await w.query().catch((e) => e);
    expect(rejection.code).toBe('UnknownCondition');
  });

  it('stopExpecting releases waiters AT ONCE rather than making each burn the timeout', async () => {
    const w = await world({ registrationTimeoutMs: 60_000 });
    w.broker.expectMps(['leave']);

    const pending = w.query().catch((e) => e);
    w.broker.stopExpecting('leave');

    const rejection = await pending;
    expect(rejection.code).toBe('UnknownCondition');
  });

  it('after stopExpecting, a fresh read fails fast instead of re-arming the wait', async () => {
    const w = await world({ registrationTimeoutMs: 60_000 });
    w.broker.expectMps(['leave']);
    w.broker.stopExpecting('leave');

    const rejection = await w.query().catch((e) => e);
    expect(rejection.code).toBe('UnknownCondition');
  });

  it('registering clears the announcement, so a later read never waits again', async () => {
    const w = await world({ registrationTimeoutMs: 50 });
    w.broker.expectMps(['leave']);
    registerProvider(w.broker);

    const started = Date.now();
    expect(await w.query()).toBe('requests');
    expect(Date.now() - started).toBeLessThan(40);
  });
});
