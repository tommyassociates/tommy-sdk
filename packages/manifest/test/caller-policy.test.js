// D.40 — `callerPolicy` makes all three caller cases SAYABLE.
//
// The defect this closes is a grammar defect, not a bug: `authorizedCallers`
// could only state one of its three cases with a value. Owner-only was spelled
// by an EMPTY ARRAY and first-party by an ABSENT FIELD, so two thirds of the
// answers were carried by the shape of the omission — which is exactly what an
// author who forgot the field also looks like. Worse, the empty case read two
// ways depending on the host's `strictEmptyCallers` flag, so the tightest
// setting in the grammar was the one whose meaning was conditional.
//
// Ruled 2026-08-12 (Mason): adopt the sibling `callerPolicy: owner_only |
// first_party | listed` and retire the M06 checker rule, which existed only to
// make the ambiguity visible. The sentinel alternative
// (`authorizedCallers: ["*first_party"]`) was rejected as the smaller diff that
// keeps the problem. The estate's 58 owner-only activities migrated in the same
// change; `authorizedCallers: []` stays LEGAL so nothing that validated before
// stops validating (ruled additive, 2026-08-13), which the last case pins.
//
// The broker half of this contract lives in
// actions-runtime/test/authz-invoke.test.js.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validateManifest, parseManifest } from '../src/index.js';
import { loadSchema } from '../src/schema.js';

const BASE = readFileSync(fileURLToPath(new URL('./fixtures/valid-minimal.yml', import.meta.url)), 'utf8');
const ANCHOR = '    callerPolicy: owner_only\n';

/** valid-minimal with its one activity's caller declaration rewritten. */
function withCallers(block) {
  expect(BASE).toContain(ANCHOR); // the anchor must still exist in the fixture
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
    expect(activity.additionalProperties).toBe(false); // still closed…
    expect(activity.properties.callerPolicy.enum) // …and the field is in it
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
    // A companion list is not merely redundant: the broker ignores it, so the
    // manifest would state a caller set that has no effect anywhere.
    for (const policy of ['owner_only', 'first_party']) {
      const yaml = withCallers(`    callerPolicy: ${policy}\n    authorizedCallers: [time-clock]\n`);
      expect(errorsOf(yaml).length, policy).toBeGreaterThanOrEqual(1);
    }
  });

  it('REJECTS a value outside the three cases', () => {
    expect(errorsOf(withCallers('    callerPolicy: anyone\n')).length).toBeGreaterThanOrEqual(1);
  });

  it('an activity that OMITS callerPolicy is REJECTED (operator ruling 2026-08-19)', () => {
    // ⚠ THIS TEST USED TO ASSERT THE OPPOSITE, and the reversal is the record.
    // It was "the legacy spellings still validate — the change is additive
    // (ruled 2026-08-13)", pinning a deliberate decision to leave the field
    // OPTIONAL because making it required is the first non-additive change this
    // v1 grammar has made. The operator overturned that on 2026-08-19: the
    // permissive `first_party` default was still being carried by an OMISSION
    // on 119 activities, where a forgotten field and a deliberate "any
    // first-party MP may call this" are indistinguishable — the exact
    // absence-carries-meaning defect callerPolicy was introduced to remove.
    //
    // WHAT DID NOT CHANGE, and the distinction matters: this closes the
    // AUTHORING hole, not a runtime one. The broker still DERIVES an effective
    // policy for a manifest that omits the field (authorizeInvoke normalises
    // rather than deny-by-default), so nothing already published changes
    // behaviour — it simply can no longer be authored that way.
    expect(validateManifest(withCallers('')).ok, 'absent callerPolicy must fail').toBe(false);
    expect(errorsOf(withCallers('')).join(' ')).toContain('callerPolicy');
    // A bare `authorizedCallers` is no longer enough on its own either: it can
    // only state the `listed` case, and it now has to say so.
    expect(validateManifest(withCallers('    authorizedCallers: [time-clock]\n')).ok).toBe(false);
    // The same declaration WITH the policy is fine.
    expect(validateManifest(withCallers('    callerPolicy: listed\n    authorizedCallers: [time-clock]\n')).ok).toBe(true);
    // And the fixture, which now declares owner_only, still validates.
    expect(validateManifest(BASE).ok).toBe(true);
  });

  it('the schema and the BROKER agree on the field name and the three values', () => {
    // Same guard shape as naturalKeyField's: a manifest field the broker does
    // not read is a declaration that validates and does nothing.
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
