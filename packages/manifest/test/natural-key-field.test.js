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
      + '    naturalKeyField: id\n',
    );
    const result = validateManifest(yaml);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
    expect(activityOf(yaml).naturalKeyField).toBe('id');
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

  // ⚠ SUPERSEDED BY D.38 RULING (a), 2026-08-15 — kept, inverted, and NOT
  // deleted, because the assertion it used to make is the whole reason the
  // estate drifted. It read "omitting it stays legal — the default is still
  // args.id, so this change is purely additive". L22 was additive by design and
  // that was right AT THE TIME: the field had just become reachable and nothing
  // declared it yet.
  //
  // Two years of manifests later, 74 of 114 natural_key activities had never
  // declared one, and this test was the thing certifying that as fine. Its
  // premise was also only half true — the broker is `naturalKeyField || 'id'`,
  // so the default is args.id ONLY when the activity has an `id` property; the
  // estate's undeclared ones mostly do not, and they fell through to
  // `n-${JSON.stringify(args)}`, which is `derived_from_input` wearing a
  // different prefix. Omitting the field never meant "key on id". It meant
  // "key on everything, but say otherwise".
  it('omitting it is now REFUSED — L22 was additive, D.38(a) closed the spelling', () => {
    const yaml = withActivity(
      '    sideEffect: local_write\n'
      + '    idempotency: natural_key\n',
    );
    const result = validateManifest(yaml);
    expect(result.ok).toBe(false);
    expect(result.errors.map((e) => e.rule)).toContain('natural-key-requires-field');
  });
});

/**
 * D.38 — the field must name a SCALAR PROPERTY OF THE INPUT, not just look like
 * a name. Both failures below are silent at runtime, which is why they are
 * refused at author time rather than left to a survey.
 *
 * The broker builds the key as `n-${value}` — a template literal. A field
 * pointing at an OBJECT therefore yields `n-[object Object]` for every call,
 * and an ARRAY yields its join. Every invocation collides on one key, so the
 * second DISTINCT write replays the first's stored result instead of applying:
 * the M3 `set_mileage_status` approve→reject failure, reproduced by
 * declaration rather than by omission.
 *
 * A field naming nothing at all is the quieter one: the broker resolves
 * `undefined` and falls back to hashing the whole args, so the manifest
 * advertises a natural key it does not have and the fallback hides it.
 */
describe('D.38 — naturalKeyField must resolve to a scalar identity', () => {
  // `        id: { type: string }` appears three times in the fixture — twice in
  // condition schemas and LAST in the activity's inputSchema, which is the one
  // this rule reads. A plain `.replace` rewrites the first (a condition), so the
  // activity keeps its original property and every case here would test nothing.
  const PROPS_LINE = '        id: { type: string }\n';
  const replaceLast = (source, find, next) => {
    const at = source.lastIndexOf(find);
    expect(at, 'the activity inputSchema anchor must still exist').toBeGreaterThan(-1);
    return source.slice(0, at) + next + source.slice(at + find.length);
  };
  const withInput = (idempotencyBlock, props) => replaceLast(
    BASE.replace(ANCHOR, idempotencyBlock), PROPS_LINE, props,
  );

  it('REFUSES an OBJECT-typed field — every call would collide on the same key', () => {
    const yaml = withInput(
      '    sideEffect: local_write\n'
      + '    idempotency: natural_key\n'
      + '    naturalKeyField: attributes\n',
      '        attributes: { type: object }\n',
    );
    const errors = errorsOf(yaml);
    expect(errors.join(' ')).toContain('natural-key-field-not-scalar');
    expect(errors.join(' ')).toContain('object');
  });

  it('REFUSES an ARRAY-typed field for the same reason', () => {
    const yaml = withInput(
      '    sideEffect: local_write\n'
      + '    idempotency: natural_key\n'
      + '    naturalKeyField: userIds\n',
      '        userIds: { type: array, items: { type: string } }\n',
    );
    expect(errorsOf(yaml).join(' ')).toContain('natural-key-field-not-scalar');
  });

  it('REFUSES a field that is not in the inputSchema at all — the fallback would hide it', () => {
    const yaml = withInput(
      '    sideEffect: local_write\n'
      + '    idempotency: natural_key\n'
      + '    naturalKeyField: ghostId\n',
      '        id: { type: string }\n',
    );
    expect(errorsOf(yaml).join(' ')).toContain('natural-key-field-not-in-input');
  });

  it('ACCEPTS a scalar identity — the shape the whole estate uses', () => {
    for (const type of ['string', 'integer', 'number']) {
      const yaml = withInput(
        '    sideEffect: local_write\n'
        + '    idempotency: natural_key\n'
        + '    naturalKeyField: thingId\n',
        `        thingId: { type: ${type} }\n`,
      );
      expect(errorsOf(yaml), `${type} must be accepted`).toEqual([]);
    }
  });

  it('does NOT pile a second error onto the wrong-strategy case — one fix, named once', () => {
    const yaml = withInput(
      '    sideEffect: local_write\n'
      + '    idempotency: client_key\n'
      + '    naturalKeyField: ghostId\n',
      '        id: { type: string }\n',
    ).replace('    offlineReplayable: true\n', '    offlineReplayable: false\n');
    const errors = errorsOf(yaml);
    expect(errors.join(' ')).toContain('natural-key-field-requires-natural-key');
    expect(errors.join(' ')).not.toContain('natural-key-field-not-in-input');
  });

  it('leaves a DOTTED path alone — its type is not knowable from the inputSchema', () => {
    const yaml = withInput(
      '    sideEffect: local_write\n'
      + '    idempotency: natural_key\n'
      + '    naturalKeyField: invitation.token\n',
      '        invitation: { type: object }\n',
    );
    expect(errorsOf(yaml)).toEqual([]);
  });

  // D.38 ruling (a), 2026-08-15 — the OTHER half of L22. L22 made the field
  // reachable; this makes it MANDATORY, so `natural_key` can no longer be
  // spelled in the way that silently means `derived_from_input`. 74 of the
  // estate's 114 natural_key activities were spelled exactly that way and were
  // all re-declared in the same commit, so the estate enters this rule clean.
  describe('natural_key REQUIRES the field', () => {
    it('REFUSES natural_key with no naturalKeyField — it was never a natural key', () => {
      const yaml = withActivity(
        '    sideEffect: local_write\n'
        + '    idempotency: natural_key\n',
      );
      const errors = errorsOf(yaml);
      expect(errors.join(' ')).toContain('natural-key-requires-field');
      // The message must name the honest alternative, or the author's only
      // route out is to invent a key — which is the regression this ruling
      // rejected (declaring one collapses two distinct writes into a replay).
      expect(errors.join(' ')).toContain('derived_from_input');
    });

    it('is SILENT once a real field is declared', () => {
      const yaml = withActivity(
        '    sideEffect: local_write\n'
        + '    idempotency: natural_key\n'
        + '    naturalKeyField: id\n',
      );
      expect(errorsOf(yaml)).toEqual([]);
    });

    it('does not fire for any OTHER strategy — only natural_key promises a key', () => {
      for (const strategy of ['derived_from_input', 'client_key', 'none']) {
        const yaml = withActivity(
          '    sideEffect: local_write\n'
          + `    idempotency: ${strategy}\n`,
        ).replace('    offlineReplayable: true\n', '    offlineReplayable: false\n');
        expect(errorsOf(yaml).join(' ')).not.toContain('natural-key-requires-field');
      }
    });

    it('does NOT double-report with the ghost-field rule — one fix, named once', () => {
      const yaml = withInput(
        '    sideEffect: local_write\n'
        + '    idempotency: natural_key\n'
        + '    naturalKeyField: ghostId\n',
        '        id: { type: string }\n',
      );
      const errors = errorsOf(yaml).join(' ');
      expect(errors).toContain('natural-key-field-not-in-input');
      expect(errors).not.toContain('natural-key-requires-field');
    });
  });
});
