/**
 * query-signal.test.js — `tommy.actions.query(condition, args, { signal })`
 * hands the caller's signal to the condition handler's own signal through the
 * adapter, so a read the asking surface stopped waiting for can stop.
 */
import { describe, it, expect } from 'vitest';
import { createActionsApi } from '../src/actions.js';

describe('actions.query signal', () => {
  it('passes the signal on the query envelope', async () => {
    const sent = [];
    const api = createActionsApi({ adapter: { rpc: async (env) => { sent.push(env); return {}; } }, mpId: 'demo' });
    const caller = new AbortController();
    await api.query('demo.read', { a: 1 }, { signal: caller.signal });
    expect(sent[0]).toMatchObject({ kind: 'query', condition: 'demo.read', args: { a: 1 } });
    expect(sent[0].signal).toBe(caller.signal);
  });

  it('sends no signal field without one', async () => {
    const sent = [];
    const api = createActionsApi({ adapter: { rpc: async (env) => { sent.push(env); return {}; } }, mpId: 'demo' });
    await api.query('demo.read', {});
    expect('signal' in sent[0]).toBe(false);
  });
});
