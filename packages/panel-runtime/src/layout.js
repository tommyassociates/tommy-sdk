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
