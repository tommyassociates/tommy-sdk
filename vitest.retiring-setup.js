// The retiring-path monitor records each use of a retiring path
// (core/src/retiring in the sibling core checkout), under the SDK root
// whichever package runs. Without that checkout, nothing is recorded.
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
try {
  const { installRetiringVitest } = await import('../core/src/retiring/vitest-setup.js');
  await installRetiringVitest({ pkg: 'sdk', root });
} catch (_) { /* no sibling core checkout */ }
