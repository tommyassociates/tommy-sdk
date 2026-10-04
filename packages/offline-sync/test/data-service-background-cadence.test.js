// @vitest-environment node
/**
 * An account that is not displayed reads at its device budget's cadence:
 * its refreshes wait `backgroundCadence()` times as long between reads, and
 * read nothing while the cadence is paused (Infinity); a read paused on its
 * way stores nothing and is not fresh. The displayed account reads as
 * asked, and so does a collection the service keeps in the foreground for
 * every account. Sends are never held.
 */
import { describe, it, expect, vi } from 'vitest';
import { createDataService, createDataStore, createMemoryStoreBackend } from '../src/index.js';

const MINUTE = 60 * 1000;
// A scheduler that holds jobs until `run()`, checking each job's `valid()` first.
function heldScheduler() {
  const held = [];
  return {
    request(job) {
      return new Promise((resolve, reject) => { held.push({ job, resolve, reject }); });
    },
    // Runs every held job, and the jobs they lead to, until none is left.
    async run() {
      for (let round = 0; round < 10; round += 1) {
        for (const { job, resolve, reject } of held.splice(0)) {
          if (typeof job.valid === 'function' && !job.valid()) { reject(Object.assign(new Error('no longer current'), { code: 'REFRESH_DROPPED' })); continue; }
          try { resolve(await job.run(() => true)); } catch (error) { reject(error); } // eslint-disable-line no-await-in-loop
        }
        await new Promise((done) => { setTimeout(done, 10); }); // eslint-disable-line no-await-in-loop
      }
    },
  };
}
function service({ foreground, cadence, scheduler }) {
  let clock = 1_000_000;
  const store = createDataStore({ name: 'members', backend: createMemoryStoreBackend() });
  const data = createDataService({
    resolve: (name) => (name === 'members' ? { store, decl: { keyPath: 'id' } } : null),
    now: () => clock, principal: { id: 'p1' }, foreground, backgroundCadence: cadence, ...(scheduler ? { scheduler } : {}),
  });
  const whole = vi.fn(async () => [{ id: '1', user_id: 101 }]);
  const byUserIds = vi.fn(async ({ user_ids: wanted }) => wanted.map((user) => ({ id: String(Number(user) - 100), user_id: Number(user) })));
  data.source('members', {
    fetch: whole,
    methods: { byUserIds: { params: { user_ids: { type: 'ids', max: 3 } }, batch: 'user_ids', fetch: byUserIds, cadenceMs: MINUTE } },
  });
  return { data, whole, byUserIds, advance: (ms) => { clock += ms; } };
}

describe('a background account\'s cadence', () => {
  it('reads a collection asked with a cadence only once that cadence times the multiplier has passed', async () => {
    const shown = service({ foreground: () => true, cadence: () => 2 });
    const hidden = service({ foreground: () => false, cadence: () => 2 });
    for (const { data, advance } of [shown, hidden]) {
      await data.refresh('members', { maxAge: MINUTE }); // eslint-disable-line no-await-in-loop
      advance(MINUTE + 1000);
      await data.refresh('members', { maxAge: MINUTE }); // eslint-disable-line no-await-in-loop
    }
    expect(shown.whole).toHaveBeenCalledTimes(2);
    expect(hidden.whole).toHaveBeenCalledTimes(1);
    hidden.advance(MINUTE);
    await hidden.data.refresh('members', { maxAge: MINUTE });
    expect(hidden.whole).toHaveBeenCalledTimes(2);
  });

  it('asks a refresh method again only at its cadence times the multiplier', async () => {
    const hidden = service({ foreground: () => false, cadence: () => 4 });
    const ask = () => hidden.data.refresh({ collection: 'members', method: 'byUserIds', params: { user_ids: ['101'] } });
    await ask();
    hidden.advance(2 * MINUTE);
    await ask();
    expect(hidden.byUserIds).toHaveBeenCalledTimes(1);
    hidden.advance(3 * MINUTE);
    await ask();
    expect(hidden.byUserIds).toHaveBeenCalledTimes(2);
  });

  it('starts no read already queued once its cadence pauses, a collection\'s or a method\'s', async () => {
    let factor = 2;
    const scheduler = heldScheduler();
    const account = service({ foreground: () => false, cadence: () => factor, scheduler });
    const whole = account.data.refresh('members');
    const method = account.data.refresh({ collection: 'members', method: 'byUserIds', params: { user_ids: ['101'] } });
    // The method's ids are gathered for a moment before its job is asked.
    await new Promise((done) => { setTimeout(done, 10); });
    factor = Infinity;
    await scheduler.run();
    await whole;
    await method;
    expect(account.whole).not.toHaveBeenCalled();
    expect(account.byUserIds).not.toHaveBeenCalled();
  });

  it('reads nothing while its cadence is paused, and as asked once it is displayed', async () => {
    let shown = false;
    const account = service({ foreground: () => shown, cadence: () => Infinity });
    await account.data.refresh('members');
    await account.data.refresh({ collection: 'members', method: 'byUserIds', params: { user_ids: ['101'] } });
    expect(account.whole).not.toHaveBeenCalled();
    expect(account.byUserIds).not.toHaveBeenCalled();
    shown = true;
    await account.data.refresh('members');
    expect(account.whole).toHaveBeenCalledTimes(1);
  });

  it('stores nothing from a read paused on its way, and reads it again once displayed', async () => {
    let factor = 2;
    let shown = false;
    // Each run asks the job whether it is still wanted, as the host's scheduler does.
    const scheduler = {
      request: (job) => Promise.resolve().then(() => job.run(() => job.valid())),
    };
    const account = service({ foreground: () => shown, cadence: () => factor, scheduler });
    let answer;
    account.whole.mockImplementationOnce(() => new Promise((resolve) => { answer = resolve; }));
    const read = account.data.refresh('members');
    await vi.waitFor(() => expect(answer).toBeTypeOf('function'));
    factor = Infinity;
    answer([{ id: '1', user_id: 101 }]);
    await expect(read).resolves.toMatchObject({ state: 'stale', syncedAt: null });
    expect(await account.data.read('members')).toEqual([]);
    // Displayed: a read asked with a maxAge is not answered by the paused one.
    shown = true;
    await account.data.refresh('members', { maxAge: MINUTE });
    expect(account.whole).toHaveBeenCalledTimes(2);
    expect(await account.data.read('members')).toHaveLength(1);
  });

  it('reads a collection kept in the foreground while the rest of its account is paused', async () => {
    const stores = {
      members: createDataStore({ name: 'members', backend: createMemoryStoreBackend() }),
      profile: createDataStore({ name: 'profile', backend: createMemoryStoreBackend() }),
    };
    const data = createDataService({
      resolve: (name) => (stores[name] ? { store: stores[name], decl: { keyPath: 'id' } } : null),
      principal: { id: 'p1' }, foreground: (collection) => collection === 'profile', backgroundCadence: () => Infinity,
    });
    const members = vi.fn(async () => [{ id: '1' }]);
    const profile = vi.fn(async () => [{ id: 'me' }]);
    data.source('members', { fetch: members });
    data.source('profile', { fetch: profile });
    await data.refresh('members');
    await data.refresh('profile');
    expect(members).not.toHaveBeenCalled();
    expect(profile).toHaveBeenCalledTimes(1);
  });

  it('leaves a method read paused on its way stale, not refreshing or fresh', async () => {
    let factor = 2;
    const scheduler = { request: (job) => Promise.resolve().then(() => job.run(() => job.valid())) };
    const account = service({ foreground: () => false, cadence: () => factor, scheduler });
    let answer;
    account.byUserIds.mockImplementationOnce(() => new Promise((resolve) => { answer = resolve; }));
    const read = account.data.refresh({ collection: 'members', method: 'byUserIds', params: { user_ids: ['101'] } });
    await vi.waitFor(() => expect(answer).toBeTypeOf('function'));
    factor = Infinity;
    answer([{ id: '1', user_id: 101 }]);
    await expect(read).resolves.toMatchObject({ state: 'stale' });
    expect(await account.data.read('members')).toEqual([]);
  });
});
