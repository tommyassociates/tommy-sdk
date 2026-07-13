#!/usr/bin/env node
/**
 * check-store-name-literals.mjs — offline-sync.md §8.8 requirement 3.
 *
 * No code path may open a store by a literal namespace name: a tenant-less
 * `tommy-mp:{mpId}` reads a cross-tenant/empty store; a hand-built
 * `tommy-core:{tenantId}:{domain}` bypasses the core-domain registry. The
 * `tommy.data` wrapper (@tommy/offline-sync src/names.js) is the ONLY name
 * resolver — this blocking check rejects literal `tommy-mp:` / `tommy-core:`
 * construction anywhere else (comments included, same posture as the other
 * M0 detectors).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, extname, relative } from 'node:path';

const ROOTS = ['packages', 'addons', 'src'];
const ALLOW = [
  'packages/offline-sync/src/names.js',        // the ONE resolver
  'packages/offline-sync/test/data-store.test.js', // asserts the resolver's output
  'scripts/check-store-name-literals.mjs',
];
const NEEDLES = ['tommy-mp:', 'tommy-core:'];
const EXTS = new Set(['.js', '.mjs', '.ts', '.vue']);

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (EXTS.has(extname(entry.name))) yield full;
  }
}

const violations = [];
for (const root of ROOTS) {
  let files;
  try { files = [...walk(root)]; } catch { continue; }
  for (const file of files) {
    const rel = relative('.', file);
    if (ALLOW.includes(rel)) continue;
    const content = readFileSync(file, 'utf8');
    for (const needle of NEEDLES) {
      if (content.includes(needle)) violations.push(`${rel}: literal '${needle}' — use the tommy.data wrapper (@tommy/offline-sync names.js)`);
    }
  }
}

if (violations.length) {
  console.error('[check-store-name-literals] FAIL:');
  violations.forEach((v) => console.error(`  ${v}`));
  process.exit(1);
}
console.log('[check-store-name-literals] OK — no literal store-name construction outside the wrapper.');
