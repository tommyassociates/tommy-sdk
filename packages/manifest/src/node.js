// Kept off the root entry so the browser/vite import graph never touches node:fs.
export { validateFile } from './validate-file.js';
export { typegenFromManifest, typegenFromSource } from './typegen.js';
export { run as runCli } from './cli.js';
