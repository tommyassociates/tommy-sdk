import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
export default async function setup() {
  try {
    const { startRetiringRun } = await import('../core/src/retiring/vitest-setup.js');
    return startRetiringRun({ pkg: 'sdk', root });
  } catch (_) { return () => {}; }
}
