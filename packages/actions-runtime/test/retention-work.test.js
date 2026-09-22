import { describe, it, expect } from 'vitest';
import { createBroker, createFakeIssuer } from '../src/index.js';

async function fixture(handler) {
  const issuer = createFakeIssuer();
  const broker = createBroker({ capabilityService: issuer });
  broker.registerMp({ id: 'example', version: '1.0.0', publisher: { type: 'first_party' },
    triggers: { changed: { payloadSchema: { type: 'object' }, emission: 'async' } },
    conditions: {}, actions: {}, activities: { save: { inputSchema: { type: 'object' },
      sideEffect: 'local_write', idempotency: 'none', offlineReplayable: false,
      retry: { maxAttempts: 1 } } } }, { handlers: { activities: { save: handler } }, firstParty: true });
  const capabilityToken = await issuer.issue('example', '1.0.0', 'team-1', ['*'], 'i-1');
  const envelope = { sourceMpId: 'example', instanceId: 'i-1', capabilityToken, tenantId: 'team-1', args: {} };
  return { broker, envelope };
}

describe('broker host retention signals', () => {
  it('protects an outstanding action and releases after settlement, including failure', async () => {
    let finish;
    const f = await fixture(() => new Promise((resolve) => { finish = resolve; }));
    const save = f.broker.invoke({ ...f.envelope, activity: 'example.save' });
    expect(f.broker.hasPendingWork()).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    finish({ saved: true }); await save;
    expect(f.broker.hasPendingWork()).toBe(false);
    await expect(f.broker.invoke({ ...f.envelope, activity: 'example.absent' })).rejects.toBeTruthy();
    expect(f.broker.hasPendingWork()).toBe(false);
  });
  it('keeps asynchronous subscriber work protected after emit returns', async () => {
    let finish;
    const f = await fixture(() => ({}));
    f.broker.subscribe('example', 'example.changed', () => new Promise((resolve) => { finish = resolve; }));
    await f.broker.emit({ ...f.envelope, trigger: 'example.changed', payload: {} });
    expect(f.broker.hasPendingWork()).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    finish(); await new Promise((resolve) => setTimeout(resolve, 0));
    expect(f.broker.hasPendingWork()).toBe(false);
  });
  it('one SDK teardown does not erase other registrations; world teardown releases them', async () => {
    const f = await fixture(() => ({ saved: true }));
    await f.broker.teardown('i-1');
    expect((await f.broker.invoke({ ...f.envelope, activity: 'example.save' })).status).toBe('succeeded');
    await f.broker.teardown();
    await expect(f.broker.invoke({ ...f.envelope, activity: 'example.save' })).rejects.toBeTruthy();
  });
});
