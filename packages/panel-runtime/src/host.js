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

/**
 * @param {object} [opts]
 * @param {function} [opts.onEvent] budget/telemetry hook
 * @param {function} [opts.installComponentRuntime] host-supplied installer run
 *   on every surface `createApp` — installs Framework7Vue + registerComponents
 *   + provides `$f7`/store so a component-path tile's `f7-*` globals resolve.
 *   panel-runtime stays framework7-agnostic (layering): the app/core supplies
 *   this; without it, only the plain-DOM `render` path works.
 */
export function createPanelHost({ onEvent, installComponentRuntime } = {}) {
  const registrations = new Map(); // mpId -> Map<panelId, def>
  const declarations = new Map();  // mpId -> manifest.panels declaration
  // Keyed by the host ELEMENT, not the surface name: one MP surface (e.g.
  // `full_page`) can be mounted into MORE THAN ONE element at once — the
  // canonical master-detail routes mount the same MP's `full_page` panel into
  // both the master page (`/calendar/`) and the detail page (`/calendar/overview/`)
  // simultaneously. Keying by surface would tear the first down when the second
  // mounts (blanking the master pane).
  const mounted = new Map();       // el -> { app, el, surface }

  return {
    /**
     * The PanelsApi for one MP instance — injected as `tommy.panels`.
     * register() only accepts ids the manifest DECLARES (contract-first).
     */
    panelsApiFor(mpId, manifestPanelsRaw = {}, { firstParty = false } = {}) {
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
          // component XOR render — a panel is authored EITHER as a Vue/F7
          // component (light DOM, shared runtime) OR as a plain-DOM render(root)
          // (shadow-isolated). Exactly one; never both, never neither.
          const hasComponent = Boolean(def.component);
          const hasRender = typeof def.render === 'function';
          if (hasComponent === hasRender) {
            throw new Error(`tommy.panels.register: panel '${def.id}' must provide exactly one of 'component' or 'render'`);
          }
          // The `component` path mounts in LIGHT DOM sharing the host runtime
          // (drops shadow isolation), so it is FIRST-PARTY ONLY until the M4
          // untrusted-review pipeline exists. Untrusted MPs stay on the
          // shadow-isolated `render` path.
          if (hasComponent && !firstParty) {
            throw new Error(`tommy.panels.register: panel '${def.id}' — the 'component' path is first-party only (untrusted MPs must use 'render')`);
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
     * `opts.panelId` scopes further to a SINGLE panel (a per-panel canonical
     * route, e.g. the Partner MP's `/dashboard/partner/` mounting only
     * `partner-dashboard`); omit it to render every panel of the surface. Both
     * are purely additive — absent → the prior "render all" behaviour.
     */
    layoutFor(surface, viewerRoles, { mpId, panelId } = {}) {
      const out = [];
      for (const [id, manifestPanels] of declarations) {
        if (mpId && id !== mpId) continue;
        const defs = registrations.get(id) || new Map();
        const visible = layoutFor(manifestPanels, surface, viewerRoles)
          .filter((pid) => defs.has(pid))
          .filter((pid) => !panelId || pid === panelId)
          .map((pid) => defs.get(pid));
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
    mountSurface(el, { surface, viewerRoles = [], ctxFor, mpId, panelId }) {
      // Idempotent per element: re-mounting into the same element replaces its
      // app (never touches another element hosting the same surface name).
      this.unmountSurface(el);
      const groups = this.layoutFor(surface, viewerRoles, { mpId, panelId });
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
      // Install the host F7 runtime (Framework7Vue + registerComponents + $f7)
      // onto the surface app so component-path tiles resolve `f7-*` globals.
      // Contained: a broken installer must not take down the whole surface.
      if (installComponentRuntime) {
        try { installComponentRuntime(app); } catch (e) { if (onEvent) onEvent({ type: 'surface-runtime-install-failed', surface, message: String(e && e.message), at: Date.now() }); }
      }
      app.mount(el);
      mounted.set(el, { app, el, surface });
      return { panelCount: tiles.length };
    },

    /** Whether THIS host already has an app mounted into `el` (the loader uses
     *  this to skip re-mounting a surface it painted incrementally during boot). */
    isSurfaceMounted(el) {
      return mounted.has(el);
    },

    /** Unmount the app hosted in `el` (the host element the surface mounted into). */
    unmountSurface(el) {
      const entry = mounted.get(el);
      if (entry) {
        entry.app.unmount();
        mounted.delete(el);
      }
    },

    /** Full teardown (team switch at M1 = teardown-and-cold-boot). */
    teardownMp(mpId) {
      registrations.delete(mpId);
      declarations.delete(mpId);
    },
  };
}
