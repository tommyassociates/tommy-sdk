// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  createDataService, createDataStore, createMemoryStoreBackend, createMemorySourceMeta,
} from '../src/index.js';

const keep = (fields) => (dto, prev) => {
  if (!prev) return dto;
  return { ...dto, ...Object.fromEntries(fields.filter((f) => dto[f] === undefined && prev[f] !== undefined).map((f) => [f, prev[f]])) };
};

function service(spec) {
  const store = createDataStore({ name: 'account', keyPath: 'key', backend: createMemoryStoreBackend() });
  const data = createDataService({ resolve: (name) => (name === 'account' ? { store, decl: { keyPath: 'key' } } : null), sourceMeta: createMemorySourceMeta() });
  if (spec) data.source('account', spec);
  return { data, store };
}

describe('ingestRecord', () => {
  it('an ingested row keeps the declared fields the stored row has and it lacks', async () => {
    let answer = [{ key: 'one', name: 'Cafe', invoicing: { record: true } }];
    const { data } = service({ fetch: async () => ({ rows: answer }), read: { cursor: false }, ingestRecord: keep(['invoicing']) });
    await data.refresh('account', { mode: 'visible' });
    await data.ingest('account', [{ key: 'one', name: 'Cafe Pty' }]);
    expect(await data.read('account')).toEqual([{ key: 'one', name: 'Cafe Pty', invoicing: { record: true } }]);
    answer = [{ key: 'one', name: 'Cafe Pty' }];
    await data.refresh('account', { mode: 'visible', force: true });
    expect(await data.read('account')).toEqual([{ key: 'one', name: 'Cafe Pty' }]);
  });

  it('a source that declares none stores ingested rows as given', async () => {
    const { data } = service({ fetch: async () => ({ rows: [{ key: 'one', name: 'Cafe', invoicing: { record: true } }] }), read: { cursor: false } });
    await data.refresh('account', { mode: 'visible' });
    await data.ingest('account', [{ key: 'one', name: 'Cafe Pty' }]);
    expect(await data.read('account')).toEqual([{ key: 'one', name: 'Cafe Pty' }]);
  });
});
