/**
 * predicate-conformance.test.js — the CLIENT half of one conformance table.
 *
 * `test/fixtures/predicate-conformance.json` is a byte-for-byte mirror of
 * `JF15-predicate-conformance.json`, the Team Member Journeys contract fixture
 * (11d, journeys v1.0.6). The SERVER replays the same file through
 * `AiSettings::Predicate` (`api/spec/.../predicate_conformance_spec.rb`); this
 * file replays it through THIS evaluator. The point is not to test the operators
 * twice — it is that a case answered differently by the two evaluators is the R4
 * drift the schema's own `$comment` forbids, and one shared table is the only way
 * to see it (JD11, JD30; landmine 30).
 *
 * The mirror is verified against the scope's sha256 lock by
 * `ledger/journeys-lock.rb check all`, which compares this file's digest against
 * the locked `JF15-predicate-conformance.json` — so an edit here is caught by the
 * lock, not by a reviewer.
 *
 * TWO CLASSES OF CASE ARE NOT THIS EVALUATOR'S:
 *   · `server_only: true` — the `subject` and `record` context sources are
 *     server-side (05 §3, JD11). This evaluator has no adapter for them, and it
 *     must REFUSE them rather than resolve them to undefined and quietly answer
 *     false, so each one is asserted to throw on `from`.
 *   · `pending: true` — behaviour a later backend task adds. None is pending on
 *     this base, and the suite asserts that too: a table where every case is
 *     pending would pass while proving nothing.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluatePredicate, PredicateError, PREDICATE_OPERATORS } from '../src/predicate.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TABLE = JSON.parse(readFileSync(path.join(HERE, 'fixtures/predicate-conformance.json'), 'utf8'));

/**
 * THE TWO EVALUATORS TAKE DIFFERENT CONTEXT BAGS, and the table is written in the
 * SERVER's. That is not a defect in either: the server reads settings out of a
 * per-package hash keyed by package id with `_package` as the default
 * (`AiSettings::Predicate`), while this binary takes
 * `{ mpId, setting: { [mpId]: … } }` (`resolveSource`'s own doc comment). The
 * conformance claim is about what the operators ANSWER, not about how a caller
 * spells the bag, so the shape is translated here — once, visibly — rather than
 * by duplicating every case in a second dialect, which would let the two copies
 * drift and quietly destroy the thing the table is for.
 *
 * `subject` and `record` are deliberately NOT translated: they are server-side
 * sources with no client adapter (05 §3, JD11), and the `server_only` block below
 * asserts that this evaluator REFUSES them.
 */
function contextFor(kase) {
  const { _package: mpId, subject, record, ...packages } = kase.context || {};
  return { mpId, setting: packages, _serverOnly: { subject, record } };
}

describe('the predicate conformance table', () => {
  it('is the contract fixture, at the contract version', () => {
    expect(TABLE.fixture).toBe('JF15-predicate-conformance');
    expect(TABLE.contract).toBe('journeys v1.0.6');
    expect(TABLE.not_http).toBe(true);
    expect(TABLE.cases.length).toBeGreaterThanOrEqual(40);
  });

  it('has no pending case on this base, so nothing passes by being skipped', () => {
    expect(TABLE.cases.filter((k) => k.pending)).toEqual([]);
  });

  it('covers every operator this binary declares, so a new one cannot arrive untested', () => {
    const exercised = new Set();
    const collect = (node) => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node.allOf)) node.allOf.forEach(collect);
      if (Array.isArray(node.anyOf)) node.anyOf.forEach(collect);
      if (typeof node.op === 'string') exercised.add(node.op);
    };
    TABLE.cases.forEach((k) => collect(k.predicate));
    for (const op of PREDICATE_OPERATORS) {
      expect(exercised.has(op), `${op} is not exercised by the table`).toBe(true);
    }
  });
});

const clientCases = TABLE.cases.filter((k) => !k.server_only && !k.pending);
const serverCases = TABLE.cases.filter((k) => k.server_only);

describe('every client case answers the same as the server', () => {
  it.each(clientCases.map((k) => [k.name, k]))('%s', (name, kase) => {
    if (kase.expect === 'refused') {
      expect(() => evaluatePredicate(kase.predicate, contextFor(kase))).toThrow(PredicateError);
      return;
    }
    expect(evaluatePredicate(kase.predicate, contextFor(kase)), name).toBe(kase.expect);
  });

  it('and there are enough of them to be a proof rather than a gesture', () => {
    expect(clientCases.length).toBeGreaterThanOrEqual(25);
  });
});

describe('the server-only sources are REFUSED here, never resolved to undefined', () => {
  it.each(serverCases.map((k) => [k.name, k]))('%s', (name, kase) => {
    // `subject` and `record` have no client adapter. Refusing is the fail-closed
    // answer; answering `false` would let a client-side gate silently disagree
    // with the server about who a step applies to.
    expect(() => evaluatePredicate(kase.predicate, contextFor(kase)), name).toThrow(PredicateError);
  });

  it('and the table really does carry server-only cases, so this is not vacuous', () => {
    expect(serverCases.length).toBeGreaterThanOrEqual(8);
    // The buckets exist in the table and are withheld on purpose, not missing.
    const withheld = serverCases.map((k) => contextFor(k)._serverOnly);
    expect(withheld.some((w) => w.subject !== undefined)).toBe(true);
    expect(withheld.some((w) => w.record !== undefined)).toBe(true);
  });
});

describe('includes_any, the one L-1 addition (JD11)', () => {
  it('is in the closed set, and the set is otherwise unchanged', () => {
    expect(PREDICATE_OPERATORS).toEqual([
      'exists', 'not_exists', 'equals', 'not_equals', 'one_of', 'range', 'includes_any',
    ]);
  });

  const evalWith = (value, operands) => evaluatePredicate(
    { source: { from: 'setting', path: 'v' }, op: 'includes_any', operands },
    { mpId: 'p', setting: { p: { v: value } } },
  );

  it('an array value sharing one element is true; sharing nothing is false', () => {
    expect(evalWith([9, 12], [11, 12])).toBe(true);
    expect(evalWith([7, 9], [11, 12])).toBe(false);
    expect(evalWith([], [11, 12])).toBe(false);
  });

  it('a NON-array value is false, never an error and never coerced to a one-element set', () => {
    // 12 is in `operands`, and a coercing implementation would answer true.
    expect(evalWith(12, [11, 12])).toBe(false);
    expect(evalWith(undefined, [11, 12])).toBe(false);
    expect(evalWith(null, [11, 12])).toBe(false);
    expect(evalWith('12', [11, 12])).toBe(false);
  });

  it('empty operands share nothing with anything', () => {
    expect(evalWith([1, 2, 3], [])).toBe(false);
  });

  it('elements compare STRUCTURALLY, as every other operator does', () => {
    expect(evalWith([{ a: 1 }], [{ a: 1 }])).toBe(true);
    expect(evalWith([{ a: 1 }], [{ a: 2 }])).toBe(false);
    expect(evalWith(['x'], [1, 'x'])).toBe(true);
    // A string is not a number: the operator does not widen JSON's value space.
    expect(evalWith([12], ['12'])).toBe(false);
  });

  it('composes inside one level of allOf, which is the whole "roles A or B at locations X or Y" case', () => {
    const predicate = {
      allOf: [
        { source: { from: 'setting', path: 'role_tag_ids' }, op: 'includes_any', operands: [11, 12] },
        { source: { from: 'setting', path: 'location_ids' }, op: 'includes_any', operands: [3001] },
      ],
    };
    const ctx = (roles, locations) => ({ mpId: 'p', setting: { p: { role_tag_ids: roles, location_ids: locations } } });
    expect(evaluatePredicate(predicate, ctx([12], [3001]))).toBe(true);
    expect(evaluatePredicate(predicate, ctx([12], [3002]))).toBe(false);
    expect(evaluatePredicate(predicate, ctx([99], [3001]))).toBe(false);
  });
});
