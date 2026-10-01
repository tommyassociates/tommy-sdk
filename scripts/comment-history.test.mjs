// Comments state what the code does now and why. Rollout history, plan tags,
// dated rulings, review rounds and people's names belong in commits, PRs and
// ledgers. This counts the comment lines that carry those markers in each
// source file and fails when a file gains any beyond its baseline.
//
// Lowering the baseline after a cleanup:
//   COMMENT_HISTORY_BASELINE=tighten node --test scripts/comment-history.test.mjs
// rewrites the baseline with each count lowered to what the file has now. It
// never raises a count and never adds a file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const BASELINE = path.join(HERE, 'comment-history-baseline.json');

const HISTORY = new RegExp([
  String.raw`\blegacy\b`, 'cut-?over', 'convergence', 'single-?mode', String.raw`\brc[12]\b`,
  'mp[- ]platform', String.raw`\bMP refactor`, String.raw`\bretir(ed|ing|ement)\b`,
  String.raw`\bpreviously\b`, String.raw`\bused to\b`, String.raw`\bno longer\b`,
  String.raw`\bold (code|path|host|flow|behaviou?r|build|api|version)`,
  String.raw`\bwas (removed|replaced|moved|renamed|added)\b`,
  String.raw`\bbefore (this|the) (change|fix|refactor)\b`, String.raw`\bpre-?(fabric|mp|refactor)\b`,
].join('|'), 'i');
const REFERENCE = new RegExp([
  String.raw`\b20\d\d-\d\d-\d\d\b`, String.raw`\bDV-\d+\b`, String.raw`\bRT-\d+\b`, String.raw`\b(QA|qa) round\b`,
  String.raw`\bQ\d{1,2}\b`, String.raw`\bD\d{2}\b`, String.raw`\b(Mason|Gav|Kam)\b`, String.raw`\bCodex\b`,
  String.raw`\bcouncil\b`, String.raw`\bruling\b`, String.raw`\bP3(\.\d[a-z]?)?\b`, String.raw`\bBatch \d\b`,
  String.raw`\bM\d[AB]?\b`, String.raw`\b(scope|Scope) \d{2}[a-z]?\b`, String.raw`\b(OD|CL|INT|SC|BE|FE)-[A-Z]?\d+\b`,
  String.raw`\bPR ?#\d+`, String.raw`\b(api|core|app|sdk)#\d+`,
].join('|'));
const PLAN = /PROVENANCE|LEGACY_REMOVAL_PLAN|BACKLOG|owner-reported/;

const EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.vue', '.scss']);
const SKIP_DIRS = new Set(['node_modules', 'locales', 'i18n', 'dist', 'test', 'tests', '__tests__']);
// Generated modules and tests are not scanned.
const GENERATED = new Set(['manifest.js', 'locales.js']);
const isSkipped = (name) => GENERATED.has(name) || name.includes('.generated.') || name.includes('.embedded.')
  || name.includes('.test.');

function sources() {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = path.posix.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(rel);
      } else if (EXTENSIONS.has(path.extname(entry.name)) && !isSkipped(entry.name)) {
        out.push(rel);
      }
    }
  };
  for (const dir of ['packages', 'src', 'scripts']) walk(dir);
  return out.sort();
}

/** The lines of `text` that are comments: `//` lines and `/* *\/` / `<!-- -->` blocks. */
function commentLines(text) {
  const lines = [];
  let close = null;
  for (const line of text.split('\n')) {
    let inside = close !== null;
    let rest = line;
    if (close === null && /^\s*\/\//.test(line)) {
      lines.push(line);
      continue;
    }
    while (rest.length) {
      if (close === null) {
        const open = [['/*', '*/'], ['<!--', '-->']]
          .map(([o, c]) => [rest.indexOf(o), o, c])
          .filter(([at]) => at >= 0)
          .sort((a, b) => a[0] - b[0])[0];
        if (!open) break;
        inside = true;
        close = open[2];
        rest = rest.slice(open[0] + open[1].length);
      } else {
        const at = rest.indexOf(close);
        if (at < 0) break;
        rest = rest.slice(at + close.length);
        close = null;
      }
    }
    if (inside) lines.push(line);
  }
  return lines;
}

function counts() {
  const out = {};
  for (const file of sources()) {
    const n = commentLines(fs.readFileSync(path.join(ROOT, file), 'utf8'))
      .filter((line) => HISTORY.test(line) || REFERENCE.test(line) || PLAN.test(line)).length;
    if (n > 0) out[file] = n;
  }
  return out;
}

test('adds no comment lines carrying history markers', () => {
  const now = counts();
  let baseline = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : {};

  if (process.env.COMMENT_HISTORY_BASELINE === 'tighten') {
    const tightened = {};
    for (const [file, allowed] of Object.entries(baseline).sort()) {
      if (now[file]) tightened[file] = Math.min(allowed, now[file]);
    }
    fs.writeFileSync(BASELINE, `${JSON.stringify(tightened, null, 2)}\n`);
    baseline = tightened;
  }

  const grown = Object.entries(now)
    .filter(([file, n]) => n > (baseline[file] || 0))
    .map(([file, n]) => `${file}: ${n} history comment lines (baseline ${baseline[file] || 0})`);
  assert.deepEqual(grown, [], [
    'Comments must state current behaviour. These files gained comment lines with',
    'rollout history, plan tags, dates, review rounds or names:',
    ...grown.map((g) => `  ${g}`),
    'Put that context in the commit message or the ledger instead.',
  ].join('\n'));
});
