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
    fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).forEach((entry) => {
      const rel = path.posix.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(rel);
      } else if (EXTENSIONS.has(path.extname(entry.name)) && !isSkipped(entry.name)) {
        out.push(rel);
      }
    });
  };
  ['packages', 'src', 'scripts'].forEach(walk);
  return out.sort();
}

// A file whose header says it is generated is rewritten by its generator, not by hand.
const isGeneratedText = (text) => {
  const head = text.split('\n', 3).join('\n');
  return /\bGENERATED\b/.test(head) || /do not (hand-?)?edit/i.test(head);
};

// After one of these characters or keywords, `/` starts a regex literal rather than a division.
const REGEX_AFTER = new Set([...'(,=:[!&|?{};+-*%~^<>']);
const REGEX_KEYWORDS = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete',
  'void', 'throw', 'instanceof', 'yield', 'await']);
// After the `)` that closes the head of one of these statements, `/` starts a regex literal too.
const CONTROL_KEYWORDS = new Set(['if', 'while', 'for', 'with']);
const WORD = /[\w$]/;

function regexAllowed(src, prev) {
  if (prev < 0 || REGEX_AFTER.has(src[prev])) return true;
  if (!WORD.test(src[prev])) return false;
  let from = prev;
  while (from > 0 && WORD.test(src[from - 1])) from -= 1;
  return REGEX_KEYWORDS.has(src.slice(from, prev + 1));
}

/**
 * Whether the `(` after src[prev] opens the head of a control statement;
 * `x.for(` is a method call.
 */
function opensControlHead(src, prev) {
  if (prev < 0 || !WORD.test(src[prev])) return false;
  let from = prev;
  while (from > 0 && WORD.test(src[from - 1])) from -= 1;
  if (!CONTROL_KEYWORDS.has(src.slice(from, prev + 1))) return false;
  let before = from - 1;
  while (before >= 0 && /\s/.test(src[before])) before -= 1;
  return before < 0 || src[before] !== '.';
}

/** Index just past the string literal opening at src[start]; an unescaped newline ends it. */
function skipQuoted(src, start, end) {
  const quote = src[start];
  let i = start + 1;
  while (i < end) {
    if (src[i] === '\\') i += 2;
    else if (src[i] === quote) return i + 1;
    else if (src[i] === '\n') return i;
    else i += 1;
  }
  return end;
}

/** Index just past the regex literal (and its flags) opening at src[start]. */
function skipRegex(src, start, end) {
  let i = start + 1;
  let inClass = false;
  while (i < end && src[i] !== '\n') {
    if (src[i] === '\\') i += 1;
    else if (src[i] === '[') inClass = true;
    else if (src[i] === ']') inClass = false;
    else if (src[i] === '/' && !inClass) break;
    i += 1;
  }
  i += 1;
  while (i < end && /[a-z]/.test(src[i])) i += 1;
  return i;
}

/**
 * Calls `add(from, to)` for each `//` and `/* *\/` comment in src[start, end),
 * stepping over string, template and regex literals (or, in a stylesheet,
 * strings and unquoted `url()` values).
 */
function codeComments(src, start, end, add, style) {
  const lineEnd = (from) => {
    const at = src.indexOf('\n', from);
    return at < 0 || at > end ? end : at;
  };
  const templates = [];
  const parens = [];
  let inTemplate = false;
  let depth = 0;
  let prev = -1;
  let controlClose = -1;
  const regexNext = () => prev === controlClose || regexAllowed(src, prev);
  let i = start;
  while (i < end) {
    const c = src[i];
    const next = src[i + 1];
    if (inTemplate) {
      if (c === '\\') i += 2;
      else if (c === '`') {
        inTemplate = false;
        prev = i;
        i += 1;
      } else if (c === '$' && next === '{') {
        templates.push(depth);
        depth += 1;
        inTemplate = false;
        prev = i + 1;
        i += 2;
      } else i += 1;
    } else if (c === '/' && next === '/') {
      add(i, lineEnd(i));
      i = lineEnd(i);
    } else if (c === '/' && next === '*') {
      const close = src.indexOf('*/', i + 2);
      const stop = close < 0 || close + 2 > end ? end : close + 2;
      add(i, stop);
      i = stop;
    } else if (c === '\'' || c === '"') {
      i = skipQuoted(src, i, end);
      prev = i - 1;
    } else if (style && (c === 'u' || c === 'U') && /^url\(\s*[^'"\s)]/i.test(src.slice(i, i + 64))) {
      const close = src.indexOf(')', i);
      i = close < 0 || close >= end ? end : close + 1;
      prev = i - 1;
    } else if (!style && c === '`') {
      inTemplate = true;
      i += 1;
    } else if (!style && (c === '+' || c === '-') && next === c) {
      // A postfix `++` / `--` leaves its operand as the previous token, so a
      // `/` after it divides; a prefix one is an operator, so a `/` after it
      // opens a regex.
      if (regexNext()) prev = i + 1;
      i += 2;
    } else if (!style && c === '/' && regexNext()) {
      i = skipRegex(src, i, end);
      prev = i - 1;
    } else {
      if (c === '(') parens.push(opensControlHead(src, prev));
      if (c === ')' && parens.pop()) controlClose = i;
      if (c === '{') depth += 1;
      if (c === '}') {
        depth -= 1;
        if (templates.length && templates[templates.length - 1] === depth) {
          templates.pop();
          inTemplate = true;
        }
      }
      if (!/\s/.test(c)) prev = i;
      i += 1;
    }
  }
}

// The rest of a tag after its name, through the closing `>`. A quoted
// attribute value follows its `=` and may hold `<`, `>` or `<!--`.
const TAG_REST = String.raw`(?=[\s/>])(?:[^<>"'=]|=\s*(?:"[^"]*"|'[^']*')?)*>`;
const BLOCK_OPEN = new RegExp(`<!--|<(template|script|style)${TAG_REST}`, 'g');
// A comment opening, or a whole tag with its attributes.
const MARKUP = new RegExp(`<!--|<(/?)([A-Za-z][\\w:.-]*)${TAG_REST}`, 'g');
const RAW_CLOSE = { script: /<\/script\s*>/g, style: /<\/style\s*>/g };

/** Index just past the `<!-- -->` comment opening at src[start]. */
function markupCommentEnd(src, start) {
  const close = src.indexOf('-->', start + 4);
  return close < 0 ? src.length : close + 3;
}

/**
 * Calls `add(from, to)` for each `<!-- -->` comment in the markup src[start, end).
 * Tags are stepped over whole, so a `<!--` inside a quoted attribute value is
 * not read as a comment.
 */
function markupComments(src, start, end, add) {
  MARKUP.lastIndex = start;
  for (let m = MARKUP.exec(src); m && m.index < end; m = MARKUP.exec(src)) {
    if (m[0] === '<!--') {
      const stop = Math.min(markupCommentEnd(src, m.index), end);
      add(m.index, stop);
      MARKUP.lastIndex = stop;
    }
  }
}

/**
 * The match of the `</template>` that closes the template whose body starts at
 * `body`, or null. Nested templates are counted; comments and other tags are
 * stepped over.
 */
function templateClose(src, body) {
  let depth = 1;
  MARKUP.lastIndex = body;
  for (let m = MARKUP.exec(src); m; m = MARKUP.exec(src)) {
    if (m[0] === '<!--') MARKUP.lastIndex = markupCommentEnd(src, m.index);
    else if (m[2] === 'template' && m[1]) {
      depth -= 1;
      if (depth === 0) return m;
    } else if (m[2] === 'template' && !m[0].endsWith('/>')) depth += 1;
  }
  return null;
}

/**
 * Calls `add(from, to)` for each comment in a Vue single-file component. A
 * block opens and closes wherever its tags sit on a line: a script or style
 * body runs to its first closing tag, a template body to its matching one.
 */
function vueComments(src, add) {
  let cursor = 0;
  BLOCK_OPEN.lastIndex = 0;
  for (let m = BLOCK_OPEN.exec(src); m; m = BLOCK_OPEN.exec(src)) {
    const tag = m[1];
    const body = m.index + m[0].length;
    if (!tag) {
      cursor = markupCommentEnd(src, m.index);
      add(m.index, cursor);
    } else if (m[0].endsWith('/>')) {
      cursor = body;
    } else {
      let found;
      if (tag === 'template') found = templateClose(src, body);
      else {
        RAW_CLOSE[tag].lastIndex = body;
        found = RAW_CLOSE[tag].exec(src);
      }
      const bodyEnd = found ? found.index : src.length;
      if (tag === 'template') markupComments(src, body, bodyEnd, add);
      else codeComments(src, body, bodyEnd, add, tag === 'style');
      cursor = found ? found.index + found[0].length : src.length;
    }
    BLOCK_OPEN.lastIndex = cursor;
  }
}

/**
 * The comment text of each line of `src` that has any: `//`, `/* *\/` and
 * `<!-- -->` comments, never the inside of a string, template or regex literal.
 */
function commentLines(src, ext) {
  const lineStarts = [0];
  for (let at = src.indexOf('\n'); at >= 0; at = src.indexOf('\n', at + 1)) lineStarts.push(at + 1);
  const lineOf = (at) => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (lineStarts[mid] <= at) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  const byLine = new Map();
  const add = (from, to) => {
    const first = lineOf(from);
    src.slice(from, to).split('\n').forEach((part, k) => {
      byLine.set(first + k, `${byLine.get(first + k) || ''} ${part}`);
    });
  };
  if (ext === '.vue') vueComments(src, add);
  else {
    const start = src.startsWith('#!') ? src.indexOf('\n') + 1 : 0;
    codeComments(src, start, src.length, add, ext === '.scss' || ext === '.css');
  }
  return [...byLine.keys()].sort((a, b) => a - b).map((line) => byLine.get(line));
}

/** How many comment lines of `text` carry a history marker. */
function historyCount(text, ext) {
  return commentLines(text, ext)
    .filter((line) => HISTORY.test(line) || REFERENCE.test(line) || PLAN.test(line)).length;
}

function counts() {
  const out = {};
  sources().forEach((file) => {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const n = isGeneratedText(text) ? 0 : historyCount(text, path.extname(file));
    if (n > 0) out[file] = n;
  });
  return out;
}

const STRINGS_JS = [
  "const accept = 'image/*';",
  'const url = "http://example.com/legacy";',
  ['const t = `rc2 $', '{"/*"} legacy`;'].join(''),
  'const re = /\\/\\*legacy[/*]/g; const half = total / 2;',
  "const later = 'legacy';",
].join('\n');
const STRINGS_VUE = [
  '<template>', '  <input accept="image/*">', "  <p>Don't // legacy</p>", '</template>',
  '<script>', "const a = '// legacy';", '</script>',
  '<style lang="scss">', '.a { background: url(//cdn.example/legacy.png); content: "/* rc2"; }', '</style>', '',
].join('\n');
const SHARED_LINE_VUE = [
  '<template><div /></template>',
  '<script>', "const a = '<!-- legacy -->'; // rc2", '</script>',
  '<style lang="scss" src="./a.scss"></style>',
  '<style>', '.a { color: red; } /* legacy */', '</style>', '',
].join('\n');
const NESTED_TEMPLATE_VUE = [
  '<template>', '  <template v-if="a > b"><p>x</p></template> <!-- legacy -->', '</template>',
  '<script>', 'const b = 2; /* rc2 */', '</script>', '',
].join('\n');

test('counts nothing inside strings, template literals or regexes', () => {
  assert.equal(historyCount(STRINGS_JS, '.js'), 0);
  assert.equal(historyCount(STRINGS_VUE, '.vue'), 0);
});

test('counts a trailing history comment', () => {
  assert.equal(historyCount('const x = 1; // legacy path removed 2026-10-02\n', '.js'), 1);
  assert.equal(historyCount("const accept = 'image/*'; /* rc2 */\n", '.js'), 1);
  assert.equal(historyCount('<template>\n  <p>x</p> <!-- legacy -->\n</template>\n', '.vue'), 1);
});

test('reads every block of a component whose tags share a line', () => {
  assert.equal(historyCount(SHARED_LINE_VUE, '.vue'), 2);
  assert.equal(historyCount(NESTED_TEMPLATE_VUE, '.vue'), 2);
});

test('reads a slash after a postfix ++ or -- as a division', () => {
  assert.equal(historyCount('const rate = count++ / total; /* legacy */\n', '.js'), 1);
  assert.equal(historyCount('const rate = count-- / total; // rc2\n', '.js'), 1);
  assert.equal(historyCount('const at = ++/[/*]legacy/.lastIndex;\n', '.js'), 0);
});

test('reads a slash after the head of an if, while, for or with statement as a regex', () => {
  assert.equal(historyCount('if (ok) /[/*]legacy/.test(value);\n', '.js'), 0);
  assert.equal(historyCount('while (more()) /[/*]rc2/.exec(text);\n', '.js'), 0);
  assert.equal(historyCount('const share = tally.for(team) / total; /* legacy */\n', '.js'), 1);
});

test('counts no markup comment inside a quoted attribute value', () => {
  assert.equal(historyCount('<template>\n  <p title="<!-- legacy -->">x</p>\n</template>\n', '.vue'), 0);
  assert.equal(
    historyCount('<template>\n  <p title="<!-- a -->">Don\'t</p> <!-- legacy -->\n</template>\n', '.vue'),
    1
  );
});

test('adds no comment lines carrying history markers', () => {
  const now = counts();
  let baseline = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : {};

  if (process.env.COMMENT_HISTORY_BASELINE === 'tighten') {
    const tightened = {};
    Object.entries(baseline).sort().forEach(([file, allowed]) => {
      if (now[file]) tightened[file] = Math.min(allowed, now[file]);
    });
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
