// The workspace's other packages are this checkout's own files, never a
// copy linked from another checkout's node_modules.
import { describe, expect, it } from 'vitest';

describe('workspace packages', () => {
  it('resolves @tommy/sdk to this checkout', async () => {
    expect(await import('@tommy/sdk')).toBe(await import('../../sdk/src/index.js'));
  });
});
