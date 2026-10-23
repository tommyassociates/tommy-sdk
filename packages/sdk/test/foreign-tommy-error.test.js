// A rejection the broker raises with another copy of this SDK's TommyError
// (the host bundles its own) reaches the MP as this SDK's TommyError, with
// its code, rule and retryability kept.
import { describe, it, expect } from 'vitest';
import { createDirectAdapter, TommyError } from '../src/index.js';

class OtherTommyError extends Error {
  constructor({ code, message, rule, retryable, retryAfterMs }) {
    super(message);
    this.name = 'TommyError';
    this.code = code;
    this.rule = rule;
    this.retryable = retryable;
    if (retryAfterMs !== undefined) this.retryAfterMs = retryAfterMs;
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

  it('keeps a rate-limit refusal\'s retryAfterMs', async () => {
    const broker = { query: async () => { throw new OtherTommyError({ code: 'RateLimited', message: 'slow down', retryable: true, retryAfterMs: 1500 }); } };
    const adapter = createDirectAdapter({ broker, init: { mpId: 'x', instanceId: 'i', capabilityToken: 't' } });
    const rejection = await adapter.rpc({ kind: 'query', condition: 'y.z', args: {} }).catch((e) => e);
    expect(rejection).toBeInstanceOf(TommyError);
    expect(rejection).toMatchObject({ code: 'RateLimited', retryable: true, retryAfterMs: 1500 });
  });

  it('leaves retryAfterMs off an error that does not carry one (the shape older callers know)', async () => {
    const broker = { query: async () => { throw new OtherTommyError({ code: 'RateLimited', message: 'slow down', retryable: true }); } };
    const adapter = createDirectAdapter({ broker, init: { mpId: 'x', instanceId: 'i', capabilityToken: 't' } });
    const rejection = await adapter.rpc({ kind: 'query', condition: 'y.z', args: {} }).catch((e) => e);
    expect('retryAfterMs' in rejection).toBe(false);
    expect(Object.keys(new TommyError({ code: 'Timeout', message: 'm' })).sort())
      .toEqual(['cause', 'code', 'name', 'retryable', 'rule', 'runId'].sort());
  });
});
