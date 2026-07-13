/**
 * actions.js — the ActionsApi surface (sdk-types.ts ActionsApi) over the
 * transport adapter. Local validation here is for DEVELOPER EXPERIENCE ONLY —
 * the broker re-validates and enforces everything at its entry points
 * (03-sdk-runtime/README design rules; never a security check only here).
 */
import { TommyError } from './errors.js';

let txnSeq = 0;
let keySeq = 0;

/**
 * Client-supplied idempotency key for `client_key` activities: generated once
 * per logical invoke() so broker retries and offline replay reuse the SAME
 * key (actions-runtime.md §3.2). Callers may override for natural stability
 * (e.g. `tc-clockout-{shiftId}`) via invoke(activity, args, {idempotencyKey}).
 */
const nextClientKey = (mpId) => `ck-${mpId}-${(keySeq += 1)}-${Date.now().toString(36)}`;

export function createActionsApi({ adapter, mpId }) {
  return {
    /** Async fan-out emit; resolves with EmitReceipt when the broker durably accepted. */
    async emit(trigger, payload) {
      if (typeof trigger !== 'string' || !trigger) {
        throw new TommyError({ code: 'InvalidPayload', message: 'emit: trigger name required', retryable: false });
      }
      return adapter.rpc({ kind: 'emit', trigger, payload });
    },

    /** Evaluate another MP's condition. Never queued offline (reads fail fast). */
    async query(condition, args) {
      if (typeof condition !== 'string' || !condition) {
        throw new TommyError({ code: 'InvalidPayload', message: 'query: condition name required', retryable: false });
      }
      return adapter.rpc({ kind: 'query', condition, args });
    },

    /** Invoke another MP's activity; resolves InvokeResult. */
    async invoke(activity, args, { idempotencyKey } = {}) {
      if (typeof activity !== 'string' || !activity.includes('.')) {
        throw new TommyError({
          code: 'InvalidPayload',
          message: "invoke: activity must be '<mpId>.<name>'",
          rule: 'activity pattern ^[a-z0-9-]+\\.[a-z0-9_]+$',
          retryable: false,
        });
      }
      return adapter.rpc({ kind: 'invoke', activity, args, idempotencyKey: idempotencyKey || nextClientKey(mpId) });
    },

    subscribe(trigger, handler) {
      if (typeof handler !== 'function') {
        throw new TommyError({ code: 'InvalidPayload', message: 'subscribe: handler required', retryable: false });
      }
      return adapter.subscribe(trigger, handler);
    },

    /**
     * Transport batching — in-process this is a pass-through (execution-modes
     * table): each call dispatches independently; results settle independently.
     */
    async batch(calls) {
      return Promise.allSettled(calls.map((call) => {
        if (call.kind === 'emit') return this.emit(call.trigger, call.payload);
        if (call.kind === 'query') return this.query(call.condition, call.args);
        if (call.kind === 'invoke') return this.invoke(call.activity, call.args);
        return Promise.reject(new TommyError({ code: 'InvalidPayload', message: `batch: unknown kind '${call.kind}'`, retryable: false }));
      }));
    },

    /**
     * Best-effort saga (actions-runtime.md §4): shared txnId, FIFO order,
     * compensating activities invoked in reverse on non-retryable failure.
     * Compensation dispatch is the BROKER's job (it knows the undo_* pairing);
     * the SDK threads the txnId.
     */
    async transaction(fn) {
      txnSeq += 1;
      const txnId = `txn-${mpId}-${txnSeq}`;
      const tx = {
        txnId,
        invoke: (activity, args, { idempotencyKey } = {}) => adapter.rpc({
          kind: 'transaction_invoke', activity, args, txnId, idempotencyKey: idempotencyKey || nextClientKey(mpId),
        }),
      };
      try {
        const result = await fn(tx);
        return result;
      } catch (err) {
        // Reverse-order compensation is the broker's job — it holds the
        // applied-step list for the txnId and the undo_* pairings.
        await adapter.rpc({ kind: 'transaction_rollback', txnId }).catch(() => { /* best-effort saga */ });
        throw err;
      }
    },
  };
}
