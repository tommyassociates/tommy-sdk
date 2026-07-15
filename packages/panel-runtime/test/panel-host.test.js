/**
 * panel-host.test.js (ac1) — grid mounting, skeleton -> progressive reveal,
 * a THROWING panel contained to its tile (siblings alive), retry + the
 * 3-failure "Reload add-on" escalation, load timeout, rbac layout, budget
 * hooks, and contract-first registration.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPanelHost, layoutFor, LOAD_TIMEOUT_MS } from '../src/index.js';

const flush = () => new Promise((resolve) => { setTimeout(resolve, 0); });

const manifestPanels = {
  'whos-clocked-in': { surfaces: ['dashboard'], rbac: { roles: ['Team Admin'] } },
  'my-week': { surfaces: ['dashboard'] },
  'member-history': { surfaces: ['team_member_details'] },
};

function healthyDef(id, body = 'hello') {
  return {
    id,
    load: vi.fn(async () => {}),
    render: vi.fn((root) => { const el = document.createElement('p'); el.textContent = body; root.append(el); }),
    unmount: vi.fn(),
  };
}

function throwingDef(id) {
  return {
    id,
    load: vi.fn(async () => { throw new Error('panel exploded'); }),
    render: vi.fn(),
  };
}

describe('panel host', () => {
  let host; let el; let events;

  beforeEach(() => {
    events = [];
    host = createPanelHost({ onEvent: (e) => events.push(e) });
    el = document.createElement('div');
    document.body.append(el);
  });
  afterEach(() => { document.body.replaceChildren(); });

  it('mounts declared panels into the host grid with progressive reveal', async () => {
    const api = host.panelsApiFor('time-clock', manifestPanels);
    api.register(healthyDef('whos-clocked-in'));
    api.register(healthyDef('my-week'));

    host.mountSurface(el, { surface: 'dashboard', viewerRoles: ['Team Admin'] });
    // Skeleton paints synchronously, before any load resolves.
    expect(el.querySelectorAll('.mp-panel-tile--loading')).toHaveLength(2);
    await flush();
    expect(el.querySelectorAll('.mp-panel-tile--ready')).toHaveLength(2);
    expect(events.filter((e) => e.type === 'panel-ready')).toHaveLength(2);
  });

  it('CONTAINS a throwing panel to its tile — siblings keep running', async () => {
    const api = host.panelsApiFor('time-clock', manifestPanels);
    api.register(throwingDef('whos-clocked-in'));
    api.register(healthyDef('my-week', 'alive'));

    host.mountSurface(el, { surface: 'dashboard', viewerRoles: ['Team Admin'] });
    await flush();

    const broken = el.querySelector('[data-panel-id="whos-clocked-in"]');
    const healthy = el.querySelector('[data-panel-id="my-week"]');
    expect(broken.className).toContain('mp-panel-tile--error');
    expect(broken.textContent).toContain("This panel couldn't load.");
    expect(healthy.className).toContain('mp-panel-tile--ready');
  });

  it('Retry re-runs load; 3 consecutive failures escalate to "Reload add-on"', async () => {
    const api = host.panelsApiFor('time-clock', manifestPanels);
    const def = throwingDef('my-week');
    api.register(def);
    host.mountSurface(el, { surface: 'dashboard' });
    await flush();
    expect(def.load).toHaveBeenCalledTimes(1);

    el.querySelector('.mp-panel-tile__retry').click();
    await flush();
    expect(def.load).toHaveBeenCalledTimes(2);

    el.querySelector('.mp-panel-tile__retry').click();
    await flush();
    expect(def.load).toHaveBeenCalledTimes(3);
    const tile = el.querySelector('[data-panel-id="my-week"]');
    expect(tile.className).toContain('mp-panel-tile--reload_addon');
    expect(tile.textContent).toContain('Reload add-on');
    expect(events.some((e) => e.type === 'panel-reload-required')).toBe(true);
  });

  it(`a load stuck past ${LOAD_TIMEOUT_MS}ms is a contained timeout failure`, async () => {
    vi.useFakeTimers();
    const api = host.panelsApiFor('time-clock', manifestPanels);
    api.register({ id: 'my-week', load: () => new Promise(() => {}), render: vi.fn() });
    host.mountSurface(el, { surface: 'dashboard' });
    await vi.advanceTimersByTimeAsync(LOAD_TIMEOUT_MS + 10);
    vi.useRealTimers();
    await flush();
    expect(el.querySelector('[data-panel-id="my-week"]').className).toContain('mp-panel-tile--error');
    expect(events.some((e) => e.type === 'panel-error' && /exceeded/.test(e.message))).toBe(true);
  });

  it('layoutFor filters by surface and manifest rbac.roles', () => {
    expect(layoutFor(manifestPanels, 'dashboard', ['Team Admin'])).toEqual(['whos-clocked-in', 'my-week']);
    expect(layoutFor(manifestPanels, 'dashboard', ['Team Member'])).toEqual(['my-week']);
    expect(layoutFor(manifestPanels, 'team_member_details', [])).toEqual(['member-history']);
  });

  it('register is contract-first: undeclared panel ids are refused', () => {
    const api = host.panelsApiFor('time-clock', manifestPanels);
    expect(() => api.register(healthyDef('not-declared'))).toThrow(/not declared in the manifest/);
  });

  it('mpId scopes a surface to a single MP (per-MP surface host); absent = all MPs', async () => {
    const tc = host.panelsApiFor('time-clock', { 'tc-main': { surfaces: ['full_page'] } });
    tc.register(healthyDef('tc-main', 'time clock'));
    const sched = host.panelsApiFor('scheduling', { 'sch-main': { surfaces: ['full_page'] } });
    sched.register(healthyDef('sch-main', 'scheduling'));

    // Scoped: only the Time Clock panel mounts.
    const scoped = host.mountSurface(el, { surface: 'full_page', mpId: 'time-clock' });
    await flush();
    expect(scoped.panelCount).toBe(1);
    expect(el.querySelector('[data-panel-id="tc-main"]')).toBeTruthy();
    expect(el.querySelector('[data-panel-id="sch-main"]')).toBeFalsy();
    host.unmountSurface('full_page');

    // Unscoped: every MP's full_page panel mounts (regression).
    const all = host.mountSurface(el, { surface: 'full_page' });
    await flush();
    expect(all.panelCount).toBe(2);
    expect(el.querySelector('[data-panel-id="tc-main"]')).toBeTruthy();
    expect(el.querySelector('[data-panel-id="sch-main"]')).toBeTruthy();
  });

  it('host.layoutFor({ mpId }) groups only the scoped MP', () => {
    host.panelsApiFor('time-clock', { 'tc-main': { surfaces: ['full_page'] } }).register(healthyDef('tc-main'));
    host.panelsApiFor('scheduling', { 'sch-main': { surfaces: ['full_page'] } }).register(healthyDef('sch-main'));
    const groups = host.layoutFor('full_page', [], { mpId: 'time-clock' });
    expect(groups.map((g) => g.mpId)).toEqual(['time-clock']);
  });

  it('unmountSurface calls panel unmount hooks (teardown-and-cold-boot at M1)', async () => {
    const api = host.panelsApiFor('time-clock', manifestPanels);
    const def = healthyDef('my-week');
    api.register(def);
    host.mountSurface(el, { surface: 'dashboard' });
    await flush();
    host.unmountSurface('dashboard');
    expect(def.unmount).toHaveBeenCalled();
  });
});
