// A store's declared schema is the manifest's `localData` entry, and the host
// owns two kinds of store beside the declared ones: `prefs` (tommy.prefs) and
// `<name>__unfit` (rows a schema change set aside). A manifest can declare a
// store's `schemaVersion`, never one of those names, and never a name too
// long for its `__unfit` sibling to keep within 64 characters.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validateManifest } from '../src/index.js';

const BASE = readFileSync(fileURLToPath(new URL('./fixtures/valid-minimal.yml', import.meta.url)), 'utf8');

/** valid-minimal with one declared store. */
function withStore(name, extra = '') {
  return `${BASE.trimEnd()}\nlocalData:\n  ${name}:\n    keyPath: id\n    syncStrategy: last_write_wins\n${extra}    recordSchema:\n      type: object\n      properties:\n        id: { type: string }\n`;
}
const errorsOf = (yaml) => {
  const r = validateManifest(yaml);
  return r.ok ? [] : r.errors.map((e) => `${e.rule || ''} ${e.path || ''} ${e.message || ''}`);
};

describe('localData store names and schema versions', () => {
  it('accepts a store with a schemaVersion', () => {
    expect(errorsOf(withStore('drafts', '    schemaVersion: 2\n'))).toEqual([]);
  });

  it('refuses a schemaVersion below 1', () => {
    expect(errorsOf(withStore('drafts', '    schemaVersion: 0\n'))).not.toEqual([]);
  });

  it('refuses the host-owned store names and names over 57 characters', () => {
    expect(errorsOf(withStore('prefs'))).not.toEqual([]);
    expect(errorsOf(withStore('drafts__unfit'))).not.toEqual([]);
    expect(errorsOf(withStore('d'.repeat(58)))).not.toEqual([]);
    expect(errorsOf(withStore('d'.repeat(57)))).toEqual([]);
  });
});
