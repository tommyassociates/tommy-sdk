module.exports = {
  forbidden: [
    {
      name: 'no-addon-to-addon',
      comment:
        'Audit 1.1: a Mini Program must not import another Mini Program. Inter-MP ' +
        'communication goes through the Actions bus (manifest-mediated), never static imports.',
      severity: 'error',
      from: { path: '(?:^|/)addons/([^/]+)/' },
      to: {
        path: '(^|/)addons/([^/]+)/',
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
      // A nested node_modules copy the bundler externalizes must not fire this rule.
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
    // Kept as rule targets but never traversed.
    // node_modules must not be in exclude: exclude removes modules from the graph entirely.
    tsPreCompilationDeps: true,
    // production/ trees are release-sync copies of development/src.
    exclude: { path: '(build/|production/)' },
    enhancedResolveOptions: {
      extensions: ['.js', '.ts', '.vue', '.json'],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
