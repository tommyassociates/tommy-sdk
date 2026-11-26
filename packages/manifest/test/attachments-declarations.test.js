// Level-21 declaration: a write may carry files by reference (attachments).
// Only a queued client-key server write may, and each named field is a
// top-level array argument.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validateManifest, parseManifest } from '../src/index.js';

const BASE = readFileSync(fileURLToPath(new URL('./fixtures/valid-minimal.yml', import.meta.url)), 'utf8');
const ACTIVITY = `    sideEffect: local_write
    idempotency: derived_from_input
    offlineReplayable: true
    inputSchema:
      type: object
      additionalProperties: false
      properties:
        id: { type: string }
`;
const errorsOf = (yaml) => { const r = validateManifest(yaml); return r.ok ? [] : r.errors; };

function manifestWith({
  sideEffect = 'server_write', idempotency = 'client_key', offlineReplayable = true, attachments, files = '{ type: array, items: { type: object } }',
} = {}) {
  const lines = [
    `    sideEffect: ${sideEffect}`,
    `    idempotency: ${idempotency}`,
    `    offlineReplayable: ${offlineReplayable}`,
    ...(attachments ? [`    attachments: ${JSON.stringify(attachments)}`] : []),
    '    inputSchema:',
    '      type: object',
    '      additionalProperties: false',
    '      properties:',
    '        id: { type: string }',
    `        files: ${files}`,
    '        note: { type: string }',
  ];
  const yaml = BASE.replace(ACTIVITY, `${lines.join('\n')}\n`);
  if (yaml === BASE) throw new Error('fixture anchor moved');
  return yaml;
}

describe('activity attachments', () => {
  it('a queued client-key server write may declare them, with the declared values', () => {
    const yaml = manifestWith({ attachments: { fields: ['files'], maxFiles: 10, maxBytesEach: 26214400, accept: ['image/*', 'application/pdf'] } });
    expect(errorsOf(yaml)).toEqual([]);
    expect(parseManifest(yaml).data.activities.record_thing.attachments).toEqual({
      fields: ['files'], maxFiles: 10, maxBytesEach: 26214400, accept: ['image/*', 'application/pdf'],
    });
  });

  it('fields alone is enough', () => {
    expect(errorsOf(manifestWith({ attachments: { fields: ['files'] } }))).toEqual([]);
  });

  it.each([
    ['a local write', { sideEffect: 'local_write', idempotency: 'client_key' }],
    ['a derived key', { idempotency: 'derived_from_input' }],
    ['a write that is not replayed', { offlineReplayable: false }],
  ])('%s is refused with attachments-require-queued-client-key', (_, shape) => {
    const rules = errorsOf(manifestWith({ ...shape, attachments: { fields: ['files'] } })).map((e) => e.rule);
    expect(rules).toContain('attachments-require-queued-client-key');
  });

  it('a field that is not a top-level array argument is refused', () => {
    expect(errorsOf(manifestWith({ attachments: { fields: ['note'] } })).map((e) => e.rule)).toContain('attachments-fields-are-arrays');
    expect(errorsOf(manifestWith({ attachments: { fields: ['missing'] } })).map((e) => e.rule)).toContain('attachments-fields-are-arrays');
    expect(errorsOf(manifestWith({ attachments: { fields: ['files'] }, files: '{ type: object }' })).map((e) => e.rule)).toContain('attachments-fields-are-arrays');
  });

  it.each([
    ['no fields', {}],
    ['an empty fields list', { fields: [] }],
    ['more than 10 files', { fields: ['files'], maxFiles: 11 }],
    ['a file over 25 MB', { fields: ['files'], maxBytesEach: 26214401 }],
    ['a malformed type', { fields: ['files'], accept: ['images'] }],
    ['an unknown key', { fields: ['files'], keepForever: true }],
  ])('%s is a shape error', (_, attachments) => {
    expect(errorsOf(manifestWith({ attachments })).length).toBeGreaterThan(0);
  });
});
