import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildSdk as createSdk } from '../src/index.js';

describe('host API level 21 attachment types', () => {
  it('types the attachments member, the invoke summary and the receipt files', () => {
    const compiler = fileURLToPath(new URL('../../../node_modules/typescript/bin/tsc', import.meta.url));
    const project = fileURLToPath(new URL('./fixtures/attachments.tsconfig.json', import.meta.url));
    expect(execFileSync(process.execPath, [compiler, '--project', project], { encoding: 'utf8' })).toBe('');
  });
});

describe('invoke summary', () => {
  const sdkWith = (calls) => createSdk({
    init: { mpId: 'documents' },
    adapter: { rpc: async (call) => { calls.push(call); return { status: 'succeeded' }; }, subscribe: () => () => {} },
  });

  it('travels to the host with the write', async () => {
    const calls = [];
    await sdkWith(calls).actions.invoke('documents.submit_document', {}, { idempotencyKey: 'k', summary: 'Police check' });
    expect(calls[0]).toMatchObject({ kind: 'invoke', idempotencyKey: 'k', summary: 'Police check' });
  });

  it('is left out when not given, and refused when it is not text', async () => {
    const calls = [];
    await sdkWith(calls).actions.invoke('documents.submit_document', {}, { idempotencyKey: 'k' });
    expect(calls[0]).not.toHaveProperty('summary');
    await expect(sdkWith(calls).actions.invoke('documents.submit_document', {}, { summary: 7 })).rejects.toMatchObject({ code: 'InvalidPayload' });
  });
});
