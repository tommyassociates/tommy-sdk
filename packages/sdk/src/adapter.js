/**
 * adapter.js — the transport seam between the SDK surface and the host broker.
 *
 * One SDK, two adapters (execution-modes.md D2): the direct adapter
 * (in-process — adapter-direct.js) and the postMessage adapter
 * (sandboxed — not built yet). EVERYTHING above this interface is
 * mode-independent; an MP cannot detect its mode through the SDK surface
 * (the contract-test suite asserts mode opacity).
 *
 * Adapter contract (all methods promise-returning, all rejections TommyError):
 *
 *   rpc(envelope) -> Promise<result>
 *     envelope: { kind: 'emit'|'query'|'invoke'|'batch'|'transaction_invoke',
 *                 ...call fields, capabilityToken }
 *     The adapter owns correlation + a per-RPC timeout (a non-responding host
 *     must reject Timeout, never hang — README §RPC correlation; the direct
 *     adapter preserves those semantics without a postMessage hop). A write
 *     (`WRITE_RPC_KINDS`) is waited for longer than any other call: its
 *     answer is the server's, and giving up early reports a write that is
 *     still being applied as one that failed.
 *
 *   subscribe(trigger, handler) -> Unsubscribe
 *     Handler receives (payload, TriggerMeta). Auto-removed on teardown.
 *
 *   teardown() -> Promise<void>
 *     Honours mp:teardown flush semantics (direct unmount in-process).
 */

export const DEFAULT_RPC_TIMEOUT_MS = 10_000;

/** How long the adapter waits for a write's answer. */
export const DEFAULT_WRITE_TIMEOUT_MS = 60_000;

/**
 * The RPC kinds that are writes: an activity invoked on its own or inside a
 * transaction, and a transaction's rollback. The SDK sets an envelope's kind
 * from the method an MP called, so an MP cannot choose it.
 */
export const WRITE_RPC_KINDS = Object.freeze(['invoke', 'transaction_invoke', 'transaction_rollback']);
