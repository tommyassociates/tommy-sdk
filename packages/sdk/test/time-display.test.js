import { describe, expect, it, vi } from 'vitest';
import { buildSdk } from '../src/index.js';

const options = { adapter: { rpc: vi.fn(), subscribe: vi.fn(), teardown: vi.fn() }, init: { mpId: 'team', instanceId: 'one' } };

describe('public host timezone namespace', () => {
  it('guards unsupported hosts without silently guessing a zone', () => {
    expect(() => buildSdk(options).time.formatInstant('2026-10-15T00:00:00Z', { timezone: 'UTC' })).toThrow(/does not exist/);
  });
  it('passes explicit business context only through the injected public namespace', () => {
    const display = Object.freeze({ text: '10:00', timezone: 'Australia/Brisbane', offset: 'UTC+10:00', showZone: true });
    const formatInstant = vi.fn(() => display);
    const sdk = buildSdk({ ...options, namespaces: { time: { formatInstant } } });
    expect(sdk.time.formatInstant('2026-10-15T00:00:00Z', { timezone: 'Australia/Brisbane' })).toBe(display);
    expect(formatInstant).toHaveBeenCalledWith('2026-10-15T00:00:00Z', { timezone: 'Australia/Brisbane' });
    expect(() => sdk.time.unknownTimezoneApi()).toThrow();
    expect(Object.isFrozen(sdk)).toBe(true);
  });
});
