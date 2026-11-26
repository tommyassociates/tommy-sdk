import { describe, it, expect, vi } from 'vitest';
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
    expect(await query()).toEqual({ rows: ['a'] });
  });

  it('refuses to cache a late value that fails its own returnSchema', async () => {
    let resolveLate;
    let calls = 0;
    const { query } = await world(() => {
      calls += 1;
      if (calls === 1) return new Promise((r) => { resolveLate = r; });
      return { rows: ['fresh'] };
    });
    await expect(query()).rejects.toThrow();
    resolveLate({ nonsense: true });
    await tick(20);
    expect(await query()).toEqual({ rows: ['fresh'] });
  });
});


describe('R2-F3 — a late value must not resurrect data a write has since deleted', () => {
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

    broker.setSettingState(TENANT, 'demo', { anything: 1 });

    h.release({ rows: [{ id: 'deleted-row' }] });
    await tick(30);

    const second = await query();
    expect(h.calls()).toBe(2);
    expect(second.rows).toEqual([{ id: 'fresh' }]);
  });

  it('still caches a late value when nothing invalidated', async () => {
    const h = slowThenFast({ rows: [{ id: 'fresh' }] });
    const { broker, query } = await world(h.handler);
    await expect(query()).rejects.toThrow(/exceeded latencyBudgetMs/);
    h.release({ rows: [{ id: 'salvaged' }] });
    await tick(30);
    const [rec] = await broker.records.query({ status: 'failed' });
    expect(rec.lateResult).toEqual({ rows: [{ id: 'salvaged' }] });
    const second = await query();
    expect(second.rows).toEqual([{ id: 'salvaged' }]);
    expect(h.calls()).toBe(1);
  });
});

describe('R2-F4 — the salvaged value is payload-bearing and must be redacted', () => {
  it('never reaches the persisted tier, while the note that explains it does', async () => {
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
    vi.useFakeTimers();
    const store = createRecordStore({ backend: createWebStorageBackend({ storage }) });
    const rec = await store.open({ kind: 'query', tenantId: TENANT, targetMpId: 'demo' });
    await store.update(rec.runId, {
      status: 'failed',
      lateResult: { rows: [{ id: 'SENSITIVE-PAYLOAD' }] },
      note: 'resolved after latency budget; the caller had already timed out',
    });

    vi.advanceTimersByTime(1000);
    vi.useRealTimers();
    const onDisk = storage._dump();
    expect(onDisk).toContain('resolved after latency budget');
    expect(onDisk).not.toContain('SENSITIVE-PAYLOAD');
    expect(onDisk).not.toContain('lateResult');
  });
});
