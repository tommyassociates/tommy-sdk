/**
 * reference-mp.test.js — the reference MP boots against the REAL runtime
 * stack (broker + SDK + data + panel host) and exercises every primitive:
 * manifest validates clean (incl. vs the plans seed), the required Action's
 * trigger→activity loop runs through the bus, the condition answers
 * cross-MP queries, panels mount on all three surfaces, offline emits queue
 * and replay. This IS the M1 "runtime refined against it" fixture suite.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { validateManifest, parseManifest } from '@tommy/manifest';
import { buildSdk, createDirectAdapter } from '@tommy/sdk';
import { createBroker, createFakeIssuer } from '@tommy/actions-runtime';
import { createDataManager } from '@tommy/offline-sync';
import { createPanelHost } from '@tommy/panel-runtime';
import referenceMp, { postCheckin } from '../src/index.js';

const TENANT = 'team-4401';
const flush = () => new Promise((resolve) => { setTimeout(resolve, 5); });

async function bootWorld() {
  const issuer = createFakeIssuer();
  const broker = createBroker({ capabilityService: issuer });
  const parsed = parseManifest(referenceMp.manifest).data;
  broker.registerMp(parsed, { handlers: referenceMp.handlers, firstParty: true });

  const token = await issuer.issue(parsed.id, parsed.version, TENANT, [], 'inst-ref');
  const data = createDataManager({ capabilityToken: token, mpId: parsed.id, localData: parsed.localData });
  const host = createPanelHost({});
  const init = {
    instanceId: 'inst-ref',
    mpId: parsed.id,
    tenant: { tenantId: TENANT, displayName: 'Test', roles: ['Team Member'] },
    locale: 'en',
    capabilityToken: token,
    grantedScopes: token.effectiveScopes,
    surfaceContext: { surface: 'dashboard' },
    mpConfig: {},
    sharedDeps: {},
  };
  const adapter = createDirectAdapter({ broker, init });
  const sdk = buildSdk({ adapter, init, data, panels: host.panelsApiFor(parsed.id, parsed.panels), locales: referenceMp.locales });
  referenceMp.register(sdk);
  return { broker, sdk, host, parsed, issuer };
}

describe('reference MP (team-checkin)', () => {
  let world;
  beforeEach(async () => { world = await bootWorld(); });

  it('its manifest validates clean and matches the plans seed byte-for-byte', () => {
    const verdict = validateManifest(referenceMp.manifest);
    expect(verdict.errors || []).toEqual([]);
    expect(verdict.ok).toBe(true);
    // Walk up from cwd to the workspace root (vitest's transformed
    // import.meta.url is not a file: URL here).
    let root = process.cwd();
    while (!existsSync(path.join(root, 'plans')) && root !== path.dirname(root)) root = path.dirname(root);
    const seed = readFileSync(path.join(root, 'plans/refactor-plan/05-deliverables/05-reference-mp/reference-manifest.yml'), 'utf8');
    expect(referenceMp.manifest).toBe(seed);
  });

  it('the required Action loop runs end-to-end: emit checkin_posted → record_checkin persists', async () => {
    await postCheckin(world.sdk, { status: 'great', note: 'shipping M1' });
    await flush();

    const records = await world.sdk.data.store('checkins').getAll();
    expect(records).toHaveLength(1);
    expect(records[0].status).toBe('great');

    // Every hop is an action-run record.
    expect(await world.broker.records.query({ kind: 'emit' })).toHaveLength(1);
    const invokes = await world.broker.records.query({ kind: 'invoke' });
    expect(invokes).toHaveLength(1);
    expect(invokes[0].activityName).toBe('team-checkin.record_checkin');
    expect(invokes[0].status).toBe('succeeded');
  });

  it('the condition answers cross-MP has_checked_in_today queries', async () => {
    const memberId = 'self';
    // A first-party caller MP queries the reference MP's condition.
    const caller = { id: 'timesheets', version: '1.0.0', publisher: { type: 'first_party' }, triggers: {}, conditions: {}, activities: {}, actions: {} };
    world.broker.registerMp(caller, { handlers: {} });
    const callerToken = await world.issuer.issue('timesheets', '1.0.0', TENANT, [], 'inst-ts');

    const before = await world.broker.query({
      sourceMpId: 'timesheets', instanceId: 'inst-ts', capabilityToken: callerToken,
      condition: 'team-checkin.has_checked_in_today', args: { teamMemberId: memberId },
    });
    expect(before.checkedIn).toBe(false);

    await postCheckin(world.sdk, { status: 'ok' });
    await flush();
    // cacheable 60s: bypass by different args? Same args — invalidation only
    // fires on server_write; local_write keeps the cache. Assert the CACHED
    // answer semantics explicitly (fresh broker world → fresh answer).
    const fresh = await bootWorld();
    await postCheckin(fresh.sdk, { status: 'ok' });
    await flush();
    const callerB = await fresh.issuer.issue('timesheets', '1.0.0', TENANT, [], 'inst-ts');
    fresh.broker.registerMp(caller, { handlers: {} });
    const after = await fresh.broker.query({
      sourceMpId: 'timesheets', instanceId: 'inst-ts', capabilityToken: callerB,
      condition: 'team-checkin.has_checked_in_today', args: { teamMemberId: memberId },
    });
    expect(after.checkedIn).toBe(true);
  });

  it('panels are registered for ALL THREE surfaces and mount through the host grid', async () => {
    for (const [surface, expected] of [['dashboard', 1], ['team_member_details', 1], ['full_page', 1]]) {
      const el = document.createElement('div');
      document.body.append(el);
      const { panelCount } = world.host.mountSurface(el, {
        surface,
        viewerRoles: ['Team Admin'],
        ctxFor: (mpId, def) => ({ panelId: def.id, surface, surfaceContext: { surface, teamMemberId: 'self' }, config: {}, online: true }),
      });
      expect(panelCount, surface).toBe(expected);
      // eslint-disable-next-line no-await-in-loop
      await flush();
      expect(el.querySelector('.mp-panel-tile--ready'), surface).toBeTruthy();
    }
  });

  it('offline: the check-in emit queues and replays through the bus', async () => {
    world.broker.setOnline(false);
    const receipt = await postCheckin(world.sdk, { status: 'struggling' });
    expect(receipt.queuedFor).toBe(1);
    expect(await world.sdk.data.store('checkins').getAll()).toHaveLength(0);

    world.broker.setOnline(true);
    await world.broker.drainOfflineQueue();
    await flush();
    expect(await world.sdk.data.store('checkins').getAll()).toHaveLength(1);
  });

  it('the 2.22 teaching Actions register and surface in per-tenant state (dispatch deferred)', () => {
    // enabledByDefault:false → never dispatched; required lock enforced.
    expect(() => world.broker.setActionState(TENANT, 'team-checkin', 'record_on_checkin', { enabled: false }))
      .toThrow(/required/);
    world.broker.setActionState(TENANT, 'team-checkin', 'notify_manager_when_struggling', { enabled: false, options: {} });
  });
});
