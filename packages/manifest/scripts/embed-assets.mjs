#!/usr/bin/env node
// Regenerates the embedded JS twins of the vendored JSON assets (schema +
// catalogue). JSON stays the source of truth (drift-checked against plans);
// the .embedded.js modules make the package loadable in the browser/vite
// pipeline AND plain node without fs reads or JSON import attributes.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const pairs = [
  ['../src/schema/manifest-schema.json', '../src/schema/manifest-schema.embedded.js'],
  ['../src/catalogue/permission-catalogue.json', '../src/catalogue/permission-catalogue.embedded.js'],
];
for (const [src, out] of pairs) {
  const srcPath = fileURLToPath(new URL(src, import.meta.url));
  const outPath = fileURLToPath(new URL(out, import.meta.url));
  const data = readFileSync(srcPath, 'utf8').trimEnd();
  const name = src.split('/').pop();
  const header = `// GENERATED from ${name} by scripts/embed-assets.mjs — do not hand-edit.\n`
    + '// Embedded as a JS module so the package loads in BOTH node (the CLI)\n'
    + '// and the browser/vite pipeline (the M1 in-process loader) without fs\n'
    + '// or JSON import attributes.\n';
  writeFileSync(outPath, `${header}export default ${data};\n`);
  console.log(`[embed-assets] wrote ${out}`);
}
