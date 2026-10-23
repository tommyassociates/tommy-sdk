import { describe, it, expect } from 'vitest';
import {
  createHostStoreChangeFeed, observeHostStorePort, retirementEvent, FRAGMENT_LABEL,
} from '../src/host-store/index.js';

const ORIGIN = 'https://api.example.test';
const VIEWER = JSON.stringify([ORIGIN, '31']);

async function retired(selector) {
  const feed = createHostStoreChangeFeed({ BroadcastChannelImpl: null });
  const heard = [];
  feed.subscribe((event) => heard.push(event));
  const observed = observeHostStorePort({ retirePrincipal: async () => ({ ok: true }) }, feed);
  await observed.retirePrincipal(selector);
  feed.close();
  // What the announcement says (the feed adds its own envelope fields).
  return heard.map(({ type, principal, label }) => ({ type, principal, ...(label === undefined ? {} : { label }) }));
}

describe('a principal retirement, as the change feed announces it', () => {
  it('announces one session\'s chat fragments as those fragments only', async () => {
    const selector = { authorityOrigin: ORIGIN, viewerId: '31', cacheSession: { id: '7', generation: 2 } };
    expect(await retired(selector)).toEqual([{ type: 'purge', principal: VIEWER, label: FRAGMENT_LABEL }]);
    expect(retirementEvent(selector)).toEqual({ type: 'purge', principal: VIEWER, label: FRAGMENT_LABEL });
  });

  it('announces a sign-out, and a client subject\'s namespace, as the whole viewer', async () => {
    expect(await retired({ authorityOrigin: ORIGIN, viewerId: '31' })).toEqual([{ type: 'purge', principal: VIEWER }]);
    expect(await retired({ authorityOrigin: ORIGIN, viewerId: '31', subjectKey: 'client:9' }))
      .toEqual([{ type: 'purge', principal: VIEWER }]);
  });
});
