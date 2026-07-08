/**
 * Tommy Mini Program isolation — dependency-cruiser config (tommy-sdk-private).
 *
 * Adapted for this repo from the workspace source of record:
 * plans/refactor-plan/01-detectors/dependency-cruiser.config.js
 * (rollout model: plans/refactor-plan/06-instrumentation/detectors-in-ci.md).
 *
 * Run:  npx depcruise --config dependency-cruiser.config.js --output-type err-long addons
 * JSON: npx depcruise --config dependency-cruiser.config.js --output-type json addons > depcruise-report.json
 *
 * Class A rules (zero existing violations) are `error` from day 0.
 * Class B rules (existing baseline) are `warn` + block-on-increase via
 * scripts/compare-to-baseline.js; a rule flips to `error` only when its
 * baseline reaches zero — never on a calendar date.
 *
 * Note: `tommy-core` / `tommy-app` are not resolvable from this repo (no
 * dependency on them here) — dependency-cruiser records those imports as
 * unresolvable modules whose path IS the import specifier, which is exactly
 * what the tommy-core/src and tommy-app/src rules match on.
 */
module.exports = {
  forbidden: [
    {
      name: 'no-addon-to-addon',
      comment:
        'Audit 1.1: a Mini Program must not import another Mini Program. Inter-MP ' +
        'communication goes through the Actions bus (manifest-mediated), never static imports.',
      severity: 'error',
      // The leading group is non-capturing so $1 below is the addon name.
      from: { path: '(?:^|/)addons/([^/]+)/' },
      to: {
        path: '(^|/)addons/([^/]+)/',
        // Allow imports within the SAME addon; forbid imports into a DIFFERENT one.
        pathNot: '(^|/)addons/$1/',
      },
    },
    {
      name: 'no-addon-to-core-internals',
      comment:
        'Audit 1.4: addons must import only the published @tommy/sdk entry point, ' +
        'never tommy-core/src/* internals. Large existing baseline — freeze and shrink.',
      severity: 'warn',
      from: { path: '(^|/)addons/[^/]+/' },
      to: {
        path: '(tommy-core|\\.\\./core)/src/',
        pathNot: '(tommy-core|\\.\\./core)/src/(tommy|index)(\\.js)?$',
      },
    },
    {
      name: 'no-addon-to-shell',
      comment:
        'Audit 1.4/1.9: addons must not reach into the shell app (tommy-app/src). ' +
        'Dashboard panels move OUT of the shell into their owning MP.',
      severity: 'error',
      from: { path: '(^|/)addons/[^/]+/' },
      to: { path: '(tommy-app|\\.\\./app)/src/' },
    },
    {
      name: 'no-bundled-shared-deps',
      comment:
        'Audit 1.7: vue / vuex / framework7 must be EXTERNAL in addon bundles, ' +
        'provided by the host at runtime. A bundled copy means version drift and ' +
        'a duplicate framework in the same realm.',
      severity: 'error',
      from: { path: '(^|/)addons/[^/]+/' },
      // Scoped to an ADDON-LOCAL node_modules (a vendored copy inside the addon
      // tree). An addon source file importing 'vue' that resolves to the REPO
      // ROOT node_modules is normal — the host provides it and the bundler
      // externalizes it — and must not fire this rule.
      to: { path: '(^|/)addons/[^/]+/.*node_modules/(vue|vuex|framework7|framework7-vue)/' },
    },
    {
      name: 'no-circular',
      comment: 'Circular dependencies make MP boundaries impossible to reason about.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      comment: 'Orphaned modules in addon source are usually dead code left from migration.',
      severity: 'warn',
      from: {
        orphan: true,
        pathNot: '\\.(d\\.ts|json|scss|css)$',
      },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: '(^|/)node_modules/|^\\.\\./' },
    // ^\.\./ — sibling-repo modules (e.g. ../core resolved through the tommy-core
    // link) are kept as rule TARGETS but never traversed: their internal edges
    // (core's own cycles etc.) are core's jurisdiction, not this repo's.
    // node_modules still resolved (so no-bundled-shared-deps can see them) but not traversed.
    // node_modules must NOT be in exclude — exclude removes modules from the graph
    // entirely, which would blind no-bundled-shared-deps.
    tsPreCompilationDeps: true,
    // production/ trees are release-sync copies of development/src (never
    // hand-edited — repo rule). Scanning them double-counts every violation
    // and a routine dev->production sync PR would trip the block-on-increase
    // freeze without adding any new coupling. Excluded; development/src and
    // the migrated single-tree src/ layout are the measured surface.
    exclude: { path: '(build/|production/)' },
    enhancedResolveOptions: {
      extensions: ['.js', '.ts', '.vue', '.json'],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
