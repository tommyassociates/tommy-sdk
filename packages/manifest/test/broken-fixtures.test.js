// ac3 — every fixture in test/fixtures/broken/ fails with its NAMED, LINE-LOCATED
// rule. Each fixture filename IS the rule it must trigger, exercising all five
// validation layers (yaml → schema → catalogue → cross-reference → semantic).

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validateFile } from '../src/index.js';

const BROKEN_DIR = fileURLToPath(new URL('./fixtures/broken/', import.meta.url));
const fixtures = readdirSync(BROKEN_DIR).filter((f) => f.endsWith('.yml'));

// filename (minus .yml) === the rule the first error must carry.
const EXPECTED_LAYER = {
  'yaml-syntax': 1,
  'missing-required-field': 2,
  'unknown-field': 2,
  'invalid-enum-value': 2,
  'malformed-scope': 2,
  'permission-not-in-catalogue': 3,
  'unresolved-trigger': 4,
  'unresolved-activity': 4,
  'unresolved-computed-function': 4,
  'unresolved-data-requirement': 4,
  'offline-replay-requires-idempotency': 5,
  'debounced-requires-debounceMs': 5,
  'custom-sync-requires-resolver': 5,
};

// A few fixtures where the offending token must appear on the reported line —
// proves line-location is real, not a constant fallback.
const LINE_MUST_CONTAIN = {
  'malformed-scope': 'READ:team_members',
  'permission-not-in-catalogue': 'write:payroll_export',
  'invalid-enum-value': 'teleportation',
  'unresolved-data-requirement': 'ghost_condition',
  'unresolved-trigger': 'ghost_trigger',
  'unresolved-activity': 'ghost_activity',
  'unresolved-computed-function': 'ghost_function',
};

describe('broken-fixture corpus', () => {
  it('covers every fixture with a known expected layer', () => {
    for (const f of fixtures) {
      expect(EXPECTED_LAYER, `no expected layer for fixture ${f}`).toHaveProperty(f.replace(/\.yml$/, ''));
    }
    // all five layers exercised
    expect(new Set(Object.values(EXPECTED_LAYER))).toEqual(new Set([1, 2, 3, 4, 5]));
  });

  for (const f of fixtures) {
    const rule = f.replace(/\.yml$/, '');
    it(`${f} → fails with named, line-located rule '${rule}'`, () => {
      const path = fileURLToPath(new URL(`./fixtures/broken/${f}`, import.meta.url));
      const result = validateFile(path);
      const lines = readFileSync(path, 'utf8').split('\n');

      expect(result.ok).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(1);

      const first = result.errors[0];
      expect(first.rule, `${f} first-error rule`).toBe(rule);
      expect(first.layer).toBe(EXPECTED_LAYER[rule]);
      expect(typeof first.message).toBe('string');
      expect(first.message.length).toBeGreaterThan(0);

      // line-located: a valid 1-based line within the file.
      expect(Number.isInteger(first.line)).toBe(true);
      expect(first.line).toBeGreaterThanOrEqual(1);
      expect(first.line).toBeLessThanOrEqual(lines.length);

      if (LINE_MUST_CONTAIN[rule]) {
        expect(lines[first.line - 1]).toContain(LINE_MUST_CONTAIN[rule]);
      }
    });
  }
});
