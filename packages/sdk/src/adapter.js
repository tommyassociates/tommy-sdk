/**
 * adapter.js — the transport seam between the SDK surface and the host broker.
 *
 * One SDK, two adapters (execution-modes.md D2): the direct adapter
 * (in-process, M1 — adapter-direct.js) and the postMessage adapter
 * (sandboxed, M4 — not built yet). EVERYTHING above this interface is
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
 *     adapter preserves those semantics without a postMessage hop).
 *
 *   subscribe(trigger, handler) -> Unsubscribe
 *     Handler receives (payload, TriggerMeta). Auto-removed on teardown.
 *
 *   teardown() -> Promise<void>
 *     Honours mp:teardown flush semantics (direct unmount in-process).
 */

export const DEFAULT_RPC_TIMEOUT_MS = 10_000;
