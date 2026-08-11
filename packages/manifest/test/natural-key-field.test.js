// L22 — `naturalKeyField` must be REACHABLE from a manifest.
//
// The bug this pins: the broker's `idempotencyKeyFor` has always read
// `activityDef.naturalKeyField || 'id'` (actions-runtime `src/broker.js`), but
// the activity object in the manifest schema is `additionalProperties: false`
// and did not list the field. So no manifest could ever declare it, every
// `idempotency: natural_key` activity in the estate keyed on `args.id`, and
// where an activity has no `args.id` the broker fell through to hashing the
// whole args — i.e. `natural_key` was indistinguishable from
// `derived_from_input` for most of the estate.
//
// These tests fail on the pre-fix schema (case 1 was an `unknown-field`
// schema error) and pin the three things that must stay true: it validates,
// it is refused where it would be a silent no-op, and the string the schema
// accepts is the string the broker resolves.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validateManifest, parseManifest } from '../src/index.js';
import { loadSchema } from '../src/schema.js';

const BASE = readFileSync(fileURLToPath(new URL('./fixtures/valid-minimal.yml', import.meta.url)), 'utf8');
const ANCHOR = '    sideEffect: local_write\n    idempotency: derived_from_input\n';

/** valid-minimal with its one activity's idempotency block rewritten. */
function withActivity(block) {
  expect(BASE).toContain(ANCHOR); // the anchor must still exist in the fixture
  return BASE.replace(ANCHOR, block);
}

const errorsOf = (yaml) => {
  const r = validateManifest(yaml);
  return r.ok ? [] : r.errors.map((e) => `${e.rule || ''} ${e.message || ''}`);
};

const activityOf = (yaml) => parseManifest(yaml).data.activities.record_thing;

describe('L22 — naturalKeyField on the activity schema', () => {
  it('the activity object DECLARES naturalKeyField (it was unreachable behind additionalProperties:false)', () => {
    const schema = loadSchema();
    const activity = schema.properties.activities.additionalProperties;
    expect(activity.additionalProperties).toBe(false); // still closed…
    expect(activity.properties).toHaveProperty('naturalKeyField'); // …but the field is now in it
    expect(activity.properties.naturalKeyField.type).toBe('string');
  });

  it('a natural_key activity may now declare naturalKeyField — this is the case that used to fail', () => {
    const yaml = withActivity(
      '    sideEffect: local_write\n'
      + '    idempotency: natural_key\n'
      + '    naturalKeyField: token\n',
    );
    const result = validateManifest(yaml);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
    expect(activityOf(yaml).naturalKeyField).toBe('token');
  });

  it('accepts a DOTTED path, because the broker resolves one (dottedGet)', () => {
    const yaml = withActivity(
      '    sideEffect: local_write\n'
      + '    idempotency: natural_key\n'
      + '    naturalKeyField: invitation.token\n',
    );
    expect(validateManifest(yaml).ok).toBe(true);
    expect(activityOf(yaml).naturalKeyField).toBe('invitation.token');
  });

  it('REJECTS naturalKeyField beside any other idempotency strategy — it would be a silent no-op', () => {
    for (const strategy of ['client_key', 'derived_from_input', 'none']) {
      const yaml = withActivity(
        '    sideEffect: local_write\n'
        + `    idempotency: ${strategy}\n`
        + '    naturalKeyField: token\n',
      ).replace('    offlineReplayable: true\n', '    offlineReplayable: false\n');
      const errors = errorsOf(yaml);
      expect(errors.length, `${strategy} must be rejected`).toBeGreaterThanOrEqual(1);
      expect(errors.join(' '), `${strategy} must be named honestly`)
        .toContain('natural-key-field-requires-natural-key');
    }
  });

  it('REJECTS a field name that is not a property path (the broker would resolve undefined and key on the whole args)', () => {
    for (const bad of ['', 'has spaces', 'a..b', '.leading', 'trailing.']) {
      const yaml = withActivity(
        '    sideEffect: local_write\n'
        + '    idempotency: natural_key\n'
        + `    naturalKeyField: "${bad}"\n`,
      );
      expect(errorsOf(yaml).length, `'${bad}' must be rejected`).toBeGreaterThanOrEqual(1);
    }
  });

  it('the schema and the BROKER agree on the field name — the two cannot drift apart silently', () => {
    const broker = readFileSync(
      fileURLToPath(new URL('../../actions-runtime/src/broker.js', import.meta.url)),
      'utf8',
    );
    // If the broker ever renames its read, this test fails rather than leaving
    // a manifest field that validates and does nothing.
    expect(broker).toContain("activityDef.naturalKeyField || 'id'");
  });

  it('omitting it stays legal — the default is still args.id, so this change is purely additive', () => {
    const yaml = withActivity(
      '    sideEffect: local_write\n'
      + '    idempotency: natural_key\n',
    );
    expect(validateManifest(yaml).ok).toBe(true);
    expect(activityOf(yaml).naturalKeyField).toBeUndefined();
  });
});
