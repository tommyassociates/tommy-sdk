import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
try {
  const { installRetiringVitest } = await import('../core/src/retiring/vitest-setup.js');
  await installRetiringVitest({ pkg: 'sdk', root });
} catch (_) { /* no sibling core checkout */ }
