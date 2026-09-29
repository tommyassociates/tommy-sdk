/**
 * inflight-join.test.js — an invoke whose idempotency key matches a run still
 * in flight (same activity, same tenant) joins that run and receives its result
 * or error; the activity is applied once.
 *
 * A second invoke from an MP whose chain is executing a handler runs inline
 * (re-entrancy, F6), so without the join it would pass the stored-result check
 * before the first run stored its result and apply the write again. A join
 * waits at most `inflightJoinTimeoutMs`, so a handler that invokes its own
 * activity with its own key is rejected instead of waiting on itself.
 */
import { describe, it, expect } from 'vitest';
import { createDirectAdapter } from '@tommy/sdk';
import { createBroker, createFakeIssuer } from '../src/index.js';

const TENANT = 'team-1';

function settles(promise, ms, what) {
  let timer;
  const guard = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`HANG: ${what} did not settle within ${ms}ms`)), ms);
  });
  return Promise.race([promise, guard]).finally(() => clearTimeout(timer));
}

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

const tick = (ms = 10) => new Promise((resolve) => { setTimeout(resolve, ms); });

const activity = (extra = {}) => ({
  description: 'a',
  inputSchema: { type: 'object' },
  resultSchema: { type: 'object' },
  sideEffect: 'local_write',
  idempotency: 'derived_from_input',
  offlineReplayable: false,
  retry: { maxAttempts: 1 },
  ...extra,
});

async function world(activities, handlers, options = {}) {
  const issuer = createFakeIssuer();
  const broker = createBroker({ capabilityService: issuer, ...options });
  broker.registerMp({
    id: 'availability',
    version: '1.0.0',
    publisher: { type: 'first_party' },
    triggers: {},
    conditions: {},
    activities,
    actions: {},
  }, { handlers: { activities: handlers(() => broker) } });
  const token = await issuer.issue('availability', '1.0.0', TENANT, [], 'i-1');
  const invoke = (name, args = {}, extra = {}) => broker.invoke({
    sourceMpId: 'availability', instanceId: 'i-1', capabilityToken: token, activity: `availability.${name}`, args, ...extra,
  });
  return { broker, invoke };
}

describe('an invoke joins a run in flight with the same key', () => {
  it('a duplicate arriving while the first run is in its handler is applied once and gets the same result', async () => {
    const applied = [];
    const started = deferred();
    const release = deferred();
    const w = await world({ save: activity() }, () => ({
      save: async (args) => {
        applied.push(args);
        started.resolve();
        await release.promise;
        return { saved: applied.length };
      },
    }));

    const first = w.invoke('save', { id: 7 });
    await started.promise;
    const second = w.invoke('save', { id: 7 });
    await tick();
    release.resolve();

    const [a, b] = await settles(Promise.all([first, second]), 1500, 'duplicate invokes');
    expect(applied).toHaveLength(1);
    expect(a.result).toEqual({ saved: 1 });
    expect(b.result).toEqual({ saved: 1 });
    expect(b.idempotentReplay).toBe(true);
  });

  it('a joiner receives the error of the run it joined', async () => {
    let calls = 0;
    const started = deferred();
    const release = deferred();
    const w = await world({ save: activity() }, () => ({
      save: async () => {
        calls += 1;
        started.resolve();
        await release.promise;
        throw new Error('write refused');
      },
    }));

    const first = w.invoke('save', { id: 7 }).catch((e) => e);
    await started.promise;
    const second = w.invoke('save', { id: 7 }).catch((e) => e);
    await tick();
    release.resolve();

    const [a, b] = await settles(Promise.all([first, second]), 1500, 'failing duplicate invokes');
    expect(calls).toBe(1);
    expect(a.code).toBe('ActivityFailed');
    expect(b.code).toBe('ActivityFailed');
    expect(b.message).toBe(a.message);
  });

  it('distinct keys during a running handler still each run', async () => {
    const applied = [];
    const started = deferred();
    const release = deferred();
    const w = await world({ save: activity() }, () => ({
      save: async (args) => {
        applied.push(args.id);
        if (args.id === 1) {
          started.resolve();
          await release.promise;
        }
        return { id: args.id };
      },
    }));

    const first = w.invoke('save', { id: 1 });
    await started.promise;
    const second = w.invoke('save', { id: 2 });
    await tick();
    release.resolve();

    const [a, b] = await settles(Promise.all([first, second]), 1500, 'distinct invokes');
    expect(applied.sort()).toEqual([1, 2]);
    expect(a.result).toEqual({ id: 1 });
    expect(b.result).toEqual({ id: 2 });
    expect(b.idempotentReplay).toBeUndefined();
  });

  it('a nested fan-out over distinct windows still runs inline (the Availability lock pattern)', async () => {
    const locked = [];
    const w = await world({
      lock_window_for_shift: activity(),
      lock_window: activity({ idempotency: 'client_key' }),
    }, (broker) => ({
      lock_window_for_shift: async ({ windows }) => {
        const results = [];
        for (const window of windows) {
          // eslint-disable-next-line no-await-in-loop
          const res = await broker().invoke({
            sourceMpId: 'availability',
            instanceId: 'i-1',
            capabilityToken: undefined,
            identity: { mpId: 'availability', tenantId: TENANT, scopes: [], tokenId: 'nested' },
            activity: 'availability.lock_window',
            args: { window },
            idempotencyKey: `lock-${window}`,
          });
          results.push(res.result.window);
        }
        return { windows: results };
      },
      lock_window: async ({ window }) => { locked.push(window); return { window }; },
    }));

    const receipt = await settles(w.invoke('lock_window_for_shift', { windows: ['am', 'pm'] }), 1500, 'nested fan-out');
    expect(receipt.result).toEqual({ windows: ['am', 'pm'] });
    expect(locked).toEqual(['am', 'pm']);
  });

  it('a handler invoking its own activity with its own key is rejected, not left waiting on itself', async () => {
    let calls = 0;
    const w = await world({ save: activity() }, (broker) => ({
      save: async (args) => {
        calls += 1;
        const inner = await broker().invoke({
          sourceMpId: 'availability',
          instanceId: 'i-1',
          identity: { mpId: 'availability', tenantId: TENANT, scopes: [], tokenId: 'nested' },
          activity: 'availability.save',
          args,
        }).catch((e) => e);
        return { innerCode: inner.code, innerRetryable: inner.retryable };
      },
    }), { inflightJoinTimeoutMs: 50 });

    const receipt = await settles(w.invoke('save', { id: 7 }), 1500, 'self-invoke');
    expect(calls).toBe(1);
    expect(receipt.result).toEqual({ innerCode: 'Timeout', innerRetryable: false });
  });

  it("through the SDK adapter, the join is refused before the caller's own RPC timeout fires", async () => {
    const issuer = createFakeIssuer();
    const broker = createBroker({ capabilityService: issuer });
    const token = await issuer.issue('availability', '1.0.0', TENANT, [], 'i-1');
    const adapter = createDirectAdapter({
      broker,
      init: { mpId: 'availability', instanceId: 'i-1', capabilityToken: token, tenant: { tenantId: TENANT } },
      rpcTimeoutMs: 400,
    });
    let calls = 0;
    broker.registerMp({
      id: 'availability',
      version: '1.0.0',
      publisher: { type: 'first_party' },
      triggers: {},
      conditions: {},
      activities: { save: activity() },
      actions: {},
    }, {
      handlers: {
        activities: {
          save: async (args) => {
            calls += 1;
            const inner = await adapter.rpc({ kind: 'invoke', activity: 'availability.save', args }).catch((e) => e);
            return { innerCode: inner.code, innerRule: inner.rule, innerRetryable: inner.retryable };
          },
        },
      },
    });

    const receipt = await settles(adapter.rpc({ kind: 'invoke', activity: 'availability.save', args: { id: 7 } }), 1500, 'self-invoke via adapter');
    expect(calls).toBe(1);
    expect(receipt.result).toEqual({ innerCode: 'Timeout', innerRule: 'idempotency.inflight', innerRetryable: false });
  });

  it('a replay drained from the offline queue is not bound by the deadline of the call that queued it', async () => {
    const started = deferred();
    const release = deferred();
    let calls = 0;
    const w = await world({ save: activity({ sideEffect: 'server_write', offlineReplayable: true, idempotency: 'client_key' }) }, () => ({}), {
      serverInvoke: async () => {
        calls += 1;
        started.resolve();
        await release.promise;
        return { status: 'succeeded', result: { saved: true } };
      },
    });
    w.broker.setOnline(false);
    const queued = await w.invoke('save', { id: 7 }, { idempotencyKey: 'k-7', rpcDeadlineAt: Date.now() - 1 });
    expect(queued.status).toBe('queued_offline');
    w.broker.setOnline(true);
    const live = w.invoke('save', { id: 7 }, { idempotencyKey: 'k-7' });
    await started.promise;
    const drained = w.broker.drainOfflineQueue();
    await tick();
    release.resolve();
    const [, results] = await settles(Promise.all([live, drained]), 1500, 'drain beside a live run');
    expect(calls).toBe(1);
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(true);
    expect(results[0].result.idempotentReplay).toBe(true);
  });

  async function adapterWorld({ rpcTimeoutMs, brokerOptions = {}, save }) {
    const issuer = createFakeIssuer();
    const broker = createBroker({ capabilityService: issuer, ...brokerOptions });
    const token = await issuer.issue('availability', '1.0.0', TENANT, [], 'i-1');
    const adapter = createDirectAdapter({
      broker,
      init: { mpId: 'availability', instanceId: 'i-1', capabilityToken: token, tenant: { tenantId: TENANT } },
      rpcTimeoutMs,
    });
    broker.registerMp({
      id: 'availability',
      version: '1.0.0',
      publisher: { type: 'first_party' },
      triggers: {},
      conditions: {},
      activities: { save: activity() },
      actions: {},
    }, { handlers: { activities: { save: (args) => save(args, adapter) } } });
    const call = (args) => adapter.rpc({ kind: 'invoke', activity: 'availability.save', args });
    return { call };
  }

  it('under a short RPC timeout, a join still waits for a run that settles within the budget', async () => {
    const started = deferred();
    let calls = 0;
    const w = await adapterWorld({
      rpcTimeoutMs: 200,
      save: async () => {
        calls += 1;
        started.resolve();
        await tick(40);
        return { saved: calls };
      },
    });
    const first = w.call({ id: 7 });
    await started.promise;
    const second = w.call({ id: 7 });
    const [a, b] = await settles(Promise.all([first, second]), 1500, 'short-timeout join');
    expect(calls).toBe(1);
    expect(a.result).toEqual({ saved: 1 });
    expect(b.result).toEqual({ saved: 1 });
  });

  it("the caller's deadline is read from the wall clock, whatever clock the broker was given", async () => {
    let calls = 0;
    const w = await adapterWorld({
      rpcTimeoutMs: 400,
      brokerOptions: { now: () => Date.now() - 60_000 },
      save: async (args, adapter) => {
        calls += 1;
        const inner = await adapter.rpc({ kind: 'invoke', activity: 'availability.save', args }).catch((e) => e);
        return { innerRule: inner.rule, innerRetryable: inner.retryable };
      },
    });
    const receipt = await settles(w.call({ id: 7 }), 1500, 'self-invoke under a lagging broker clock');
    expect(calls).toBe(1);
    expect(receipt.result).toEqual({ innerRule: 'idempotency.inflight', innerRetryable: false });
  });
});
