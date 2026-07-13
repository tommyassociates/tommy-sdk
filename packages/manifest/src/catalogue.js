// Permission catalogue — load, search, explain, and nearest-scope suggestion.
// The catalogue shipped inside this package is the source of truth for
// validation layer 3 (README §Validation layers). A pinned @tommy/manifest
// version pins the catalogue version.

// Embedded JS twin of the vendored JSON (scripts/embed-assets.mjs) — loads in
// node AND the browser/vite pipeline; the JSON stays the drift-checked truth.
import embeddedCatalogue from './catalogue/permission-catalogue.embedded.js';

/**
 * Load a permission catalogue. Defaults to the embedded one. An override must
 * be a pre-parsed OBJECT (browser-safe); the CLI resolves --catalogue file
 * paths to objects before calling in (keeping this module free of node
 * builtins for the in-process loader).
 */
export function loadCatalogue(override) {
  let raw = embeddedCatalogue;
  if (override && typeof override === 'object') {
    raw = override;
  } else if (typeof override === 'string') {
    throw new Error("loadCatalogue: pass a parsed catalogue object; the CLI resolves file paths (see cli.js readCatalogueOverride)");
  }
  const permissions = raw.permissions ?? [];
  return {
    version: raw.catalogueVersion ?? 'unknown',
    categories: raw.categories ?? [],
    permissions,
    scopes: new Set(permissions.map((p) => p.scope)),
    byScope: new Map(permissions.map((p) => [p.scope, p])),
  };
}

/** Levenshtein edit distance (small strings; suggestion only). */
export function editDistance(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...new Array(n).fill(0)]);
  for (let j = 0; j <= n; j += 1) dp[0][j] = j;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

/**
 * Suggest the closest catalogue scope to an unknown scope, or null when nothing
 * is close enough to be a useful "did you mean".
 */
export function suggestScope(catalogue, unknown) {
  // Prefer candidates sharing the same verb (before ':') so a 'read:*' typo is
  // not "corrected" to an unrelated 'write:*'; this keeps suggestions honest.
  const [verb] = unknown.split(':');
  const sameVerb = [...catalogue.scopes].filter((s) => s.startsWith(`${verb}:`));
  const pool = sameVerb.length ? sameVerb : [...catalogue.scopes];

  let best = null;
  let bestDist = Infinity;
  for (const scope of pool) {
    const d = editDistance(unknown, scope);
    if (d < bestDist) {
      bestDist = d;
      best = scope;
    }
  }
  // Suggest only for genuine near-misses (tight typo distance), never a loose
  // nearest — a misleading "did you mean" sends an AI author to the wrong scope.
  const threshold = Math.max(2, Math.floor(unknown.length / 4));
  return best && bestDist <= threshold ? best : null;
}

/** Filter helper for `tommy manifest catalogue`. */
export function searchCatalogue(catalogue, { search, category } = {}) {
  let list = catalogue.permissions;
  if (category) list = list.filter((p) => p.category === category);
  if (search) {
    const q = search.toLowerCase();
    list = list.filter(
      (p) =>
        p.scope.toLowerCase().includes(q) ||
        (p.title ?? '').toLowerCase().includes(q) ||
        (p.description ?? '').toLowerCase().includes(q),
    );
  }
  return list;
}
