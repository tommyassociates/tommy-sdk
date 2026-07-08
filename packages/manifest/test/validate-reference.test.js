// ac1 / ac2 — the shipped schema parses and the canonical reference manifest
// validates clean. The reference is vendored (test/fixtures/reference-manifest.yml)
// so this suite is self-contained; when the plans tree is present we also assert
// the vendored copy has not drifted from the design record.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validateManifest, loadSchema } from '../src/index.js';

const REF = fileURLToPath(new URL('./fixtures/reference-manifest.yml', import.meta.url));
const PLANS_REF = fileURLToPath(
  new URL('../../../../plans/refactor-plan/05-deliverables/05-reference-mp/reference-manifest.yml', import.meta.url),
);
const PLANS_SCHEMA = fileURLToPath(
  new URL('../../../../plans/refactor-plan/02-architecture/manifest-schema.json', import.meta.url),
);
const VENDORED_SCHEMA = fileURLToPath(new URL('../src/schema/manifest-schema.json', import.meta.url));

describe('schema + reference manifest', () => {
  it('the shipped schema parses (Draft 2020-12, versioned $id)', () => {
    const schema = loadSchema();
    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(schema.$id).toContain('schema.tommy.app');
    expect(schema.required).toEqual(
      expect.arrayContaining(['manifestVersion', 'id', 'version', 'name', 'publisher', 'category']),
    );
  });

  it('the reference manifest validates clean', () => {
    const result = validateManifest(readFileSync(REF, 'utf8'));
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.manifestId).toBe('team-checkin');
  });

  it('the vendored reference has not drifted from the plans copy (when present)', () => {
    if (!existsSync(PLANS_REF)) return; // standalone sdk CI: nothing to diff against
    expect(readFileSync(REF, 'utf8')).toBe(readFileSync(PLANS_REF, 'utf8'));
  });

  it('the vendored schema has not drifted from the plans copy (when present)', () => {
    if (!existsSync(PLANS_SCHEMA)) return;
    expect(readFileSync(VENDORED_SCHEMA, 'utf8')).toBe(readFileSync(PLANS_SCHEMA, 'utf8'));
  });
});
