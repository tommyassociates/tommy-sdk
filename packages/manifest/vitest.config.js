import { defineConfig } from 'vitest/config';
import { workspaceAlias } from '../workspace-alias.js';

export default defineConfig({
  resolve: { alias: workspaceAlias() },
});
