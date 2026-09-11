/**
 * queueStats() carries per-partition byte usage and the caps (additive), so a
 * host read can report one MP's queue pressure without exposing another's rows.
 */
import { describe, it, expect } from 'vitest';
import { createBroker, createFakeIssuer, createDurableQueue } from '../src/index.js';
import { QUEUE_MAX_BYTES, QUEUE_MAX_ENTRIES } from '../src/constants.js';

function fakeStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

const serverWrite = {
  description: 'a', inputSchema: { type: 'object' }, sideEffect: 'server_write',
  offlineReplayable: true, idempotency: 'client_key', retry: { maxAttempts: 1 },
};
const mp = (id, activity) => ({
  id, version: '1.0.0', publisher: { type: 'first_party' },
  triggers: {}, conditions: {}, actions: {}, activities: { [activity]: serverWrite },
});

describe('queueStats — bytes per partition + caps', () => {
  it('reports bytesBySource, bytesCap and entriesCap beside the existing fields', async () => {
    const issuer = createFakeIssuer();
    const broker = createBroker({
      capabilityService: issuer, online: false, now: () => 1_700_000_000_000,
      serverInvoke: async () => ({ ok: true }),
      offlineQueue: createDurableQueue({ storage: fakeStorage(), now: () => 1_700_000_000_000 }),
    });
    broker.registerMp(mp('time-clock', 'record_attendance'), { handlers: { activities: {} } });
    broker.registerMp(mp('timesheets', 'submit_timesheet'), { handlers: { activities: {} } });
    const tc = await issuer.issue('time-clock', '1.0.0', 'team-A', [], 'i-tc');
    const ts = await issuer.issue('timesheets', '1.0.0', 'team-A', [], 'i-ts');
    await broker.invoke({ sourceMpId: 'time-clock', instanceId: 'i-tc', capabilityToken: tc, activity: 'time-clock.record_attendance', args: { status: 'start', photo: 'x'.repeat(100) }, idempotencyKey: 'k1' });
    await broker.invoke({ sourceMpId: 'time-clock', instanceId: 'i-tc', capabilityToken: tc, activity: 'time-clock.record_attendance', args: { status: 'stop' }, idempotencyKey: 'k2' });
    await broker.invoke({ sourceMpId: 'timesheets', instanceId: 'i-ts', capabilityToken: ts, activity: 'timesheets.submit_timesheet', args: { week: 'w1' }, idempotencyKey: 'k3' });

    const stats = broker.queueStats();
    expect(stats.total).toBe(3);
    expect(stats.bySource).toEqual({ 'time-clock': 2, timesheets: 1 });
    expect(stats.bytesBySource['time-clock']).toBeGreaterThan(100);
    expect(stats.bytesBySource.timesheets).toBeGreaterThan(0);
    expect(stats.bytesBySource['time-clock']).toBeGreaterThan(stats.bytesBySource.timesheets);
    expect(stats.bytesCap).toBe(QUEUE_MAX_BYTES);
    expect(stats.entriesCap).toBe(QUEUE_MAX_ENTRIES);
    expect(stats.expiredOnLoad).toBe(0);
  });
});
