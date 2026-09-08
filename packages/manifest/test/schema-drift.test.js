import { afterEach, describe, expect, it } from 'vitest';
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const script = fileURLToPath(new URL('../scripts/check-schema-drift.mjs', import.meta.url));
const schema = fileURLToPath(new URL('../src/schema/manifest-schema.json', import.meta.url));
const directories = [];
function sourcePath() {
  const directory = mkdtempSync(join(tmpdir(), 'tommy-schema-drift-'));
  directories.push(directory);
  return join(directory, 'manifest-schema.json');
}
function check(path) {
  const env = { ...process.env, MP_MANIFEST_DESIGN_SOURCE: path };
  delete env.MP_REFERENCE_MANIFEST_SOURCE;
  return spawnSync(process.execPath, [script], { env, encoding: 'utf8' });
}
afterEach(() => directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })));

describe('schema drift source selection', () => {
  it('checks both embedded runtimes and a relocated explicit schema positively', () => {
    const path = sourcePath();
    copyFileSync(schema, path);
    const result = check(path);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('manifest-schema (SDK browser runtime): byte-identical');
    expect(result.stdout).toContain('permission-catalogue (SDK browser runtime): byte-identical');
    expect(result.stdout).toContain('explicit current manifest design source: byte-identical');
    expect(result.stdout).not.toContain('skipping');
  });
  it('fails when an explicitly requested source is absent', () => {
    const result = check(sourcePath());
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('required copy missing');
  });
  it('fails byte drift even when JSON semantics remain equal', () => {
    const path = sourcePath();
    copyFileSync(schema, path);
    writeFileSync(path, '\n', { flag: 'a' });
    const result = check(path);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('DRIFT');
  });
});
