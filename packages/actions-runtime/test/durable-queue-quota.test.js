/**
 * A write queued offline is only reported as queued once the device holds it.
 * A row the device's storage could not take (its quota is spent, e.g. by the
 * photos of a form) is refused as Offline_QueueFull, so the MP keeps its draft
 * and says so, instead of a queued write that is gone at the next reload.
 */
import { describe, it, expect } from 'vitest';
import { createBroker, createFakeIssuer, createDurableQueue } from '../src/index.js';

const quotaError = () => Object.assign(new Error('The quota has been exceeded.'), { name: 'QuotaExceededError' });

function smallStorage(maxChars) {
  const data = new Map();
  return {
    data,
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => {
      if (String(v).length > maxChars) throw quotaError();
      data.set(k, String(v));
    },
    removeItem: (k) => data.delete(k),
  };
}

const serverWrite = {
  description: 'a', inputSchema: { type: 'object' }, sideEffect: 'server_write',
  offlineReplayable: true, idempotency: 'client_key', retry: { maxAttempts: 1 },
};
const forms = {
  id: 'forms', version: '1.0.0', publisher: { type: 'first_party' },
  triggers: {}, conditions: {}, actions: {}, activities: { submit_form: serverWrite },
};

async function offlineBroker(storage) {
  const issuer = createFakeIssuer();
  const queue = createDurableQueue({ storage, now: () => 1_700_000_000_000 });
  const broker = createBroker({
    capabilityService: issuer, online: false, now: () => 1_700_000_000_000,
    serverInvoke: async () => ({ ok: true }), offlineQueue: queue,
  });
  broker.registerMp(forms, { handlers: { activities: {} } });
  const token = await issuer.issue('forms', '1.0.0', 'team-A', [], 'i-f');
  const submit = (args, key) => broker.invoke({
    sourceMpId: 'forms', instanceId: 'i-f', capabilityToken: token, activity: 'forms.submit_form', args, idempotencyKey: key,
  });
  return { queue, submit };
}

describe('offline queue: only what the device holds is queued', () => {
  it('refuses a submit whose photos the device storage cannot take, and keeps the rows it holds', async () => {
    const storage = smallStorage(2000);
    const { queue, submit } = await offlineBroker(storage);
    await expect(submit({ schemaName: 'incident', fields: { a: 1 } }, 'k1')).resolves.toMatchObject({ status: 'queued_offline' });
    const photo = `data:image/jpeg;base64,${'A'.repeat(5000)}`;
    await expect(submit({ schemaName: 'incident', fields: {}, files: [{ key: 'photo', value: photo }] }, 'k2'))
      .rejects.toMatchObject({ code: 'Offline_QueueFull' });
    expect(queue.all()).toHaveLength(1);
    expect(JSON.parse(storage.data.get('mp-offline-queue')).rows).toHaveLength(1);
    // The next small write is still taken.
    await expect(submit({ schemaName: 'incident', fields: { b: 2 } }, 'k3')).resolves.toMatchObject({ status: 'queued_offline' });
    expect(JSON.parse(storage.data.get('mp-offline-queue')).rows).toHaveLength(2);
  });

  it('with no device storage at all, keeps the row in memory as before', () => {
    const queue = createDurableQueue({ storage: null });
    expect(queue.push({ sourceMpId: 'forms', envelope: { args: {} }, bytes: 2 })).toBe(1);
    expect(queue.all()).toHaveLength(1);
  });
});
