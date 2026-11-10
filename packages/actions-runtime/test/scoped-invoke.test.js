import { describe, it, expect, vi } from 'vitest';
import { createBroker, createFakeIssuer } from '../src/index.js';

const deferred = () => {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
};
const activity = { inputSchema: { type: 'object' }, sideEffect: 'local_write', idempotency: 'client_key', retry: { maxAttempts: 1 } };
function setup(handlers, minHostApi = 17) {
  const broker = createBroker({ capabilityService: createFakeIssuer(), inflightJoinTimeoutMs: 500 });
  broker.registerMp({ id: 'test', version: '1', activities: { write: activity, child: activity } }, {
    minHostApi, handlers: { activities: handlers },
  });
  const invoke = (activityName, args = {}, key = activityName) => broker.invoke({
    sourceMpId: 'test', identity: { tenantId: 't', scopes: [] }, activity: `test.${activityName}`, args, idempotencyKey: key,
  });
  return { broker, invoke };
}

describe('handler-scoped invoke contract', () => {
  it('applies overlapping untagged writes in issue order', async () => {
    const entered = deferred();
    const release = deferred();
    const applied = [];
    const { invoke } = setup({ write: async ({ n }) => {
      if (n === 1) { entered.resolve(); await release.promise; }
      applied.push(n);
      return n;
    } });
    const first = invoke('write', { n: 1 }, '1');
    await entered.promise;
    const second = invoke('write', { n: 2 }, '2');
    await new Promise((resolve) => setTimeout(resolve, 10));
    const beforeRelease = [...applied];
    release.resolve();
    await Promise.all([first, second]);
    expect(beforeRelease).toEqual([]);
    expect(applied).toEqual([1, 2]);
  });

  it('completes a tagged child while the parent awaits it', async () => {
    const { invoke } = setup({
      write: async (_, ctx) => (await ctx.invoke('test.child', {})).result,
      child: async () => 'child',
    });
    await expect(invoke('write')).resolves.toMatchObject({ result: 'child' });
  });

  it('preserves untagged nested invokes for old-contract bundles', async () => {
    const { invoke } = setup({ write: async () => (await invoke('child')).result, child: async () => 'old' }, 16);
    await expect(invoke('write')).resolves.toMatchObject({ result: 'old' });
  });

  it('rejects its own key immediately as a non-retryable cycle', async () => {
    let cycle;
    const timers = vi.spyOn(globalThis, 'setTimeout');
    const { invoke } = setup({ write: async (_, ctx) => {
      try { await ctx.invoke('test.write', {}, { idempotencyKey: 'own' }); } catch (error) { cycle = error; }
      return 'done';
    } });
    await invoke('write', {}, 'own');
    const scheduled = timers.mock.calls.length;
    timers.mockRestore();
    expect(scheduled).toBe(0);
    expect(cycle).toMatchObject({ code: 'LoopDetected', retryable: false, rule: 'idempotency.cycle' });
  });

  it('refuses a scoped invoke after its handler finishes', async () => {
    let scoped;
    const { invoke } = setup({ write: async (_, ctx) => { scoped = ctx.invoke; return 'done'; } });
    await invoke('write');
    await expect(scoped('test.child', {})).rejects.toMatchObject({ retryable: false });
  });

  it('uses the handler MP identity for cross-MP nesting', async () => {
    const { broker, invoke } = setup({ write: async (_, ctx) => (await ctx.invoke('other.outer', {})).result });
    broker.registerMp({ id: 'other', version: '1', activities: {
      outer: { ...activity, authorizedCallers: ['test'] }, child: activity,
    } }, {
      minHostApi: 17,
      invokeContext: () => ({ sourceMpId: 'other', identity: { tenantId: 't', mpId: 'other', scopes: [] } }),
      handlers: { activities: {
        outer: async (_, ctx) => (await ctx.invoke('other.child', {})).result,
        child: async () => 'other child',
      } },
    });
    // The initiating MP owns only its declared cross-MP grant.
    await expect(broker.invoke({
      sourceMpId: 'test', identity: { tenantId: 't', scopes: ['invoke:other.outer'] },
      activity: 'test.write', args: {}, idempotencyKey: 'cross',
    })).resolves.toMatchObject({ result: 'other child' });
  });

});
