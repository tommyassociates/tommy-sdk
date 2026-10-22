// @vitest-environment node
/**
 * A visible read that passed its deadline answers its caller with the
 * scheduler's REFRESH_TIMEOUT, named for its collection and carrying the
 * stack of where the caller asked: the scheduler's own error comes from its
 * timer and names no caller, so one left unhandled could not be traced.
 * Every other failure, and every other mode, answers as before.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  createDataService, createDataStore, createMemoryStoreBackend,
} from '../src/index.js';
import { timedOutFor } from '../src/data-service.js';

const timeout = () => Object.assign(new Error('Refresh took too long'), { code: 'REFRESH_TIMEOUT', retryable: true });
// A scheduler that answers every request with `answer()`, as the host's does
// for a visible read past its deadline.
const answering = (answer) => ({ request: () => Promise.reject(answer()), revalidate: vi.fn() });
function service(scheduler) {
  const store = createDataStore({ name: 'members', backend: createMemoryStoreBackend() });
  const data = createDataService({
    resolve: (name) => (name === 'members' ? { store, decl: { keyPath: 'id' } } : null), scheduler, principal: { id: 'p1' },
  });
  data.source('members', { fetch: vi.fn().mockResolvedValue([]) });
  return data;
}

describe('a visible read past its deadline', () => {
  it('names its collection and the place its caller asked', async () => {
    const data = service(answering(timeout));
    const askingCaller = () => data.refresh('members', { mode: 'visible' });
    const error = await askingCaller().catch((reason) => reason);
    expect(error).toMatchObject({ code: 'REFRESH_TIMEOUT', retryable: true, collection: 'members' });
    expect(error.message).toBe("Refresh took too long: 'members'");
    expect(error.cause?.message).toBe('Refresh took too long');
    expect(error.stack).toMatch(/^Error: Refresh took too long: 'members'\n/);
    expect(error.stack).toContain('askingCaller');
  });

  it('answers any other failure unchanged', async () => {
    const offline = Object.assign(new Error('Network unreachable'), { status: 0 });
    const data = service(answering(() => offline));
    await expect(data.refresh('members', { mode: 'visible' })).rejects.toBe(offline);
  });

  it('leaves a silent read answering with its status', async () => {
    const data = service(answering(timeout));
    await expect(data.refresh('members')).resolves.toMatchObject({ state: 'error' });
  });

  it('passes an error through when it is not a timeout or no caller was captured', () => {
    const other = new Error('x');
    expect(timedOutFor(other, 'members', new Error())).toBe(other);
    const late = timeout();
    expect(timedOutFor(late, 'members', null)).toBe(late);
  });
});
