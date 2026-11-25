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

  it('accepts the chain field and per-step requireInteraction', () => {
    const r = validateManifest(withBody(`
contributions:
  tourAnchors:
    - name: approve-button
  tours:
    - id: timesheets
      nextTour: team
      steps:
        - anchor: approve-button
          requireInteraction: true
          timeoutMs: 15000
`));
    expect(r.ok, errorText(r)).toBe(true);
  });

  it('REJECTS a dotted tour id', () => {
    expect(validateManifest(withBody('contributions:\n  tours:\n    - id: mp.timesheets\n      steps:\n        - anchor: a')).ok).toBe(false);
  });
});

describe('the gate that made the four tour rules unreachable', () => {
  it('a tour-declaring manifest no longer fails schema validation outright', () => {
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
