// An MP replacing a legacy addon adopts its install identity, so the existing install row activates it.

export class LegacyPackageCollisionError extends Error {
  constructor(message, { packageKey, mpIds } = {}) {
    super(message);
    this.name = 'LegacyPackageCollisionError';
    this.packageKey = packageKey;
    this.mpIds = mpIds;
  }
}

export function legacyPackagesOf(manifest) {
  const declared = manifest && manifest.legacyPackages;
  if (!Array.isArray(declared)) return [];
  return declared.filter((p) => typeof p === 'string' && p.length > 0);
}

// The single injectivity assertion point: no package may be claimed by two MPs.
export function buildLegacyPackageIndex(manifests = []) {
  const entries = (manifests || []).filter((m) => m && typeof m.id === 'string' && m.id);
  const canonicalIds = new Set(entries.map((m) => m.id));

  const byPackage = new Map();
  const byMpId = new Map();

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

// Unknown keys pass through unchanged so an unindexed MP is never silently remapped.
export function resolveMpIdWith(index, packageKey) {
  if (!packageKey) return packageKey;
  const hit = index && index.byPackage ? index.byPackage.get(packageKey) : undefined;
  return hit === undefined ? packageKey : hit;
}
