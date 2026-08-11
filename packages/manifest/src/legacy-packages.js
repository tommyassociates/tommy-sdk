/**
 * legacy-packages.js — the IDENTITY-ADOPTION derivation (council C3).
 *
 * An MP that replaces a legacy addon ADOPTS the legacy install identity: the
 * tenant's existing `addon_installs` row (package `time_clock`) must activate
 * the MP (`time-clock`) with zero tenant action. The mapping is declared, per
 * MP, by the manifest's optional `legacyPackages: []`, and is resolved at READ
 * TIME only — nothing here ever writes, migrates, or deletes an install row.
 *
 * This module is the ONE derivation from those declarations. Consumers (the
 * app's `mp-identity.js` authority, the validator, tooling) build an index here
 * rather than re-deriving package strings themselves, so the injectivity rule
 * is asserted in exactly one place.
 *
 * Browser-safe (no node built-ins) — the in-process loader imports it.
 */

/** Thrown when two manifests claim the same legacy package (injectivity). */
export class LegacyPackageCollisionError extends Error {
  constructor(message, { packageKey, mpIds } = {}) {
    super(message);
    this.name = 'LegacyPackageCollisionError';
    this.packageKey = packageKey;
    this.mpIds = mpIds;
  }
}

/**
 * The legacy package keys one manifest declares. Accepts a parsed manifest
 * object or any `{ id, legacyPackages }` summary.
 * @param {{id?: string, legacyPackages?: string[]}} manifest
 * @returns {string[]}
 */
export function legacyPackagesOf(manifest) {
  const declared = manifest && manifest.legacyPackages;
  if (!Array.isArray(declared)) return [];
  return declared.filter((p) => typeof p === 'string' && p.length > 0);
}

/**
 * Build the package -> mpId index across every loaded manifest.
 *
 * INJECTIVITY (C3 rider, asserted here — the single assertion point):
 *  - no package key may be claimed by two different MPs;
 *  - a package key that equals some MP's canonical id may only be claimed by
 *    THAT MP (otherwise `scheduling` would resolve away from the Scheduling MP).
 *
 * The canonical id is always its own key (`time-clock` -> `time-clock`), so the
 * index answers both the legacy row and the canonical row with one lookup.
 *
 * @param {Array<{id?: string, legacyPackages?: string[]}>} manifests
 * @returns {{ byPackage: Map<string,string>, byMpId: Map<string,string[]> }}
 * @throws {LegacyPackageCollisionError}
 */
export function buildLegacyPackageIndex(manifests = []) {
  const entries = (manifests || []).filter((m) => m && typeof m.id === 'string' && m.id);
  const canonicalIds = new Set(entries.map((m) => m.id));

  const byPackage = new Map();
  const byMpId = new Map();

  // Canonical ids first — an MP is always reachable by its own id.
  for (const mp of entries) {
    byPackage.set(mp.id, mp.id);
    byMpId.set(mp.id, []);
  }

  for (const mp of entries) {
    for (const pkg of legacyPackagesOf(mp)) {
      // A key that is another MP's canonical id may never be re-pointed.
      if (canonicalIds.has(pkg) && pkg !== mp.id) {
        throw new LegacyPackageCollisionError(
          `legacyPackages: '${pkg}' is the canonical id of another Mini Program — '${mp.id}' may not adopt it.`,
          { packageKey: pkg, mpIds: [pkg, mp.id] },
        );
      }
      const owner = byPackage.get(pkg);
      if (owner !== undefined && owner !== mp.id) {
        throw new LegacyPackageCollisionError(
          `legacyPackages: '${pkg}' is declared by BOTH '${owner}' and '${mp.id}' — legacy package keys must be globally unique (injectivity).`,
          { packageKey: pkg, mpIds: [owner, mp.id] },
        );
      }
      byPackage.set(pkg, mp.id);
      const list = byMpId.get(mp.id);
      if (!list.includes(pkg)) list.push(pkg);
    }
  }

  return { byPackage, byMpId };
}

/**
 * Resolve one install/package key to its canonical mpId against an index built
 * by `buildLegacyPackageIndex`. Unknown keys pass THROUGH unchanged (an MP the
 * index does not know about must not be silently renamed).
 * @param {{byPackage: Map<string,string>}} index
 * @param {string} packageKey
 * @returns {string}
 */
export function resolveMpIdWith(index, packageKey) {
  if (!packageKey) return packageKey;
  const hit = index && index.byPackage ? index.byPackage.get(packageKey) : undefined;
  return hit === undefined ? packageKey : hit;
}
