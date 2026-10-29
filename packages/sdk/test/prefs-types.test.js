import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

describe('public prefs types', () => {
  it('reads a pref as nullable unless a fallback is given', () => {
    const compiler = fileURLToPath(new URL('../../../node_modules/typescript/bin/tsc', import.meta.url));
    const project = fileURLToPath(new URL('./fixtures/prefs.tsconfig.json', import.meta.url));
    expect(execFileSync(process.execPath, [compiler, '--project', project], { encoding: 'utf8' })).toBe('');
  });
});
