# Vendored schema provenance

`manifest-schema.json` in this directory is the **runtime source of truth** for
`@tommy/manifest` from M1 onward.

- **Origin:** `plans/refactor-plan/02-architecture/manifest-schema.json` (the shipped,
  fully-extended D22 seed schema — Draft 2020-12,
  `$id: https://schema.tommy.app/mini-program/manifest/v1.json`).
- **Vendored:** byte-identical copy. The plan-tree file remains the *design record*;
  this copy is the *runtime truth*. `yarn check:schema-drift` diffs the two when the
  plans tree is present (workspace checkout) and is a no-op in a standalone sdk CI.
- **Do NOT re-author.** D22 seed discipline (plan §Pass-H): extend/refresh only,
  never rewrite. To refresh: replace this file with the updated plan-tree schema and
  re-run the fixture corpus.

## Ajv strict-mode note

The schema is valid Draft 2020-12 but does **not** compile under Ajv's
`strict: true` because of a `strictRequired` lint on the `triggers` `if/then`
(`then: { required: [debounceMs] }` at
`#/properties/triggers/additionalProperties/allOf/0/then`). The validator runs Ajv
with `strict: true, strictRequired: false` (all other strict checks on) — verified
2026-07-03 that the reference manifest validates `valid: true` with Ajv 2020 +
ajv-formats. This is an Ajv-specific extra-standard lint, not a schema defect, so
the schema is left untouched.
