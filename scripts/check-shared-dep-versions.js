#!/usr/bin/env node
/**
 * check-shared-dep-versions.js — shared-dependency drift gate (M0, blocking
 * from day 0). Closes audit 1.7's "pin shared dependency versions".
 *
 * The host provides ONE copy of vue / vuex / framework7 / framework7-vue at
 * runtime; any repo resolving a DIFFERENT version means the dev/build
 * environments disagree with the host realm. This script reads the resolved
 * version of each shared package across the sibling repos (app, core, sdk)
 * and exits non-zero on any mismatch.
 *
 * Two comparison tiers, both must pass — never compare a resolved version
 * against a declared range (in CI the sibling repos are bare clones with no
 * node_modules, and e.g. app's installed vuex 4.1.0 vs sdk's declared ^4.0.2
 * is NOT drift):
 *   1. DECLARED — package.json ranges (deps+devDeps), compared across every
 *      repo that declares the package, normalised by stripping a leading
 *      ^ or ~ . Works on bare clones.
 *   2. RESOLVED — node_modules/<pkg>/package.json versions, compared only
 *      across repos that actually have the package installed (catches
 *      lockfile-level drift inside a shared range; effectively local-only,
 *      since CI does not install siblings).
 * A repo that neither installs nor declares the package is skipped: it
 * inherits the host's copy at runtime (e.g. app takes framework7 through
 * tommy-core; core declares vue/vuex only as peerDependencies — a
 * compatibility statement, not a copy — and peers are deliberately ignored).
 *
 * Workspace layout assumption: this script lives in <repo>/scripts/ and the
 * sibling repos are ../app, ../core, ../sdk (the tommy workspace layout; CI
 * clones siblings to the same relative paths).
 *
 * Design: plans/refactor-plan/06-instrumentation/detectors-in-ci.md (PR 3).
 */
const fs = require('fs');
const path = require('path');

const SHARED = ['vue', 'vuex', 'framework7', 'framework7-vue'];
const repoRoot = path.resolve(__dirname, '..');
const workspace = path.resolve(repoRoot, '..');
// The repo this script runs from is always included (in CI the checkout dir
// is often named `project`, not app/core/sdk); the others are found as
// sibling checkouts by their workspace names.
const seen = new Set([fs.realpathSync(repoRoot)]);
const REPOS = [{ name: path.basename(repoRoot), dir: repoRoot }];
for (const name of ['app', 'core', 'sdk']) {
  const dir = path.join(workspace, name);
  if (!fs.existsSync(path.join(dir, 'package.json'))) continue;
  const real = fs.realpathSync(dir);
  if (seen.has(real)) continue;
  seen.add(real);
  REPOS.push({ name, dir });
}

if (REPOS.length < 2) {
  console.error(
    `[check-shared-dep-versions] found ${REPOS.length} of app/core/sdk next to ${workspace} — need the sibling checkouts to compare`
  );
  process.exit(2);
}

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
let failed = false;

const compareTier = (pkg, tier, entries) => {
  if (entries.length < 2) return;
  const versions = [...new Set(entries.map((f) => f.version))];
  const detail = entries.map((f) => `${f.repo}=${f.version}`).join(', ');
  if (versions.length > 1) {
    failed = true;
    console.error(`FAIL ${pkg} [${tier}]: ${detail}`);
  } else {
    console.log(`ok   ${pkg} [${tier}]: ${detail}`);
  }
};

for (const pkg of SHARED) {
  const declared = [];
  const resolved = [];
  for (const { name, dir } of REPOS) {
    const pj = readJson(path.join(dir, 'package.json'));
    const range = (pj.dependencies || {})[pkg] || (pj.devDependencies || {})[pkg];
    if (range) declared.push({ repo: name, version: range.replace(/^[\^~]/, '') });
    const installed = path.join(dir, 'node_modules', pkg, 'package.json');
    if (fs.existsSync(installed)) {
      resolved.push({ repo: name, version: readJson(installed).version });
    }
  }
  compareTier(pkg, 'declared', declared);
  compareTier(pkg, 'resolved', resolved);
  if (declared.length < 2 && resolved.length < 2) {
    const single = declared[0] || resolved[0];
    console.log(
      single
        ? `ok   ${pkg}: single source (${single.repo}=${single.version})`
        : `ok   ${pkg}: not declared anywhere (host-provided only)`
    );
  }
}

if (failed) {
  console.error(
    '\n[check-shared-dep-versions] BLOCKED: shared dependency versions drifted across repos. Align them before merging.'
  );
  process.exit(1);
}
console.log('[check-shared-dep-versions] OK — no drift.');
