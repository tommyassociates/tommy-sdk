// This run's retiring-path records, merged into the SDK's when it ends
// (core/src/retiring in the sibling core checkout, when present).
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
export default async function setup() {
  try {
    const { startRetiringRun } = await import('../core/src/retiring/vitest-setup.js');
    return startRetiringRun({ pkg: 'sdk', root });
  } catch (_) { return () => {}; }
}
