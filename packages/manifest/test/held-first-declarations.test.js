// Level-20 declarations: an activity may keep its refused queued writes
// (keepRefused, only when offline-replayable); a condition may be held first
// (heldFirst) and describe how its held answer ages and is retried (freshness,
// only with heldFirst). Replays the contract fixture's cases, each grafted onto
// the compact valid manifest.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validateManifest, parseManifest } from '../src/index.js';

const BASE = readFileSync(fileURLToPath(new URL('./fixtures/valid-minimal.yml', import.meta.url)), 'utf8');
const FIXTURE = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/hds-contract/J10-manifest-declarations-valid-and-invalid.json', import.meta.url)), 'utf8'));
const ACTIVITY = '    sideEffect: local_write\n    idempotency: derived_from_input\n    offlineReplayable: true\n';
const CONDITION = '    latencyBudgetMs: 200\n';
const errorsOf = (yaml) => { const r = validateManifest(yaml); return r.ok ? [] : r.errors; };

const yamlLines = (obj, indent) => Object.entries(obj).map(([key, value]) => {
  if (Array.isArray(value)) return `${indent}${key}: [${value.map((v) => JSON.stringify(v)).join(', ')}]\n`;
  if (value && typeof value === 'object') return `${indent}${key}:\n${yamlLines(value, `${indent}  `)}`;
  return `${indent}${key}: ${JSON.stringify(value)}\n`;
}).join('');

/** The base manifest with the fixture's abbreviated activity and condition keys laid over its own. */
function manifestFor(payload) {
  let yaml = BASE;
  const [activity] = Object.values(payload.activities ?? {});
  if (activity) {
    const keys = { sideEffect: 'local_write', idempotency: 'derived_from_input', offlineReplayable: true, ...activity };
    yaml = yaml.replace(ACTIVITY, yamlLines(keys, '    '));
  }
  const [condition] = Object.values(payload.conditions ?? {});
  if (condition) {
    const keys = { latencyBudgetMs: 200, ...condition };
    yaml = yaml.replace(CONDITION, yamlLines(keys, '    '));
  }
  return yaml;
}

const RULE_FOR = {
  'keep-refused-requires-offline-replay': (e) => e.rule === 'keep-refused-requires-offline-replay',
  'freshness-needs-held-first': (e) => e.rule === 'freshness-needs-held-first',
  'schema: retryAfterMs ascending': (e) => e.rule === 'retry-steps-ascending' && e.layer === 2,
  'schema: additionalProperties': (e) => e.rule === 'unknown-field' && e.layer === 2,
};

describe('level-20 manifest declarations (contract fixture J10)', () => {
  for (const step of FIXTURE.timeline) {
    it(`${step.case}: ${step.result === 'ok' ? 'valid' : step.result.error}`, () => {
      const yaml = manifestFor(step.payload);
      const errors = errorsOf(yaml);
      if (step.result === 'ok') {
        expect(errors).toEqual([]);
        return;
      }
      const match = RULE_FOR[step.result.error];
      expect(match, `no rule mapped for ${step.result.error}`).toBeTypeOf('function');
      expect(errors.some(match), JSON.stringify(errors)).toBe(true);
    });
  }

  it('the valid case parses with the declared values', () => {
    const data = parseManifest(manifestFor(FIXTURE.timeline[0].payload)).data;
    expect(data.activities.record_thing.keepRefused).toBe(true);
    expect(data.conditions.is_ready.heldFirst).toBe(true);
    expect(data.conditions.is_ready.freshness).toEqual({ showAgeMs: 43200000, refreshAfterMs: 300000, retryAfterMs: [4000, 12000], sources: ['workforce.attendances'] });
  });
});

describe('level-20 declaration bounds', () => {
  const withCondition = (freshness, heldFirst = true) => manifestFor({ conditions: { c: { heldFirst, freshness } } });
  const ok = (yaml) => expect(errorsOf(yaml)).toEqual([]);
  const bad = (yaml) => expect(errorsOf(yaml).length).toBeGreaterThan(0);

  it('keepRefused false needs nothing; heldFirst alone is valid', () => {
    ok(manifestFor({ activities: { a: { offlineReplayable: false, keepRefused: false } } }));
    ok(manifestFor({ conditions: { c: { heldFirst: true } } }));
    ok(manifestFor({ conditions: { c: { heldFirst: false } } }));
  });

  it('heldFirst false with freshness is refused like no heldFirst', () => {
    expect(errorsOf(withCondition({ showAgeMs: 60000 }, false)).map((e) => e.rule)).toContain('freshness-needs-held-first');
  });

  it('showAgeMs is 1,000 to 604,800,000', () => {
    ok(withCondition({ showAgeMs: 1000 }));
    ok(withCondition({ showAgeMs: 604800000 }));
    bad(withCondition({ showAgeMs: 999 }));
    bad(withCondition({ showAgeMs: 604800001 }));
    bad(withCondition({ showAgeMs: 1500.5 }));
  });

  it('refreshAfterMs is 0 to 86,400,000', () => {
    ok(withCondition({ refreshAfterMs: 0 }));
    ok(withCondition({ refreshAfterMs: 86400000 }));
    bad(withCondition({ refreshAfterMs: -1 }));
    bad(withCondition({ refreshAfterMs: 86400001 }));
  });

  it('retryAfterMs is 1 to 3 ascending steps of 1,000 to 60,000', () => {
    ok(withCondition({ retryAfterMs: [4000] }));
    ok(withCondition({ retryAfterMs: [1000, 4000, 60000] }));
    bad(withCondition({ retryAfterMs: [] }));
    bad(withCondition({ retryAfterMs: [1000, 2000, 3000, 4000] }));
    bad(withCondition({ retryAfterMs: [999] }));
    bad(withCondition({ retryAfterMs: [60001] }));
    expect(errorsOf(withCondition({ retryAfterMs: [4000, 4000] })).map((e) => e.rule)).toContain('retry-steps-ascending');
  });

  it('sources are 0 to 10 host collection ids', () => {
    ok(withCondition({ sources: [] }));
    ok(withCondition({ sources: Array.from({ length: 10 }, (_, i) => `workforce.c${'abcdefghij'[i]}`) }));
    bad(withCondition({ sources: Array.from({ length: 11 }, (_, i) => `workforce.c${'abcdefghijk'[i]}`) }));
    bad(withCondition({ sources: ['Workforce.shifts'] }));
    bad(withCondition({ sources: ['workforce'] }));
    bad(withCondition({ sources: ['workforce.shifts.byRange'] }));
  });

  it('keepRefused and heldFirst must be booleans', () => {
    bad(manifestFor({ activities: { a: { keepRefused: 'yes' } } }));
    bad(manifestFor({ conditions: { c: { heldFirst: 1 } } }));
  });
});
