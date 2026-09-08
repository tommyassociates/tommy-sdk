// The SDK JSON is the current runtime authority. Guard both runtime copies;
// optional relocated design sources must be explicitly selected, never skipped.
// See src/schema/PROVENANCE.md for the frozen v3 design-seed relationship.
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const local = (path) => fileURLToPath(new URL(path, import.meta.url));
const schema = local('../src/schema/manifest-schema.json');
const api = local('../../../../api/config/mp_contract/manifest-schema.json');
const pairs = [];
if (existsSync(local('../../../../api'))) {
  pairs.push({ source: schema, copy: api, label: 'manifest schema (API runtime copy)' });
}
if (process.env.MP_MANIFEST_DESIGN_SOURCE) {
  pairs.push({ source: schema, copy: resolve(process.env.MP_MANIFEST_DESIGN_SOURCE), label: 'explicit current manifest design source' });
}
if (process.env.MP_REFERENCE_MANIFEST_SOURCE) {
  pairs.push({
    source: local('../test/fixtures/reference-manifest.yml'),
    copy: resolve(process.env.MP_REFERENCE_MANIFEST_SOURCE),
    label: 'explicit current reference manifest source',
  });
}

let drift = false;
function verify(label, expected, path) {
  if (!existsSync(path)) {
    console.error(`✖ ${label}: required copy missing: ${path}`);
    drift = true;
  } else if (expected.equals(readFileSync(path))) {
    console.log(`✔ ${label}: byte-identical.`);
  } else {
    console.error(`✖ ${label}: DRIFT — reconcile and regenerate the runtime copy.`);
    drift = true;
  }
}

for (const [name, directory] of [['manifest-schema', 'schema'], ['permission-catalogue', 'catalogue']]) {
  const data = readFileSync(local(`../src/${directory}/${name}.json`), 'utf8').trimEnd();
  const header = `// GENERATED from ${name}.json by scripts/embed-assets.mjs — do not hand-edit.\n`
    + '// Embedded as a JS module so the package loads in BOTH node (the CLI)\n'
    + '// and the browser/vite pipeline (the M1 in-process loader) without fs\n'
    + '// or JSON import attributes.\n';
  verify(`${name} (SDK browser runtime)`, Buffer.from(`${header}export default ${data};\n`), local(`../src/${directory}/${name}.embedded.js`));
}
for (const pair of pairs) verify(pair.label, readFileSync(pair.source), pair.copy);
if (drift) process.exit(1);
console.log(`Schema drift check passed: ${pairs.length + 2} current runtime/design comparisons.`);
