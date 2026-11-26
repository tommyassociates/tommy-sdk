import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validateManifest, parseManifest } from '../src/index.js';
import { loadSchema } from '../src/schema.js';

const BASE = readFileSync(fileURLToPath(new URL('./fixtures/valid-minimal.yml', import.meta.url)), 'utf8');
const ANCHOR = '    callerPolicy: owner_only\n';

function withCallers(block) {
  expect(BASE).toContain(ANCHOR);
  return BASE.replace(ANCHOR, block);
}

const errorsOf = (yaml) => {
  const r = validateManifest(yaml);
  return r.ok ? [] : r.errors.map((e) => `${e.rule || ''} ${e.message || ''}`);
};

const activityOf = (yaml) => parseManifest(yaml).data.activities.record_thing;

describe('D.40 — callerPolicy on the activity schema', () => {
  it('the activity object DECLARES callerPolicy with exactly the three cases', () => {
    const activity = loadSchema().properties.activities.additionalProperties;
    expect(activity.additionalProperties).toBe(false);
    expect(activity.properties.callerPolicy.enum)
      .toEqual(['owner_only', 'first_party', 'listed']);
  });

  it('accepts owner_only and first_party on their own', () => {
    for (const policy of ['owner_only', 'first_party']) {
      const yaml = withCallers(`    callerPolicy: ${policy}\n`);
      expect(errorsOf(yaml), policy).toEqual([]);
      expect(activityOf(yaml).callerPolicy).toBe(policy);
      expect(activityOf(yaml).authorizedCallers).toBeUndefined();
    }
  });

  it('accepts listed WITH a non-empty authorizedCallers', () => {
    const yaml = withCallers('    callerPolicy: listed\n    authorizedCallers: [time-clock]\n');
    expect(errorsOf(yaml)).toEqual([]);
    expect(activityOf(yaml).authorizedCallers).toEqual(['time-clock']);
  });

  it('REJECTS listed with an absent or empty list — it would collapse to owner-only at the broker', () => {
    for (const block of ['    callerPolicy: listed\n', '    callerPolicy: listed\n    authorizedCallers: []\n']) {
      expect(errorsOf(withCallers(block)).length, JSON.stringify(block)).toBeGreaterThanOrEqual(1);
    }
  });

  it('REJECTS owner_only / first_party beside authorizedCallers — one question, one answer', () => {
    for (const policy of ['owner_only', 'first_party']) {
      const yaml = withCallers(`    callerPolicy: ${policy}\n    authorizedCallers: [time-clock]\n`);
      expect(errorsOf(yaml).length, policy).toBeGreaterThanOrEqual(1);
    }
  });

  it('REJECTS a value outside the three cases', () => {
    expect(errorsOf(withCallers('    callerPolicy: anyone\n')).length).toBeGreaterThanOrEqual(1);
  });

  it('an activity that OMITS callerPolicy is REJECTED (operator ruling 2026-08-19)', () => {
    expect(validateManifest(withCallers('')).ok, 'absent callerPolicy must fail').toBe(false);
    expect(errorsOf(withCallers('')).join(' ')).toContain('callerPolicy');
    expect(validateManifest(withCallers('    authorizedCallers: [time-clock]\n')).ok).toBe(false);
    expect(validateManifest(withCallers('    callerPolicy: listed\n    authorizedCallers: [time-clock]\n')).ok).toBe(true);
    expect(validateManifest(BASE).ok).toBe(true);
  });

  it('the schema and the BROKER agree on the field name and the three values', () => {
    const broker = readFileSync(
      fileURLToPath(new URL('../../actions-runtime/src/broker.js', import.meta.url)),
      'utf8',
    );
    expect(broker).toContain('activityDef.callerPolicy');
    for (const policy of loadSchema().properties.activities.additionalProperties.properties.callerPolicy.enum) {
      expect(broker, policy).toContain(`${policy}:`);
    }
  });
});
