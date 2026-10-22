/**
 * CI's sibling checkout (scripts/clone-ci-sibling.sh) against a fake `git`:
 * the same-named sibling branch when it exists, the release branch
 * (mp-platform-rc6, or CI_SIBLING_FALLBACK_BRANCH) only once the branch is
 * proven missing, and no checkout at all on an auth or transport failure.
 */
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('./clone-ci-sibling.sh', import.meta.url));
const dirs = [];
after(() => { dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })); });

function checkout({ requested = 'feature/repair', exists = {}, fallback } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'ci-sibling-'));
  dirs.push(dir);
  const trace = join(dir, 'calls');
  writeFileSync(join(dir, 'git'), `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.TRACE, JSON.stringify(args) + '\\n');
const answers = JSON.parse(process.env.TEST_EXISTS);
if (args[0] === 'ls-remote') {
  const branch = args.at(-1).replace('refs/heads/', '');
  process.exit(branch in answers ? answers[branch] : 2);
}
if (args[0] === 'clone') fs.writeFileSync(process.env.TRACE + '.branch', args[args.indexOf('--branch') + 1]);
if (args[2] === 'branch') console.log(fs.readFileSync(process.env.TRACE + '.branch', 'utf8'));
if (args[2] === 'rev-parse' || args[2] === 'log') console.log('1234567');
`, { mode: 0o700 });
  const env = { ...process.env, PATH: `${dir}:${process.env.PATH}`, TRACE: trace, CIRCLE_BRANCH: requested, TEST_EXISTS: JSON.stringify(exists) };
  delete env.CI_SIBLING_FALLBACK_BRANCH;
  if (fallback) env.CI_SIBLING_FALLBACK_BRANCH = fallback;
  const result = spawnSync('bash', [SCRIPT, 'git@github.com:example/sibling.git', join(dir, 'checkout')], { env, encoding: 'utf8', timeout: 5000 });
  const calls = existsSync(trace) ? readFileSync(trace, 'utf8').trim().split('\n').map((row) => JSON.parse(row)) : [];
  const clone = calls.find((args) => args[0] === 'clone');
  return { status: result.status, stderr: result.stderr, branch: clone ? clone[clone.indexOf('--branch') + 1] : null };
}


test('checks out the same-named sibling branch when it exists', () => {
  const result = checkout({ exists: { 'feature/repair': 0 } });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.branch, 'feature/repair');
});

test('falls back to the release branch only once the branch is proven missing', () => {
  const result = checkout({ exists: { 'mp-platform-rc6': 0 } });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.branch, 'mp-platform-rc6');
});

test('honours CI_SIBLING_FALLBACK_BRANCH', () => {
  const result = checkout({ exists: { 'mp-platform-rc7': 0 }, fallback: 'mp-platform-rc7' });
  assert.equal(result.branch, 'mp-platform-rc7');
});

for (const code of [1, 128]) {
  test(`stops on an auth or transport failure (git exit ${code}) without a checkout`, () => {
    const result = checkout({ exists: { 'feature/repair': code, 'mp-platform-rc6': 0 } });
    assert.notEqual(result.status, 0);
    assert.equal(result.branch, null);
  });
}
