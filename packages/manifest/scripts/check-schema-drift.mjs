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
  // A.6 — THE API COPY, WHICH HAD NO GUARD AT ALL AND WAS ALREADY STALE.
  //
  // There are THREE copies of this schema, not two: the vendored one, the
  // plans one, and `api/config/mp_contract/manifest-schema.json`, which is
  // what `Mp::ChecksRunner` and `Mp::ManifestCheck::Contract` validate every
  // SUBMISSION against. Only the first two were checked, so the one the SERVER
  // enforces was free to drift — and had: it was missing `correlationKey` from
  // the idempotency enum, so any manifest declaring it validated in the CLI
  // and would have been REJECTED at publish.
  //
  // Found while adding `panels[].authorizedCallers`: the client accepted it and
  // the server would have refused the same file. Named `plans` here only
  // because that is the field the loop reads; it is a peer copy, not a source.
  {
    vendored: '../src/schema/manifest-schema.json',
    plans: '../../../../api/config/mp_contract/manifest-schema.json',
    label: 'manifest schema (api copy — what the SERVER validates submissions against)',
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
