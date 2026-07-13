// @tommy/manifest — parse, validate, and type-generate Tommy Mini Program
// manifests. The forcing function for schema-first authoring; imported by
// @tommy/sdk, the loader, and @tommy/review-cli.

// Browser-safe surface ONLY — the in-process loader imports this entry in the
// shell realm, so nothing here (transitively) may touch node built-ins.
// Node-only pieces (validateFile, typegen, the CLI) live in './node.js'
// (exported as '@tommy/manifest/node').
export { validateManifest } from './validate.js';
export { parseManifest } from './parse.js';
export { loadSchema } from './schema.js';
export { loadCatalogue, searchCatalogue, suggestScope } from './catalogue.js';
