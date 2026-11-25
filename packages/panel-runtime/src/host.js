import { createApp, h, shallowReactive } from 'vue';
import { PanelTile } from './panel-tile.js';
import { isStaleWorldRefusal } from './stale-world.js';
import { layoutFor, normalizePanels } from './layout.js';

export const SURFACE_PANEL_BUDGET = 24;
export const SURFACE_MP_BUDGET = 12;

const defGenerations = new WeakMap();
let defGeneration = 0;
function generationOf(def) {
  if (!def || typeof def !== 'object') return 0;
  if (!defGenerations.has(def)) defGenerations.set(def, (defGeneration += 1));
  return defGenerations.get(def);
}

// Vue runs Options-API data() outside its error wrapping, so a stale-world throw surfaces as the tile's own error.
function quietStaleTileErrors(app) {
  const hostHandler = app.config.errorHandler;
  app.config.errorHandler = (err, instance, info) => {
    if (isStaleWorldRefusal(err)) {
      for (let c = instance && instance.$ ? instance.$ : instance; c; c = c.parent) {
        if (c.type === PanelTile) return;
      }
    }
    if (hostHandler) { hostHandler(err, instance, info); return; }
    // eslint-disable-next-line no-console
    console.error(err);
  };
}

export function createPanelHost({ onEvent, installComponentRuntime } = {}) {
  const registrations = new Map();
  const declarations = new Map();
  const mounted = new Map();

  return {
    panelsApiFor(mpId, manifestPanelsRaw = {}, { firstParty = false, onEmbed } = {}) {
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
          const hasComponent = Boolean(def.component);
          const hasRender = typeof def.render === 'function';
          if (hasComponent === hasRender) {
            throw new Error(`tommy.panels.register: panel '${def.id}' must provide exactly one of 'component' or 'render'`);
          }
          if (hasComponent && !firstParty) {
            throw new Error(`tommy.panels.register: panel '${def.id}' — the 'component' path is first-party only (untrusted MPs must use 'render')`);
          }
          defs.set(def.id, def);
        },
        async requestNavigation() {
          throw new Error('tommy.panels.requestNavigation: host navigation lands with the shell integration (M1 loader)');
        },
        async embed(opts = {}) {
          if (typeof onEmbed !== 'function') {
            throw new Error('tommy.panels.embed: the host has no embed integration');
          }
          return onEmbed({ ...opts, callerMpId: mpId });
        },
        reportSize(panelId, size) {
          if (onEvent) onEvent({ type: 'panel-size', panelId, size, at: Date.now() });
        },
      };
    },

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

    mountSurface(el, { surface, viewerRoles = [], ctxFor, mpId, panelId, layout, pack = null, onDispose, onPanelElement, onClose, closeLabel, labels = null }) {
      let tiles;
      if (Array.isArray(layout)) {
        const entries = layout.filter((entry) => entry && entry.instance);
        if (pack === 'flow') {
          entries
            .map((entry, index) => ({ entry, index }))
            .sort((a, b) => (
              ((a.entry.cell?.y ?? 0) - (b.entry.cell?.y ?? 0))
              || ((a.entry.cell?.x ?? 0) - (b.entry.cell?.x ?? 0))
              || (a.index - b.index)
            ))
            .forEach(({ entry }, position) => { entries[position] = entry; });
        }
        tiles = entries
          .map((entry) => {
            const defs = registrations.get(entry.instance.mpId);
            const def = (entry.decl && defs && defs.get(entry.instance.panelId)) || null;
            return { mpId: entry.instance.mpId, def, entry };
          });
      } else {
        const groups = this.layoutFor(surface, viewerRoles, { mpId, panelId });
        tiles = groups.flatMap(({ mpId, defs }) => defs.map((def) => ({ mpId, def })));
      }
      if (tiles.length > SURFACE_PANEL_BUDGET) {
        if (onEvent) onEvent({ type: 'surface-budget-exceeded', surface, count: tiles.length, at: Date.now() });
        tiles.length = SURFACE_PANEL_BUDGET;
      }
      const next = {
        surface, tiles, pack, ctxFor, onPanelElement, onClose, closeLabel, labels,
      };
      const current = mounted.get(el);
      if (current?.view) {
        const replacedDispose = current.onDispose;
        Object.assign(current.view, next);
        current.surface = surface;
        current.onDispose = onDispose;
        if (replacedDispose && replacedDispose !== onDispose) {
          try { replacedDispose(); } catch (_) { /* host cleanup isolation */ }
        }
        return { panelCount: tiles.length, patched: true };
      }
      this.unmountSurface(el);
      const view = shallowReactive(next);
      const app = createApp({
        name: 'MpPanelSurface',
        render: () => h('div', { class: 'mp-panel-grid', 'data-mp-surface': view.surface },
          view.tiles.map(({ mpId, def, entry }) => {
            const {
              surface: shownSurface, pack: shownPack, ctxFor: contextFor, onPanelElement: onElement, onClose: close, closeLabel: closeText, labels: tileLabels,
            } = view;
            // Explicit start lines: `span` alone would let the grid autoplace and lose the composed x/y.
            const cell = entry && entry.cell;
            let style;
            if (cell) {
              style = shownPack === 'flow'
                ? { gridColumn: `span ${cell.w}` }
                : { gridColumn: `${cell.x + 1} / span ${cell.w}`, gridRow: `${cell.y + 1} / span ${cell.h}` };
            }
            if (entry && !def) {
              return h('div', {
                key: entry.instance.id,
                class: 'mp-panel-unavailable',
                'data-panel-id': entry.instance.panelId,
                'data-mp-id': entry.instance.mpId,
                style,
              });
            }
            return h(PanelTile, {
              ref: (instance) => onElement?.(mpId, def, entry, instance?.$el || null),
              key: `${entry ? entry.instance.id : `${mpId}:${def.id}`}#${generationOf(def)}`,
              style,
              'data-instance-id': entry ? entry.instance.id : undefined,
              def,
              ctx: contextFor
                ? (entry ? contextFor(mpId, def, entry) : contextFor(mpId, def))
                : { panelId: def.id, surface: shownSurface, surfaceContext: { surface: shownSurface }, config: (entry && entry.instance.config) || {}, online: true },
              onEvent,
              onClose: close,
              closeLabel: closeText,
              labels: tileLabels,
            });
          })),
      });
      // Contained: a broken installer must not take down the whole surface.
      if (installComponentRuntime) {
        try { installComponentRuntime(app); } catch (e) { if (onEvent) onEvent({ type: 'surface-runtime-install-failed', surface, message: String(e && e.message), at: Date.now() }); }
      }
      quietStaleTileErrors(app);
      try { app.mount(el); } catch (error) {
        try { onDispose?.(); } finally { app.unmount(); }
        throw error;
      }
      mounted.set(el, {
        app, el, surface, view, onDispose,
      });
      return { panelCount: tiles.length, patched: false };
    },

    panelDeclaration(mpId, panelId) {
      return (declarations.get(mpId) || {})[panelId] || null;
    },

    isSurfaceMounted(el) {
      return mounted.has(el);
    },

    unmountSurface(el) {
      const entry = mounted.get(el);
      if (!entry) return;
      mounted.delete(el);
      try { entry.onDispose?.(); } catch (_) { /* host cleanup isolation */ }
      try {
        entry.app.unmount();
      } catch (error) {
        // A tree left broken by a throwing update cannot unmount; clear it so the next mount starts fresh.
        el._vnode = null;
        delete el.__vue_app__;
        el.replaceChildren();
        if (onEvent) onEvent({ type: 'surface-unmount-failed', surface: entry.surface, message: String(error && error.message), at: Date.now() });
      }
    },

    teardownMp(mpId) {
      registrations.delete(mpId);
      declarations.delete(mpId);
    },
  };
}
