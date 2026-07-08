/**
 * MP-isolation lint (M0 — mp-platform-m0-coupling-detectors).
 *
 * Standalone config run with `eslint --no-eslintrc -c .eslintrc.isolation.js`
 * (see the lint:isolation script). It is deliberately separate from the main
 * .eslintrc.js, whose airbnb/promise extends are not installed in this repo —
 * the isolation job must not depend on that toolchain. Rule data is vendored
 * in ./eslint-mp-isolation.json (source of record:
 * plans/refactor-plan/01-detectors/ in the workspace repo).
 *
 * All isolation rules stay `warn` — enforcement is the baseline compare in
 * scripts/compare-to-baseline.js (block-on-increase), per
 * plans/refactor-plan/06-instrumentation/detectors-in-ci.md.
 */
const iso = require('./eslint-mp-isolation.json');

// Strip _-prefixed annotation keys (_scope, _comment) the ESLint schema
// rejects, and drop the production/ tree globs: production is a release-sync
// copy of development/src (never hand-edited), so scanning it double-counts
// debt and a routine sync PR would trip the block-on-increase freeze.
const overrides = iso.overrides.map((o) => ({
  ...Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith('_'))),
  files: o.files.filter((g) => !g.includes('/production/')),
}));

module.exports = {
  root: true,
  extends: ['plugin:vue/base'],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  env: {
    browser: true,
    es2022: true,
  },
  overrides,
};
