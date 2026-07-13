/**
 * action-run-records.test.js (ac3) — a scripted trigger→condition→activity
 * chain produces queryable records with per-step detail (§5), chain stamps
 * (§7.1), the replay entry point, dead-letter, and the D21 suppression tally.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createBroker, createFakeIssuer } from '../src/index.js';

const TENANT = 'team-9';

const timeClock = {
  id: 'time-clock',
  version: '1.4.2',
  publisher: { type: 'first_party' },
  triggers: {
    clock_out: {
      description: 'clock out',
      payloadSchema: { type: 'object', required: ['shiftId'], properties: { shiftId: { type: 'string' } } },
      emission: 'async',
    },
  },
  conditions: {},
  activities: {},
  actions: {},
};

const timesheets = {
  id: 'timesheets',
  version: '2.0.0',
  publisher: { type: 'first_party' },
  triggers: {},
  conditions: {
    shift_is_open: {
      description: 'gate',
      inputSchema: { type: 'object' },
      returnSchema: { type: 'boolean' },
      latencyBudgetMs: 100,
    },
  },
  activities: {
    record_timesheet: {
      description: 'the M3 loop target',
      inputSchema: { type: 'object', required: ['shiftId'], properties: { shiftId: { type: 'string' } } },
      resultSchema: { type: 'object' },
      sideEffect: 'local_write',
      idempotency: 'derived_from_input',
      offlineReplayable: false,
      authorizedCallers: ['timesheets', 'time-clock'],
      retry: { maxAttempts: 2 },
    },
  },
  // The declared Action: time-clock.clock_out -> (shift_is_open) -> record_timesheet
  actions: {
    record_timesheet_on_clock_out: {
      title: 'Record timesheet on clock-out',
      trigger: { mp: 'time-clock', name: 'clock_out' },
      conditions: [{ name: 'shift_is_open' }],
      activity: {
        name: 'record_timesheet',
        inputMap: {
          shiftId: { from: 'trigger', path: 'shiftId' },
          note: { const: 'auto' },
          fallbackRate: { from: 'option', path: 'rate', default: 0 },
        },
      },
      enabledByDefault: true,
      required: true,
      userConfigurable: false,
    },
  },
};

async function world({ gateOpen = true, activitySucceeds = true } = {}) {
  const issuer = createFakeIssuer();
  const broker = createBroker({ capabilityService: issuer });
  const recorded = [];
  broker.registerMp(timesheets, {
    handlers: {
      conditions: { shift_is_open: () => gateOpen },
      activities: {
        record_timesheet: (args) => {
          if (!activitySucceeds) throw new Error('db exploded');
          recorded.push(args);
          return { ok: true };
        },
      },
    },
  });
  broker.registerMp(timeClock, { handlers: {} });
  const token = await issuer.issue('time-clock', '1.4.2', TENANT, [], 'i-1');
  return { broker, token, recorded };
}

const emitClockOut = (w, shiftId = 's-77') => w.broker.emit({
  sourceMpId: 'time-clock', instanceId: 'i-1', capabilityToken: w.token,
  trigger: 'time-clock.clock_out', payload: { shiftId },
});

describe('action-run records', () => {
  let w;
  beforeEach(async () => { w = await world(); });

  it('a scripted trigger→condition→activity chain is fully recorded with per-step detail', async () => {
    await emitClockOut(w);
    await new Promise((resolve) => { setTimeout(resolve, 10); });

    const emits = await w.broker.records.query({ kind: 'emit', tenantId: TENANT });
    expect(emits).toHaveLength(1);
    const emitRecord = emits[0];
    expect(emitRecord.triggerName).toBe('time-clock.clock_out');
    expect(emitRecord.sourceMpVersion).toBe('1.4.2');
    expect(emitRecord.status).toBe('succeeded');
    expect(emitRecord.rootRunId).toBe(emitRecord.runId);

    const queries = await w.broker.records.query({ kind: 'query' });
    expect(queries).toHaveLength(1);
    expect(queries[0].conditionName).toBe('timesheets.shift_is_open');
    expect(queries[0].rootRunId).toBe(emitRecord.rootRunId);
    expect(queries[0].depth).toBeGreaterThan(0);
    expect(queries[0].chainPath).toContain('timesheets:record_timesheet_on_clock_out');

    const invokes = await w.broker.records.query({ kind: 'invoke' });
    expect(invokes).toHaveLength(1);
    expect(invokes[0].activityName).toBe('timesheets.record_timesheet');
    expect(invokes[0].status).toBe('succeeded');
    expect(invokes[0].rootRunId).toBe(emitRecord.rootRunId);
    // inputMap assembled base-four sources + default:
    expect(w.recorded[0]).toEqual({ shiftId: 's-77', note: 'auto', fallbackRate: 0 });
    expect(invokes[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  it('a failing activity retries then dead-letters; the record carries attempts + error', async () => {
    const failing = await world({ activitySucceeds: false });
    await emitClockOut(failing);
    await new Promise((resolve) => { setTimeout(resolve, 20); });
    const invokes = await failing.broker.records.query({ kind: 'invoke' });
    expect(invokes).toHaveLength(1);
    expect(invokes[0].status).toBe('dead_letter');
    expect(invokes[0].error.message).toContain('db exploded');
    expect(invokes[0].attempts).toBeGreaterThanOrEqual(1);
  });

  it('replay re-dispatches a dead-lettered invoke with its original args', async () => {
    const failing = await world({ activitySucceeds: false });
    await emitClockOut(failing);
    await new Promise((resolve) => { setTimeout(resolve, 20); });
    const [dead] = await failing.broker.records.query({ kind: 'invoke', status: 'dead_letter' });

    // "Fix the bug", then replay from the inspector with the SAME args.
    failing.recorded.length = 0;
    const fixedWorld = failing;
    fixedWorld.broker.registerMp(timesheets, {
      handlers: {
        conditions: { shift_is_open: () => true },
        activities: { record_timesheet: (args) => { fixedWorld.recorded.push(args); return { ok: true }; } },
      },
    });
    const result = await fixedWorld.broker.replay(dead.runId, { newIdempotencyKey: 'replay-1' });
    expect(result.status).toBe('succeeded');
    expect(fixedWorld.recorded[0].shiftId).toBe('s-77');
  });

  it('a gated (condition=false) Action skips the activity — the query is still recorded', async () => {
    const gated = await world({ gateOpen: false });
    await emitClockOut(gated);
    await new Promise((resolve) => { setTimeout(resolve, 10); });
    expect(await gated.broker.records.query({ kind: 'invoke' })).toHaveLength(0);
    expect(await gated.broker.records.query({ kind: 'query' })).toHaveLength(1);
    expect(gated.recorded).toHaveLength(0);
  });

  it('D21: a trigger with zero consumers is suppressed with a per-(trigger,day) tally, no per-event record', async () => {
    // Disable the required action is forbidden; use a fresh world without the action wired.
    const issuer = createFakeIssuer();
    const broker = createBroker({ capabilityService: issuer });
    broker.registerMp(timeClock, { handlers: {} });
    const token = await issuer.issue('time-clock', '1.4.2', TENANT, [], 'i-9');
    const receipt = await broker.emit({
      sourceMpId: 'time-clock', instanceId: 'i-9', capabilityToken: token,
      trigger: 'time-clock.clock_out', payload: { shiftId: 's-1' },
    });
    expect(receipt.suppressed).toBe(true);
    expect(await broker.records.query({ kind: 'emit' })).toHaveLength(0);
    const tallies = broker.suppressionTallies();
    expect(tallies).toHaveLength(1);
    expect(tallies[0].count).toBe(1);
    expect(tallies[0].key).toContain('time-clock.clock_out');
  });

  it('required Actions cannot be disabled (server posture mirrored device-side)', () => {
    expect(() => w.broker.setActionState(TENANT, 'timesheets', 'record_timesheet_on_clock_out', { enabled: false }))
      .toThrow(/required and cannot be disabled/);
  });
});
