/**
 * A Mini Program's `tommy.data.store(name).put` may be conditional through
 * declarative options only: `ifAbsent` writes only while no row has the key,
 * `expectedRevision` only while the row is still that revision; either leaves
 * the row as it was and resolves undefined otherwise. A host-only `when`
 * never passes.
 */
import { describe, it, expect } from 'vitest';
import { createMemoryStoreBackend } from '../src/data-store.js';
import { createDataManager } from '../src/manager.js';

const manager = () => createDataManager({
  capabilityToken: { tenantId: 'team-3', mpId: 'claim-mp' }, mpId: 'claim-mp',
  localData: { settings: { keyPath: 'key' } },
  backendFactory: () => createMemoryStoreBackend(),
});

describe('a Mini Program\'s conditional put', () => {
  it('ifAbsent claims a key once; a second claim leaves the first', async () => {
    const store = manager().store('settings');
    expect(await store.put({ key: 'slot', value: 'a' }, { ifAbsent: true })).toBe('slot');
    expect(await store.put({ key: 'slot', value: 'b' }, { ifAbsent: true })).toBeUndefined();
    expect((await store.get('slot')).value).toBe('a');
  });

  it('expectedRevision writes only over that revision', async () => {
    const store = manager().store('settings');
    await store.put({ key: 'slot', value: 'a' });
    const first = await store.get('slot');
    await store.put({ key: 'slot', value: 'b' });
    expect(await store.put({ key: 'slot', value: 'stale' }, { expectedRevision: first._rev })).toBeUndefined(); // eslint-disable-line no-underscore-dangle
    const now = await store.get('slot');
    expect(now.value).toBe('b');
    expect(await store.put({ key: 'slot', value: 'c' }, { expectedRevision: now._rev })).toBe('slot'); // eslint-disable-line no-underscore-dangle
    expect((await store.get('slot')).value).toBe('c');
  });

  it('a host-only when never passes', async () => {
    const store = manager().store('settings');
    expect(await store.put({ key: 'slot', value: 'a' }, { when: () => false })).toBe('slot');
  });
});
