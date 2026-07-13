/**
 * adapter-contract.test.js — THE D2 safeguard suite (harden round-1).
 *
 * Runs against the `adapter` INTERFACE with the adapter injected — the same
 * suite the M4 postMessage adapter must pass unchanged. Covers: every
 * ActionsApi method incl. batch/transaction; errors as TommyError with
 * correct `retryable`; queued_offline + EmitReceipt semantics; timeout
 * rejection; MODE OPACITY (no adapter-identifying property reachable from
 * the SDK surface); the unknown-method guard.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { buildSdk, createDirectAdapter, TommyError, TommySDKError } from '../src/index.js';
import { createBroker, createFakeIssuer } from '@tommy/actions-runtime';

const TENANT = 'team-4401';

const timeClockManifest = {
  id: 'time-clock',
  version: '1.0.0',
  publisher: { type: 'first_party' },
  triggers: {
    clock_out: {
      description: 'A team member clocked out',
      payloadSchema: { type: 'object', required: ['shiftId'], properties: { shiftId: { type: 'string' }, hours: { type: 'number' } }, additionalProperties: false },
      emission: 'async',
    },
  },
  conditions: {},
  activities: {},
  actions: {},
};

const timesheetsManifest = {
  id: 'timesheets',
  version: '1.0.0',
  publisher: { type: 'first_party' },
  triggers: {},
  conditions: {
    hours_for: {
      description: 'Hours for a shift',
      inputSchema: { type: 'object', required: ['shiftId'], properties: { shiftId: { type: 'string' } }, additionalProperties: false },
      returnSchema: { type: 'number' },
      latencyBudgetMs: 200,
    },
  },
  activities: {
    upsert_timesheet: {
      description: 'Create or update a timesheet entry',
      inputSchema: { type: 'object', required: ['shiftId'], properties: { shiftId: { type: 'string' }, hours: { type: 'number' } }, additionalProperties: false },
      resultSchema: { type: 'object', properties: { entryId: { type: 'string' } } },
      sideEffect: 'server_write',
      idempotency: 'client_key',
      offlineReplayable: true,
      authorizedCallers: ['time-clock'],
    },
    export_now: {
      description: 'server_write that is NOT offline-replayable (typed Offline probe)',
      inputSchema: { type: 'object' },
      sideEffect: 'server_write',
      idempotency: 'derived_from_input',
      offlineReplayable: false,
    },
    undo_upsert_timesheet: {
      description: 'Compensation for upsert_timesheet',
      inputSchema: { type: 'object' },
      sideEffect: 'local_write',
      idempotency: 'derived_from_input',
      offlineReplayable: false,
    },
    slow_op: {
      description: 'never resolves — timeout probe',
      inputSchema: { type: 'object' },
      sideEffect: 'local_write',
      idempotency: 'derived_from_input',
      offlineReplayable: false,
      retry: { maxAttempts: 1 },
    },
  },
  actions: {},
};

/** Build a world: broker + registered MPs + an SDK for time-clock via the injected adapter factory. */
async function makeWorld({ adapterFactory = createDirectAdapter, rpcTimeoutMs } = {}) {
  const issuer = createFakeIssuer();
  const applied = [];
  const undone = [];
  // The server_write seam — stands in for the F0 typed client's invoke.
  const serverInvoke = async (envelope) => {
    applied.push(envelope.args);
    return { rpcId: envelope.rpcId, status: 'succeeded', result: { entryId: `entry-${applied.length}` } };
  };
  const broker = createBroker({ capabilityService: issuer, serverInvoke });

  broker.registerMp(timesheetsManifest, {
    handlers: {
      conditions: { hours_for: () => 8.04 },
      activities: {
        undo_upsert_timesheet: (args) => { undone.push(args); return {}; },
        slow_op: () => new Promise(() => {}),
      },
    },
  });
  broker.registerMp(timeClockManifest, { handlers: {} });

  const token = await issuer.issue('time-clock', '1.0.0', TENANT, ['invoke:timesheets.upsert_timesheet', 'invoke:timesheets.slow_op', 'invoke:timesheets.export_now'], 'inst-1');
  const init = {
    instanceId: 'inst-1',
    mpId: 'time-clock',
    tenant: { tenantId: TENANT, displayName: 'Test', roles: [] },
    locale: 'en',
    capabilityToken: token,
    grantedScopes: token.effectiveScopes,
    surfaceContext: { surface: 'dashboard' },
    mpConfig: {},
    sharedDeps: {},
  };
  const adapter = adapterFactory({ broker, init, rpcTimeoutMs });
  const sdk = buildSdk({ adapter, init, locales: { en: { greet: 'Hi {{name}}' } } });
  return { sdk, broker, applied, undone, issuer, init };
}

describe('adapter contract (parameterised — direct adapter at M1)', () => {
  let world;
  beforeEach(async () => { world = await makeWorld(); });

  it('emit resolves an EmitReceipt once the broker durably accepted', async () => {
    world.broker.subscribe('timesheets', 'time-clock.clock_out', () => {});
    const receipt = await world.sdk.actions.emit('clock_out', { shiftId: 's-1', hours: 8 });
    expect(receipt.emitId).toBeTruthy();
    expect(receipt.deliveredTo).toBe(1);
    expect(receipt.queuedFor).toBe(0);
  });

  it('emit rejects InvalidPayload (TommyError, non-retryable) before fan-out', async () => {
    world.broker.subscribe('timesheets', 'time-clock.clock_out', () => {});
    const rejection = await world.sdk.actions.emit('clock_out', { wrong: true }).catch((e) => e);
    expect(rejection).toBeInstanceOf(TommyError);
    expect(rejection.code).toBe('InvalidPayload');
    expect(rejection.retryable).toBe(false);
  });

  it('query returns the condition value; unknown condition is a named error', async () => {
    expect(await world.sdk.actions.query('timesheets.hours_for', { shiftId: 's-1' })).toBe(8.04);
    const rejection = await world.sdk.actions.query('timesheets.nope', {}).catch((e) => e);
    expect(rejection.code).toBe('UnknownCondition');
  });

  it('invoke resolves InvokeResult validated against resultSchema', async () => {
    const result = await world.sdk.actions.invoke('timesheets.upsert_timesheet', { shiftId: 's-1', hours: 8 });
    expect(result.status).toBe('succeeded');
    expect(result.result.entryId).toBe('entry-1');
  });

  it('subscribe delivers payload + TriggerMeta and unsubscribes cleanly', async () => {
    const seen = [];
    const unsubscribe = world.sdk.actions.subscribe('time-clock.clock_out', (payload, meta) => {
      seen.push({ payload, meta });
    });
    await world.sdk.actions.emit('clock_out', { shiftId: 's-2' });
    expect(seen).toHaveLength(1);
    expect(seen[0].meta.emitterMpId).toBe('time-clock');
    expect(seen[0].meta.live).toBe(true);
    unsubscribe();
    // No consumer left -> suppressed by the Active Trigger Index, no delivery.
    await world.sdk.actions.emit('clock_out', { shiftId: 's-3' });
    expect(seen).toHaveLength(1);
  });

  it('batch settles each call independently', async () => {
    const results = await world.sdk.actions.batch([
      { kind: 'query', condition: 'timesheets.hours_for', args: { shiftId: 's-1' } },
      { kind: 'invoke', activity: 'timesheets.upsert_timesheet', args: { shiftId: 's-1', hours: 1 } },
      { kind: 'query', condition: 'timesheets.missing', args: {} },
    ]);
    expect(results[0].status).toBe('fulfilled');
    expect(results[1].status).toBe('fulfilled');
    expect(results[2].status).toBe('rejected');
    expect(results[2].reason.code).toBe('UnknownCondition');
  });

  it('transaction compensates applied steps in reverse via undo_* on failure', async () => {
    const failure = await world.sdk.actions.transaction(async (tx) => {
      await tx.invoke('timesheets.upsert_timesheet', { shiftId: 's-1', hours: 2 });
      throw new Error('step 2 exploded');
    }).catch((e) => e);
    expect(failure.message).toBe('step 2 exploded');
    expect(world.applied).toHaveLength(1);
    expect(world.undone).toHaveLength(1);
    expect(world.undone[0].shiftId).toBe('s-1');
  });

  it('offline: replayable invoke resolves queued_offline; emit receipt reports queuedFor', async () => {
    world.broker.subscribe('timesheets', 'time-clock.clock_out', () => {});
    world.broker.setOnline(false);
    const result = await world.sdk.actions.invoke('timesheets.upsert_timesheet', { shiftId: 's-off', hours: 1 });
    expect(result.status).toBe('queued_offline');
    const receipt = await world.sdk.actions.emit('clock_out', { shiftId: 's-off' });
    expect(receipt.queuedFor).toBe(1);
    expect(world.applied).toHaveLength(0);
  });

  it('offline: a non-replayable activity rejects with the typed Offline error', async () => {
    world.broker.setOnline(false);
    const rejection = await world.sdk.actions.invoke('timesheets.export_now', {}).catch((e) => e);
    expect(rejection.code).toBe('Offline');
    expect(rejection.retryable).toBe(false);
  });

  it('a non-responding broker entry rejects Timeout — never hangs', async () => {
    const fast = await makeWorld({ rpcTimeoutMs: 50 });
    const rejection = await fast.sdk.actions.invoke('timesheets.slow_op', {}).catch((e) => e);
    expect(rejection.code).toBe('Timeout');
    expect(rejection.retryable).toBe(true);
  });

  it('MODE OPACITY: no adapter-identifying property is reachable from the SDK surface', () => {
    const surface = world.sdk;
    expect(Object.keys(surface)).not.toContain('adapter');
    expect(Object.keys(surface)).not.toContain('broker');
    expect(Object.keys(surface.actions)).not.toContain('rpc');
    expect(JSON.stringify(Object.keys(surface))).not.toMatch(/postmessage|iframe|\badapter\b|\bbroker\b/i);
  });

  it('unknown-method guard throws a helpful named error with a suggestion', () => {
    let thrown;
    try { world.sdk.actions.emitt('x', {}); } catch (e) { thrown = e; }
    expect(thrown).toBeInstanceOf(TommySDKError);
    expect(thrown.code).toBe('UnknownMethod');
    expect(thrown.message).toContain("Did you mean 'tommy.actions.emit'");
    expect(() => world.sdk.panels.subscribe()).toThrow(/tommy\.panels\.subscribe does not exist/);
  });

  it('t() is bound to the MP bundle locales with {{var}} interpolation', () => {
    expect(world.sdk.t('greet', 'fallback', { name: 'Dana' })).toBe('Hi Dana');
    expect(world.sdk.t('missing.key', 'the fallback')).toBe('the fallback');
  });
});
