import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

describe('public host forecasting and holiday types', () => {
  it('compiles the real host DTO contract and rejects invalid command/result shapes', () => {
    const compiler = fileURLToPath(new URL('../../../node_modules/typescript/bin/tsc', import.meta.url));
    const project = fileURLToPath(new URL('./fixtures/host-forecasting.tsconfig.json', import.meta.url));
    expect(execFileSync(process.execPath, [compiler, '--project', project], { encoding: 'utf8' })).toBe('');
  });
});
