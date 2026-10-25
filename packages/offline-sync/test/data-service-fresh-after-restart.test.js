// @vitest-environment node
/**
 * A declared read's freshness outlives the page: a whole read records when it
 * ran and the key digest of what it left in the collection's source meta
 * (cursor or none), and a later service over the same rows and meta (the app
 * opened again) takes an unforced refresh within `maxAge` of that read as
 * fresh, while the stored rows are still the whole set it left. Past
 * `maxAge`, with a row gone or added since, or asked afresh, it reads.
 */
import { describe, it, expect } from 'vitest';
import {
  createDataService, createDataStore, createMemoryStoreBackend, createMemorySourceMeta,
} from '../src/index.js';

const MINUTE = 60_000;

function device() {
  const store = createDataStore({ name: 'members', backend: createMemoryStoreBackend() });
  const sourceMeta = createMemorySourceMeta();
  let at = 1_000_000;
  const asked = [];
  let rows = [{ id: 'a' }, { id: 'b' }];
  const open = () => {
    const data = createDataService({ resolve: (name) => (name === 'members' ? { store, decl: { keyPath: 'id' } } : null), now: () => at, sourceMeta });
    data.source('members', {
      fetch: async () => { asked.push(at); return { rows: rows.map((row) => ({ ...row })) }; },
      read: {},
    });
    return data;
  };
  return {
    store,
    sourceMeta,
    asked,
    open,
    pass(ms) { at += ms; },
    serve(next) { rows = next; },
  };
}

describe('a declared read after the app opens again', () => {
  it('is fresh within maxAge of the last whole read, with the rows it left', async () => {
    const phone = device();
    await phone.open().refresh('members', { mode: 'visible', maxAge: 5 * MINUTE });
    expect(phone.asked).toHaveLength(1);
    expect(await phone.sourceMeta.get('members')).toMatchObject({ cursor: null, count: 2, fullAt: 1_000_000 });

    phone.pass(MINUTE);
    const reopened = phone.open();
    await reopened.refresh('members', { mode: 'visible', maxAge: 5 * MINUTE });
    expect(phone.asked).toHaveLength(1);
    expect(reopened.status('members')).toMatchObject({ state: 'fresh', syncedAt: 1_000_000 });
    expect((await reopened.read('members')).map((row) => row.id).sort()).toEqual(['a', 'b']);
  });

  it('reads once the last whole read is older than maxAge', async () => {
    const phone = device();
    await phone.open().refresh('members', { mode: 'visible', maxAge: 5 * MINUTE });
    phone.pass(5 * MINUTE + 1);
    await phone.open().refresh('members', { mode: 'visible', maxAge: 5 * MINUTE });
    expect(phone.asked).toHaveLength(2);
  });

  it('reads when the stored rows are not the set the read left: one gone, or one added', async () => {
    const phone = device();
    await phone.open().refresh('members', { mode: 'visible', maxAge: 5 * MINUTE });
    await phone.store.delete('a');
    await phone.open().refresh('members', { mode: 'visible', maxAge: 5 * MINUTE });
    expect(phone.asked).toHaveLength(2);

    await phone.store.put({ id: 'z' });
    await phone.open().refresh('members', { mode: 'visible', maxAge: 5 * MINUTE });
    expect(phone.asked).toHaveLength(3);
  });

  it('reads when asked afresh (no maxAge), or when no whole read was recorded', async () => {
    const phone = device();
    await phone.open().refresh('members', { mode: 'visible', maxAge: 5 * MINUTE });
    await phone.open().refresh('members', { mode: 'visible' });
    expect(phone.asked).toHaveLength(2);

    await phone.sourceMeta.set('members', null);
    await phone.open().refresh('members', { mode: 'visible', maxAge: 5 * MINUTE });
    expect(phone.asked).toHaveLength(3);
  });

  it('answers refreshes asked together from the one check: none reads while the stored read is fresh', async () => {
    const phone = device();
    await phone.open().refresh('members', { mode: 'visible', maxAge: 5 * MINUTE });
    const reopened = phone.open();
    await Promise.all([1, 2, 3].map(() => reopened.refresh('members', { mode: 'visible', maxAge: 5 * MINUTE })));
    expect(phone.asked).toHaveLength(1);
    expect(reopened.status('members')).toMatchObject({ state: 'fresh' });
  });

  it('checks the stored rows once a service: refreshes asked together read at most once', async () => {
    const phone = device();
    await phone.open().refresh('members', { mode: 'visible', maxAge: 5 * MINUTE });
    await phone.store.delete('a');
    const reopened = phone.open();
    await Promise.all([1, 2, 3].map(() => reopened.refresh('members', { mode: 'visible', maxAge: 5 * MINUTE })));
    expect(phone.asked).toHaveLength(2);
    expect((await reopened.read('members')).map((row) => row.id).sort()).toEqual(['a', 'b']);
  });
});
