import { describe, expect, it } from 'vitest';

describe('workspace packages', () => {
  it('resolves @tommy/sdk to this checkout', async () => {
    expect(await import('@tommy/sdk')).toBe(await import('../../sdk/src/index.js'));
  });
});
