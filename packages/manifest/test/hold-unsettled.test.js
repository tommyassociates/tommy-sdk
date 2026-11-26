import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validateManifest, parseManifest } from '../src/index.js';

const BASE = readFileSync(fileURLToPath(new URL('./fixtures/valid-minimal.yml', import.meta.url)), 'utf8');
const ANCHOR = '    sideEffect: local_write\n    idempotency: derived_from_input\n    offlineReplayable: true\n';
const withActivity = (block) => { expect(BASE).toContain(ANCHOR); return BASE.replace(ANCHOR, block); };
const errorsOf = (yaml) => { const r = validateManifest(yaml); return r.ok ? [] : r.errors.map((e) => `${e.rule || ''} ${e.message || ''}`); };
const HOLD = '    holdUnsettled:\n      key: [name]\n      holdCodes: [SEND_IN_PROGRESS]\n      keepCodes: [NOT_FOUND]\n      settleCodes: [MAIL_HANDOFF_FAILED]\n';

describe('holdUnsettled on an activity', () => {
  it('a client-key server write that is not offline-replayable may declare it', () => {
    const yaml = withActivity(`    sideEffect: server_write\n    idempotency: client_key\n    offlineReplayable: false\n${HOLD}`);
    expect(errorsOf(yaml)).toEqual([]);
    expect(parseManifest(yaml).data.activities.record_thing.holdUnsettled).toEqual({
      key: ['name'], holdCodes: ['SEND_IN_PROGRESS'], keepCodes: ['NOT_FOUND'], settleCodes: ['MAIL_HANDOFF_FAILED'],
    });
  });

  it('is refused beside another key, an offline-replayable write or a local write', () => {
    for (const block of [
      `    sideEffect: server_write\n    idempotency: derived_from_input\n    offlineReplayable: false\n${HOLD}`,
      `    sideEffect: server_write\n    idempotency: client_key\n    offlineReplayable: true\n${HOLD}`,
      `    sideEffect: local_write\n    idempotency: client_key\n    offlineReplayable: false\n${HOLD}`,
    ]) {
      expect(errorsOf(withActivity(block)).join('\n')).toMatch(/hold-unsettled-requires-client-key/);
    }
  });

  it('is closed: a key is required and nothing else is taken', () => {
    const base = '    sideEffect: server_write\n    idempotency: client_key\n    offlineReplayable: false\n';
    expect(errorsOf(withActivity(`${base}    holdUnsettled:\n      holdCodes: [X]\n`)).length).toBeGreaterThan(0);
    expect(errorsOf(withActivity(`${base}    holdUnsettled:\n      key: [name]\n      retry: true\n`)).length).toBeGreaterThan(0);
  });
});
