/**
 * A retirement's selector: the viewer at an origin (all of it), one
 * session's chat fragments, or one subject's namespace, never both of the
 * last two; anything else is refused.
 */
import { describe, it, expect } from 'vitest';
import { retirementMatcher, HOST_STORE_FEATURES } from '../src/host-store/protocol.js';

const base = { authorityOrigin: 'https://api.example.test', viewerId: '31' };

describe('retirementMatcher', () => {
  it('matches every namespace of the viewer, the fragments of one session, or one subject exactly', () => {
    expect(retirementMatcher(base)('anything')).toBe(true);
    const subject = JSON.stringify(['client-access-v1', '7', '401', '41']);
    const one = retirementMatcher({ ...base, subjectKey: subject });
    expect(one(subject)).toBe(true);
    expect(one(JSON.stringify(['client-access-v1', '7', '402', '42']))).toBe(false);
    expect(one(null)).toBe(false);
    const fragments = retirementMatcher({ ...base, cacheSession: { id: '9', generation: 1 } });
    expect(fragments(JSON.stringify(['chat-fragments-v1', '9', 1]))).toBe(true);
    expect(HOST_STORE_FEATURES).toContain('subject-retire');
  });

  it('refuses a subject with a session, an empty subject, or an unknown field', () => {
    expect(() => retirementMatcher({ ...base, subjectKey: 'x', cacheSession: { id: '9', generation: 1 } })).toThrow(/unserializable/);
    expect(() => retirementMatcher({ ...base, subjectKey: '' })).toThrow(/unserializable/);
    expect(() => retirementMatcher({ ...base, other: true })).toThrow(/unserializable/);
  });
});
