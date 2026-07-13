#!/usr/bin/env node
// Regenerates src/manifest.js from manifest.yml (the vendored plans seed —
// PROVENANCE in the header of manifest.yml). Same embed pattern as
// @tommy/manifest: a JS module loads in node AND the browser/vite pipeline.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = fileURLToPath(new URL('../manifest.yml', import.meta.url));
const out = fileURLToPath(new URL('../src/manifest.js', import.meta.url));
const yaml = readFileSync(src, 'utf8');
writeFileSync(out, `// GENERATED from manifest.yml by scripts/embed-manifest.mjs — do not hand-edit.\nexport default ${JSON.stringify(yaml)};\n`);
console.log('[embed-manifest] wrote src/manifest.js');
