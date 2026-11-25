#!/usr/bin/env node
// No store may be opened by a literal name: a tenant-less name reads a cross-tenant or empty store.
import { readdirSync, readFileSync } from 'node:fs';
import { join, extname, relative } from 'node:path';

const ROOTS = ['packages', 'addons', 'src'];
const ALLOW = [
  'packages/offline-sync/src/names.js',
  'packages/offline-sync/test/data-store.test.js',
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
