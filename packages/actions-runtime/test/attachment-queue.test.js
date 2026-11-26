import { describe, it, expect, vi } from 'vitest';
import { TommyError } from '@tommy/sdk';
import { createBroker, createFakeIssuer, createDurableQueue, createHostStoreQueue } from '../src/index.js';

const submit = ({ keepRefused = false, maxFiles } = {}) => ({
  description: 'submit a document',
  inputSchema: {
    type: 'object',
    properties: { documentTypeId: { type: 'string' }, files: { type: 'array', items: { type: 'object' } } },
  },
  sideEffect: 'server_write',
  idempotency: 'client_key',
  offlineReplayable: true,
  keepRefused,
  attachments: { fields: ['files'], ...(maxFiles ? { maxFiles } : {}) },
  retry: { maxAttempts: 1 },
});

/** The host's attachment store as the broker sees it: kept refs, pins by key, released by outcome. */
function fakeAttachments(queue) {
  const kept = new Map();
  const events = [];
  const keyOf = ({ sourceMpId, activity, idempotencyKey }) => `${sourceMpId}|${activity}|${idempotencyKey}`;
  return {
    kept,
    events,
    keep(ref, sourceMpId, extra = {}) { kept.set(ref, { ref, sourceMpId, name: `${ref}.jpg`, size: 3, type: 'image/jpeg', pin: null, ...extra }); },
    async pin(request) {
      events.push(['pin', request.refs]);
      for (const ref of request.refs) {
        const row = kept.get(ref);
        if (!row || row.sourceMpId !== request.sourceMpId) throw Object.assign(new Error('not here'), { code: 'ATTACHMENT_NOT_FOUND' });
        if (row.pin && row.pin !== keyOf(request)) throw Object.assign(new Error('pinned'), { code: 'ATTACHMENT_IN_USE' });
      }
      for (const ref of request.refs) kept.get(ref).pin = keyOf(request);
    },
    async settle(request) {
      const rowsLeft = queue ? queue.all().filter((row) => row.envelope?.idempotencyKey === request.idempotencyKey).length : null;
      events.push(['settle', request.state, request.keep, rowsLeft]);
      for (const [ref, row] of kept) {
        if (row.pin !== keyOf(request)) continue;
        if (request.state === 'unconfirmed') row.hold = true;
        else if (request.state === 'refused' && request.keep) row.refused = true;
        else if (request.state === 'released') row.pin = null;
        else if (request.state === 'expired') row.expired = true;
        else kept.delete(ref);
      }
    },
    describe(request) {
      const rows = [...kept.values()].filter((row) => row.pin === keyOf(request));
      return rows.length ? rows.map(({ ref, name, size, type }) => ({ ref, name, size, type })) : null;
    },
    progress: () => 0.5,
  };
}

async function page({
  online = false, serverInvoke = vi.fn(async () => ({ result: { documentId: 'd-1' } })), keepRefused = false, store = true, queue = null, maxFiles,
  now, options = {}, tenant = 'team-1',
} = {}) {
  const issuer = createFakeIssuer();
  const offlineQueue = queue || createDurableQueue({ storage: null, held: new Set() });
  const attachments = store ? fakeAttachments(offlineQueue) : null;
  let identity = {};
  const broker = createBroker({
    capabilityService: issuer,
    serverInvoke,
    online,
    sleep: async () => {},
    ...(now ? { now, setTimer: () => 0, clearTimer: () => {} } : {}),
    offlineQueue,
    ...(attachments ? { attachmentStore: attachments } : {}),
    queueOwner: () => ({ tenantId: 'team-1', person: '5', accountType: 'TeamMember', accountId: '9' }),
    replayEnvelope: async (envelope) => ({ ...envelope, ...identity }),
    ...options,
  });
  const manifest = (id) => ({
    id, version: '1.0.0', publisher: { type: 'first_party' }, triggers: {}, conditions: {},
    activities: { submit_document: submit({ keepRefused, maxFiles }) }, actions: {},
  });
  broker.registerMp(manifest('documents'), { handlers: { activities: {} } });
  broker.registerMp(manifest('forms'), { handlers: { activities: {} } });
  const token = await issuer.issue('documents', '1.0.0', tenant, [], 'i-d');
  identity = { capabilityToken: token, instanceId: 'i-d' };
  const invoke = (key, files, extra = {}) => broker.invoke({
    sourceMpId: 'documents', instanceId: 'i-d', capabilityToken: token, activity: 'documents.submit_document',
    args: { documentTypeId: '7', files }, idempotencyKey: key, ...extra,
  });
  return { broker, invoke, attachments, serverInvoke, offlineQueue, issuer };
}

const fileRef = (ref) => ({ ref, name: `${ref}.jpg`, size: 3, type: 'image/jpeg' });

describe('a queued write that carries attachments', () => {
  it('is queued holding only its refs, pinned to its key, with a receipt naming the files', async () => {
    const { broker, invoke, attachments, offlineQueue } = await page();
    attachments.keep('a-1', 'documents');
    const answer = await invoke('k-1', [fileRef('a-1')], { summary: 'Police check' });
    expect(answer.status).toBe('queued_offline');
    expect(attachments.kept.get('a-1').pin).toBe('documents|documents.submit_document|k-1');
    const [row] = offlineQueue.all();
    expect(JSON.stringify(row.envelope.args)).not.toMatch(/base64|data:/);
    const [receipt] = broker.queuedWrites('documents');
    expect(receipt).toMatchObject({
      idempotencyKey: 'k-1', summary: 'Police check', attachments: [{ ref: 'a-1', name: 'a-1.jpg', size: 3, type: 'image/jpeg' }], progress: null,
    });
  });

  it('a write without files keeps today\'s receipt shape', async () => {
    const { broker, invoke } = await page();
    await invoke('k-2', []);
    const [receipt] = broker.queuedWrites('documents');
    expect(receipt).not.toHaveProperty('attachments');
    expect(receipt).not.toHaveProperty('progress');
    expect(receipt).not.toHaveProperty('summary');
  });

  it('a ref another Mini Program kept is not found, and nothing is queued', async () => {
    const { broker, invoke, attachments } = await page();
    attachments.keep('a-9', 'forms');
    await expect(invoke('k-1', [fileRef('a-9')])).rejects.toMatchObject({ code: 'ATTACHMENT_NOT_FOUND', retryable: false });
    expect(broker.queuedWrites('documents')).toEqual([]);
  });

  it('a ref pinned to another write is in use', async () => {
    const { invoke, attachments } = await page();
    attachments.keep('a-1', 'documents');
    await invoke('k-1', [fileRef('a-1')]);
    await expect(invoke('k-2', [fileRef('a-1')])).rejects.toMatchObject({ code: 'ATTACHMENT_IN_USE' });
  });

  it('more files than the activity declares is refused before anything is pinned', async () => {
    const { invoke, attachments } = await page({ maxFiles: 1 });
    attachments.keep('a-1', 'documents');
    attachments.keep('a-2', 'documents');
    await expect(invoke('k-1', [fileRef('a-1'), fileRef('a-2')])).rejects.toMatchObject({ code: 'InvalidPayload' });
    expect(attachments.events).toEqual([]);
  });

  it('a host with no attachment store refuses refs', async () => {
    const { invoke } = await page({ store: false });
    await expect(invoke('k-1', [fileRef('a-1')])).rejects.toMatchObject({ code: 'ATTACHMENTS_UNAVAILABLE' });
  });

  it('success deletes the bytes, only after the queue row is gone', async () => {
    const { broker, invoke, attachments, serverInvoke } = await page();
    attachments.keep('a-1', 'documents');
    await invoke('k-1', [fileRef('a-1')], { summary: 'Police check' });
    broker.setOnline(true);
    await broker.drainOfflineQueue();
    expect(serverInvoke).toHaveBeenCalledTimes(1);
    expect(serverInvoke.mock.calls[0][0]).not.toHaveProperty('summary');
    expect(JSON.stringify(serverInvoke.mock.calls[0][0])).not.toContain('Police check');
    expect(attachments.kept.has('a-1')).toBe(false);
    expect(attachments.events.find((event) => event[0] === 'settle')).toEqual(['settle', 'succeeded', false, 0]);
  });

  it('an online write held in the queue releases its files after the row is removed', async () => {
    const queue = createHostStoreQueue({ backend: memoryBackend(), held: new Set() });
    const { invoke, attachments } = await page({ online: true, queue });
    attachments.keep('a-1', 'documents');
    await invoke('k-1', [fileRef('a-1')]);
    expect(attachments.kept.has('a-1')).toBe(false);
    expect(attachments.events.find((event) => event[0] === 'settle')).toEqual(['settle', 'succeeded', false, 0]);
  });

  it('a refusal of a keepRefused write keeps the files for its receipt', async () => {
    const refused = () => Object.assign(new TommyError({ code: 'FORM_INACTIVE', message: 'inactive', retryable: false }), { status: 422 });
    const { broker, invoke, attachments } = await page({ keepRefused: true, serverInvoke: vi.fn(async () => { throw refused(); }) });
    attachments.keep('a-1', 'documents');
    await invoke('k-1', [fileRef('a-1')]);
    broker.setOnline(true);
    await broker.drainOfflineQueue();
    expect(attachments.kept.get('a-1')).toMatchObject({ refused: true });
  });

  it('a refusal of a write that keeps nothing deletes the files', async () => {
    const refused = () => Object.assign(new TommyError({ code: 'FORM_INACTIVE', message: 'inactive', retryable: false }), { status: 422 });
    const { broker, invoke, attachments } = await page({ serverInvoke: vi.fn(async () => { throw refused(); }) });
    attachments.keep('a-1', 'documents');
    await invoke('k-1', [fileRef('a-1')]);
    broker.setOnline(true);
    await broker.drainOfflineQueue();
    expect(attachments.kept.has('a-1')).toBe(false);
  });

  it('a write that never reached the server keeps its files queued', async () => {
    const unreachable = () => Object.assign(new TypeError('Failed to fetch'), { status: 0 });
    const { broker, invoke, attachments } = await page({ serverInvoke: vi.fn(async () => { throw unreachable(); }) });
    attachments.keep('a-1', 'documents');
    await invoke('k-1', [fileRef('a-1')]);
    broker.setOnline(true);
    await broker.drainOfflineQueue();
    expect(attachments.kept.get('a-1')).toMatchObject({ pin: 'documents|documents.submit_document|k-1' });
    expect(attachments.events.some((event) => event[0] === 'settle')).toBe(false);
    expect(broker.queuedWrites('documents')).toHaveLength(1);
  });

  it('a write the server asked to wait for shows when it is sent again, and that the server is busy', async () => {
    const clock = { t: 1_000_000 };
    const busy = () => Object.assign(new Error('Too many requests'), { status: 429, retryAfterMs: 90_000 });
    const { broker, invoke, attachments } = await page({ online: true, now: () => clock.t, serverInvoke: vi.fn(async () => { throw busy(); }) });
    attachments.keep('a-1', 'documents');
    expect((await invoke('k-1', [fileRef('a-1')])).status).toBe('queued_offline');
    expect(broker.queuedWrites('documents')[0]).toMatchObject({ retryAt: 1_090_000, throttled: true });
    clock.t += 90_000;
    expect(broker.queuedWrites('documents')[0]).toMatchObject({ retryAt: null, throttled: false });
  });

  it('a write spaced by the queue after a failed connection shows its resend time, not a busy server', async () => {
    const clock = { t: 1_000_000 };
    const unreachable = () => Object.assign(new TypeError('Failed to fetch'), { status: 0 });
    const { broker, invoke, attachments } = await page({ online: true, now: () => clock.t, serverInvoke: vi.fn(async () => { throw unreachable(); }) });
    attachments.keep('a-1', 'documents');
    await invoke('k-1', [fileRef('a-1')]);
    const [receipt] = broker.queuedWrites('documents');
    expect(receipt.retryAt).toBeGreaterThan(clock.t);
    expect(receipt.throttled).toBe(false);
  });

  it('a write without files carries no resend time', async () => {
    const clock = { t: 1_000_000 };
    const busy = () => Object.assign(new Error('Too many requests'), { status: 429, retryAfterMs: 90_000 });
    const { broker, invoke } = await page({ online: true, now: () => clock.t, serverInvoke: vi.fn(async () => { throw busy(); }) });
    await invoke('k-2', []);
    const [receipt] = broker.queuedWrites('documents');
    expect(receipt).not.toHaveProperty('retryAt');
    expect(receipt).not.toHaveProperty('throttled');
  });

  it('an answer that never came holds the files for the confirm window', async () => {
    const lost = () => new TommyError({ code: 'Timeout', message: 'no answer', retryable: false });
    const { invoke, attachments } = await page({ online: true, serverInvoke: vi.fn(async () => { throw lost(); }) });
    attachments.keep('a-1', 'documents');
    await invoke('k-1', [fileRef('a-1')]).catch(() => {});
    expect(attachments.kept.get('a-1')).toMatchObject({ hold: true });
  });

  it('a discard deletes the files', async () => {
    const { broker, invoke, attachments } = await page();
    attachments.keep('a-1', 'documents');
    await invoke('k-1', [fileRef('a-1')]);
    const [receipt] = broker.queuedWrites('documents');
    expect(await broker.discardQueuedWrite('documents', receipt.id)).toBe(true);
    expect(attachments.kept.has('a-1')).toBe(false);
  });

  it('a queue that cannot keep the write unpins its files, so they can be sent under another key', async () => {
    const issuer = createFakeIssuer();
    const full = {
      ...createDurableQueue({ storage: null }),
      push: async () => { throw Object.assign(new Error('full'), { name: 'QueueNotKept' }); },
    };
    const attachments = fakeAttachments(null);
    const broker = createBroker({
      capabilityService: issuer, online: false, offlineQueue: full, attachmentStore: attachments, sleep: async () => {},
    });
    broker.registerMp({
      id: 'documents', version: '1.0.0', publisher: { type: 'first_party' }, triggers: {}, conditions: {},
      activities: { submit_document: submit() }, actions: {},
    }, { handlers: { activities: {} } });
    const token = await issuer.issue('documents', '1.0.0', 'team-1', [], 'i-d');
    attachments.keep('a-1', 'documents');
    await expect(broker.invoke({
      sourceMpId: 'documents', instanceId: 'i-d', capabilityToken: token, activity: 'documents.submit_document',
      args: { documentTypeId: '7', files: [fileRef('a-1')] }, idempotencyKey: 'k-1',
    })).rejects.toMatchObject({ code: 'Offline_QueueFull' });
    expect(attachments.kept.get('a-1')).toMatchObject({ pin: null });
    await expect(attachments.pin({
      sourceMpId: 'documents', activity: 'documents.submit_document', idempotencyKey: 'k-2', refs: ['a-1'],
    })).resolves.toBeUndefined();
  });

  it('a retried offline write under the same key keeps its files until the last row carrying them settles', async () => {
    const { broker, invoke, attachments } = await page();
    attachments.keep('a-1', 'documents');
    await invoke('k-1', [fileRef('a-1')]);
    await invoke('k-1', [fileRef('a-1')]);
    const receipts = broker.queuedWrites('documents');
    expect(receipts).toHaveLength(2);
    expect(await broker.discardQueuedWrite('documents', receipts[0].id)).toBe(true);
    expect(attachments.kept.get('a-1')).toMatchObject({ pin: 'documents|documents.submit_document|k-1' });
    expect(await broker.discardQueuedWrite('documents', receipts[1].id)).toBe(true);
    expect(attachments.kept.has('a-1')).toBe(false);
  });

  it('a write with files left unsent for the queue\'s 7 days is never sent: its row goes and its files are settled expired', async () => {
    const clock = { t: 1_000_000 };
    const queue = createDurableQueue({ storage: null, held: new Set(), now: () => clock.t });
    const { broker, invoke, attachments, serverInvoke } = await page({ now: () => clock.t, queue });
    attachments.keep('a-1', 'documents');
    await invoke('k-1', [fileRef('a-1')]);
    await invoke('k-2', []);
    clock.t += 7 * 24 * 60 * 60 * 1000;
    broker.setOnline(true);
    await broker.drainOfflineQueue();
    expect(serverInvoke).toHaveBeenCalledTimes(1);
    expect(serverInvoke.mock.calls[0][0].idempotencyKey).toBe('k-2');
    expect(broker.queuedWrites('documents')).toEqual([]);
    expect(attachments.events.filter((event) => event[0] === 'settle')[0]).toEqual(['settle', 'expired', false, 0]);
    expect(attachments.kept.get('a-1')).toMatchObject({ expired: true });
  });

  it('files pinned for a write refused for in-flight capacity are released for another key', async () => {
    let started;
    const running = new Promise((resolve) => { started = resolve; });
    const { broker, invoke, attachments } = await page({
      online: true,
      serverInvoke: vi.fn(() => { started(); return new Promise(() => {}); }),
      options: { throttleOverrides: { documents: { invokesPerMin: 1e6, burst: 1e6 } } },
    });
    invoke('busy-0', []).catch(() => {});
    await running;
    // Issued while a write of the same Mini Program is executing, so each runs inline.
    for (let i = 1; i < 500; i += 1) invoke(`busy-${i}`, []).catch(() => {});
    await new Promise((resolve) => { setTimeout(resolve, 50); });
    expect(broker.inflightStats().runs).toBe(500);
    attachments.keep('a-1', 'documents');
    await expect(invoke('k-1', [fileRef('a-1')])).rejects.toMatchObject({ code: 'RateLimited' });
    expect(attachments.kept.get('a-1')).toMatchObject({ pin: null });
  });

  it('files of an online write that never reached the server and that the queue cannot keep are released', async () => {
    const unreachable = () => Object.assign(new TypeError('Failed to fetch'), { status: 0 });
    const full = {
      ...createDurableQueue({ storage: null, held: new Set() }),
      push: async () => { throw Object.assign(new Error('full'), { name: 'QueueNotKept' }); },
    };
    const { invoke, attachments } = await page({ online: true, queue: full, serverInvoke: vi.fn(async () => { throw unreachable(); }) });
    attachments.keep('a-1', 'documents');
    await expect(invoke('k-1', [fileRef('a-1')])).rejects.toMatchObject({ code: 'Offline_QueueFull' });
    expect(attachments.kept.get('a-1')).toMatchObject({ pin: null });
  });

  it('a drained refusal of a keepRefused write deletes its files when the queue kept no receipt', async () => {
    const refused = () => Object.assign(new TommyError({ code: 'FORM_INACTIVE', message: 'inactive', retryable: false }), { status: 422 });
    const queue = createHostStoreQueue({ backend: memoryBackend(), held: new Set() });
    const { broker, invoke, attachments } = await page({ keepRefused: true, queue, serverInvoke: vi.fn(async () => { throw refused(); }) });
    attachments.keep('a-1', 'documents');
    await invoke('k-1', [fileRef('a-1')]);
    broker.setOnline(true);
    await broker.drainOfflineQueue();
    expect(attachments.events.find((event) => event[0] === 'settle')).toEqual(['settle', 'refused', false, 0]);
    expect(attachments.kept.has('a-1')).toBe(false);
  });

  it('another account\'s row under the same key never holds this account\'s files', async () => {
    const queue = createDurableQueue({ storage: null, held: new Set() });
    const theirs = await page({ queue, options: { queueOwner: () => ({ tenantId: 'team-2', person: '6', accountType: 'TeamMember', accountId: '10' }) } });
    const mine = await page({ queue });
    theirs.attachments.keep('b-1', 'documents');
    mine.attachments.keep('a-1', 'documents');
    await theirs.invoke('k-1', [fileRef('b-1')]);
    await mine.invoke('k-1', [fileRef('a-1')]);
    const [receipt] = mine.broker.queuedWrites('documents');
    expect(await mine.broker.discardQueuedWrite('documents', receipt.id)).toBe(true);
    expect(mine.attachments.kept.has('a-1')).toBe(false);
    expect(theirs.attachments.kept.get('b-1')).toMatchObject({ pin: 'documents|documents.submit_document|k-1' });
  });

  it('two refused rows of one keepRefused write leave its files kept as refused', async () => {
    const refused = () => Object.assign(new TommyError({ code: 'FORM_INACTIVE', message: 'inactive', retryable: false }), { status: 422 });
    const { broker, invoke, attachments } = await page({ keepRefused: true, serverInvoke: vi.fn(async () => { throw refused(); }) });
    attachments.keep('a-1', 'documents');
    await invoke('k-1', [fileRef('a-1')]);
    await invoke('k-1', [fileRef('a-1')]);
    broker.setOnline(true);
    await broker.drainOfflineQueue();
    expect(attachments.kept.get('a-1')).toMatchObject({ refused: true });
  });

  it('an expired row of a write retried later keeps the newer row\'s outcome', async () => {
    const clock = { t: 1_000_000 };
    const queue = createDurableQueue({ storage: null, held: new Set(), now: () => clock.t });
    const { broker, invoke, attachments } = await page({ now: () => clock.t, queue });
    attachments.keep('a-1', 'documents');
    await invoke('k-1', [fileRef('a-1')]);
    clock.t += 6 * 24 * 60 * 60 * 1000;
    await invoke('k-1', [fileRef('a-1')]);
    clock.t += 24 * 60 * 60 * 1000;
    await broker.drainOfflineQueue();
    expect(broker.queuedWrites('documents')).toHaveLength(1);
    expect(broker.writeOutcome('documents', 'submit_document', 'k-1')).toMatchObject({ state: 'queued' });
  });

  it('a write whose last row expired leaves no resend wait for a new write under its key', async () => {
    const clock = { t: 1_000_000 };
    const unreachable = () => Object.assign(new TypeError('Failed to fetch'), { status: 0 });
    const queue = createDurableQueue({ storage: null, held: new Set(), now: () => clock.t });
    const { broker, invoke, attachments } = await page({ now: () => clock.t, queue, serverInvoke: vi.fn(async () => { throw unreachable(); }) });
    attachments.keep('a-1', 'documents');
    await invoke('k-1', [fileRef('a-1')]);
    clock.t += 7 * 24 * 60 * 60 * 1000 - 1000;
    broker.setOnline(true);
    await broker.drainOfflineQueue();
    clock.t += 1000;
    await broker.drainOfflineQueue();
    expect(broker.queuedWrites('documents')).toEqual([]);
    broker.setOnline(false);
    attachments.keep('a-2', 'documents');
    await invoke('k-1', [fileRef('a-2')]);
    expect(broker.queuedWrites('documents')[0]).toMatchObject({ retryAt: null });
  });

  it('an expired row of a Mini Program that registers after the drain starts is not sent', async () => {
    const clock = { t: 1_000_000 };
    const queue = createDurableQueue({ storage: null, held: new Set(), now: () => clock.t });
    const before = await page({ now: () => clock.t, queue });
    before.attachments.keep('a-1', 'documents');
    await before.invoke('k-1', [fileRef('a-1')]);
    clock.t += 7 * 24 * 60 * 60 * 1000;
    const issuer = createFakeIssuer();
    const attachments = fakeAttachments(queue);
    delete attachments.describe;
    attachments.keep('a-1', 'documents', { pin: 'documents|documents.submit_document|k-1' });
    const serverInvoke = vi.fn(async () => ({ result: { documentId: 'd-1' } }));
    let token = null;
    const broker = createBroker({
      capabilityService: issuer, serverInvoke, online: true, sleep: async () => {}, now: () => clock.t, setTimer: () => 0, clearTimer: () => {},
      offlineQueue: queue, attachmentStore: attachments,
      queueOwner: () => ({ tenantId: 'team-1', person: '5', accountType: 'TeamMember', accountId: '9' }),
      replayEnvelope: async (envelope) => ({ ...envelope, capabilityToken: token, instanceId: 'i-d' }),
    });
    broker.expectMps(['documents']);
    const draining = broker.drainOfflineQueue();
    await new Promise((resolve) => { setTimeout(resolve, 10); });
    broker.registerMp({
      id: 'documents', version: '1.0.0', publisher: { type: 'first_party' }, triggers: {}, conditions: {},
      activities: { submit_document: submit() }, actions: {},
    }, { handlers: { activities: {} } });
    token = await issuer.issue('documents', '1.0.0', 'team-1', [], 'i-d');
    await draining;
    await broker.drainOfflineQueue();
    expect(serverInvoke).not.toHaveBeenCalled();
    expect(attachments.kept.get('a-1')).toMatchObject({ expired: true });
  });

  it('an aged row discarded while its Mini Program has not registered is never sent', async () => {
    const clock = { t: 1_000_000 };
    const queue = createDurableQueue({ storage: null, held: new Set(), now: () => clock.t });
    const before = await page({ now: () => clock.t, queue });
    await before.invoke('k-1', []);
    clock.t += 7 * 24 * 60 * 60 * 1000;
    const issuer = createFakeIssuer();
    const serverInvoke = vi.fn(async () => ({ result: { documentId: 'd-1' } }));
    let token = null;
    const broker = createBroker({
      capabilityService: issuer, serverInvoke, online: true, sleep: async () => {}, now: () => clock.t, setTimer: () => 0, clearTimer: () => {},
      offlineQueue: queue, attachmentStore: fakeAttachments(queue),
      queueOwner: () => ({ tenantId: 'team-1', person: '5', accountType: 'TeamMember', accountId: '9' }),
      replayEnvelope: async (envelope) => ({ ...envelope, capabilityToken: token, instanceId: 'i-d' }),
    });
    broker.expectMps(['documents']);
    const draining = broker.drainOfflineQueue();
    await new Promise((resolve) => { setTimeout(resolve, 10); });
    const [row] = queue.all();
    expect(await broker.discardQueuedWrite('documents', row.id)).toBe(true);
    broker.registerMp({
      id: 'documents', version: '1.0.0', publisher: { type: 'first_party' }, triggers: {}, conditions: {},
      activities: { submit_document: submit() }, actions: {},
    }, { handlers: { activities: {} } });
    token = await issuer.issue('documents', '1.0.0', 'team-1', [], 'i-d');
    await draining;
    expect(serverInvoke).not.toHaveBeenCalled();
  });

  it('an aged file row whose Mini Program registers only after the registration wait is not sent', async () => {
    const clock = { t: 1_000_000 };
    const queue = createDurableQueue({ storage: null, held: new Set(), now: () => clock.t });
    const before = await page({ now: () => clock.t, queue });
    before.attachments.keep('a-1', 'documents');
    await before.invoke('k-1', [fileRef('a-1')]);
    clock.t += 7 * 24 * 60 * 60 * 1000;
    const issuer = createFakeIssuer();
    const attachments = fakeAttachments(queue);
    delete attachments.describe;
    attachments.keep('a-1', 'documents', { pin: 'documents|documents.submit_document|k-1' });
    const serverInvoke = vi.fn(async () => ({ result: { documentId: 'd-1' } }));
    let token = null;
    const broker = createBroker({
      capabilityService: issuer, serverInvoke, online: true, sleep: async () => {}, now: () => clock.t, setTimer: () => 0, clearTimer: () => {},
      offlineQueue: queue, attachmentStore: attachments, registrationTimeoutMs: 20,
      queueOwner: () => ({ tenantId: 'team-1', person: '5', accountType: 'TeamMember', accountId: '9' }),
      replayEnvelope: async (envelope) => ({ ...envelope, capabilityToken: token, instanceId: 'i-d' }),
    });
    broker.expectMps(['documents']);
    const draining = broker.drainOfflineQueue();
    await new Promise((resolve) => { setTimeout(resolve, 30); });
    broker.registerMp({
      id: 'documents', version: '1.0.0', publisher: { type: 'first_party' }, triggers: {}, conditions: {},
      activities: { submit_document: submit() }, actions: {},
    }, { handlers: { activities: {} } });
    token = await issuer.issue('documents', '1.0.0', 'team-1', [], 'i-d');
    await draining;
    expect(serverInvoke).not.toHaveBeenCalled();
    await broker.drainOfflineQueue();
    expect(serverInvoke).not.toHaveBeenCalled();
    expect(attachments.kept.get('a-1')).toMatchObject({ expired: true });
  });

  it('with no queue owner, another tenant\'s row under the same key keeps neither this tenant\'s files nor its outcome', async () => {
    const queue = createDurableQueue({ storage: null, held: new Set() });
    const mine = await page({ queue, options: { queueOwner: undefined } });
    const theirs = await page({ queue, tenant: 'team-2', options: { queueOwner: undefined } });
    mine.attachments.keep('a-1', 'documents');
    theirs.attachments.keep('b-1', 'documents');
    await mine.invoke('k-1', [fileRef('a-1')]);
    await theirs.invoke('k-1', [fileRef('b-1')]);
    const [first] = queue.all();
    expect(await mine.broker.discardQueuedWrite('documents', first.id)).toBe(true);
    expect(mine.attachments.kept.has('a-1')).toBe(false);
    expect(mine.broker.writeOutcome('documents', 'submit_document', 'k-1', { tenantId: 'team-1' })).toBeNull();
  });

  it('an expired row leaves another Mini Program\'s wait under the same key', async () => {
    const clock = { t: 1_000_000 };
    const unreachable = () => Object.assign(new TypeError('Failed to fetch'), { status: 0 });
    const busy = () => Object.assign(new Error('Too many requests'), { status: 429, retryAfterMs: 90_000 });
    const queue = createDurableQueue({ storage: null, held: new Set(), now: () => clock.t });
    const serverInvoke = vi.fn(async () => { throw unreachable(); });
    const { broker, invoke, attachments, issuer } = await page({ online: true, now: () => clock.t, queue, serverInvoke });
    attachments.keep('a-1', 'documents');
    await invoke('k-1', [fileRef('a-1')]);
    clock.t += 7 * 24 * 60 * 60 * 1000 - 10_000;
    serverInvoke.mockImplementation(async () => { throw busy(); });
    const formsToken = await issuer.issue('forms', '1.0.0', 'team-1', [], 'i-f');
    attachments.keep('f-1', 'forms');
    await broker.invoke({
      sourceMpId: 'forms', instanceId: 'i-f', capabilityToken: formsToken, activity: 'forms.submit_document',
      args: { documentTypeId: '7', files: [fileRef('f-1')] }, idempotencyKey: 'k-1',
    });
    expect(broker.queuedWrites('forms')[0].retryAt).toBe(clock.t + 90_000);
    clock.t += 10_000;
    await broker.drainOfflineQueue();
    expect(broker.queuedWrites('documents')).toEqual([]);
    expect(broker.queuedWrites('forms')[0].retryAt).toBe(clock.t + 80_000);
  });

  it('a write without files never reaches the attachment store when it settles', async () => {
    const { broker, invoke, attachments } = await page();
    await invoke('k-2', []);
    broker.setOnline(true);
    await broker.drainOfflineQueue();
    expect(attachments.events.filter((event) => event[0] === 'settle')).toEqual([]);
  });

  it('a summary is plain text up to 80 characters, kept with the host-store row', async () => {
    const backend = memoryBackend();
    const queue = createHostStoreQueue({ backend, held: new Set() });
    const { invoke, attachments } = await page({ queue });
    attachments.keep('a-1', 'documents');
    await invoke('k-1', [fileRef('a-1')], { summary: `${'x'.repeat(100)}` });
    const reloaded = createHostStoreQueue({ backend, held: new Set() });
    await reloaded.ready();
    expect(reloaded.all()[0].envelope.summary).toBe('x'.repeat(80));
  });
});

function memoryBackend() {
  const rows = new Map();
  let revision = 0;
  return {
    async page({ afterKey = null, limit = 100 } = {}) {
      const keys = [...rows.keys()].sort();
      const start = afterKey === null ? 0 : keys.indexOf(afterKey) + 1;
      const slice = keys.slice(start, start + limit);
      return {
        ok: true, epoch: 1, storeRevision: revision, rows: slice.map((key) => ({ key, value: rows.get(key) })),
        nextKey: start + limit < keys.length ? slice[slice.length - 1] : null,
      };
    },
    async commit(before, changes) {
      if (before.storeRevision !== revision) return { ok: false, reason: 'conflict' };
      for (const change of changes) {
        if (change.op === 'put') rows.set(change.key, JSON.parse(JSON.stringify(change.value)));
        else rows.delete(change.key);
      }
      revision += 1;
      return { ok: true };
    },
  };
}
