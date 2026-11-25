#!/usr/bin/env node
// The host provides one copy of vue/vuex/framework7; a different resolved version means environments disagree.
const fs = require('fs');
const path = require('path');

const SHARED = ['vue', 'vuex', 'framework7', 'framework7-vue'];
const repoRoot = path.resolve(__dirname, '..');
const workspace = path.resolve(repoRoot, '..');
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
