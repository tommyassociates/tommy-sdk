import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parse, stringify } from 'yaml';
import { validateManifest } from '../src/index.js';

const fixture = () => parse(readFileSync(new URL('./fixtures/reference-manifest.yml', import.meta.url), 'utf8'));

describe('client-subject declaration', () => {
  it('keeps ordinary manifests valid without opting them into client subjects', () => {
    const manifest = fixture();
    expect(manifest.subjectCapabilities).toBeUndefined();
    expect(validateManifest(stringify(manifest)).ok).toBe(true);
  });

  it('requires a supported version and a panel declared in the same manifest', () => {
    const manifest = fixture();
    const panelId = manifest.panels[0].id;
    manifest.subjectCapabilities = { client_access: { version: 1, panelIds: [panelId] } };
    expect(validateManifest(stringify(manifest)).errors).toEqual([]);
    manifest.subjectCapabilities.client_access.panelIds = ['missing-panel'];
    expect(validateManifest(stringify(manifest)).errors.some((e) => e.rule === 'unresolved-subject-panel')).toBe(true);
    manifest.subjectCapabilities.client_access = { version: 2, panelIds: [panelId] };
    expect(validateManifest(stringify(manifest)).ok).toBe(false);
  });
});
