// Cross-reference layer (layer 4) — the advanced activity forms and the
// dataRequirements/scope contract that the auto-discovered corpus does not cover.

import { describe, it, expect } from 'vitest';
import { validateManifest } from '../src/index.js';

const IDENTITY = [
  'manifestVersion: "1"',
  'id: xref-probe',
  'version: 1.0.0',
  'name: Xref Probe',
  'category: comms',
  'publisher: { id: x, name: X, type: first_party }',
].join('\n');

// required action fields (schema): title/trigger/activity/enabledByDefault/required/userConfigurable
const ACTION_TAIL = `    enabledByDefault: true
    required: false
    userConfigurable: false`;

function withBody(body) {
  return `${IDENTITY}\n${body}\n`;
}

describe('cross-reference: activity.select branches', () => {
  const base = `
triggers:
  t:
    description: t
    emission: async
    payloadSchema: { type: object, additionalProperties: false, properties: { id: { type: string } } }
activities:
  real_activity:
    description: a
    callerPolicy: owner_only
    sideEffect: local_write
    idempotency: derived_from_input
    offlineReplayable: false
    inputSchema: { type: object, additionalProperties: false, properties: { id: { type: string } } }
    resultSchema: { type: object }
`;

  it('flags a select branch whose local target is undeclared', () => {
    const src = withBody(`${base}
actions:
  a:
    title: A
    description: A
    trigger: { name: t }
    activity:
      select:
        - when: { source: { from: trigger, path: id }, op: exists }
          name: ghost_branch_activity
        - else: true
          name: real_activity
${ACTION_TAIL}
`);
    const r = validateManifest(src);
    expect(r.ok).toBe(false);
    expect(r.errors[0].rule).toBe('unresolved-activity');
    expect(r.errors[0].message).toContain('ghost_branch_activity');
    expect(r.errors[0].layer).toBe(4);
  });

  it('accepts a select list whose targets all resolve (incl. else + skip)', () => {
    const src = withBody(`${base}
actions:
  a:
    title: A
    description: A
    trigger: { name: t }
    activity:
      select:
        - when: { source: { from: trigger, path: id }, op: exists }
          name: real_activity
        - else: true
          skip: true
${ACTION_TAIL}
`);
    const r = validateManifest(src);
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });
});

describe('cross-reference: computed function references', () => {
  const base = `
triggers:
  t:
    description: t
    emission: async
    payloadSchema: { type: object, additionalProperties: false, properties: { id: { type: string } } }
`;

  it('resolves a computed ref against a declared functions: entry', () => {
    const src = withBody(`${base}
activities:
  record:
    description: r
    callerPolicy: owner_only
    sideEffect: local_write
    idempotency: derived_from_input
    offlineReplayable: false
    inputSchema: { type: object, additionalProperties: false, properties: { id: { type: string } } }
    resultSchema: { type: object }
functions:
  reconcile:
    entry: functions/reconcile.js
    runtime: afr-js@1
    description: does a thing
    resultSchema: { type: object }
    timeoutMs: 1000
    memoryMb: 64
    reads: { conditions: [], serviceReads: [] }
    targets: { activities: [record] }
actions:
  a:
    title: A
    description: A
    trigger: { name: t }
    activity: { computed: reconcile }
${ACTION_TAIL}
`);
    const r = validateManifest(src);
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('flags a computed ref with no functions block', () => {
    const src = withBody(`${base}
actions:
  a:
    title: A
    description: A
    trigger: { name: t }
    activity: { computed: nope }
${ACTION_TAIL}
`);
    const r = validateManifest(src);
    expect(r.ok).toBe(false);
    expect(r.errors[0].rule).toBe('unresolved-computed-function');
    expect(r.errors[0].layer).toBe(4);
  });
});

describe('cross-reference: panel dataRequirements accept declared scopes', () => {
  it('does not flag a dataRequirement that is a requested permission scope', () => {
    const src = withBody(`
permissions: { scopes: [read:team_members] }
panels:
  - id: p
    name: P
    description: P
    surfaces: [dashboard]
    size: { defaultW: 4, defaultH: 3 }
    dataRequirements: [read:team_members]
    offline: cached_stale
`);
    const r = validateManifest(src);
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('still flags a dataRequirement that is neither condition nor requested scope', () => {
    const src = withBody(`
panels:
  - id: p
    name: P
    description: P
    surfaces: [dashboard]
    size: { defaultW: 4, defaultH: 3 }
    dataRequirements: [nope_neither]
    offline: cached_stale
`);
    const r = validateManifest(src);
    expect(r.ok).toBe(false);
    expect(r.errors[0].rule).toBe('unresolved-data-requirement');
  });
});
