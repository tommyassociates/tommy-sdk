// Shared schema loader + Ajv 2020 instance.
// The vendored schema (src/schema/manifest-schema.json) is the runtime truth
// (see src/schema/PROVENANCE.md). Ajv runs strict EXCEPT strictRequired:false —
// the D22 seed schema's triggers if/then trips Ajv's extra-standard
// strictRequired lint but is valid Draft 2020-12; the schema is left untouched.

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
// Embedded JS twin of the vendored JSON (scripts/embed-assets.mjs) — loads in
// node AND the browser/vite pipeline; the JSON stays the drift-checked truth.
import embeddedSchema from './schema/manifest-schema.embedded.js';

export function loadSchema() {
  return embeddedSchema;
}

/** Compile the manifest schema into a reusable Ajv validate function. */
export function compileValidator(schema = loadSchema()) {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    strictRequired: false,
    verbose: true,
  });
  addFormats.default(ajv);
  return ajv.compile(schema);
}
