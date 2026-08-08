// IDENTITY ADOPTION (council C3) — the `legacyPackages` manifest field and the
// ONE derivation that turns those declarations into a package -> mpId index.
//
// The field lets an MP adopt the install identity of the legacy addon it
// replaces (`addon_installs.package` = `time_clock` -> the `time-clock` MP).
// The schema constrains the shape; `buildLegacyPackageIndex` asserts the
// cross-manifest injectivity rule the resolver depends on.

import { describe, it, expect } from 'vitest';
import {
  validateManifest,
  legacyPackagesOf,
  buildLegacyPackageIndex,
  resolveMpIdWith,
  LegacyPackageCollisionError,
} from '../src/index.js';

const IDENTITY = [
  'manifestVersion: "1"',
  'id: time-clock',
  'version: 1.0.0',
  'name: Time Clock',
  'category: time_attendance',
  'publisher: { id: x, name: X, type: first_party }',
].join('\n');

const withBody = (body) => `${IDENTITY}\n${body}\n`;

describe('schema: legacyPackages', () => {
  it('is OPTIONAL — a manifest without it stays valid', () => {
    expect(validateManifest(`${IDENTITY}\n`).ok).toBe(true);
  });

  it('accepts underscored legacy keys (the MP id pattern stays underscore-free)', () => {
    const res = validateManifest(withBody('legacyPackages:\n  - time_clock'));
    expect(res.errors).toEqual([]);
    expect(res.ok).toBe(true);
  });

  it('accepts a key equal to the MP id (the identically-named legacy addon is mine)', () => {
    const res = validateManifest(withBody('legacyPackages:\n  - time-clock'));
    expect(res.ok).toBe(true);
  });

  it('rejects a duplicate entry within one manifest', () => {
    const res = validateManifest(withBody('legacyPackages:\n  - time_clock\n  - time_clock'));
    expect(res.ok).toBe(false);
    expect(res.errors[0].rule).toBe('duplicate-item');
  });

  it('rejects a malformed key (uppercase / leading underscore / trailing underscore)', () => {
    for (const bad of ['Time_Clock', '_time_clock', 'time_clock_']) {
      const res = validateManifest(withBody(`legacyPackages:\n  - ${bad}`));
      expect(res.ok).toBe(false);
      expect(res.errors[0].rule).toBe('pattern-mismatch');
    }
  });

  it('rejects a non-array value', () => {
    const res = validateManifest(withBody('legacyPackages: time_clock'));
    expect(res.ok).toBe(false);
    expect(res.errors[0].rule).toBe('invalid-type');
  });
});

describe('legacyPackagesOf', () => {
  it('returns the declared keys, or [] when absent/malformed', () => {
    expect(legacyPackagesOf({ id: 'a', legacyPackages: ['x_y'] })).toEqual(['x_y']);
    expect(legacyPackagesOf({ id: 'a' })).toEqual([]);
    expect(legacyPackagesOf(null)).toEqual([]);
    expect(legacyPackagesOf({ id: 'a', legacyPackages: 'x' })).toEqual([]);
  });
});

describe('buildLegacyPackageIndex — injectivity', () => {
  const estate = [
    { id: 'time-clock', legacyPackages: ['time_clock'] },
    { id: 'care-plans', legacyPackages: ['care_plans'] },
    { id: 'scheduling', legacyPackages: ['scheduling'] },
    { id: 'leave' },
  ];

  it('indexes every canonical id and every adopted legacy key', () => {
    const index = buildLegacyPackageIndex(estate);
    expect(index.byPackage.get('time_clock')).toBe('time-clock');
    expect(index.byPackage.get('time-clock')).toBe('time-clock');
    expect(index.byPackage.get('care_plans')).toBe('care-plans');
    expect(index.byPackage.get('scheduling')).toBe('scheduling');
    expect(index.byPackage.get('leave')).toBe('leave');
    expect(index.byMpId.get('time-clock')).toEqual(['time_clock']);
    expect(index.byMpId.get('leave')).toEqual([]);
  });

  it('THROWS when two MPs claim the same legacy package', () => {
    const call = () => buildLegacyPackageIndex([
      { id: 'time-clock', legacyPackages: ['time_clock'] },
      { id: 'timesheets', legacyPackages: ['time_clock'] },
    ]);
    expect(call).toThrow(LegacyPackageCollisionError);
    expect(call).toThrow(/globally unique/);
  });

  it("THROWS when an MP claims ANOTHER MP's canonical id", () => {
    const call = () => buildLegacyPackageIndex([
      { id: 'timesheets', legacyPackages: ['scheduling'] },
      { id: 'scheduling' },
    ]);
    expect(call).toThrow(LegacyPackageCollisionError);
    expect(call).toThrow(/canonical id of another/);
  });

  it('tolerates the same MP declaring the same key twice (idempotent)', () => {
    const index = buildLegacyPackageIndex([{ id: 'a', legacyPackages: ['a_b', 'a_b'] }]);
    expect(index.byMpId.get('a')).toEqual(['a_b']);
  });

  it('ignores entries with no id', () => {
    expect(() => buildLegacyPackageIndex([null, {}, { legacyPackages: ['x'] }])).not.toThrow();
  });
});

describe('resolveMpIdWith', () => {
  const index = buildLegacyPackageIndex([{ id: 'time-clock', legacyPackages: ['time_clock'] }]);

  it('maps a legacy key onto the canonical id', () => {
    expect(resolveMpIdWith(index, 'time_clock')).toBe('time-clock');
  });

  it('is the identity for a canonical id', () => {
    expect(resolveMpIdWith(index, 'time-clock')).toBe('time-clock');
  });

  it('passes an unknown key THROUGH (never invents an mpId)', () => {
    expect(resolveMpIdWith(index, 'wallet_accounts')).toBe('wallet_accounts');
    expect(resolveMpIdWith(index, '')).toBe('');
  });
});
