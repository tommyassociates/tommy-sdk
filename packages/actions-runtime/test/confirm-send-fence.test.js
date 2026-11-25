import { describe, it, expect, vi } from 'vitest';
import { TommyError } from '@tommy/sdk';
import { createBroker, createFakeIssuer, createDurableQueue } from '../src/index.js';

const lostAnswer = () => new TommyError({ code: 'Timeout', message: 'no answer within the deadline', retryable: false });

const save = {
  description: 'a save',
  inputSchema: { type: 'object', properties: { note: { type: 'string' } } },
  sideEffect: 'server_write',
  idempotency: 'client_key',
  offlineReplayable: true,
  retry: { maxAttempts: 1 },
};

async function page({
  holder = { value: { tenantId: 'team-1' } }, online = true, serverInvoke = vi.fn(async () => { throw lostAnswer(); }), replay, idempotencyLedger,
} = {}) {
  const issuer = createFakeIssuer();
  const tokens = {};
  const broker = createBroker({
    capabilityService: issuer,
    serverInvoke,
    online,
    sleep: async () => {},
    offlineQueue: createDurableQueue({ storage: null, held: new Set() }),
    queueOwner: () => holder.value,
    ...(idempotencyLedger ? { idempotencyLedger } : {}),
    replayEnvelope: async (envelope) => {
      if (replay) await replay(envelope);
      return { ...envelope, capabilityToken: tokens[envelope.sourceMpId], instanceId: tokens[envelope.sourceMpId].instanceId };
    },
  });
  broker.registerMp({
    id: 'leave', version: '1.0.0', publisher: { type: 'first_party' }, triggers: {}, conditions: {}, activities: { save }, actions: {},
  }, { handlers: { activities: {} }, minHostApi: 20 });
  broker.registerMp({
    id: 'shell', version: '1.0.0', publisher: { type: 'first_party' }, triggers: {}, conditions: {}, activities: {}, actions: {},
  }, { handlers: { activities: {} } });
  tokens.leave = await issuer.issue('leave', '1.0.0', 'team-1', [], 'i-leave');
  tokens.shell = await issuer.issue('shell', '1.0.0', 'team-1', ['invoke:leave.save'], 'i-shell');
  const invoke = (key, mp = 'leave') => broker.invoke({
    sourceMpId: mp, capabilityToken: tokens[mp], instanceId: tokens[mp].instanceId, activity: 'leave.save', args: { note: 'n' }, idempotencyKey: key,
  });
  return { broker, invoke, serverInvoke, holder };
}

describe('a confirm is checked again at the point of send', () => {
  it('an account switch while the confirm waits behind another write sends nothing and leaves no queued row', async () => {
    let releaseOther;
    const serverInvoke = vi.fn(async ({ idempotencyKey }) => {
      if (idempotencyKey === 'k-2') await new Promise((resolve) => { releaseOther = resolve; });
      throw lostAnswer();
    });
    const { broker, invoke, holder } = await page({ holder: { value: { tenantId: 'team-1', person: 'p-1' } }, serverInvoke });
    await invoke('k-1').catch(() => {});
    const other = invoke('k-2').catch(() => {});
    await vi.waitFor(() => expect(serverInvoke).toHaveBeenCalledTimes(2));
    const confirming = broker.confirmWriteOutcome('leave', 'save', 'k-1');
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    holder.value = { tenantId: 'team-1', person: 'p-2' };
    releaseOther();
    await other;
    await expect(confirming).rejects.toMatchObject({ code: 'WriteNotConfirmable', details: { reason: 'no_request' } });
    expect(serverInvoke).toHaveBeenCalledTimes(2);
    expect(broker.queuedWrites('leave')).toEqual([]);
    holder.value = { tenantId: 'team-1', person: 'p-1' };
    expect(broker.writeOutcome('leave', 'save', 'k-1')).toMatchObject({ state: 'unconfirmed', confirmable: true });
  });

  it('a purge while the confirm waits sends nothing', async () => {
    let releaseOther;
    const serverInvoke = vi.fn(async ({ idempotencyKey }) => {
      if (idempotencyKey === 'k-2') await new Promise((resolve) => { releaseOther = resolve; });
      throw lostAnswer();
    });
    const { broker, invoke } = await page({ serverInvoke });
    await invoke('k-1').catch(() => {});
    const other = invoke('k-2').catch(() => {});
    await vi.waitFor(() => expect(serverInvoke).toHaveBeenCalledTimes(2));
    const confirming = broker.confirmWriteOutcome('leave', 'save', 'k-1');
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    broker.purgeOutcomes();
    releaseOther();
    await other;
    await expect(confirming).rejects.toMatchObject({ details: { reason: 'no_request' } });
    expect(serverInvoke).toHaveBeenCalledTimes(2);
  });
});

describe('a discard while a confirm restores its sender', () => {
  it('stops the confirm: nothing is sent', async () => {
    let restored;
    let restoring = null;
    const serverInvoke = vi.fn(async () => ({ result: { ok: true } }));
    const { broker, invoke } = await page({ online: false, serverInvoke, replay: () => restoring });
    await invoke('k-1');
    const [row] = broker.queuedWrites('leave');
    broker.setOnline(true);
    restoring = new Promise((resolve) => { restored = resolve; });
    const confirming = broker.confirmWriteOutcome('leave', 'save', 'k-1');
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    expect(await broker.discardQueuedWrite('leave', row.id)).toBe(true);
    restored();
    await expect(confirming).rejects.toMatchObject({ details: { reason: 'no_request' } });
    expect(serverInvoke).not.toHaveBeenCalled();
  });
});

describe('a confirm of a write another Mini Program sent', () => {
  it('is sent as that caller, with its own credentials', async () => {
    const serverInvoke = vi.fn(async () => { throw lostAnswer(); });
    const { broker, invoke } = await page({ serverInvoke });
    await invoke('k-1', 'shell').catch(() => {});
    expect(broker.writeOutcome('leave', 'save', 'k-1')).toMatchObject({ state: 'unconfirmed', confirmable: true });
    serverInvoke.mockImplementation(async () => ({ result: { ok: true }, replayed: true }));
    expect(await broker.confirmWriteOutcome('leave', 'save', 'k-1')).toMatchObject({ state: 'succeeded' });
    expect(serverInvoke).toHaveBeenCalledTimes(2);
  });
});

describe('a confirm answered by the idempotency ledger', () => {
  it('names a run record of the authenticated tenant', async () => {
    const known = new Set();
    let ledgerAnswers = false;
    const idempotencyLedger = { has: (key) => ledgerAnswers && known.has(key), add: (key) => known.add(key) };
    const { broker, invoke } = await page({ online: false, idempotencyLedger, serverInvoke: vi.fn(async () => ({ result: {} })) });
    await invoke('k-1');
    known.add('team-1:leave.save:k-1');
    ledgerAnswers = true;
    broker.setOnline(true);
    const confirmed = await broker.confirmWriteOutcome('leave', 'save', 'k-1');
    expect(confirmed).toMatchObject({ state: 'succeeded' });
    expect(await broker.records.get(confirmed.rpcId)).toMatchObject({ tenantId: 'team-1' });
  });
});
