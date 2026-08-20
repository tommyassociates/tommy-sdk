/**
 * provider-readiness.test.js — the MP REGISTRATION RACE, made waitable.
 *
 * An MP registers only once its bundle has been fetched and evaluated, and the
 * host mounts each MP's surfaces AS SOON AS THAT MP registers rather than
 * blocking the route on the whole fan-out (the instant-boot optimisation in
 * app/src/services/mp-loader/index.js, `mountReadySurfacesFor`). So a panel can
 * be live and dispatching while a DIFFERENT MP it consumes is still mid-fetch.
 *
 * Before this, the broker had one answer for both cases: UnknownCondition. That
 * is indistinguishable from "the MP is not installed", and consumers wrap these
 * reads in a safeQuery default — so the failure was silent. MEASURED on the
 * `availability/main` parity pair, 2026-08-21: all four `leave.*` reads failed
 * with `condition 'leave.leave_requests' is not registered` while the SAME boot
 * summary reported `mps: 2, mounted: 2`. Leave was installed, loading, and had
 * simply not got there yet; the Next-Time-Off card rendered empty.
 *
 * `expectMps()` lets the host declare the loading set, so the broker can tell
 * "not YET" from "not installed" — and wait for the first without ever delaying
 * the second.
 */
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

/**
 * Register on a TIMER, not synchronously after the dispatch call.
 *
 * ⚠ THIS DETAIL IS LOAD-BEARING AND WAS FOUND BY MUTATION TESTING. `invoke()`
 * awaits several steps (idempotency ledger, offline-queue check) before it
 * looks the MP up, so a SYNCHRONOUS `registerProvider()` on the next line lands
 * during those awaits — the entry is present by the time the lookup runs, and
 * the test passes whether or not the wait exists. Written that way, the write
 * half of this suite proved nothing: stubbing the fix left it green. A timer
 * puts registration after a real turn of the event loop, which is the race the
 * host actually produces (a bundle fetch), and reds correctly when the wait is
 * removed.
 */
const registerProviderLate = (broker, ms = 15) => setTimeout(() => registerProvider(broker), ms);

async function world({ registrationTimeoutMs = 8000 } = {}) {
  const issuer = createFakeIssuer();
  const broker = createBroker({ capabilityService: issuer, registrationTimeoutMs });
  broker.registerMp(consumer, { handlers: {} });
  // The cross-MP write grant — this suite is about the RACE, not authorisation,
  // so the caller is granted what authz-invoke.test.js exists to police.
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

    // Dispatch FIRST, register after — the boot ordering the panel actually hit.
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
    const w = await world({ registrationTimeoutMs: 50 });
    registerProvider(w.broker);
    w.broker.expectMps(['leave']); // late, and must not re-arm a wait

    // If this waited it would still resolve, so prove it did not: the timeout is
    // 50ms and this must resolve well inside it.
    const started = Date.now();
    expect(await w.query()).toBe('requests');
    expect(Date.now() - started).toBeLessThan(40);
  });
});

describe('provider readiness — an UNANNOUNCED MP still fails fast', () => {
  it('a read for an MP the host never announced raises UnknownCondition immediately', async () => {
    const w = await world({ registrationTimeoutMs: 60_000 }); // a wait would hang the test
    const rejection = await w.query().catch((e) => e);

    expect(rejection.code).toBe('UnknownCondition');
    expect(rejection.message).toContain("'leave.leave_requests' is not registered");
  });

  it('a write for an MP the host never announced raises UnknownActivity immediately', async () => {
    const w = await world({ registrationTimeoutMs: 60_000 });
    const rejection = await w.invoke().catch((e) => e);

    expect(rejection.code).toBe('UnknownActivity');
  });

  // ⚠ THE DISTINCTION THE WAIT IS GATED ON. A REGISTERED MP missing the named
  // condition is a manifest error, not a race. Waiting on it would turn an
  // instant, accurate failure into a timeout that lies about the cause.
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
    // The bundle-fetch-failed path: the host knows the MP is not coming, so
    // callers must not keep paying for the announcement.
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
