// Node-only: the browser/vite import graph of the root entry never touches node:fs.
import { readFileSync } from 'node:fs';
import { validateManifest } from './validate.js';

export function validateFile(path, opts = {}) {
  const source = readFileSync(path, 'utf8');
  return validateManifest(source, opts);
}
