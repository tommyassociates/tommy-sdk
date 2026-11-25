/**
 * Held-first conditions: a query with `onRead` of a condition that declares
 * `heldFirst` resolves the answer the device holds at once and reads again in
 * the background, telling the asker through `onRead`. A refusal purges the
 * held answer; a failure keeps it; an answer is never served under another
 * viewer role fingerprint; a landed write on a collection the condition reads
 * marks it stale. Replays J9-condition-held-then-fresh,
 * J9-condition-client-refused-clears, J9-condition-client-failed-keeps,
 * J9-condition-purged-on-role-change and J6-condition-attendances-in-range-held.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createBroker, createFakeIssuer, createConditionAnswers, classifyReadOutcome, READ_OUTCOME_CODES } from '../src/index.js';

const TENANT = 'team-1';
const fixture = (name) => JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/hds-contract/${name}.json`, import.meta.url)), 'utf8'));
const tick = () => new Promise((resolve) => { setTimeout(resolve, 0); });
const settle = async (n = 4) => { for (let i = 0; i < n; i += 1) await tick(); };

function deviceStore(seed = []) {
  const rows = new Map(seed.map((row) => [row.id, JSON.parse(JSON.stringify(row))]));
  return {
    rows,
    load: async () => [...rows.values()].map((row) => JSON.parse(JSON.stringify(row))),
    put: async (row) => { rows.set(row.id, JSON.parse(JSON.stringify(row))); },
    remove: async (id) => { rows.delete(id); },
  };
}

const conditionDef = (extra = {}) => ({
  description: 'c',
  inputSchema: { type: 'object' },
  returnSchema: { type: 'object' },
  latencyBudgetMs: 5000,
  ...extra,
});

/** A broker with one owner MP whose condition answers through `handler`, and a clock and timer the test drives. */
async function world({
  mp = 'scheduling', condition = 'c', def = conditionDef({ heldFirst: true }), handler, store = null, fingerprint = { value: 'rf-1' }, start = 1764057600000,
} = {}) {
  const clock = { now: start };
  const timers = [];
  const issuer = createFakeIssuer();
  const report = vi.fn();
  const broker = createBroker({
    capabilityService: issuer,
    now: () => clock.now,
    conditionAnswerStore: store,
    viewerFingerprint: () => fingerprint.value,
    reportReadCode: report,
    setTimer: (fn, ms) => { const timer = { fn, ms }; timers.push(timer); return timer; },
    clearTimer: () => {},
  });
  const handlers = { [condition]: (args) => handler(args) };
  broker.registerMp({
    id: mp, version: '1.0.0', publisher: { type: 'first_party' }, triggers: {}, conditions: { [condition]: def }, activities: {}, actions: {},
  }, { handlers: { conditions: handlers } });
  const token = await issuer.issue(mp, '1.0.0', TENANT, [], 'i-1');
  const notices = [];
  const ask = (args, { onRead = (notice) => notices.push(notice), signal } = {}) => broker.query({
    sourceMpId: mp, instanceId: 'i-1', capabilityToken: token, condition: `${mp}.${condition}`, args, ...(onRead ? { onRead } : {}), ...(signal ? { signal } : {}),
  });
  const runTimers = async () => {
    const due = timers.splice(0);
    for (const timer of due) { clock.now += timer.ms; timer.fn(); }
    await settle();
  };
  return { broker, ask, notices, clock, timers, runTimers, report, fingerprint };
}

/** A stored entry as the broker keeps it, for an owner-less broker (every record is its own). */
function heldEntry({ fingerprint, condition, args, answer, at }) {
  const answers = createConditionAnswers();
  const id = answers.idFor('*', fingerprint, condition, JSON.stringify(args, Object.keys(args).sort()));
  return { id, owner: '*', fingerprint, condition, answer, at, seq: 0, stale: false };
}

const refused = () => Object.assign(new Error('Permission denied'), { code: 'PermissionDenied', status: 403 });
const timedOut = () => Object.assign(new Error('condition timed out'), { code: 'Timeout' });
const offline = () => Object.assign(new Error('offline'), { code: 'DATA_OFFLINE' });

describe('held-first conditions (contract fixtures)', () => {
  it('J9-condition-held-then-fresh: the held answer at once, checking, then the fresh answer kept', async () => {
    const f = fixture('J9-condition-held-then-fresh');
    const held = f.given.held['account.mp_condition_answers'];
    const [resolved, checking, fresh] = f.timeline;
    const store = deviceStore([heldEntry({ fingerprint: held.roleFingerprint, condition: 'scheduling.shift_requirements_for', args: held.args, answer: held.answer, at: held.asOf })]);
    let answer;
    const w = await world({
      condition: 'shift_requirements_for', store, fingerprint: { value: held.roleFingerprint },
      handler: () => new Promise((resolve) => { answer = resolve; }),
    });
    await w.broker.conditionAnswersReady();
    const got = await w.ask(held.args);
    expect(got).toEqual(resolved.payload);
    expect(w.notices).toEqual([]);
    await settle();
    expect(w.notices).toEqual([checking.payload]);
    w.clock.now = fresh.payload.asOf;
    answer(f.given.server['handler answer'].returns);
    await settle();
    expect(w.notices).toEqual([checking.payload, fresh.payload]);
    // The fresh value replaced the held entry.
    await w.broker.conditionAnswersReady();
    expect([...store.rows.values()][0]).toMatchObject({ answer: fresh.payload.answer, at: fresh.payload.asOf });
    // The next asker gets it held.
    w.notices.length = 0;
    expect(await w.ask(held.args)).toMatchObject({ state: 'held', answer: fresh.payload.answer, asOf: fresh.payload.asOf });
  });

  it('J9-condition-client-refused-clears: a refusal purges the held answer, then says refused', async () => {
    const f = fixture('J9-condition-client-refused-clears');
    const held = f.given.held['account.mp_condition_answers'];
    const [resolved, refusedNotice] = f.timeline;
    const store = deviceStore([heldEntry({ fingerprint: 'rf-1', condition: 'clients.client', args: held.args, answer: held.answer, at: held.asOf })]);
    const w = await world({ mp: 'clients', condition: 'client', store, handler: async () => { throw refused(); } });
    await w.broker.conditionAnswersReady();
    let askedAtNotice = null;
    const got = await w.ask(held.args, {
      // Asked again from inside the refused notice: nothing is held any more, so it waits and is refused.
      onRead: (notice) => { w.notices.push(notice); if (notice.state === 'refused') { askedAtNotice = w.ask(held.args, { onRead: () => {} }); askedAtNotice.catch(() => {}); } },
    });
    expect(got).toEqual(resolved.payload);
    await settle();
    expect(w.notices.filter((n) => n.state !== 'checking')).toEqual([refusedNotice.payload]);
    await expect(askedAtNotice).rejects.toMatchObject({ code: 'PermissionDenied' });
    await w.broker.conditionAnswersReady();
    expect(store.rows.size).toBe(0);
    // Nothing held now: a second ask waits for the handler, and its refusal rejects.
    await expect(w.ask(held.args)).rejects.toMatchObject({ code: 'PermissionDenied' });
  });

  it('J9-condition-client-failed-keeps: a failure keeps the held answer and retries on the schedule', async () => {
    const f = fixture('J9-condition-client-failed-keeps');
    const held = f.given.held['account.mp_condition_answers'];
    const [resolved, staleNotice] = f.timeline;
    const store = deviceStore([heldEntry({ fingerprint: 'rf-1', condition: 'clients.client', args: held.args, answer: held.answer, at: held.asOf })]);
    const w = await world({ mp: 'clients', condition: 'client', store, start: staleNotice.payload.nextAttemptAt - 4000, handler: async () => { throw timedOut(); } });
    await w.broker.conditionAnswersReady();
    expect(await w.ask(held.args)).toEqual(resolved.payload);
    await settle();
    const stale = w.notices.filter((n) => n.state !== 'checking');
    expect(stale).toEqual([{ ...staleNotice.payload, error: { ...staleNotice.payload.error, message: expect.any(String) } }]);
    expect(stale[0].error.code).toBe('Timeout');
    // Retries 4 s then 12 s, then a final stale without a retry; the answer stays held.
    await w.runTimers();
    await w.runTimers();
    const terminal = w.notices.filter((n) => n.state === 'stale').at(-1);
    expect(terminal).toMatchObject({ state: 'stale', retrying: false, nextAttemptAt: null });
    expect(w.notices.filter((n) => n.state === 'stale')).toHaveLength(3);
    await w.broker.conditionAnswersReady();
    expect([...store.rows.values()][0].answer).toEqual(held.answer);
  });

  it('J9-condition-client-failed-keeps: an unresolved answer is not kept and arrives as stale', async () => {
    const held = fixture('J9-condition-client-failed-keeps').given.held['account.mp_condition_answers'];
    const store = deviceStore([heldEntry({ fingerprint: 'rf-1', condition: 'clients.client', args: held.args, answer: held.answer, at: held.asOf })]);
    const w = await world({ mp: 'clients', condition: 'client', store, handler: async () => ({ client: null, unresolved: true }) });
    await w.broker.conditionAnswersReady();
    await w.ask(held.args);
    await settle();
    expect(w.notices.find((n) => n.state === 'stale')).toMatchObject({ retrying: true, error: { code: 'DATA_NOT_READ' } });
    await w.broker.conditionAnswersReady();
    expect([...store.rows.values()][0].answer).toEqual(held.answer);
  });

  it('J9-condition-purged-on-role-change: an answer held under another fingerprint is never served', async () => {
    const f = fixture('J9-condition-purged-on-role-change');
    const [held] = f.given.held['account.mp_condition_answers'];
    const store = deviceStore([heldEntry({ fingerprint: held.roleFingerprint, condition: 'scheduling.shift_requests_for_location', args: held.args, answer: held.answer, at: held.asOf })]);
    const handler = vi.fn(async () => { throw refused(); });
    const w = await world({ condition: 'shift_requests_for_location', store, fingerprint: { value: held.roleFingerprint }, handler });
    await w.broker.conditionAnswersReady();
    // Priya removes Lena's Pier tag: the fingerprint moves, and the host purges.
    w.fingerprint.value = 'rf-lm-harbour';
    w.broker.purgeConditionAnswers('role_or_location_change');
    await expect(w.ask(held.args)).rejects.toMatchObject({ code: 'PermissionDenied' });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(w.notices).toEqual([]);
    await w.broker.conditionAnswersReady();
    expect(store.rows.size).toBe(0);
  });

  it('a held answer is not served under another fingerprint even before a purge', async () => {
    const held = fixture('J9-condition-purged-on-role-change').given.held['account.mp_condition_answers'][0];
    const store = deviceStore([heldEntry({ fingerprint: held.roleFingerprint, condition: 'scheduling.c', args: held.args, answer: held.answer, at: held.asOf })]);
    const w = await world({ store, fingerprint: { value: 'rf-other' }, handler: async () => ({ requests: [] }) });
    await w.broker.conditionAnswersReady();
    expect(await w.ask(held.args)).toMatchObject({ state: 'fresh', answer: { requests: [] } });
  });

  it('J6-condition-attendances-in-range-held: offline, the held week paints and the notice says stale', async () => {
    const f = fixture('J6-condition-attendances-in-range-held');
    const held = f.given.held['account.mp_condition_answers'];
    const [resolved, staleNotice] = f.timeline;
    const def = conditionDef({ heldFirst: true, freshness: f.given.manifest.freshness });
    const store = deviceStore([heldEntry({ fingerprint: held.roleFingerprint, condition: 'time-clock.attendances_in_range', args: held.args, answer: held.answer, at: held.asOf })]);
    const w = await world({
      mp: 'time-clock', condition: 'attendances_in_range', def, store, fingerprint: { value: held.roleFingerprint },
      start: staleNotice.payload.nextAttemptAt - 4000, handler: async () => { throw offline(); },
    });
    await w.broker.conditionAnswersReady();
    expect(await w.ask(held.args)).toEqual(resolved.payload);
    await settle();
    expect(w.notices.filter((n) => n.state !== 'checking')).toEqual([{ ...staleNotice.payload, error: { ...staleNotice.payload.error, message: expect.any(String) } }]);
  });

  it('J6-condition-attendances-in-range-held: on a kiosk (no store) nothing is held after a restart', async () => {
    const f = fixture('J6-condition-attendances-in-range-held');
    const def = conditionDef({ heldFirst: true, freshness: f.given.manifest.freshness });
    const first = await world({ mp: 'time-clock', condition: 'attendances_in_range', def, handler: async () => f.given.held['account.mp_condition_answers'].answer });
    await first.ask(f.call.args);
    const restarted = await world({ mp: 'time-clock', condition: 'attendances_in_range', def, handler: async () => { throw offline(); } });
    await expect(restarted.ask(f.call.args)).rejects.toMatchObject({ code: 'ConditionError' });
  });
});

describe('ordering and declarations', () => {
  it('O6: no notice is delivered inside the call, and O1: the held answer comes first', async () => {
    const store = deviceStore([heldEntry({ fingerprint: 'rf-1', condition: 'scheduling.c', args: { a: 1 }, answer: { n: 1 }, at: 1000 })]);
    const w = await world({ store, handler: () => ({ n: 2 }) });
    await w.broker.conditionAnswersReady();
    const order = [];
    const pending = w.ask({ a: 1 }, { onRead: (notice) => order.push(`notice:${notice.state}`) });
    order.push('called');
    const got = await pending;
    order.push(`resolved:${got.state}`);
    await settle();
    expect(order).toEqual(['called', 'resolved:held', 'notice:checking', 'notice:fresh']);
  });

  it('O3: an answer read by an earlier-started read never replaces one read after it', async () => {
    const store = deviceStore([heldEntry({ fingerprint: 'rf-1', condition: 'scheduling.c', args: { a: 1 }, answer: { n: 0 }, at: 1000 })]);
    const answers = [];
    const w = await world({ store, handler: () => new Promise((resolve) => { answers.push(resolve); }) });
    await w.broker.conditionAnswersReady();
    await w.ask({ a: 1 }); // read 1 starts
    await settle();
    w.clock.now += 10;
    await w.ask({ a: 1 }); // read 2 starts later
    await settle();
    answers[1]({ n: 2 }); // the later read lands first
    await settle();
    answers[0]({ n: 1 }); // the earlier read lands after it
    await settle();
    expect(await w.ask({ a: 1 }, { onRead: () => {} })).toMatchObject({ state: 'held', answer: { n: 2 } });
  });

  it('a condition that does not declare heldFirst resolves fresh after its handler, with no notice', async () => {
    const w = await world({ def: conditionDef(), handler: async () => ({ n: 1 }) });
    const got = await w.ask({ a: 1 });
    expect(got).toEqual({ answer: { n: 1 }, state: 'fresh', asOf: w.clock.now, aged: false });
    await settle();
    expect(w.notices).toEqual([]);
    await expect((await world({ def: conditionDef(), handler: async () => { throw refused(); } })).ask({ a: 1 })).rejects.toMatchObject({ code: 'PermissionDenied' });
  });

  it('a cacheable hit resolves fresh', async () => {
    const handler = vi.fn(async () => ({ n: 1 }));
    const w = await world({ def: conditionDef({ heldFirst: true, cacheable: true, cacheTtlMs: 60000 }), handler });
    await w.ask({ a: 1 }, { onRead: null });
    expect(await w.ask({ a: 1 })).toMatchObject({ state: 'fresh', answer: { n: 1 } });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('aged when older than showAgeMs; younger than refreshAfterMs reads nothing', async () => {
    const def = conditionDef({ heldFirst: true, freshness: { showAgeMs: 60000, refreshAfterMs: 120000 } });
    const store = deviceStore([heldEntry({ fingerprint: 'rf-1', condition: 'scheduling.c', args: { a: 1 }, answer: { n: 1 }, at: 1000 })]);
    const handler = vi.fn(async () => ({ n: 2 }));
    const w = await world({ def, store, start: 1000 + 90000, handler });
    await w.broker.conditionAnswersReady();
    expect(await w.ask({ a: 1 })).toMatchObject({ state: 'held', aged: true });
    await settle();
    expect(handler).not.toHaveBeenCalled();
    expect(w.notices).toEqual([]);
  });

  it('J9-condition-stale-on-write: after a landed write on a declared source, held first, stale, then fresh', async () => {
    const f = fixture('J9-condition-stale-on-write');
    const held = f.given.held['account.mp_condition_answers'];
    const [resolved, staleNotice, fresh] = f.timeline;
    const def = conditionDef({ heldFirst: true, freshness: f.given.manifest.freshness });
    const store = deviceStore([heldEntry({ fingerprint: held.roleFingerprint, condition: 'scheduling.shift_requirements_for', args: held.args, answer: held.answer, at: held.asOf })]);
    let answer;
    const w = await world({
      condition: 'shift_requirements_for', def, store, fingerprint: { value: held.roleFingerprint }, start: f.given.landedWrite.at,
      handler: () => new Promise((resolve) => { answer = resolve; }),
    });
    await w.broker.conditionAnswersReady();
    w.broker.markConditionAnswersStale(f.given.landedWrite.writes);
    expect(await w.ask(held.args)).toEqual(resolved.payload);
    await settle();
    expect(w.notices).toEqual([staleNotice.payload]);
    w.clock.now = fresh.payload.asOf;
    answer(f.given.server['handler answer'].returns);
    await settle();
    expect(w.notices).toEqual([staleNotice.payload, fresh.payload]);
  });

  it('stale on write: a landed write on a declared source always reads again and says stale until fresh', async () => {
    const def = conditionDef({ heldFirst: true, freshness: { refreshAfterMs: 3600000, sources: ['workforce.attendances'] } });
    const store = deviceStore([heldEntry({ fingerprint: 'rf-1', condition: 'scheduling.c', args: { a: 1 }, answer: { n: 1 }, at: 1000 })]);
    const handler = vi.fn(async () => ({ n: 2 }));
    const w = await world({ def, store, start: 2000, handler });
    await w.broker.conditionAnswersReady();
    w.broker.markConditionAnswersStale(['workforce.shifts']);
    await w.ask({ a: 1 });
    await settle();
    expect(handler).not.toHaveBeenCalled();
    w.broker.markConditionAnswersStale(['workforce.attendances']);
    expect(await w.ask({ a: 1 })).toMatchObject({ state: 'held', answer: { n: 1 } });
    await settle();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(w.notices.map((n) => n.state)).toEqual(['stale', 'fresh']);
    expect(w.notices[0]).toMatchObject({ retrying: true });
  });

  it('a new version of the owning MP purges held answers', async () => {
    const store = deviceStore([heldEntry({ fingerprint: 'rf-1', condition: 'scheduling.c', args: { a: 1 }, answer: { n: 1 }, at: 1000 })]);
    const w = await world({ store, handler: async () => ({ n: 2 }) });
    await w.broker.conditionAnswersReady();
    w.broker.registerMp({
      id: 'scheduling', version: '1.1.0', publisher: { type: 'first_party' }, triggers: {}, conditions: { c: conditionDef({ heldFirst: true }) }, activities: {}, actions: {},
    }, { handlers: { conditions: { c: async () => ({ n: 3 }) } } });
    expect(await w.ask({ a: 1 })).toMatchObject({ state: 'fresh', answer: { n: 3 } });
  });

  it('a throw in onRead touches nothing else, and no notice follows an owner change', async () => {
    const store = deviceStore([heldEntry({ fingerprint: 'rf-1', condition: 'scheduling.c', args: { a: 1 }, answer: { n: 1 }, at: 1000 })]);
    let answer;
    const w = await world({ store, handler: () => new Promise((resolve) => { answer = resolve; }) });
    await w.broker.conditionAnswersReady();
    const seen = [];
    await w.ask({ a: 1 }, { onRead: (notice) => { seen.push(notice.state); throw new Error('asker bug'); } });
    await settle();
    w.fingerprint.value = 'rf-2';
    answer({ n: 2 });
    await settle();
    expect(seen).toEqual(['checking']);
  });
});

describe('the read-outcome classifier', () => {
  it('names refusals, failures and unlisted codes', () => {
    const report = vi.fn();
    expect(classifyReadOutcome(refused())).toEqual({ state: 'refused', reason: 'access' });
    expect(classifyReadOutcome({ status: 401 })).toEqual({ state: 'refused', reason: 'access' });
    expect(classifyReadOutcome({ code: 'ConditionError', cause: { code: 'DATA_ACCESS_CHANGED' } })).toEqual({ state: 'refused', reason: 'access' });
    expect(classifyReadOutcome({ code: 'UnknownCondition' })).toEqual({ state: 'refused', reason: 'unavailable' });
    expect(classifyReadOutcome({ code: 'DATA_UNDECLARED' })).toEqual({ state: 'refused', reason: 'unavailable' });
    for (const code of ['DATA_OFFLINE', 'DATA_NOT_READ', 'Timeout', 'REFRESH_BUSY']) expect(classifyReadOutcome({ code })).toEqual({ state: 'stale', retrying: true });
    expect(classifyReadOutcome({ status: 503 })).toEqual({ state: 'stale', retrying: true });
    expect(classifyReadOutcome({ status: 408 })).toEqual({ state: 'stale', retrying: true });
    expect(classifyReadOutcome(new Error('no status'))).toEqual({ state: 'stale', retrying: true });
    expect(classifyReadOutcome({ code: 'InvalidPayload' })).toEqual({ state: 'stale', retrying: false });
    expect(classifyReadOutcome({ code: 'DATA_RETIRED' })).toEqual({ state: 'silent' });
  });

  it('covers every code the completed list names, and the three default branches', () => {
    const report = vi.fn();
    for (const code of READ_OUTCOME_CODES.access) expect(classifyReadOutcome({ code }, { report }), code).toEqual({ state: 'refused', reason: 'access' });
    for (const code of READ_OUTCOME_CODES.unavailable) expect(classifyReadOutcome({ code }, { report }), code).toEqual({ state: 'refused', reason: 'unavailable' });
    for (const code of READ_OUTCOME_CODES.retry) expect(classifyReadOutcome({ code }, { report }), code).toEqual({ state: 'stale', retrying: true });
    for (const code of READ_OUTCOME_CODES.noRetry) expect(classifyReadOutcome({ code }, { report }), code).toEqual({ state: 'stale', retrying: false });
    expect(classifyReadOutcome({ code: 'DATA_RETIRED' }, { report })).toEqual({ state: 'silent' });
    for (const code of READ_OUTCOME_CODES.held) expect(classifyReadOutcome({ code }, { report }), code).toEqual({ state: 'held' });
    expect(classifyReadOutcome({ code: 'DATA_SIGNED_OUT' }, { report })).toEqual({ state: 'signed_out' });
    expect(READ_OUTCOME_CODES.access).toEqual(['PermissionDenied', 'DATA_FORBIDDEN', 'DATA_ACCESS_CHANGED', 'FORBIDDEN', 'NotAuthorized', 'SCOPE_DENIED', 'DeniedScope', 'Unauthorized', 'Forbidden']);
    expect(READ_OUTCOME_CODES.unavailable).toEqual(['UnknownCondition', 'DATA_UNDECLARED', 'DATA_TRUNCATED', 'DATA_NOT_APPLICABLE', 'NDIS_DISABLED']);
    expect(report).not.toHaveBeenCalled();
    // The default for a code no list names, by status.
    expect(classifyReadOutcome({ code: 'SOMETHING_NEW', status: 403 }, { report })).toEqual({ state: 'refused', reason: 'access' });
    expect(classifyReadOutcome({ code: 'SOMETHING_NEW', status: 404 }, { report })).toEqual({ state: 'refused', reason: 'unavailable' });
    expect(classifyReadOutcome({ code: 'SOMETHING_NEW', status: 410 }, { report })).toEqual({ state: 'refused', reason: 'unavailable' });
    expect(classifyReadOutcome({ code: 'SOMETHING_NEW', status: 422 }, { report })).toEqual({ state: 'stale', retrying: false });
    expect(classifyReadOutcome({ code: 'SOMETHING_NEW' }, { report })).toEqual({ state: 'stale', retrying: false });
    expect(report).toHaveBeenCalledWith('SOMETHING_NEW', 422);
    expect(report).toHaveBeenCalledWith('SOMETHING_NEW', null);
  });
});
