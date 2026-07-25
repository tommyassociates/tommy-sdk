/**
 * adapter-direct.js — the in-process transport (M1, built first).
 *
 * Direct function calls into the host broker's entry points; the init context
 * is handed over by the in-process loader (no handshake, no heartbeats —
 * execution-modes.md "in-process lifecycle"). The adapter still preserves the
 * postMessage timeout/correlation semantics so the SDK surface behaves
 * identically in both modes (03-sdk-runtime/README:83): every RPC gets an
 * rpcId and a per-RPC timeout that rejects TommyError{code:'Timeout'}.
 *
 * Mode opacity: nothing this adapter returns or throws identifies the mode;
 * the broker reference is held in closure, never exposed.
 */
import { TommyError, isTommyError } from './errors.js';
import { DEFAULT_RPC_TIMEOUT_MS } from './adapter.js';

let rpcSeq = 0;
const nextRpcId = (instanceId) => `rpc-${instanceId}-${(rpcSeq += 1)}`;

/**
 * @param {object} opts
 * @param {object} opts.broker host broker entry points:
 *   { emit(env), query(env), invoke(env), subscribe(mpId, trigger, handler),
 *     teardown(instanceId) } — all enforcement lives THERE, never here.
 * @param {object} opts.init the MpInit payload the loader hands over
 * @param {number} [opts.rpcTimeoutMs]
 * @param {function} [opts.getCapabilityToken] host-supplied async provider that
 *   returns the CURRENT capability token, re-minting it when it nears expiry
 *   (capability tokens carry a short TTL — security-model §3). Omitted in tests
 *   and legacy callers, which fall back to the frozen `init.capabilityToken`.
 */
export function createDirectAdapter({ broker, init, rpcTimeoutMs = DEFAULT_RPC_TIMEOUT_MS, getCapabilityToken }) {
  if (!broker) throw new Error('createDirectAdapter: broker required');
  if (!init) throw new Error('createDirectAdapter: init required');

  const subscriptions = new Set();

  function withTimeout(promise, rpcId) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new TommyError({
        code: 'Timeout',
        message: `RPC ${rpcId} timed out after ${rpcTimeoutMs}ms`,
        retryable: true,
      })), rpcTimeoutMs);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  async function rpc(envelope) {
    const rpcId = envelope.rpcId || nextRpcId(init.instanceId);
    // Re-mint a token that has aged past its TTL BEFORE it is stamped on the
    // envelope; the broker (and the server on every server_write) rejects an
    // expired token, so a panel left open past the ≤15-min TTL would otherwise
    // fail its next invoke with 'capability token expired'.
    const capabilityToken = getCapabilityToken ? await getCapabilityToken() : init.capabilityToken;
    const env = {
      ...envelope,
      rpcId,
      capabilityToken,
      sourceMpId: init.mpId,
      instanceId: init.instanceId,
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
      return await withTimeout(Promise.resolve(entry.call(broker, env)), rpcId);
    } catch (err) {
      if (isTommyError(err)) throw err;
      throw new TommyError({ code: 'ActivityFailed', message: String(err && err.message), retryable: false, cause: err });
    }
  }

  return {
    rpc,
    subscribe(trigger, handler) {
      const unsubscribe = broker.subscribe(init.mpId, trigger, handler);
      subscriptions.add(unsubscribe);
      return () => { subscriptions.delete(unsubscribe); unsubscribe(); };
    },
    async teardown() {
      // mp:teardown flush semantics: drop live subscriptions, then let the
      // broker flush anything pending for this instance.
      for (const unsubscribe of subscriptions) unsubscribe();
      subscriptions.clear();
      if (typeof broker.teardown === 'function') await broker.teardown(init.instanceId);
    },
  };
}
