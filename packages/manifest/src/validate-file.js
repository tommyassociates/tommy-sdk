// Node-only file wrapper over validateManifest — kept out of validate.js so
// the browser/vite import graph of the root entry never touches node:fs
// (the in-process loader imports validateManifest in the shell realm).
import { readFileSync } from 'node:fs';
import { validateManifest } from './validate.js';

/** Validate a manifest file by path. Throws (with .code='ENOENT') if unreadable. */
export function validateFile(path, opts = {}) {
  const source = readFileSync(path, 'utf8');
  return validateManifest(source, opts);
}
