// A device store's indexes are never unique: uniqueness is the server's to
// enforce. A localData index may still say `unique: false`, which changes
// nothing; `unique: true` is refused with a message saying so, and no
// device-store code reads a `unique` declaration.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateManifest } from '../src/index.js';

const BASE = readFileSync(fileURLToPath(new URL('./fixtures/valid-minimal.yml', import.meta.url)), 'utf8');

function withIndex(index) {
  return `${BASE.trimEnd()}\nlocalData:\n  codes:\n    keyPath: id\n    syncStrategy: server_authoritative\n    recordSchema:\n      type: object\n      properties:\n        id: { type: string }\n        code: { type: string }\n    indexes:\n      - ${index}\n`;
}

describe('localData indexes on device stores', () => {
  it('accepts a plain index', () => {
    expect(validateManifest(withIndex('{ name: by_code, keyPath: code }')).ok).toBe(true);
  });

  it('accepts unique: false, which changes nothing', () => {
    expect(validateManifest(withIndex('{ name: by_code, keyPath: code, unique: false }')).ok).toBe(true);
  });

  it('refuses unique: true, saying the server enforces uniqueness', () => {
    const result = validateManifest(withIndex('{ name: by_code, keyPath: code, unique: true }'));
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([expect.objectContaining({
      rule: 'unique-index-unsupported',
      message: expect.stringContaining('unique indexes are not supported on device stores; the server enforces uniqueness'),
    })]);
  });

  it('leaves no device-store code reading a unique declaration', () => {
    const root = fileURLToPath(new URL('../../', import.meta.url));
    const sources = [];
    const walk = (dir) => readdirSync(dir).forEach((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(js|mjs|ts)$/.test(name) && !name.endsWith('.d.ts')) sources.push(path);
    });
    walk(join(root, 'offline-sync/src'));
    const readers = sources.filter((path) => /\.unique\b|\bunique:|['"]unique['"]|unique-indexes|checkUnique|uniqueHolders/
      .test(readFileSync(path, 'utf8')));
    expect(readers).toEqual([]);
  });
});
