// Resolves to this checkout so tests never run against a linked or stale node_modules/@tommy.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGES = dirname(fileURLToPath(import.meta.url));
const escaped = (text) => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const target = (entry) => {
  if (typeof entry === 'string') return entry;
  return entry?.import || entry?.default || null;
};

export function workspaceAlias() {
  const alias = [];
  for (const folder of readdirSync(PACKAGES)) {
    const manifest = join(PACKAGES, folder, 'package.json');
    if (!existsSync(manifest)) continue;
    const { name, exports: entries, main } = JSON.parse(readFileSync(manifest, 'utf8'));
    if (!name?.startsWith('@tommy/')) continue;
    const points = entries && typeof entries === 'object' && !target(entries) ? entries : { '.': entries || main };
    for (const [subpath, entry] of Object.entries(points)) {
      const file = target(entry);
      if (!file) continue;
      const specifier = subpath === '.' ? name : `${name}/${subpath.replace(/^\.\//, '')}`;
      alias.push({ find: new RegExp(`^${escaped(specifier)}$`), replacement: resolve(PACKAGES, folder, file) });
    }
  }
  return alias;
}

export default workspaceAlias;
