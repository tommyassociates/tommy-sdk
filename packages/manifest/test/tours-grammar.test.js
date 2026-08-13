// Tours grammar — PARKED A.1 step 1.
//
// ⚠ THE GRAMMAR WAS DERIVED FROM THE CHECKER, NOT INVENTED. Four Ruby rules
// already existed and already read `contributions.tours`,
// `contributions.tourAnchors`, `tour.autoLaunch.when`, `tour.steps[].anchor`,
// `step.host`, `tour.replayable` and `tour.fixtures[].teardown` through
// `Mp::ManifestCheck::Walk` (api/app/services/mp/manifest_check/rules/
// m19_tour_anchors_rendered.rb, m20_…, m21_…, m22_…). This schema is the shape
// they were written against.
//
// ⚠ AND THAT IS WHY NONE OF THEM HAD EVER FIRED ON REAL DATA: `contributions` is
// `additionalProperties: false`, so until this change a manifest declaring a tour
// failed SCHEMA validation before a single tour rule could run. The rules were
// dead code guarded by a gate that rejected their own input.
//
// SHAPE HERE, POLICY IN THE RULES. Teardown is deliberately not schema-required
// even though M21 refuses a fixture without one: two authorities on one decision
// is the anti-pattern M20's own rationale names, and the rule's message is far
// better than a schema type error.
import { describe, it, expect } from 'vitest';
import { validateManifest } from '../src/index.js';

const IDENTITY = [
  'manifestVersion: "1"',
  'id: tours-probe',
  'version: 1.0.0',
  'name: Tours Probe',
  'category: comms',
  'publisher: { id: x, name: X, type: first_party }',
].join('\n');

const withBody = (body) => `${IDENTITY}\n${body}\n`;
const errorText = (r) => JSON.stringify(r.errors || []);

describe('contributions.tourAnchors', () => {
  it('accepts an anchor list', () => {
    const r = validateManifest(withBody(`
contributions:
  tourAnchors:
    - name: approve-button
      description: The approve action on a draft timesheet row.
`));
    expect(r.ok, errorText(r)).toBe(true);
  });

  it('REJECTS a dotted anchor name', () => {
    // The rendered attribute is `data-tour-target="<mpId>.<name>"`, so a dot in
    // the name makes the mpId prefix ambiguous — `a.b.c` could be either MP `a`
    // anchor `b.c` or MP `a.b` anchor `c`.
    const r = validateManifest(withBody(`
contributions:
  tourAnchors:
    - name: timesheets.approve
`));
    expect(r.ok).toBe(false);
  });

  it('REJECTS an unknown key on an anchor', () => {
    const r = validateManifest(withBody(`
contributions:
  tourAnchors:
    - name: approve-button
      selector: '.timesheets-approve'
`));
    expect(r.ok).toBe(false);
  });
});

describe('contributions.tours', () => {
  const TOUR = `
contributions:
  tourAnchors:
    - name: approve-button
  tours:
    - id: timesheets
      title: Timesheets tour
      steps:
        - anchor: approve-button
          title: Approve
          body: Approve a draft timesheet here.
          timeoutMs: 5000
`;

  it('accepts a minimal tour over a declared anchor', () => {
    const r = validateManifest(withBody(TOUR));
    expect(r.ok, errorText(r)).toBe(true);
  });

  it('accepts a HOST-chrome step, which declares no MP anchor', () => {
    // M19 excuses `host: true` and `tommy.`-prefixed anchors from the
    // declared-anchor requirement — host furniture is not the MP's DOM.
    const r = validateManifest(withBody(`
contributions:
  tours:
    - id: timesheets
      steps:
        - anchor: tommy.sidebar
          host: true
`));
    expect(r.ok, errorText(r)).toBe(true);
  });

  it('REQUIRES at least one step', () => {
    const r = validateManifest(withBody(`
contributions:
  tours:
    - id: timesheets
      steps: []
`));
    expect(r.ok).toBe(false);
  });

  it('accepts a DOMAIN-readiness autoLaunch predicate', () => {
    const r = validateManifest(withBody(`
contributions:
  tourAnchors:
    - name: approve-button
  tours:
    - id: timesheets
      autoLaunch:
        when:
          source: { from: condition, ref: timesheets_ready_for_export, path: ready }
          op: equals
          operand: true
      steps:
        - anchor: approve-button
`));
    expect(r.ok, errorText(r)).toBe(true);
  });

  it('accepts a fixture with a teardown', () => {
    const r = validateManifest(withBody(`
contributions:
  tourAnchors:
    - name: approve-button
  tours:
    - id: timesheets
      replayable: true
      fixtures:
        - ref: sample-draft
          activity: create_timesheet
          input: { status: draft }
          teardown:
            activity: delete_timesheet
      steps:
        - anchor: approve-button
`));
    expect(r.ok, errorText(r)).toBe(true);
  });

  it('leaves a teardown-less fixture to the CHECKER, not the schema', () => {
    // Deliberate: M21 refuses this with an explanation of the measured failure
    // (a browser closed mid-tour leaves permanent sample records on a live
    // surface with no sweeper). A schema `required` would pre-empt that with a
    // worse message and put two authorities on one decision.
    const r = validateManifest(withBody(`
contributions:
  tourAnchors:
    - name: approve-button
  tours:
    - id: timesheets
      fixtures:
        - ref: sample-draft
          activity: create_timesheet
      steps:
        - anchor: approve-button
`));
    expect(r.ok, errorText(r)).toBe(true);
  });

  it('REJECTS an unknown key on a tour, a step and a fixture', () => {
    for (const body of [
      'contributions:\n  tours:\n    - id: t\n      selector: ".x"\n      steps:\n        - anchor: a',
      'contributions:\n  tours:\n    - id: t\n      steps:\n        - anchor: a\n          target: ".x"',
      'contributions:\n  tours:\n    - id: t\n      steps:\n        - anchor: a\n      fixtures:\n        - ref: r\n          activity: x\n          cleanup: y',
    ]) {
      expect(validateManifest(withBody(body)).ok, body).toBe(false);
    }
  });

  it('REJECTS a dotted tour id', () => {
    // ⚠ The id is the WIRE KEY: `tours.seen[id]`. Keeping it to one flat token
    // is what stops an id from drifting into a path-like shape that invites
    // renaming — and renaming re-onboards the entire existing user base.
    expect(validateManifest(withBody('contributions:\n  tours:\n    - id: mp.timesheets\n      steps:\n        - anchor: a')).ok).toBe(false);
  });
});

describe('the gate that made the four tour rules unreachable', () => {
  it('a tour-declaring manifest no longer fails schema validation outright', () => {
    // The regression this whole step exists to prevent: `contributions` is
    // additionalProperties:false, so BEFORE this change the manifest below was
    // rejected at the schema, and M19/M20/M21/M22 never saw a single tour.
    const r = validateManifest(withBody(`
contributions:
  tourAnchors:
    - name: approve-button
  tours:
    - id: timesheets
      steps:
        - anchor: approve-button
`));
    expect(r.ok, errorText(r)).toBe(true);
  });
});
