#!/usr/bin/env node
/**
 * compare-to-baseline.js — the M0 coupling freeze (block-on-increase).
 *
 * Parses ESLint JSON reports (array of file results) and dependency-cruiser
 * JSON reports ({ summary: { violations: [...] } }), counts violations per
 * rule, and compares against the committed coupling-baseline.json:
 *
 *   { "eslint": { "<ruleId>": <count> }, "depcruise": { "<ruleName>": <count> } }
 *
 * Usage:
 *   node scripts/compare-to-baseline.js --write <report.json>... [baseline.json]
 *   node scripts/compare-to-baseline.js --check <report.json>... [baseline.json]
 *
 * --write  regenerate the baseline from the report(s) and exit 0.
 * --check  exit 1 if ANY rule's count increased vs the baseline. On a
 *          decrease, print a reminder to commit the updated baseline
 *          (run --write) but still exit 0.
 *
 * Report type is detected by shape, so arguments may be passed in any order.
 * The baseline path is any argument ending in coupling-baseline.json
 * (default ./coupling-baseline.json). Missing report files are skipped with
 * a warning so one command works across repos with different tool sets.
 *
 * Design: plans/refactor-plan/06-instrumentation/detectors-in-ci.md.
 */
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const mode = args.find((a) => a === '--write' || a === '--check');
if (!mode) {
  console.error('usage: compare-to-baseline.js (--write|--check) <report.json>... [baseline.json]');
  process.exit(2);
}
const fileArgs = args.filter((a) => !a.startsWith('--'));
const baselinePath =
  fileArgs.find((f) => f.endsWith('coupling-baseline.json')) || 'coupling-baseline.json';
const reportPaths = fileArgs.filter((f) => !f.endsWith('coupling-baseline.json'));

const counts = { eslint: {}, depcruise: {} };
// Tools that actually produced a parsed report this run. A tool with a
// non-zero baseline and NO report must FAIL --check: otherwise a broken
// linter (eslint exit 2 writes no output file, and the yarn script's
// `|| true` swallows it) reads as "all violations fixed" and the freeze
// silently disables itself.
const toolsSeen = new Set();

for (const p of reportPaths) {
  if (!fs.existsSync(p)) {
    console.warn(`[compare-to-baseline] skipping missing report: ${p}`);
    continue;
  }
  let data;
  try {
    data = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    console.error(`[compare-to-baseline] unparsable report ${p}: ${e.message}`);
    process.exit(2);
  }
  if (Array.isArray(data)) {
    // ESLint JSON formatter output
    toolsSeen.add('eslint');
    for (const file of data) {
      for (const msg of file.messages || []) {
        if (!msg.ruleId) continue; // parse errors etc.
        counts.eslint[msg.ruleId] = (counts.eslint[msg.ruleId] || 0) + 1;
      }
    }
  } else if (data && data.summary && Array.isArray(data.summary.violations)) {
    // dependency-cruiser JSON output
    toolsSeen.add('depcruise');
    for (const v of data.summary.violations) {
      const name = v.rule && v.rule.name;
      if (!name) continue;
      counts.depcruise[name] = (counts.depcruise[name] || 0) + 1;
    }
  } else {
    console.error(`[compare-to-baseline] unrecognised report shape: ${p}`);
    process.exit(2);
  }
}

const sortKeys = (obj) =>
  Object.fromEntries(Object.keys(obj).sort().map((k) => [k, obj[k]]));

if (mode === '--write') {
  const baseline = { eslint: sortKeys(counts.eslint), depcruise: sortKeys(counts.depcruise) };
  fs.writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
  console.log(`[compare-to-baseline] wrote ${baselinePath}`);
  console.log(JSON.stringify(baseline, null, 2));
  process.exit(0);
}

// --check
if (!fs.existsSync(baselinePath)) {
  console.error(
    `[compare-to-baseline] no baseline at ${path.resolve(baselinePath)} — generate one with --write and commit it`
  );
  process.exit(1);
}
const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
let increased = false;
let decreased = false;

// Fail-closed guard: every tool the baseline tracks (non-zero counts) must
// have produced a report this run.
for (const tool of ['eslint', 'depcruise']) {
  const baselineTotal = Object.values(baseline[tool] || {}).reduce((a, b) => a + b, 0);
  if (baselineTotal > 0 && !toolsSeen.has(tool)) {
    console.error(
      `[compare-to-baseline] BLOCKED: baseline tracks ${baselineTotal} ${tool} violations but no ${tool} report was produced this run — the ${tool} step is broken, not clean.`
    );
    process.exit(1);
  }
}

for (const tool of ['eslint', 'depcruise']) {
  const base = baseline[tool] || {};
  const now = counts[tool];
  const rules = new Set([...Object.keys(base), ...Object.keys(now)]);
  for (const rule of rules) {
    const was = base[rule] || 0;
    const is = now[rule] || 0;
    if (is > was) {
      increased = true;
      console.error(`FAIL ${tool}/${rule}: ${was} -> ${is} (+${is - was}) — new coupling introduced`);
    } else if (is < was) {
      decreased = true;
      console.log(`ok   ${tool}/${rule}: ${was} -> ${is} (improved — commit the updated baseline via --write)`);
    } else if (is > 0) {
      console.log(`ok   ${tool}/${rule}: ${is} (unchanged)`);
    }
  }
}

if (increased) {
  console.error('\n[compare-to-baseline] BLOCKED: coupling increased vs coupling-baseline.json.');
  console.error('Fix the new violation (preferred) — do not regenerate the baseline to absorb it.');
  process.exit(1);
}
if (decreased) {
  console.log('\n[compare-to-baseline] counts decreased — run with --write and commit the new baseline.');
}
console.log('[compare-to-baseline] OK — no rule increased.');
process.exit(0);
