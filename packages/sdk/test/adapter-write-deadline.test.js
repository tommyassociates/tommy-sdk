/**
 * adapter-write-deadline.test.js — a write is waited for longer than a read.
 *
 * A write is an RPC of kind `invoke`, `transaction_invoke` or
 * `transaction_rollback`: the adapter tells from the envelope's kind, which
 * the SDK sets and an MP cannot. Its answer is the server's, so the adapter
 * waits DEFAULT_WRITE_TIMEOUT_MS for it; every other kind keeps
 * DEFAULT_RPC_TIMEOUT_MS. The deadlines the broker reads off the envelope
 * (`rpcDeadlineAt`, `restoreDeadlineAt`) stay on the shorter one.
 */
import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';
import {
  createDirectAdapter, DEFAULT_RPC_TIMEOUT_MS, DEFAULT_WRITE_TIMEOUT_MS, WRITE_RPC_KINDS,
} from '../src/index.js';

const init = { mpId: 'scheduling', instanceId: 'i-1', capabilityToken: 'token', tenant: { tenantId: 'team-1' } };
const never = () => new Promise(() => {});
function world(options = {}) {
  const seen = [];
  const entry = (answer) => (envelope) => { seen.push(envelope); return answer(envelope); };
  const broker = {
    invoke: entry(options.invoke || never),
    query: entry(options.query || never),
    emit: entry(options.emit || never),
    rollbackTransaction: entry(options.rollback || never),
  };
  const adapter = createDirectAdapter({ broker, init, ...(options.adapter || {}) });
  return { adapter, seen };
}
const outcome = (promise) => {
  const state = { done: false };
  promise.then((value) => Object.assign(state, { done: true, value }), (error) => Object.assign(state, { done: true, error }));
  return state;
};

describe('the adapter waits longer for a write than for a read', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('names the kinds it treats as writes and a deadline six times the read one', () => {
    expect([...WRITE_RPC_KINDS].sort()).toEqual(['invoke', 'transaction_invoke', 'transaction_rollback']);
    expect(DEFAULT_RPC_TIMEOUT_MS).toBe(10_000);
    expect(DEFAULT_WRITE_TIMEOUT_MS).toBe(60_000);
  });

  it.each(['query', 'emit'])('a %s that never answers rejects Timeout at the read deadline', async (kind) => {
    const { adapter } = world();
    const call = outcome(adapter.rpc({ kind, condition: 'scheduling.x', trigger: 'x', args: {} }));
    await vi.advanceTimersByTimeAsync(DEFAULT_RPC_TIMEOUT_MS - 1);
    expect(call.done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(call.error?.code).toBe('Timeout');
    expect(call.error?.retryable).toBe(true);
  });

  it.each(['invoke', 'transaction_invoke', 'transaction_rollback'])('a %s is still waited for after the read deadline, and rejects Timeout at the write deadline', async (kind) => {
    const { adapter } = world();
    const call = outcome(adapter.rpc({ kind, activity: 'scheduling.update_shift', args: {}, txnId: 't-1' }));
    await vi.advanceTimersByTimeAsync(DEFAULT_RPC_TIMEOUT_MS + 5000);
    expect(call.done).toBe(false);
    await vi.advanceTimersByTimeAsync(DEFAULT_WRITE_TIMEOUT_MS - DEFAULT_RPC_TIMEOUT_MS - 5000);
    expect(call.error?.code).toBe('Timeout');
    expect(call.error?.message).toContain(`${DEFAULT_WRITE_TIMEOUT_MS}ms`);
  });

  it('a write answered after 12.6 s resolves with that answer', async () => {
    const { adapter } = world({ invoke: () => new Promise((resolve) => { setTimeout(() => resolve({ status: 'succeeded', result: { shiftId: '1' } }), 12600); }) });
    const call = outcome(adapter.rpc({ kind: 'invoke', activity: 'scheduling.update_shift', args: {} }));
    await vi.advanceTimersByTimeAsync(12600);
    expect(call.value).toEqual({ status: 'succeeded', result: { shiftId: '1' } });
  });

  it('stamps the envelope with the read deadline for the broker, on writes too', async () => {
    const { adapter, seen } = world();
    const at = Date.now();
    outcome(adapter.rpc({ kind: 'invoke', activity: 'team.update_member', args: {} }));
    outcome(adapter.rpc({ kind: 'query', condition: 'team.x', args: {} }));
    await vi.advanceTimersByTimeAsync(0);
    expect(seen).toHaveLength(2);
    expect(seen[0].rpcDeadlineAt).toBe(at + DEFAULT_RPC_TIMEOUT_MS);
    expect(seen[0].restoreDeadlineAt).toBe(at + DEFAULT_RPC_TIMEOUT_MS);
    expect(seen[1].rpcDeadlineAt).toBe(at + DEFAULT_RPC_TIMEOUT_MS);
  });

  it('a caller that names one deadline gets it for every call', async () => {
    const { adapter } = world({ adapter: { rpcTimeoutMs: 50 } });
    const call = outcome(adapter.rpc({ kind: 'invoke', activity: 'scheduling.update_shift', args: {} }));
    await vi.advanceTimersByTimeAsync(50);
    expect(call.error?.code).toBe('Timeout');
  });

  it('a caller may name the write deadline on its own', async () => {
    const { adapter } = world({ adapter: { writeTimeoutMs: 200 } });
    const write = outcome(adapter.rpc({ kind: 'invoke', activity: 'scheduling.update_shift', args: {} }));
    const read = outcome(adapter.rpc({ kind: 'query', condition: 'scheduling.x', args: {} }));
    await vi.advanceTimersByTimeAsync(200);
    expect(write.error?.code).toBe('Timeout');
    expect(read.done).toBe(false);
  });
});
