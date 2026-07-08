// CLI contract — exit codes (0 ok · 1 checkable failure · 2 usage/IO) and the
// typegen subcommand emitting typed contracts for the MP's own primitives.

import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCli, typegenFromSource } from '../src/index.js';

const REF = fileURLToPath(new URL('./fixtures/reference-manifest.yml', import.meta.url));
const BROKEN = fileURLToPath(new URL('./fixtures/broken/malformed-scope.yml', import.meta.url));

function capture() {
  const out = [];
  const err = [];
  return { io: { out: (s) => out.push(s), err: (s) => err.push(s) }, out, err };
}

describe('cli exit codes', () => {
  it('valid manifest → 0', async () => {
    const c = capture();
    expect(await runCli(['manifest', 'validate', REF], c.io)).toBe(0);
  });

  it('valid manifest --json → 0 and machine-readable ok:true', async () => {
    const c = capture();
    const code = await runCli(['manifest', 'validate', REF, '--json'], c.io);
    expect(code).toBe(0);
    expect(JSON.parse(c.out[0]).ok).toBe(true);
  });

  it('invalid manifest → 1', async () => {
    const c = capture();
    expect(await runCli(['manifest', 'validate', BROKEN], c.io)).toBe(1);
  });

  it('missing file → 2', async () => {
    const c = capture();
    expect(await runCli(['manifest', 'validate', '/no/such/manifest.yml'], c.io)).toBe(2);
  });

  it('missing file --json → 2 with the standard { ok, manifestId, errors } shape', async () => {
    const c = capture();
    const code = await runCli(['manifest', 'validate', '/no/such/manifest.yml', '--json'], c.io);
    expect(code).toBe(2);
    const out = JSON.parse(c.out[0]);
    expect(out).toMatchObject({ ok: false, manifestId: null });
    expect(Array.isArray(out.errors)).toBe(true);
    expect(out.errors[0].rule).toBe('io-error');
  });

  it('validating a directory --json → 2 with io-error (not a raw stack)', async () => {
    const c = capture();
    const dir = fileURLToPath(new URL('./fixtures/', import.meta.url));
    const code = await runCli(['manifest', 'validate', dir, '--json'], c.io);
    expect(code).toBe(2);
    expect(JSON.parse(c.out[0]).errors[0].rule).toBe('io-error');
    expect(c.err).toEqual([]); // no stack trace on stderr
  });

  it('a value flag that swallows a following flag → 2', async () => {
    const c = capture();
    // `-o --json`: --json must not be consumed as the output dir.
    expect(await runCli(['manifest', 'typegen', REF, '-o', '--json'], c.io)).toBe(2);
  });

  it('an unknown short flag → 2 (not treated as the path)', async () => {
    const c = capture();
    expect(await runCli(['manifest', 'validate', '-xy'], c.io)).toBe(2);
  });

  it('catalogue accepts an explicit --catalogue path', async () => {
    const c = capture();
    const cat = fileURLToPath(new URL('../src/catalogue/permission-catalogue.json', import.meta.url));
    const code = await runCli(['manifest', 'catalogue', '--catalogue', cat, '--json'], c.io);
    expect(code).toBe(0);
    expect(JSON.parse(c.out[0]).permissions.length).toBeGreaterThan(0);
  });

  it('bad usage → 2', async () => {
    const c = capture();
    expect(await runCli(['manifest', 'nonsense'], c.io)).toBe(2);
  });

  it('explain known scope → 0, unknown scope → 1', async () => {
    const ok = capture();
    expect(await runCli(['manifest', 'explain', 'read:team_members'], ok.io)).toBe(0);
    const bad = capture();
    expect(await runCli(['manifest', 'explain', 'read:nonsense_scope'], bad.io)).toBe(1);
  });

  it('catalogue → 0 and lists scopes', async () => {
    const c = capture();
    expect(await runCli(['manifest', 'catalogue', '--json'], c.io)).toBe(0);
    expect(JSON.parse(c.out[0]).permissions.length).toBeGreaterThan(0);
  });
});

describe('typegen', () => {
  it('emits typed contracts for the MP\'s own primitives', async () => {
    const dts = await typegenFromSource(readFileSync(REF, 'utf8'));
    expect(dts).toContain('TeamCheckinTriggers');
    expect(dts).toContain('TeamCheckinActivities');
    expect(dts).toContain('TeamCheckinActionId');
  });

  it('cli typegen writes <id>.contracts.d.ts → 0', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tommy-typegen-'));
    const c = capture();
    const code = await runCli(['manifest', 'typegen', REF, '-o', dir], c.io);
    expect(code).toBe(0);
    const outFile = join(dir, 'team-checkin.contracts.d.ts');
    expect(existsSync(outFile)).toBe(true);
    expect(readFileSync(outFile, 'utf8')).toContain('TeamCheckinTriggers');
  });
});
