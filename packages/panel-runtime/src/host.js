/**
 * host.js — the host grid: collects MP panel registrations (the PanelsApi the
 * loader injects into each MP's SDK) and mounts them into host-owned surface
 * elements with skeleton + per-panel containment (panel-runtime.md §2).
 *
 * MP panels NEVER enter the legacy `panelDefs` / `panels.top|left|right`
 * arrays (harden round-1: the core filter strips unknown names and edit-mode
 * persists those arrays into the `dashboard_layout` team setting) — the host
 * renders a PARALLEL, flag-gated grid section of its own.
 */
import { createApp, h } from 'vue';
import { PanelTile } from './panel-tile.js';
import { layoutFor, normalizePanels } from './layout.js';

/** Advisory surface budget (harden round-1 default — tunable, never hit at M1). */
export const SURFACE_PANEL_BUDGET = 24;
export const SURFACE_MP_BUDGET = 12;

export function createPanelHost({ onEvent } = {}) {
  const registrations = new Map(); // mpId -> Map<panelId, def>
  const declarations = new Map();  // mpId -> manifest.panels declaration
  const mounted = new Map();       // surfaceKey -> { app, el }

  return {
    /**
     * The PanelsApi for one MP instance — injected as `tommy.panels`.
     * register() only accepts ids the manifest DECLARES (contract-first).
     */
    panelsApiFor(mpId, manifestPanelsRaw = {}) {
      const manifestPanels = Object.fromEntries(normalizePanels(manifestPanelsRaw));
      declarations.set(mpId, manifestPanels);
      const defs = registrations.get(mpId) || new Map();
      registrations.set(mpId, defs);
      return {
        register(def) {
          if (!def || !def.id) throw new Error('tommy.panels.register: def.id required');
          if (!manifestPanels[def.id]) {
            throw new Error(`tommy.panels.register: panel '${def.id}' is not declared in the manifest`);
          }
          defs.set(def.id, def);
        },
        async requestNavigation() {
          throw new Error('tommy.panels.requestNavigation: host navigation lands with the shell integration (M1 loader)');
        },
        reportSize(panelId, size) {
          if (onEvent) onEvent({ type: 'panel-size', panelId, size, at: Date.now() });
        },
      };
    },

    /**
     * Panels visible on a surface for the current viewer, grouped by MP.
     * `opts.mpId` scopes the result to a single MP (a per-MP surface host,
     * e.g. the Time Clock full-page page); omit it to render every MP.
     */
    layoutFor(surface, viewerRoles, { mpId } = {}) {
      const out = [];
      for (const [id, manifestPanels] of declarations) {
        if (mpId && id !== mpId) continue;
        const defs = registrations.get(id) || new Map();
        const visible = layoutFor(manifestPanels, surface, viewerRoles)
          .filter((panelId) => defs.has(panelId))
          .map((panelId) => defs.get(panelId));
        if (visible.length) out.push({ mpId: id, defs: visible });
      }
      return out;
    },

    /**
     * Mount every visible panel for `surface` into the host element.
     * The skeleton paints with the grid; each tile reveals progressively.
     * `mpId` scopes the mount to a single MP (filtered BEFORE the panel
     * budget, so a scoped surface is never truncated by another MP).
     */
    mountSurface(el, { surface, viewerRoles = [], ctxFor, mpId }) {
      this.unmountSurface(surface);
      const groups = this.layoutFor(surface, viewerRoles, { mpId });
      const tiles = groups.flatMap(({ mpId, defs }) => defs.map((def) => ({ mpId, def })));
      if (tiles.length > SURFACE_PANEL_BUDGET) {
        // Advisory budget: log through the hook, render the budgeted slice.
        if (onEvent) onEvent({ type: 'surface-budget-exceeded', surface, count: tiles.length, at: Date.now() });
        tiles.length = SURFACE_PANEL_BUDGET;
      }
      const app = createApp({
        name: 'MpPanelSurface',
        render: () => h('div', { class: 'mp-panel-grid', 'data-mp-surface': surface },
          tiles.map(({ mpId, def }) => h(PanelTile, {
            key: `${mpId}:${def.id}`,
            def,
            ctx: ctxFor ? ctxFor(mpId, def) : { panelId: def.id, surface, surfaceContext: { surface }, config: {}, online: true },
            onEvent,
          }))),
      });
      app.mount(el);
      mounted.set(surface, { app, el });
      return { panelCount: tiles.length };
    },

    unmountSurface(surface) {
      const entry = mounted.get(surface);
      if (entry) {
        entry.app.unmount();
        mounted.delete(surface);
      }
    },

    /** Full teardown (team switch at M1 = teardown-and-cold-boot). */
    teardownMp(mpId) {
      registrations.delete(mpId);
      declarations.delete(mpId);
    },
  };
}
