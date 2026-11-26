export const DEFAULT_RPC_TIMEOUT_MS = 10_000;

export const DEFAULT_WRITE_TIMEOUT_MS = 60_000;

// The SDK sets the kind from the method called, so an MP cannot choose it.
export const WRITE_RPC_KINDS = Object.freeze(['invoke', 'transaction_invoke', 'transaction_rollback']);
