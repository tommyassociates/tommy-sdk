// This run's retiring-path records, merged into the package's when it ends
// (core/src/retiring in the sibling core checkout, when present).
export default async function setup() {
  try {
    const { startRetiringRun } = await import('../core/src/retiring/vitest-setup.js');
    return startRetiringRun({ pkg: 'sdk', root: process.cwd() });
  } catch (_) { return () => {}; }
}
