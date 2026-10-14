// The SDK is Tommy in every language. No source, locale or sample add-on may
// carry the former Chinese brand (托me / 托秘) or the name of the Hangzhou
// company that ran it, and the brand is never spelled phonetically in another
// script.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SELF = fileURLToPath(import.meta.url);
const FORMER_BRAND = /托me|托秘|tuome|hangzhou|杭州|汤米|托米|湯米|टॉमी|टोमी|ทอมมี|Томми|トミー|토미/i;
const ROOTS = ['src', 'addons', 'packages', 'scripts', 'static', 'index.html', 'package.json', 'server.js'];
const TEXT = new Set(['.js', '.mjs', '.cjs', '.ts', '.vue', '.json', '.html', '.scss', '.css', '.md', '.yml', '.yaml', '.svg', '.txt']);
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build']);

function textFiles(file, out = []) {
  let stat;
  try { stat = fs.statSync(file); } catch { return out; }
  if (stat.isDirectory()) {
    for (const name of fs.readdirSync(file)) if (!SKIP_DIRS.has(name)) textFiles(path.join(file, name), out);
  } else if (file !== SELF && TEXT.has(path.extname(file))) {
    out.push(file);
  }
  return out;
}

test('the former Chinese brand appears nowhere in SDK source or locales', () => {
  const hits = ROOTS.flatMap((entry) => textFiles(path.join(ROOT, entry)))
    .flatMap((file) => fs.readFileSync(file, 'utf8').split('\n')
      .map((line, index) => (FORMER_BRAND.test(line) ? `${path.relative(ROOT, file)}:${index + 1}` : null))
      .filter(Boolean));
  assert.deepEqual(hits, []);
});
