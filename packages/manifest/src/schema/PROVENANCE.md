# Vendored schema provenance

`manifest-schema.json` in this directory is the **runtime source of truth** for
`@tommy/manifest` from M1 onward.

- **Origin:** `plans/refactor-plan/02-architecture/manifest-schema.json` (the shipped,
  fully-extended D22 seed schema — Draft 2020-12,
  `$id: https://schema.tommy.app/mini-program/manifest/v1.json`).
- **Vendored origin:** originally byte-identical to that design seed. The frozen
  v3 plan moved to `Scopes/2026 - MP isolation and actions refactor/Archive (do not
  touch)/v3 - Reviewed/refactor-plan/` on 2026-07-11. The scope README and
  `plan/00-README.md` explicitly preserve that tree and the handoff `refactor-plan`
  travel copies as frozen architecture, with new additions in the current plan
  layer. They are historical seeds, not current runtime schema copies.
- **Do NOT re-author.** D22 seed discipline (plan §Pass-H): extend/refresh only,
  never rewrite. Approved additive changes extend this runtime JSON; regenerate
  its embedded JS twin and types, copy the exact JSON bytes to
  `api/config/mp_contract/manifest-schema.json`, and run the fixture corpus.

## Current drift checks (2026-09-08)

`yarn check:schema-drift` positively checks the generated SDK browser schema and
permission catalogue against their JSON sources on every checkout. In a sibling
API workspace it also requires byte identity with the server validation schema;
a missing API schema fails. This replaces the stale implicit `plans/` lookup,
which could report success without checking the current copies.

To compare an explicitly maintained, relocated current design source, set
`MP_MANIFEST_DESIGN_SOURCE` to its schema file; for the reference fixture, set
`MP_REFERENCE_MANIFEST_SOURCE` to its YAML file. Explicit sources must exist and
match byte for byte. Neither option points to the frozen Archive automatically.
The AI Settings additions are governed by the current 01b execution plan; the
runtime schema remains here and its API/browser copies are checked directly.

## Ajv strict-mode note

The schema is valid Draft 2020-12 but does **not** compile under Ajv's
`strict: true` because of a `strictRequired` lint on the `triggers` `if/then`
(`then: { required: [debounceMs] }` at
`#/properties/triggers/additionalProperties/allOf/0/then`). The validator runs Ajv
with `strict: true, strictRequired: false` (all other strict checks on) — verified
2026-07-03 that the reference manifest validates `valid: true` with Ajv 2020 +
ajv-formats. This is an Ajv-specific extra-standard lint, not a schema defect, so
the schema is left untouched.
