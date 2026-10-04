/**
 * The desktop shell vendors exactly the host-store index, port, protocol and
 * sqlite modules: copied on their own into an empty directory they load, so
 * none of them imports anything outside that set.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const source = join(dirname(fileURLToPath(import.meta.url)), '../src/host-store');
const VENDORED = ['index.js', 'port.js', 'protocol.js', 'sqlite.js'];
const made = [];
afterEach(() => { made.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })); });

describe('the vendored host-store modules', () => {
  it('load alone, from a directory holding only them', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'host-store-vendored-'));
    made.push(dir);
    VENDORED.forEach((file) => copyFileSync(join(source, file), join(dir, file)));
    const loaded = await import(/* @vite-ignore */ pathToFileURL(join(dir, 'index.js')).href);
    expect(typeof loaded.createHostStorePort).toBe('function');
    expect(loaded.bytes('é')).toBe(2);
  });
});
