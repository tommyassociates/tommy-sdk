// Local validation is for developer experience only; the broker re-validates and enforces everything.
import { TommyError } from './errors.js';

let txnSeq = 0;
let keySeq = 0;

// Generated once per logical invoke so broker retries and offline replay reuse the same key.
const nextClientKey = (mpId) => `ck-${mpId}-${(keySeq += 1)}-${Date.now().toString(36)}`;

export function createActionsApi({ adapter, mpId }) {
  return {
    async emit(trigger, payload) {
      if (typeof trigger !== 'string' || !trigger) {
        throw new TommyError({ code: 'InvalidPayload', message: 'emit: trigger name required', retryable: false });
      }
      return adapter.rpc({ kind: 'emit', trigger, payload });
    },

    async query(condition, args, { signal, onRead } = {}) {
      if (typeof condition !== 'string' || !condition) {
        throw new TommyError({ code: 'InvalidPayload', message: 'query: condition name required', retryable: false });
      }
      if (onRead !== undefined && typeof onRead !== 'function') {
        throw new TommyError({ code: 'InvalidPayload', message: 'query: onRead must be a function', retryable: false });
      }
      return adapter.rpc({ kind: 'query', condition, args, ...(signal ? { signal } : {}), ...(onRead ? { onRead } : {}) });
    },

    async invoke(activity, args, { idempotencyKey, summary } = {}) {
      if (typeof activity !== 'string' || !activity.includes('.')) {
        throw new TommyError({
          code: 'InvalidPayload',
          message: "invoke: activity must be '<mpId>.<name>'",
          rule: 'activity pattern ^[a-z0-9-]+\\.[a-z0-9_]+$',
          retryable: false,
        });
      }
      if (summary !== undefined && typeof summary !== 'string') {
        throw new TommyError({ code: 'InvalidPayload', message: 'invoke: summary must be text', retryable: false });
      }
      return adapter.rpc({
        kind: 'invoke', activity, args, idempotencyKey: idempotencyKey || nextClientKey(mpId), ...(summary !== undefined ? { summary } : {}),
      });
    },

    subscribe(trigger, handler) {
      if (typeof handler !== 'function') {
        throw new TommyError({ code: 'InvalidPayload', message: 'subscribe: handler required', retryable: false });
      }
      return adapter.subscribe(trigger, handler);
    },

    async batch(calls) {
      return Promise.allSettled(calls.map((call) => {
        if (call.kind === 'emit') return this.emit(call.trigger, call.payload);
        if (call.kind === 'query') return this.query(call.condition, call.args);
        if (call.kind === 'invoke') return this.invoke(call.activity, call.args);
        return Promise.reject(new TommyError({ code: 'InvalidPayload', message: `batch: unknown kind '${call.kind}'`, retryable: false }));
      }));
    },

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
        await adapter.rpc({ kind: 'transaction_rollback', txnId }).catch(() => { /* best-effort saga */ });
        throw err;
      }
    },
  };
}
