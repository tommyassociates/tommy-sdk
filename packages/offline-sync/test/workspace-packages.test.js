import { describe, expect, it } from 'vitest';

describe('workspace packages', () => {
  it('resolves @tommy/actions-runtime to this checkout', async () => {
    expect(await import('@tommy/actions-runtime')).toBe(await import('../../actions-runtime/src/index.js'));
  });
});
