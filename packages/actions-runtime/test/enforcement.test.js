/**
 * enforcement.test.js (ac2) — unauthorized caller denied, throttle trips,
 * loop capped — all with NAMED errors (actions-runtime.md §6/§7/§8).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createBroker, createFakeIssuer, DEFAULT_THROTTLE_PROFILE } from '../src/index.js';

const TENANT = 'team-1';

const owner = {
  id: 'timesheets',
  version: '1.0.0',
  publisher: { type: 'first_party' },
  triggers: {
    submitted: { description: 't', payloadSchema: { type: 'object' }, emission: 'async' },
  },
  conditions: {
    hours_for: {
      description: 'c',
      inputSchema: { type: 'object' },
      returnSchema: { type: 'number' },
      latencyBudgetMs: 100,
      cacheable: true,
      cacheTtlMs: 60000,
    },
  },
  activities: {
    submit: {
      description: 'a',
      inputSchema: { type: 'object' },
      sideEffect: 'local_write',
      idempotency: 'derived_from_input',
      offlineReplayable: false,
      authorizedCallers: ['time-clock'],
      retry: { maxAttempts: 1 },
    },
    report: {
      description: 'acme-callable — used by the chain-cap probes',
      inputSchema: { type: 'object' },
      sideEffect: 'local_write',
      idempotency: 'derived_from_input',
      offlineReplayable: false,
      authorizedCallers: ['acme-reporting'],
      retry: { maxAttempts: 1 },
    },
  },
  actions: {},
};

const thirdParty = {
  id: 'acme-reporting',
  version: '2.0.0',
  publisher: { type: 'third_party' },
  triggers: { ping: { description: 't', payloadSchema: { type: 'object' }, emission: 'async' } },
  conditions: {},
  activities: {},
  actions: {},
};

async function world({ throttleOverrides } = {}) {
  const issuer = createFakeIssuer();
  const broker = createBroker({ capabilityService: issuer, throttleOverrides });
  let evals = 0;
  broker.registerMp(owner, {
    handlers: {
      conditions: { hours_for: () => { evals += 1; return 8; } },
      activities: { submit: () => ({}), report: () => ({}) },
    },
  });
  broker.registerMp(thirdParty, { handlers: {} });
  const token = await issuer.issue('acme-reporting', '2.0.0', TENANT, ['invoke:timesheets.submit', 'invoke:timesheets.report'], 'i-1');
  return { broker, token, issuer, evalCount: () => evals };
}

describe('broker enforcement', () => {
  let w;
  beforeEach(async () => { w = await world(); });

  it('denies an unauthorized caller with the NAMED rule (authorizedCallers)', async () => {
    const rejection = await w.broker.invoke({
      sourceMpId: 'acme-reporting',
      instanceId: 'i-1',
      capabilityToken: w.token,
      activity: 'timesheets.submit',
      args: {},
    }).catch((e) => e);
    expect(rejection.code).toBe('PermissionDenied');
    expect(rejection.message).toContain("does not list 'acme-reporting' in authorizedCallers");
    expect(rejection.rule).toBe('activities.submit.authorizedCallers');
    // The denial itself is a failed action-run record (§6.5)? Denials happen
    // pre-record at M1 dispatch entry — asserted via records suite for the
    // executed path; the named error is the contract here.
  });

  it('rejects an expired capability token with CapabilityTokenInvalid', async () => {
    const stale = { ...w.token, expiresAt: new Date(Date.now() - 1000).toISOString() };
    const rejection = await w.broker.invoke({
      sourceMpId: 'acme-reporting', instanceId: 'i-1', capabilityToken: stale, activity: 'timesheets.submit', args: {},
    }).catch((e) => e);
    expect(rejection.code).toBe('CapabilityTokenInvalid');
  });

  it('rejects a token bound to a different MP', async () => {
    const rejection = await w.broker.invoke({
      sourceMpId: 'timesheets', instanceId: 'i-1', capabilityToken: w.token, activity: 'timesheets.submit', args: {},
    }).catch((e) => e);
    expect(rejection.code).toBe('CapabilityTokenInvalid');
  });

  it('trips the per-MP throttle with RateLimited (retryable) after the burst window', async () => {
    const tight = await world({ throttleOverrides: { 'acme-reporting': { burst: 3, emitsPerMin: 1 } } });
    const emit = () => tight.broker.emit({
      sourceMpId: 'acme-reporting', instanceId: 'i-1', capabilityToken: tight.token, trigger: 'acme-reporting.ping', payload: {},
    });
    // Burst of 3 passes (suppressed — no consumer — but rate still charged).
    await emit(); await emit(); await emit();
    const rejection = await emit().catch((e) => e);
    expect(rejection.code).toBe('RateLimited');
    expect(rejection.retryable).toBe(true);
  });

  it('caps loops with LoopDetected on same-node ancestry repeats', async () => {
    const chain = {
      rootRunId: 'root-1',
      depth: 3,
      chainPath: ['acme-reporting:invoke(timesheets.report)', 'acme-reporting:invoke(timesheets.report)', 'acme-reporting:invoke(timesheets.report)'],
    };
    const tokenTc = await w.issuer.issue('time-clock', '1.0.0', TENANT, ['invoke:timesheets.submit'], 'i-2');
    const rejection = await w.broker.invoke({
      sourceMpId: 'acme-reporting', instanceId: 'i-1', capabilityToken: w.token, activity: 'timesheets.report', args: {}, chain,
    }).catch((e) => e);
    expect(rejection.code).toBe('LoopDetected');
    expect(rejection.retryable).toBe(false);
    expect(tokenTc).toBeTruthy();
  });

  it('caps depth with ChainDepthExceeded', async () => {
    const chain = { rootRunId: 'root-2', depth: DEFAULT_THROTTLE_PROFILE.maxChainDepth + 1, chainPath: [] };
    const rejection = await w.broker.invoke({
      sourceMpId: 'acme-reporting', instanceId: 'i-1', capabilityToken: w.token, activity: 'timesheets.report', args: {}, chain,
    }).catch((e) => e);
    expect(rejection.code).toBe('ChainDepthExceeded');
  });

  it('caps total chain fan-out with FanoutLimitExceeded', async () => {
    const small = await world({ throttleOverrides: { 'acme-reporting': { maxFanoutPerRoot: 2, burst: 30 } } });
    const call = () => small.broker.invoke({
      sourceMpId: 'acme-reporting', instanceId: 'i-1', capabilityToken: small.token,
      activity: 'timesheets.report', args: {}, chain: { rootRunId: 'root-3', depth: 1, chainPath: [] },
    });
    await call(); await call();
    const rejection = await call().catch((e) => e);
    expect(rejection.code).toBe('FanoutLimitExceeded');
  });

  it('memoises cacheable conditions per (condition,args) within cacheTtlMs (§2.5)', async () => {
    const query = () => w.broker.query({
      sourceMpId: 'acme-reporting', instanceId: 'i-1', capabilityToken: w.token, condition: 'timesheets.hours_for', args: { shiftId: 's-1' },
    });
    await query(); await query(); await query();
    expect(w.evalCount()).toBe(1);
  });

  it('unknown activity/trigger are hard NAMED failures', async () => {
    const badInvoke = await w.broker.invoke({
      sourceMpId: 'acme-reporting', instanceId: 'i-1', capabilityToken: w.token, activity: 'timesheets.missing', args: {},
    }).catch((e) => e);
    expect(badInvoke.code).toBe('UnknownActivity');
    const badEmit = await w.broker.emit({
      sourceMpId: 'acme-reporting', instanceId: 'i-1', capabilityToken: w.token, trigger: 'nobody.owns_this', payload: {},
    }).catch((e) => e);
    expect(badEmit.code).toBe('UnknownTrigger');
  });
});
