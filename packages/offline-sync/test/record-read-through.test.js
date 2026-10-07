/**
 * record-read-through.test.js — DataApi.record, the single-record read-through.
 *
 * The bug it exists to prevent: a detail/edit surface reading `store.get(id)`
 * alone treats "not cached" as "no data" and paints an empty form. Timesheets
 * shipped exactly that — an edit form for any timesheet outside the loaded
 * window rendered blank over `Total Hours 0m` (measured 2026-09-10).
 */
import { describe, it, expect, vi } from 'vitest';
import { createDataManager } from '../src/index.js';

const token = { tenantId: 'team-4401', mpId: 'time-clock' };

const localData = {
  entries: {
    keyPath: 'id',
    syncStrategy: 'last_write_wins',
    recordSchema: {
      type: 'object',
      required: ['id', 'shiftId'],
      properties: {
        id: { type: 'string' }, shiftId: { type: 'string' }, hours: { type: 'number' }, note: { type: 'string' },
      },
    },
  },
};

const manager = () => createDataManager({ capabilityToken: token, mpId: 'time-clock', localData });

describe('DataApi.record', () => {
  it('only manifest-declared stores exist', () => {
    expect(() => manager().record('undeclared')).toThrow(/not declared in manifest.localData/);
  });

  it('serves a cache hit WITHOUT fetching', async () => {
    const data = manager();
    await data.store('entries').put({ id: '1', shiftId: 's1', hours: 3 });
    const fetch = vi.fn();
    const row = await data.record('entries', { fetch }).get('1');
    expect(row).toMatchObject({ id: '1', hours: 3 });
    expect(fetch).not.toHaveBeenCalled();
  });

  // THE REGRESSION. Cache-only returns undefined here, and the caller paints blank.
  it('fetches on a MISS and writes the record through', async () => {
    const data = manager();
    const fetch = vi.fn().mockResolvedValue({ id: '2', shiftId: 's2', hours: 8 });
    const rec = data.record('entries', { fetch });

    const row = await rec.get('2');
    expect(row, 'a cache miss must reach the server, not return undefined').toMatchObject({ id: '2', hours: 8 });
    expect(fetch).toHaveBeenCalledWith('2');

    // Written through: the second read is served from cache.
    const again = await rec.get('2');
    expect(again).toMatchObject({ id: '2', hours: 8 });
    expect(fetch, 'the fetched record must be cached, or every read hits the network').toHaveBeenCalledTimes(1);
  });

  it('coerces the id to a string key, so a numeric id still hits', async () => {
    const data = manager();
    await data.store('entries').put({ id: '7', shiftId: 's7', hours: 1 });
    const fetch = vi.fn();
    expect(await data.record('entries', { fetch }).get(7)).toMatchObject({ id: '7' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns undefined for a record that genuinely does not exist', async () => {
    const data = manager();
    const fetch = vi.fn().mockResolvedValue(null);
    expect(await data.record('entries', { fetch }).get('404')).toBeUndefined();
  });

  // "Unreachable" and "gone" are different answers. Conflating them is how the
  // blank form happened, so a failing fetch must REJECT rather than resolve
  // undefined — the caller decides what to show.
  it('propagates a fetch failure instead of masking it as a miss', async () => {
    const data = manager();
    const fetch = vi.fn().mockRejectedValue(new Error('offline'));
    await expect(data.record('entries', { fetch }).get('9')).rejects.toThrow(/offline/);
  });

  it('passes the cached row as `prev` so a thin DTO cannot erase rich fields', async () => {
    const data = manager();
    await data.store('entries').put({ id: '3', shiftId: 's3', hours: 5, note: 'rich' });
    const toRecord = vi.fn((dto, prev) => ({ ...prev, ...dto }));
    const row = await data.record('entries', {
      fetch: async () => ({ id: '3', shiftId: 's3', hours: 6 }),
      toRecord,
    }).get('3', { refresh: true });
    expect(toRecord.mock.calls[0][1]).toMatchObject({ note: 'rich' });
    expect(row).toMatchObject({ hours: 6, note: 'rich' });
  });

  it('refresh: true re-fetches even on a hit', async () => {
    const data = manager();
    await data.store('entries').put({ id: '4', shiftId: 's4', hours: 1 });
    const fetch = vi.fn().mockResolvedValue({ id: '4', shiftId: 's4', hours: 2 });
    const row = await data.record('entries', { fetch }).get('4', { refresh: true });
    expect(fetch).toHaveBeenCalled();
    expect(row).toMatchObject({ hours: 2 });
  });

  it('keeps a confirmed answer written after the single-record transport began', async () => {
    const data = manager();
    await data.ingest('entries', [{ id: '4', shiftId: 's4', hours: 1 }]);
    let answer;
    const reading = data.record('entries', { fetch: () => new Promise((resolve) => { answer = resolve; }) }).get('4', { refresh: true });
    await data.store('entries').patchSynced(['4'], { hours: 9 });
    answer({ id: '4', shiftId: 's4', hours: 2 });
    expect(await reading).toMatchObject({ hours: 9 });
    expect(await data.store('entries').get('4')).toMatchObject({ hours: 9 });
  });

  it('does not restore a record removed while its fetch was in flight', async () => {
    const data = manager();
    await data.ingest('entries', [{ id: '4', shiftId: 's4', hours: 1 }]);
    let answer;
    const reading = data.record('entries', { fetch: () => new Promise((resolve) => { answer = resolve; }) }).get('4', { refresh: true });
    await data.store('entries').delete('4');
    answer({ id: '4', shiftId: 's4', hours: 2 });
    expect(await reading).toBeUndefined();
    expect(await data.store('entries').get('4')).toBeUndefined();
  });

  it('keeps the later single-record read when answers arrive out of order', async () => {
    const data = manager();
    let answer;
    const older = data.record('entries', { fetch: () => new Promise((resolve) => { answer = resolve; }) }).get('4', { refresh: true });
    await data.record('entries', { fetch: async () => ({ id: '4', shiftId: 's4', hours: 9 }) }).get('4', { refresh: true });
    answer({ id: '4', shiftId: 's4', hours: 2 });
    expect(await older).toMatchObject({ hours: 9 });
    expect(await data.store('entries').get('4')).toMatchObject({ hours: 9 });
  });

  it('returns a valid server answer when its cache schema refuses to retain it', async () => {
    const data = manager();
    const row = await data.record('entries', { fetch: async () => ({ id: '4', hours: 2 }) }).get('4');
    expect(row).toEqual({ id: '4', hours: 2 });
    expect(await data.store('entries').get('4')).toBeUndefined();
  });

  it('drops a pending single-record answer after its data manager is retired', async () => {
    const data = manager();
    let answer;
    const reading = data.record('entries', { fetch: () => new Promise((resolve) => { answer = resolve; }) }).get('4', { refresh: true });
    data.dispose();
    answer({ id: '4', shiftId: 's4', hours: 2 });
    expect(await reading).toBeUndefined();
  });

  it('stores a fetched record as the server\'s row, and keeps an edit still waiting to be sent', async () => {
    const data = createDataManager({ capabilityToken: token, mpId: 'time-clock', localData: { entries: { ...localData.entries, syncStrategy: 'server_authoritative' } } });
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const pushed = [];
    data.source('entries', { fetch: async () => [], push: async (command) => { if (!pushed.length) await gate; pushed.push(command.record?.hours); } });
    await data.mutate('entries', { op: 'put', record: { id: '5', shiftId: 's5', hours: 1 } });
    const second = data.mutate('entries', { op: 'put', record: { id: '5', shiftId: 's5', hours: 7 } }, { wait: true });
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    const rec = data.record('entries', { fetch: async () => ({ id: '5', shiftId: 's5', hours: 3 }) });
    expect(await rec.get('5', { refresh: true })).toMatchObject({ hours: 7 });
    expect(await data.read('entries', '5', { raw: true })).toMatchObject({ hours: 7, _dirty: true });
    release();
    await expect(second).resolves.toEqual({ key: '5', pushed: true });
    expect(pushed).toEqual([1, 7]);
    // A record fetched where nothing waits to be sent is stored synced.
    const fetched = data.record('entries', { fetch: async () => ({ id: '8', shiftId: 's8', hours: 2 }) });
    await fetched.get('8');
    expect(await data.read('entries', '8', { raw: true })).toMatchObject({ hours: 2, _dirty: false });
  });

  it('answers nothing for a record deleted here and waiting to be sent, however the server still answers', async () => {
    const data = createDataManager({ capabilityToken: token, mpId: 'time-clock', localData: { entries: { ...localData.entries, syncStrategy: 'server_authoritative' } } });
    data.source('entries', { fetch: async () => [], push: async () => { throw Object.assign(new Error('Forbidden'), { status: 403 }); } });
    await data.ingest('entries', [{ id: '9', shiftId: 's9', hours: 4 }]);
    await data.mutate('entries', { op: 'delete', key: '9' });
    const rec = data.record('entries', { fetch: async () => ({ id: '9', shiftId: 's9', hours: 4 }) });
    expect(await rec.get('9', { refresh: true })).toBeUndefined();
    expect(await rec.get('9')).toBeUndefined();
    expect(await data.read('entries', '9')).toBeNull();
  });

  it('null/undefined ids never reach the fetcher', async () => {
    const data = manager();
    const fetch = vi.fn();
    const rec = data.record('entries', { fetch });
    expect(await rec.get(null)).toBeUndefined();
    expect(await rec.get(undefined)).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });
});
