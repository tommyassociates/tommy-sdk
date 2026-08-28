/**
 * layout.js — which declared panels are visible on a surface for a viewer.
 * Role filtering comes from the manifest `panels[].rbac.roles` (harden
 * round-1) — never from the legacy `visiblePanels` machinery.
 */
/** The manifest `panels` block is an array of {id,...}; maps also accepted. */
export function normalizePanels(manifestPanels) {
  if (Array.isArray(manifestPanels)) return manifestPanels.map((p) => [p.id, p]);
  return Object.entries(manifestPanels || {});
}

export function layoutFor(manifestPanels = {}, surface, viewerRoles = []) {
  return normalizePanels(manifestPanels)
    .filter(([, decl]) => {
      const surfaces = decl.surfaces || (decl.surface ? [decl.surface] : []);
      if (!surfaces.includes(surface)) return false;
      const roles = decl.rbac?.roles;
      if (Array.isArray(roles) && roles.length) {
        return roles.some((role) => viewerRoles.includes(role));
      }
      return true;
    })
    .map(([panelId]) => panelId);
}

/* Audience contexts the `dashboards` Setting may target (scope 01c). AND
 * across contexts, OR within a list — an unknown key in stored data is
 * IGNORED, not failed on: an old client must not hide a tab a newer admin
 * UI targeted by a context this build doesn't know. */
const AUDIENCE_CONTEXTS = ['roles', 'members', 'tags', 'locations', 'skills'];

/**
 * Audience entries are tag ids — the viewer carries their role/location/skill
 * tags flattened into `viewer.tagIds`. Only `members` may also hold a raw
 * userId. Absent/empty lists mean "everyone" (an admin clearing a picker must
 * not lock the tab to nobody).
 */
function matchesAudience(audience, viewer = {}) {
  if (!audience || typeof audience !== 'object') return true;
  const tagIds = Array.isArray(viewer.tagIds) ? viewer.tagIds : [];
  for (const context of AUDIENCE_CONTEXTS) {
    const list = audience[context];
    if (!Array.isArray(list) || !list.length) continue;
    const hit = list.some((entry) => tagIds.includes(entry)
      || (context === 'members' && entry != null && entry === viewer.userId));
    if (!hit) return false;
  }
  return true;
}

const clampInt = (n, min, max) => Math.min(max, Math.max(min, Math.trunc(n)));

/**
 * resolveComposedLayout — scope 01c: join one composed dashboard tab's
 * `panels[]` (PanelInstance[] from the `dashboards` team Setting) against the
 * installed MPs' manifest declarations and emit, in stored order, the tile
 * list the host mounts VERBATIM (`mountSurface` opts.layout).
 *
 * Distinct from `layoutFor` above: there the manifests decide what renders;
 * here the TEAM's stored composition is the source of truth — declarations
 * only validate surface eligibility, gate rbac, and clamp geometry.
 *
 * An instance whose declaration is unknown (MP uninstalled, or the panel id
 * gone from a newer manifest) is KEPT with `decl: null` — the eligibility/
 * rbac/audience rules need a declaration to evaluate, and a stored
 * composition must never silently lose a placement: the host renders an
 * unavailable tile in its cell instead.
 *
 * Pure and tolerant: stored Settings survive schema drift and hand-edits, so
 * malformed instances (no mpId/panelId, non-numeric geometry) are SKIPPED,
 * never thrown on — one bad row must not blank the whole tab.
 *
 * @param {Array} composed  PanelInstance[] of one tab, in layout order.
 * @param {string} surface  host surface the tab renders on.
 * @param {object} [opts]
 * @param {object} [opts.panelsByMp]  mpId -> manifest `panels` block (array or
 *   map — both accepted, same as `normalizePanels`).
 * @param {object} [opts.viewer]  { roles: [roleName], tagIds: [], userId } —
 *   `roles` are role NAMES (manifest rbac vocabulary); audience matching runs
 *   on `tagIds`/`userId`.
 * @returns {Array<{instance, decl, cell}>}  `cell` is the PanelCell the host
 *   places (w/h clamped to decl.size min/max when a decl exists).
 */
export function resolveComposedLayout(composed, surface, { panelsByMp = {}, viewer = {} } = {}) {
  if (!Array.isArray(composed)) return [];
  const declsByMp = new Map(); // lazy per-MP normalization: mpId -> Map<panelId, decl>
  const declFor = (mpId, panelId) => {
    if (!declsByMp.has(mpId)) {
      const raw = panelsByMp[mpId];
      declsByMp.set(mpId, raw == null ? null : new Map(normalizePanels(raw)));
    }
    const decls = declsByMp.get(mpId);
    return (decls && decls.get(panelId)) || null;
  };
  const viewerRoles = Array.isArray(viewer.roles) ? viewer.roles : [];
  const out = [];
  for (const instance of composed) {
    if (!instance || typeof instance !== 'object') continue;
    const { mpId, panelId } = instance;
    if (typeof mpId !== 'string' || !mpId || typeof panelId !== 'string' || !panelId) continue;
    if (![instance.x, instance.y, instance.w, instance.h].every(Number.isFinite)) continue;
    const decl = declFor(mpId, panelId);
    if (decl) {
      // (a) eligibility — `surfaces` means eligible-here, same reading as layoutFor.
      const surfaces = decl.surfaces || (decl.surface ? [decl.surface] : []);
      if (!surfaces.includes(surface)) continue;
      // (b) manifest rbac — absent/empty roles = visible to all (layoutFor's rule).
      const roles = decl.rbac?.roles;
      if (Array.isArray(roles) && roles.length && !roles.some((role) => viewerRoles.includes(role))) continue;
      // (c) instance-level audience targeting from the Setting document.
      if (instance.visibility?.audience && !matchesAudience(instance.visibility.audience, viewer)) continue;
    }
    // Geometry: contract bounds first (12-col grid), then the declaration's
    // own size envelope. Clamp, never reject — an admin's layout survives a
    // manifest tightening its min/max between saves.
    let w = clampInt(instance.w, 1, 12);
    let h = Math.max(1, Math.trunc(instance.h));
    if (decl && decl.size) {
      const { minW, maxW, minH, maxH } = decl.size;
      if (Number.isFinite(minW)) w = Math.max(w, minW);
      if (Number.isFinite(maxW)) w = Math.min(w, maxW);
      if (Number.isFinite(minH)) h = Math.max(h, minH);
      if (Number.isFinite(maxH)) h = Math.min(h, maxH);
    }
    out.push({
      instance,
      decl,
      cell: { panelId, x: Math.max(0, Math.trunc(instance.x)), y: Math.max(0, Math.trunc(instance.y)), w, h },
    });
  }
  return out;
}
