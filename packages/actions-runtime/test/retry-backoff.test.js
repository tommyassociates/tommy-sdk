import { describe, it, expect } from 'vitest';
import { createBroker, createFakeIssuer } from '../src/index.js';
import { retryDelayMs, RETRY_BASE_DELAY_MS, RETRY_MAX_DELAY_MS } from '../src/constants.js';

const TENANT = 'team-9';

function mpWith(retry) {
  return {
    id: 'flaky',
    version: '1.0.0',
    publisher: { type: 'first_party' },
    triggers: {},
    conditions: {},
    actions: {},
    activities: {
      always_fails: {
        description: 'always fails, retryably',
        inputSchema: { type: 'object' },
        sideEffect: 'none',
        callerPolicy: 'first_party',
        ...(retry ? { retry } : {}),
      },
    },
  };
}

async function runAndRecordDelays(retry) {
  const waited = [];
  const issuer = createFakeIssuer();
  const broker = createBroker({
    capabilityService: issuer,
    sleep: async (ms) => { waited.push(ms); },
  });
  broker.registerMp(mpWith(retry), {
    handlers: {
      conditions: {},
      activities: {
        always_fails: async () => {
          const e = new Error('transient');
          e.name = 'TommyError';
          e.code = 'Timeout';
          e.retryable = true;
          throw e;
        },
      },
    },
  });
  const token = await issuer.issue('flaky', '1.0.0', TENANT, [], 'i-1');
  let threw = null;
  try {
    await broker.invoke({
      sourceMpId: 'flaky', instanceId: 'i-1', capabilityToken: token,
      activity: 'flaky.always_fails', args: {},
    });
  } catch (e) { threw = e; }
  return { waited, threw };
}

describe('retryDelayMs', () => {
  it('never delays the first attempt', () => {
    for (const b of ['none', 'linear', 'exponential']) expect(retryDelayMs(b, 1)).toBe(0);
  });

  it('keeps `none` immediate — the honest way to ask for back-to-back retries', () => {
    expect(retryDelayMs('none', 2)).toBe(0);
    expect(retryDelayMs('none', 5)).toBe(0);
  });

  it('grows linearly and exponentially, and CAPS both', () => {
    expect(retryDelayMs('linear', 2)).toBe(RETRY_BASE_DELAY_MS);
    expect(retryDelayMs('linear', 3)).toBe(RETRY_BASE_DELAY_MS * 2);
    expect(retryDelayMs('exponential', 2)).toBe(RETRY_BASE_DELAY_MS);
    expect(retryDelayMs('exponential', 3)).toBe(RETRY_BASE_DELAY_MS * 2);
    expect(retryDelayMs('exponential', 12)).toBe(RETRY_MAX_DELAY_MS);
    expect(retryDelayMs('linear', 99)).toBe(RETRY_MAX_DELAY_MS);
  });

  it('spaces an unrecognised value rather than firing immediately', () => {
    expect(retryDelayMs(undefined, 2)).toBeGreaterThan(0);
  });
});

describe('the broker applies the declared backoff', () => {
  it('spaces the default 3-attempt budget, and the whole budget stays under a second', async () => {
    const { waited, threw } = await runAndRecordDelays(undefined);

    expect(waited).toEqual([RETRY_BASE_DELAY_MS, RETRY_BASE_DELAY_MS * 2]);
    expect(waited.reduce((a, b) => a + b, 0)).toBeLessThan(1000);
    expect(threw).toBeTruthy();
    expect(String(threw.message)).toContain('dead-lettered after 3 attempt(s)');
  });

  it('honours `backoff: none` by not waiting at all', async () => {
    const { waited } = await runAndRecordDelays({ maxAttempts: 3, backoff: 'none' });
    expect(waited).toEqual([0, 0]);
  });

  it('honours a declared linear backoff', async () => {
    const { waited } = await runAndRecordDelays({ maxAttempts: 4, backoff: 'linear' });
    expect(waited).toEqual([100, 200, 300]);
  });

  it('does not delay when there is nothing to retry', async () => {
    const { waited } = await runAndRecordDelays({ maxAttempts: 1, backoff: 'exponential' });
    expect(waited).toEqual([]);
  });
});
