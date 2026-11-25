import { TommyError, isTommyError } from './errors.js';
import { DEFAULT_RPC_TIMEOUT_MS, DEFAULT_WRITE_TIMEOUT_MS, WRITE_RPC_KINDS } from './adapter.js';

let rpcSeq = 0;
const nextRpcId = (instanceId) => `rpc-${instanceId}-${(rpcSeq += 1)}`;

export function createDirectAdapter({
  broker, init, rpcTimeoutMs: callTimeoutMs, writeTimeoutMs, getCapabilityToken,
}) {
  if (!broker) throw new Error('createDirectAdapter: broker required');
  if (!init) throw new Error('createDirectAdapter: init required');
  const rpcTimeoutMs = callTimeoutMs ?? DEFAULT_RPC_TIMEOUT_MS;
  const writeMs = writeTimeoutMs ?? (callTimeoutMs === undefined ? DEFAULT_WRITE_TIMEOUT_MS : callTimeoutMs);

  const subscriptions = new Set();

  function withTimeout(promise, rpcId, waitMs) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new TommyError({
        code: 'Timeout',
        message: `RPC ${rpcId} timed out after ${waitMs}ms`,
        retryable: true,
      })), waitMs);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  async function rpc(envelope) {
    const rpcId = envelope.rpcId || nextRpcId(init.instanceId);
    // Re-mint an aged token before stamping: an expired one would fail the next invoke.
    const capabilityToken = getCapabilityToken ? await getCapabilityToken() : init.capabilityToken;
    const env = {
      ...envelope,
      rpcId,
      capabilityToken,
      sourceMpId: init.mpId,
      instanceId: init.instanceId,
      ...(envelope.activity === 'team.update_member'
        ? { restoreDeadlineAt: Date.now() + rpcTimeoutMs } : {}),
      rpcDeadlineAt: Date.now() + rpcTimeoutMs,
    };
    const ENTRY_BY_KIND = {
      emit: 'emit',
      query: 'query',
      invoke: 'invoke',
      transaction_invoke: 'invoke',
      transaction_rollback: 'rollbackTransaction',
    };
    const entry = broker[ENTRY_BY_KIND[env.kind]];
    if (typeof entry !== 'function') {
      throw new TommyError({ code: 'InvalidPayload', message: `unknown rpc kind '${env.kind}'`, retryable: false });
    }
    try {
      return await withTimeout(Promise.resolve(entry.call(broker, env)), rpcId,
        WRITE_RPC_KINDS.includes(env.kind) ? writeMs : rpcTimeoutMs);
    } catch (err) {
      if (err instanceof TommyError) throw err;
      if (isTommyError(err)) {
        throw new TommyError({
          code: err.code, message: err.message, rule: err.rule, retryable: err.retryable, runId: err.runId, cause: err.cause,
          retryAfterMs: err.retryAfterMs,
        });
      }
      throw new TommyError({ code: 'ActivityFailed', message: String(err && err.message), retryable: false, cause: err });
    }
  }

  return {
    rpc,
    subscribe(trigger, handler) {
      // The instance's tenant, so the broker checks that tenant's grant.
      const unsubscribe = broker.subscribe(init.mpId, trigger, handler, { tenantId: init.tenant?.tenantId });
      subscriptions.add(unsubscribe);
      return () => { subscriptions.delete(unsubscribe); unsubscribe(); };
    },
    async teardown() {
      for (const unsubscribe of subscriptions) unsubscribe();
      subscriptions.clear();
      if (typeof broker.teardown === 'function') await broker.teardown(init.instanceId);
    },
  };
}
