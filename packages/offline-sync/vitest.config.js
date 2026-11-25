import { defineConfig } from 'vitest/config';
import { workspaceAlias } from '../workspace-alias.js';

export default defineConfig({
  resolve: { alias: workspaceAlias() },
  // The host-store suites commit hundreds of rows to on-disk SQLite files;
  // with every test file running in parallel those commits can pass the
  // default 5 s on a loaded machine.
  test: { testTimeout: 20_000 },
});
