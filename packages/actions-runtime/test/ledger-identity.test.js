import { describe, it, expect } from 'vitest';
import { createOutcomeLedger, createConditionAnswers } from '../src/index.js';

const copy = (value) => JSON.parse(JSON.stringify(value));

// A store whose load answers only when the test lets it.
function slowStore(seed = []) {
  const rows = new Map(seed.map((row) => [row.id, copy(row)]));
  let letLoad;
  const loaded = new Promise((resolve) => { letLoad = resolve; });
  return {
    rows,
    letLoad: () => letLoad(),
    load: async () => { await loaded; return [...rows.values()].map(copy); },
    put: async (row) => { rows.set(row.id, copy(row)); },
    remove: async (id) => { rows.delete(id); },
  };
}

describe('collision-safe ledger identities', () => {
  // These two keys share a 32-bit FNV-1a digest under this owner and activity.
  it('two keys never share an outcome record', () => {
    const ledger = createOutcomeLedger();
    ledger.record('owner', 'time-clock.record_attendance', 'k-132789', { state: 'queued', request: { args: { status: 'stop' } } });
    expect(ledger.get('owner', 'time-clock.record_attendance', 'k-729192')).toBeNull();
    expect(ledger.get('owner', 'time-clock.record_attendance', 'k-132789')).toMatchObject({ state: 'queued' });
  });

  it('a held answer is never served to another viewer, even under the same id', () => {
    const answers = createConditionAnswers();
    const mine = answers.idFor('owner', 'k-232789', 'mp.c', 'null');
    answers.keep({
      id: mine, owner: 'owner', fingerprint: 'k-232789', condition: 'mp.c', answer: { x: 1 }, at: 1, seq: 1,
    });
    const theirs = answers.idFor('owner', 'k-429192', 'mp.c', 'null');
    expect(theirs).not.toBe(mine);
    expect(answers.get(mine, { owner: 'owner', fingerprint: 'k-429192', condition: 'mp.c' })).toBeNull();
    expect(answers.get(mine, { owner: 'owner', fingerprint: 'k-232789', condition: 'mp.c' })).toMatchObject({ answer: { x: 1 } });
  });

  it('a stored outcome whose owner does not match the asked partition is not answered', () => {
    const ledger = createOutcomeLedger();
    const kept = ledger.record('owner-a', 'mp.save', 'k-1', { state: 'succeeded' });
    const other = createOutcomeLedger({ store: { load: async () => [{ ...kept, owner: 'owner-b' }] } });
    return other.ready().then(() => {
      expect(other.get('owner-a', 'mp.save', 'k-1')).toBeNull();
      expect(other.get('owner-b', 'mp.save', 'k-1')).toBeNull();
    });
  });
});

describe('purges made while the stored records load', () => {
  it('an outcome purge before the load finishes is not undone, and the stored rows are removed', async () => {
    const seedLedger = createOutcomeLedger({ now: () => 1000 });
    const seeded = seedLedger.record('owner', 'mp.save', 'k-1', { state: 'queued', request: { args: {} } });
    const store = slowStore([seeded]);
    const ledger = createOutcomeLedger({ store, now: () => 2000 });
    const loading = ledger.ready();
    ledger.clear();
    store.letLoad();
    await loading;
    await ledger.flush();
    expect(ledger.get('owner', 'mp.save', 'k-1')).toBeNull();
    expect(store.rows.size).toBe(0);
  });

  it('an outcome removed before the load finishes stays removed', async () => {
    const seedLedger = createOutcomeLedger({ now: () => 1000 });
    const seeded = seedLedger.record('owner', 'mp.save', 'k-1', { state: 'queued', request: { args: {} } });
    const store = slowStore([seeded]);
    const ledger = createOutcomeLedger({ store, now: () => 2000 });
    const loading = ledger.ready();
    ledger.remove('owner', 'mp.save', 'k-1');
    store.letLoad();
    await loading;
    await ledger.flush();
    expect(ledger.get('owner', 'mp.save', 'k-1')).toBeNull();
    expect(store.rows.size).toBe(0);
  });

  it('a held-answer purge before the load finishes is not undone, and the stored rows are removed', async () => {
    const answers = createConditionAnswers();
    const id = answers.idFor('owner', 'rf-1', 'mp.c', 'null');
    const store = slowStore([{
      id, owner: 'owner', fingerprint: 'rf-1', condition: 'mp.c', answer: { x: 1 }, at: 1, seq: 0, stale: false,
    }]);
    const loadingAnswers = createConditionAnswers({ store });
    const loading = loadingAnswers.ready();
    loadingAnswers.purge();
    store.letLoad();
    await loading;
    await loadingAnswers.flush();
    expect(loadingAnswers.get(id)).toBeNull();
    expect(store.rows.size).toBe(0);
  });

  it('a stale mark before the load finishes reaches the loaded answers', async () => {
    const answers = createConditionAnswers();
    const id = answers.idFor('owner', 'rf-1', 'mp.c', 'null');
    const store = slowStore([{
      id, owner: 'owner', fingerprint: 'rf-1', condition: 'mp.c', answer: { x: 1 }, at: 1, seq: 0, stale: false,
    }]);
    const loadingAnswers = createConditionAnswers({ store });
    const loading = loadingAnswers.ready();
    loadingAnswers.markStale((condition) => condition === 'mp.c');
    store.letLoad();
    await loading;
    expect(loadingAnswers.get(id)).toMatchObject({ stale: true });
  });
});

describe('read order across a restart', () => {
  it('a stored answer\'s sequence never outranks the reads of a new session', async () => {
    const answers = createConditionAnswers();
    const id = answers.idFor('owner', 'rf-1', 'mp.c', 'null');
    const store = slowStore([{
      id, owner: 'owner', fingerprint: 'rf-1', condition: 'mp.c', answer: { old: true }, at: 1000, seq: 100, stale: false,
    }]);
    store.letLoad();
    const next = createConditionAnswers({ store });
    await next.ready();
    expect(next.keep({
      id, owner: 'owner', fingerprint: 'rf-1', condition: 'mp.c', answer: { fresh: true }, at: 2000, seq: 1,
    })).toBe(true);
    expect(next.get(id)).toMatchObject({ answer: { fresh: true } });
  });
});
