import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

describe('public canonical Timesheet host types', () => {
  it('preserves exact absence, omitted fields and invalidation-only notices', () => {
    const compiler = fileURLToPath(new URL('../../../node_modules/typescript/bin/tsc', import.meta.url));
    const project = fileURLToPath(new URL('./fixtures/host-timesheet.tsconfig.json', import.meta.url));
    expect(execFileSync(process.execPath, [compiler, '--project', project], { encoding: 'utf8' })).toBe('');
  });
});
