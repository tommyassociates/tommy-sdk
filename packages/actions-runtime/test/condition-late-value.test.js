/**
 * condition-late-value.test.js — mp-slow-read-blanks-surface review findings
 * F4 and F5.
 *
 * The broker salvages a condition value that lands after `latencyBudgetMs`: the
 * caller has already been rejected with a Timeout, but the value is cached so the
 * NEXT read is warm. Two things about that path were wrong, and both were
 * invisible — it skipped the returnSchema gate the on-time path runs, and it
 * flipped the failed run record to `succeeded`, erasing the error a later triage
 * would look for.
 */
import { describe, it, expect } from 'vitest';
import {
  createBroker, createFakeIssuer, createRecordStore, createWebStorageBackend,
} from '../src/index.js';

const TENANT = 'team-3';

const ownerWith = (handler, { cacheable = true } = {}) => ({
  manifest: {
    id: 'demo',
    version: '1.0.0',
    publisher: { type: 'first_party' },
    triggers: {},
    activities: {},
    actions: {},
    conditions: {
      slow: {
        description: 'a read that overruns its budget',
        latencyBudgetMs: 30,
        cacheable,
        cacheTtlMs: cacheable ? 60000 : 0,
        inputSchema: { type: 'object' },
        returnSchema: {
          type: 'object', required: ['rows'], additionalProperties: false, properties: { rows: { type: 'array' } },
        },
      },
    },
  },
  handlers: { conditions: { slow: handler } },
});

async function world(handler, opts) {
  const issuer = createFakeIssuer();
  const broker = createBroker({ capabilityService: issuer });
  const { manifest, handlers } = ownerWith(handler, opts);
  broker.registerMp(manifest, { handlers });
  const token = await issuer.issue('demo', '1.0.0', TENANT, [], 'i-1');
  const query = () => broker.query({
    sourceMpId: 'demo', instanceId: 'i-1', capabilityToken: token, condition: 'demo.slow', args: {},
  });
  return { broker, query };
}

const tick = (ms) => new Promise((r) => { setTimeout(r, ms); });

describe('a condition value that lands after the budget', () => {
  it('does NOT erase the timeout the caller experienced', async () => {
    let resolveLate;
    const { broker, query } = await world(() => new Promise((r) => { resolveLate = r; }));
    await expect(query()).rejects.toThrow(/exceeded latencyBudgetMs/);
    const [failed] = await broker.records.query({ status: 'failed' });
    expect(failed).toBeTruthy();

    resolveLate({ rows: [1, 2] });
    await tick(20);
    const after = (await broker.records.query({ kind: 'query' })).find((r) => r.runId === failed.runId);
    // Still discoverable as a failure — an engineer filtering `failed` has to
    // find it — with the salvage recorded alongside the error, not instead of it.
    expect(after.status).toBe('failed');
    expect(after.error).toBeTruthy();
    expect(after.lateResult).toEqual({ rows: [1, 2] });
  });

  it('caches a VALID late value, so the next read is warm', async () => {
    let resolveLate;
    const { query } = await world(() => new Promise((r) => { resolveLate = r; }));
    await expect(query()).rejects.toThrow();
    resolveLate({ rows: ['a'] });
    await tick(20);
    expect(await query()).toEqual({ rows: ['a'] });   // served from the cache
  });

  it('refuses to cache a late value that fails its own returnSchema', async () => {
    // The on-time path validates before caching and the cache READ path does not
    // re-validate, so an unvalidated late value would be served to every caller
    // for the whole TTL — the schema guarantee would hold only while the handler
    // was fast.
    let resolveLate;
    let calls = 0;
    const { query } = await world(() => {
      calls += 1;
      if (calls === 1) return new Promise((r) => { resolveLate = r; });
      return { rows: ['fresh'] };
    });
    await expect(query()).rejects.toThrow();
    resolveLate({ nonsense: true });                  // violates the returnSchema
    await tick(20);
    // Nothing poisoned: the next read runs the handler again.
    expect(await query()).toEqual({ rows: ['fresh'] });
  });
});


/**
 * Round-2 findings R2-F3 and R2-F4 — both defects in the late-value salvage
 * ITSELF, i.e. in the round-1 repair above. The salvage runs DETACHED, an
 * unbounded time after its dispatch returned, and neither the cache it writes
 * nor the record field it adds was reasoned about under that condition.
 */
describe('R2-F3 — a late value must not resurrect data a write has since deleted', () => {
  /** A handler that hangs on its FIRST call and answers instantly after. */
  function slowThenFast(fast) {
    let calls = 0;
    let releaseFirst;
    const handler = () => {
      calls += 1;
      if (calls === 1) return new Promise((r) => { releaseFirst = r; });
      return Promise.resolve(fast);
    };
    return { handler, release: (v) => releaseFirst(v), calls: () => calls };
  }

  it('drops the salvage when the cache was invalidated while the read was in flight', async () => {
    const h = slowThenFast({ rows: [{ id: 'fresh' }] });
    const { broker, query } = await world(h.handler);
    await expect(query()).rejects.toThrow(/exceeded latencyBudgetMs/);

    // The invalidation lands AFTER the caller timed out and BEFORE the slow read
    // returns — the window this branch is open for, and the one nobody sized.
    // `setSettingState` is one of the two real invalidation paths (the other is
    // a server_write sweeping its owner's keys); either proves the same thing.
    broker.setSettingState(TENANT, 'demo', { anything: 1 });

    h.release({ rows: [{ id: 'deleted-row' }] });
    await tick(30);

    // The salvage must have been DROPPED. If it had been cached, this read would
    // be served from it and the handler would never run a second time — and the
    // caller would see `deleted-row`, which the invalidation said is gone.
    const second = await query();
    expect(h.calls()).toBe(2);
    expect(second.rows).toEqual([{ id: 'fresh' }]);
  });

  it('still caches a late value when nothing invalidated', async () => {
    // The guard must not disable the salvage it is protecting.
    const h = slowThenFast({ rows: [{ id: 'fresh' }] });
    const { broker, query } = await world(h.handler);
    await expect(query()).rejects.toThrow(/exceeded latencyBudgetMs/);
    h.release({ rows: [{ id: 'salvaged' }] });
    await tick(30);
    const [rec] = await broker.records.query({ status: 'failed' });
    expect(rec.lateResult).toEqual({ rows: [{ id: 'salvaged' }] });
    // Served from the cache the salvage wrote — the handler is NOT re-entered.
    const second = await query();
    expect(second.rows).toEqual([{ id: 'salvaged' }]);
    expect(h.calls()).toBe(1);
  });
});

describe('R2-F4 — the salvaged value is payload-bearing and must be redacted', () => {
  it('never reaches the persisted tier, while the note that explains it does', async () => {
    // `lateResult` carries a FULL handler return value, exactly like `result`.
    // Round 1 added it without adding it to either projection, so condition
    // results were written to localStorage and never released from the
    // in-memory window — a payload-bearing field outside both lists, which is
    // the one shape those lists exist to prevent.
    //
    // ⚠ ASSERTED AGAINST THE STORAGE, not against a convenience accessor. The
    // first version of this test guarded on an API that does not exist, so it
    // passed against the BROKEN code too — vacuous, and caught only by running
    // it against the pre-fix records.js.
    const storage = (() => {
      const map = new Map();
      return {
        getItem: (k) => (map.has(k) ? map.get(k) : null),
        setItem: (k, v) => map.set(k, String(v)),
        removeItem: (k) => map.delete(k),
        key: (i) => [...map.keys()][i],
        get length() { return map.size; },
        _dump: () => [...map.values()].join(''),
      };
    })();
    const store = createRecordStore({ backend: createWebStorageBackend({ storage }) });
    const rec = await store.open({ kind: 'query', tenantId: TENANT, targetMpId: 'demo' });
    await store.update(rec.runId, {
      status: 'failed',
      lateResult: { rows: [{ id: 'SENSITIVE-PAYLOAD' }] },
      note: 'resolved after latency budget; the caller had already timed out',
    });

    const onDisk = storage._dump();
    expect(onDisk).toContain('resolved after latency budget');
    expect(onDisk).not.toContain('SENSITIVE-PAYLOAD');
    expect(onDisk).not.toContain('lateResult');
  });
});
