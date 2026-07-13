// @tommy/manifest/node — the node-only surface (fs, CLI, typegen). Split from
// the root entry so the browser/vite import graph (loader, @tommy/sdk) stays
// free of node built-ins; import this entry from CLI/CI/scripts only.
export { validateFile } from './validate-file.js';
export { typegenFromManifest, typegenFromSource } from './typegen.js';
export { run as runCli } from './cli.js';
