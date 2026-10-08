import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

describe('public Scheduling pay context types', () => {
  it('keeps nullable readonly scalars and invalidation-only follows', () => {
    const compiler = fileURLToPath(new URL('../../../node_modules/typescript/bin/tsc', import.meta.url));
    const project = fileURLToPath(new URL('./fixtures/host-pay-template.tsconfig.json', import.meta.url));
    expect(execFileSync(process.execPath, [compiler, '--project', project], { encoding: 'utf8' })).toBe('');
  });
});
