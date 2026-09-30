// The retiring-path monitor records each use of a retiring path
// (core/src/retiring in the sibling core checkout). Without that checkout,
// nothing is recorded.
try {
  const { installRetiringVitest } = await import('../core/src/retiring/vitest-setup.js');
  await installRetiringVitest({ pkg: 'sdk', root: process.cwd() });
} catch (_) { /* no sibling core checkout */ }
