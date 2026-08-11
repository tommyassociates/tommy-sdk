// ac4 — the fixed permission catalogue is machine-checkable: non-catalogue scopes
// are rejected with the named `permission-not-in-catalogue` rule + a suggestion,
// and the catalogue itself is well-formed and covers the reference manifest.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validateManifest, loadCatalogue, searchCatalogue, suggestScope } from '../src/index.js';
import { validateFile } from '../src/node.js';

const catalogue = loadCatalogue();
const SCOPE_RE = /^(read|write|invoke):[a-z][a-z0-9_]*$/;
const REF = fileURLToPath(new URL('./fixtures/reference-manifest.yml', import.meta.url));
const NON_CAT = fileURLToPath(new URL('./fixtures/broken/permission-not-in-catalogue.yml', import.meta.url));

describe('permission catalogue enforcement', () => {
  it('rejects a non-catalogue scope with the named rule', () => {
    const result = validateFile(NON_CAT);
    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    const err = result.errors[0];
    expect(err.rule).toBe('permission-not-in-catalogue');
    expect(err.message).toContain('write:payroll_export');
    expect(err.layer).toBe(3);
  });

  it('carries a "did you mean" suggestion for a near-miss scope', () => {
    // read:team_member is one edit from the catalogue's read:team_members.
    const src = [
      'manifestVersion: "1"',
      'id: typo-scope',
      'version: 1.0.0',
      'name: Typo Scope',
      'category: comms',
      'publisher: { id: x, name: X, type: first_party }',
      'permissions: { scopes: [read:team_member] }',
    ].join('\n');
    const result = validateManifest(src);
    expect(result.ok).toBe(false);
    const err = result.errors[0];
    expect(err.rule).toBe('permission-not-in-catalogue');
    expect(err.suggestion).toBe('read:team_members');
  });

  it('accepts every scope the reference manifest requests', () => {
    const result = validateManifest(readFileSync(REF, 'utf8'));
    expect(result.ok).toBe(true); // reference clears the catalogue layer
    for (const scope of ['read:team_members', 'read:team_member_self', 'invoke:device_geolocation']) {
      expect(catalogue.scopes.has(scope)).toBe(true);
    }
  });

  it('suggestScope returns a near neighbour for a typo and null for gibberish', () => {
    expect(suggestScope(catalogue, 'read:team_member')).toBeTruthy();
    expect(suggestScope(catalogue, 'zzzzzzzzzzzzzzzzzzzzzzzz')).toBeNull();
  });
});

// The QUALIFIED per-primitive form. A cross-MP invoke has no domain derivation:
// broker.authorizeInvoke and the server InvokeExecutor both require exactly
// `invoke:<owner>.<activity>`, so that string is the only way a manifest can
// declare the authority it needs — but the schema pattern and the catalogue
// layer used to reject it, which is precisely why seven live cross-MP wirings
// were granted out of band by seed data instead of being declared (convergence
// M08, 2026-08-10). Both layers now admit it; the catalogue is not the right
// authority for a scope addressed by another MP's manifest.
describe('qualified per-primitive scopes', () => {
  const withScopes = (...scopes) => [
    'manifestVersion: "1"',
    'id: qualified-scope-mp',
    'version: 1.0.0',
    'name: Qualified Scope',
    'category: comms',
    'publisher: { id: x, name: X, type: first_party }',
    `permissions: { scopes: [${scopes.join(', ')}] }`,
  ].join('\n');

  it('accepts a cross-MP invoke scope on a hyphenated MP id', () => {
    expect(validateManifest(withScopes('invoke:team-comms.send_message')).ok).toBe(true);
  });

  it('accepts a cross-MP invoke scope on an unhyphenated MP id', () => {
    expect(validateManifest(withScopes('invoke:scheduling.update_shift_from_leave')).ok).toBe(true);
  });

  it('accepts the qualified READ form the broker also honours', () => {
    expect(validateManifest(withScopes('read:time-clock.shift_marked_absent')).ok).toBe(true);
  });

  it('mixes qualified and catalogue scopes in one manifest', () => {
    const result = validateManifest(withScopes('read:leave', 'invoke:team-comms.send_message'));
    expect(result.ok).toBe(true);
  });

  it('is exempt from the catalogue, NOT from the shape rule', () => {
    // No dot -> still an ordinary catalogue lookup, still rejected.
    const flat = validateManifest(withScopes('invoke:send_message'));
    expect(flat.ok).toBe(false);
    expect(flat.errors[0].rule).toBe('permission-not-in-catalogue');

    // Dotted but malformed -> layer 2 rejects it before the catalogue is asked.
    for (const bad of ['invoke:Team-Comms.send_message', 'invoke:team-comms.', 'invoke:.send_message']) {
      const res = validateManifest(withScopes(bad));
      expect(res.ok, `${bad} should not validate`).toBe(false);
      expect(res.errors[0].layer).toBe(2);
    }
  });
});

describe('catalogue integrity', () => {
  it('is versioned and non-empty', () => {
    expect(catalogue.version).toBeTruthy();
    expect(catalogue.permissions.length).toBeGreaterThan(0);
  });

  it('every scope is well-formed, unique, and categorised', () => {
    const seen = new Set();
    for (const p of catalogue.permissions) {
      expect(p.scope, `scope ${p.scope} malformed`).toMatch(SCOPE_RE);
      expect(seen.has(p.scope), `duplicate scope ${p.scope}`).toBe(false);
      seen.add(p.scope);
      expect(catalogue.categories).toContain(p.category);
      expect(['low', 'medium', 'high']).toContain(p.sensitivity);
    }
  });

  it('searchCatalogue filters by substring and category', () => {
    expect(searchCatalogue(catalogue, { search: 'team' }).length).toBeGreaterThan(0);
    const device = searchCatalogue(catalogue, { category: 'device' });
    expect(device.length).toBeGreaterThan(0);
    expect(device.every((p) => p.category === 'device')).toBe(true);
  });
});
