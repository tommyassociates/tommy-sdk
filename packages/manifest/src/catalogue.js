import embeddedCatalogue from './catalogue/permission-catalogue.embedded.js';

// An override must be a pre-parsed object so this module stays browser-safe.
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

export function suggestScope(catalogue, unknown) {
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
  // Suggest only for genuine near-misses (tight typo distance).
  const threshold = Math.max(2, Math.floor(unknown.length / 4));
  return best && bestDist <= threshold ? best : null;
}

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
