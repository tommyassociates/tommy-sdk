/**
 * composed-layout.test.js (scope 01c) — resolveComposedLayout (the join of a
 * `dashboards`-Setting tab's panels[] against manifest declarations: ordering,
 * size clamping, surface eligibility, rbac, audience AND/OR, unknown-decl
 * KEPT, malformed SKIPPED) and mountSurface's composed mode (layout order is
 * tile order, grid placement styles, unavailable tiles, budget event, the
 * ctxFor third argument, declaration mode untouched when layout is absent).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPanelHost, resolveComposedLayout, SURFACE_PANEL_BUDGET } from '../src/index.js';

const flush = () => new Promise((resolve) => { setTimeout(resolve, 0); });

// Manifest `panels` blocks keyed by mpId — the contract-shape fixture.
const panelsByMp = {
  'time-clock': {
    'whos-clocked-in': { surfaces: ['dashboard'], rbac: { roles: ['Team Admin'] }, size: { defaultW: 6, defaultH: 2, minW: 4, maxW: 8, minH: 2, maxH: 4 } },
    'my-week': { surfaces: ['dashboard'] },
    'member-history': { surfaces: ['team_member_details'] },
  },
  documents: {
    'doc-inbox': { surfaces: ['dashboard'], rbac: { roles: [] } },
  },
};

let seq = 0;
function place(mpId, panelId, geo = {}, extra = {}) {
  seq += 1;
  return { id: `uuid-${seq}`, mpId, panelId, x: 0, y: 0, w: 6, h: 2, ...geo, ...extra };
}

describe('resolveComposedLayout', () => {
  it('joins instances to their declarations, in stored order, with PanelCell geometry', () => {
    const composed = [
      place('time-clock', 'my-week', { x: 6, y: 0, w: 6, h: 2 }),
      place('documents', 'doc-inbox', { x: 0, y: 0, w: 6, h: 3 }),
    ];
    const out = resolveComposedLayout(composed, 'dashboard', { panelsByMp, viewer: {} });
    expect(out.map((e) => e.instance.panelId)).toEqual(['my-week', 'doc-inbox']);
    expect(out[0].decl).toBe(panelsByMp['time-clock']['my-week']);
    expect(out[1].cell).toEqual({ panelId: 'doc-inbox', x: 0, y: 0, w: 6, h: 3 });
  });

  it('clamps w/h into the declaration size envelope — clamp, never reject', () => {
    const composed = [
      place('time-clock', 'whos-clocked-in', { w: 2, h: 1 }),   // below minW/minH
      place('time-clock', 'whos-clocked-in', { w: 12, h: 9 }),  // above maxW/maxH
    ];
    const out = resolveComposedLayout(composed, 'dashboard', { panelsByMp, viewer: { roles: ['Team Admin'] } });
    expect(out.map((e) => [e.cell.w, e.cell.h])).toEqual([[4, 2], [8, 4]]);
  });

  it('clamps w to the 12-column contract bound when the declaration has no size', () => {
    const out = resolveComposedLayout([place('time-clock', 'my-week', { w: 99, h: 2 })], 'dashboard', { panelsByMp });
    expect(out[0].cell.w).toBe(12);
  });

  it('drops instances whose declaration is not eligible on this surface', () => {
    const composed = [place('time-clock', 'member-history'), place('time-clock', 'my-week')];
    const out = resolveComposedLayout(composed, 'dashboard', { panelsByMp });
    expect(out.map((e) => e.instance.panelId)).toEqual(['my-week']);
  });

  it('filters by manifest rbac.roles; absent/EMPTY roles = visible to all', () => {
    const composed = [place('time-clock', 'whos-clocked-in'), place('documents', 'doc-inbox')];
    const admin = resolveComposedLayout(composed, 'dashboard', { panelsByMp, viewer: { roles: ['Team Admin'] } });
    expect(admin.map((e) => e.instance.panelId)).toEqual(['whos-clocked-in', 'doc-inbox']);
    const member = resolveComposedLayout(composed, 'dashboard', { panelsByMp, viewer: { roles: ['Team Member'] } });
    // rbac drops whos-clocked-in; doc-inbox's EMPTY roles array means everyone.
    expect(member.map((e) => e.instance.panelId)).toEqual(['doc-inbox']);
  });

  it('audience: AND across present contexts, OR within a list, members may match userId', () => {
    const targeted = (audience) => [place('time-clock', 'my-week', {}, { visibility: { audience } })];
    const resolve = (audience, viewer) => resolveComposedLayout(targeted(audience), 'dashboard', { panelsByMp, viewer });

    // AND across contexts: matching only one of two present lists is not enough.
    expect(resolve({ roles: ['tag-r1'], locations: ['tag-l1'] }, { tagIds: ['tag-r1'] })).toHaveLength(0);
    expect(resolve({ roles: ['tag-r1'], locations: ['tag-l1'] }, { tagIds: ['tag-r1', 'tag-l1'] })).toHaveLength(1);
    // OR within a list.
    expect(resolve({ roles: ['tag-r1', 'tag-r2'] }, { tagIds: ['tag-r2'] })).toHaveLength(1);
    // members matches by userId as well as by tag.
    expect(resolve({ members: ['user-9'] }, { tagIds: [], userId: 'user-9' })).toHaveLength(1);
    expect(resolve({ members: ['user-9'] }, { tagIds: [], userId: 'user-1' })).toHaveLength(0);
    // Absent/empty audience lists = everyone.
    expect(resolve({ roles: [] }, { tagIds: [] })).toHaveLength(1);
    expect(resolve(undefined, { tagIds: [] })).toHaveLength(1);
  });

  it('KEEPS unknown-decl instances with decl:null — never dropped, cell preserved', () => {
    const composed = [
      place('uninstalled-mp', 'gone-panel', { x: 3, y: 1, w: 4, h: 2 }),
      // Contract: with no decl, rules (a)-(c) do not evaluate — even a
      // non-matching audience does not drop the placement.
      place('uninstalled-mp', 'gone-panel', {}, { visibility: { audience: { roles: ['tag-nobody-has'] } } }),
    ];
    const out = resolveComposedLayout(composed, 'dashboard', { panelsByMp, viewer: { tagIds: [] } });
    expect(out).toHaveLength(2);
    expect(out[0].decl).toBeNull();
    expect(out[0].cell).toEqual({ panelId: 'gone-panel', x: 3, y: 1, w: 4, h: 2 });
  });

  it('skips malformed instances without throwing; non-array input resolves empty', () => {
    const composed = [
      null,
      'not-an-object',
      { id: 'u1', mpId: 'time-clock' },                                  // no panelId
      place('time-clock', 'my-week', { w: 'wide' }),                     // non-numeric geometry
      place('time-clock', 'my-week'),                                    // the one healthy row
    ];
    const out = resolveComposedLayout(composed, 'dashboard', { panelsByMp });
    expect(out).toHaveLength(1);
    expect(out[0].instance.panelId).toBe('my-week');
    expect(resolveComposedLayout(undefined, 'dashboard', { panelsByMp })).toEqual([]);
  });
});

describe('mountSurface composed mode (opts.layout)', () => {
  let host; let el; let events;

  function healthyDef(id, body = 'hello') {
    return {
      id,
      load: vi.fn(async () => {}),
      render: vi.fn((root) => { const p = document.createElement('p'); p.textContent = body; root.append(p); }),
    };
  }

  beforeEach(() => {
    events = [];
    host = createPanelHost({ onEvent: (e) => events.push(e) });
    el = document.createElement('div');
    document.body.append(el);
  });
  afterEach(() => { document.body.replaceChildren(); });

  it('tiles follow layout order exactly, with inline grid placement from the cell', async () => {
    const api = host.panelsApiFor('time-clock', panelsByMp['time-clock']);
    api.register(healthyDef('whos-clocked-in'));
    api.register(healthyDef('my-week'));
    // Layout order deliberately reverses registration order.
    const layout = resolveComposedLayout([
      place('time-clock', 'my-week', { x: 6, y: 0, w: 6, h: 2 }),
      place('time-clock', 'whos-clocked-in', { x: 0, y: 0, w: 6, h: 2 }),
    ], 'dashboard', { panelsByMp, viewer: { roles: ['Team Admin'] } });

    host.mountSurface(el, { surface: 'dashboard', layout });
    await flush();

    const tiles = [...el.querySelectorAll('.mp-panel-tile')];
    expect(tiles.map((t) => t.dataset.panelId)).toEqual(['my-week', 'whos-clocked-in']);
    expect(tiles[0].style.gridColumn).toBe('7 / span 6');
    expect(tiles[0].style.gridRow).toBe('1 / span 2');
    expect(tiles[1].style.gridColumn).toBe('1 / span 6');
    expect(tiles.every((t) => t.className.includes('mp-panel-tile--ready'))).toBe(true);
  });

  it('renders unavailable tiles (decl:null AND registered-nowhere) outside PanelTile — no load, no skeleton', async () => {
    const api = host.panelsApiFor('time-clock', panelsByMp['time-clock']);
    const registered = healthyDef('my-week');
    api.register(registered);
    // 'whos-clocked-in' is DECLARED but never registered; 'gone-panel' has no decl at all.
    const layout = resolveComposedLayout([
      place('time-clock', 'my-week'),
      place('time-clock', 'whos-clocked-in', { x: 0, y: 2 }),
      place('uninstalled-mp', 'gone-panel', { x: 6, y: 2, w: 4, h: 2 }),
    ], 'dashboard', { panelsByMp, viewer: { roles: ['Team Admin'] } });

    host.mountSurface(el, { surface: 'dashboard', layout });
    await flush();

    const unavailable = [...el.querySelectorAll('.mp-panel-unavailable')];
    expect(unavailable.map((t) => [t.dataset.mpId, t.dataset.panelId])).toEqual([
      ['time-clock', 'whos-clocked-in'],
      ['uninstalled-mp', 'gone-panel'],
    ]);
    // Placed in its cell, but never a PanelTile: no skeleton, no load lifecycle.
    expect(unavailable[1].style.gridColumn).toBe('7 / span 4');
    expect(unavailable.every((t) => !t.className.includes('mp-panel-tile'))).toBe(true);
    expect(el.querySelectorAll('.mp-panel-tile__skeleton')).toHaveLength(0);
    expect(el.querySelectorAll('.mp-panel-tile')).toHaveLength(1);
    expect(registered.load).toHaveBeenCalledTimes(1);
  });

  it('enforces SURFACE_PANEL_BUDGET on the layout path too — event + truncation', () => {
    const layout = Array.from({ length: SURFACE_PANEL_BUDGET + 1 }, (_, i) => ({
      instance: { id: `u${i}`, mpId: 'uninstalled-mp', panelId: `p${i}`, x: 0, y: i, w: 12, h: 1 },
      decl: null,
      cell: { panelId: `p${i}`, x: 0, y: i, w: 12, h: 1 },
    }));
    const { panelCount } = host.mountSurface(el, { surface: 'dashboard', layout });
    expect(panelCount).toBe(SURFACE_PANEL_BUDGET);
    expect(events.some((e) => e.type === 'surface-budget-exceeded' && e.count === SURFACE_PANEL_BUDGET + 1)).toBe(true);
    expect(el.querySelectorAll('.mp-panel-unavailable')).toHaveLength(SURFACE_PANEL_BUDGET);
  });

  it('hands ctxFor the full resolver entry as a THIRD argument in composed mode', async () => {
    const api = host.panelsApiFor('time-clock', panelsByMp['time-clock']);
    api.register(healthyDef('my-week'));
    const layout = resolveComposedLayout(
      [place('time-clock', 'my-week', {}, { config: { compact: true } })],
      'dashboard', { panelsByMp },
    );
    const ctxFor = vi.fn((_mp, def) => ({ panelId: def.id, surface: 'dashboard', online: true }));
    host.mountSurface(el, { surface: 'dashboard', layout, ctxFor });
    await flush();
    expect(ctxFor).toHaveBeenCalledTimes(1);
    const call = ctxFor.mock.calls[0];
    expect(call).toHaveLength(3);
    expect(call[0]).toBe('time-clock');
    expect(call[2]).toBe(layout[0]);
    expect(call[2].instance.config).toEqual({ compact: true });
  });

  it('declaration mode is untouched when layout is absent: two-arg ctxFor, no grid placement', async () => {
    const api = host.panelsApiFor('time-clock', panelsByMp['time-clock']);
    api.register(healthyDef('my-week'));
    const ctxFor = vi.fn((_mp, def) => ({ panelId: def.id, surface: 'dashboard', online: true }));
    host.mountSurface(el, { surface: 'dashboard', ctxFor });
    await flush();
    // Arity-sniffing hosts must see the same call shape as before 01c.
    expect(ctxFor.mock.calls[0]).toHaveLength(2);
    const tile = el.querySelector('.mp-panel-tile');
    expect(tile.className).toContain('mp-panel-tile--ready');
    expect(tile.style.gridColumn).toBe('');
    expect(el.querySelectorAll('.mp-panel-unavailable')).toHaveLength(0);
  });
});
