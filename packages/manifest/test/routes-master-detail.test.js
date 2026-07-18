// Route contribution shape — the master-detail + :param additions
// (mp-canonical-routes-addon-relocation, Phase 1).
import { describe, it, expect } from 'vitest';
import { validateManifest } from '../src/index.js';

const IDENTITY = [
  'manifestVersion: "1"',
  'id: routes-probe',
  'version: 1.0.0',
  'name: Routes Probe',
  'category: comms',
  'publisher: { id: x, name: X, type: first_party }',
].join('\n');

const withBody = (body) => `${IDENTITY}\n${body}\n`;

describe('contributions.routes: master/detail + :param', () => {
  it('accepts a master route + a detail route paired by masterId', () => {
    const r = validateManifest(withBody(`
contributions:
  routes:
    - id: index
      path: /time-clock/
      name: Time Clock
      index: true
      master: true
    - id: overview
      path: /time-clock/overview/
      name: Overview
      detail: true
      masterId: index
`));
    expect(r.ok).toBe(true);
  });

  it('accepts a :param sub-route path (deep-link)', () => {
    const r = validateManifest(withBody(`
contributions:
  routes:
    - id: index
      path: /care-plans/
      name: Care Plans
      index: true
    - id: details
      path: /care-plans/:id/details/
      name: Care Plan Details
`));
    expect(r.ok).toBe(true);
  });

  it('rejects an unknown route property (additionalProperties:false holds)', () => {
    const r = validateManifest(withBody(`
contributions:
  routes:
    - id: index
      path: /time-clock/
      name: Time Clock
      bogus: true
`));
    expect(r.ok).toBe(false);
  });
});
