// The workspace's other packages are this checkout's own files, never a
// copy linked from another checkout's node_modules.
import { describe, expect, it } from 'vitest';

describe('workspace packages', () => {
  it('resolves @tommy/sdk to this checkout', async () => {
    expect(await import('@tommy/sdk')).toBe(await import('../../sdk/src/index.js'));
  });
  it('resolves @tommy/panel-runtime to this checkout', async () => {
    expect(await import('@tommy/panel-runtime')).toBe(await import('../../panel-runtime/src/index.js'));
  });
  it('resolves @tommy/offline-sync to this checkout', async () => {
    expect(await import('@tommy/offline-sync')).toBe(await import('../../offline-sync/src/index.js'));
  });
  it('resolves @tommy/manifest to this checkout', async () => {
    expect(await import('@tommy/manifest')).toBe(await import('../../manifest/src/index.js'));
  });
  it('resolves @tommy/actions-runtime to this checkout', async () => {
    expect(await import('@tommy/actions-runtime')).toBe(await import('../../actions-runtime/src/index.js'));
  });
});
