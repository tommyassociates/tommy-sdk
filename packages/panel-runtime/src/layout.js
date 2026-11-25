// Role filtering comes from manifest panels[].rbac.roles.
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

// AND across contexts, OR within a list; unknown keys are ignored so an old client never hides a newer tab.
const AUDIENCE_CONTEXTS = ['roles', 'members', 'tags', 'locations', 'skills'];

// Entries are tag ids; only members may also hold a raw userId; absent lists mean everyone.
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

export function resolveComposedLayout(composed, surface, { panelsByMp = {}, viewer = {} } = {}) {
  if (!Array.isArray(composed)) return [];
  const declsByMp = new Map();
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
      const surfaces = decl.surfaces || (decl.surface ? [decl.surface] : []);
      if (!surfaces.includes(surface)) continue;
      const roles = decl.rbac?.roles;
      if (Array.isArray(roles) && roles.length && !roles.some((role) => viewerRoles.includes(role))) continue;
      if (instance.visibility?.audience && !matchesAudience(instance.visibility.audience, viewer)) continue;
    }
    // Clamp, never reject: an admin's layout survives a panel's size envelope changing.
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
