// Guards the two vendored-vs-plans copies (schema + reference manifest) from
// silent drift. No-op when the plans tree is absent (standalone sdk checkout);
// exits 1 on drift so CI can catch an un-refreshed vendor.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const pairs = [
  {
    vendored: '../src/schema/manifest-schema.json',
    plans: '../../../../plans/refactor-plan/02-architecture/manifest-schema.json',
    label: 'manifest schema',
  },
  {
    vendored: '../test/fixtures/reference-manifest.yml',
    plans: '../../../../plans/refactor-plan/05-deliverables/05-reference-mp/reference-manifest.yml',
    label: 'reference manifest',
  },
];

let drift = false;
let checked = 0;
for (const p of pairs) {
  const vendored = fileURLToPath(new URL(p.vendored, import.meta.url));
  const plans = fileURLToPath(new URL(p.plans, import.meta.url));
  if (!existsSync(plans)) {
    console.log(`• ${p.label}: plans copy absent — skipping (standalone checkout).`);
    continue;
  }
  checked += 1;
  if (readFileSync(vendored, 'utf8') === readFileSync(plans, 'utf8')) {
    console.log(`✔ ${p.label}: vendored copy matches plans.`);
  } else {
    console.error(`✖ ${p.label}: DRIFT — vendored copy differs from plans. Re-vendor or reconcile.`);
    drift = true;
  }
}

if (drift) process.exit(1);
if (checked === 0) console.log('No plans tree present; nothing to diff.');
