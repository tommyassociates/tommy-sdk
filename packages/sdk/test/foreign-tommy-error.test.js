// A rejection the broker raises with another copy of this SDK's TommyError
// (the host bundles its own) reaches the MP as this SDK's TommyError, with
// its code, rule and retryability kept.
import { describe, it, expect } from 'vitest';
import { createDirectAdapter, TommyError } from '../src/index.js';

class OtherTommyError extends Error {
  constructor({ code, message, rule, retryable }) {
    super(message);
    this.name = 'TommyError';
    this.code = code;
    this.rule = rule;
    this.retryable = retryable;
  }
}

describe('the direct adapter', () => {
  it('rethrows another copy\'s TommyError as this SDK\'s, keeping what it says', async () => {
    const broker = { emit: async () => { throw new OtherTommyError({ code: 'InvalidPayload', message: 'bad payload', rule: 'payloadSchema', retryable: false }); } };
    const adapter = createDirectAdapter({ broker, init: { mpId: 'x', instanceId: 'i', capabilityToken: 't' } });
    const rejection = await adapter.rpc({ kind: 'emit', trigger: 'y', payload: {} }).catch((e) => e);
    expect(rejection).toBeInstanceOf(TommyError);
    expect([rejection.code, rejection.message, rejection.rule, rejection.retryable]).toEqual(['InvalidPayload', 'bad payload', 'payloadSchema', false]);
  });
});
