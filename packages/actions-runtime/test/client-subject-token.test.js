import { describe, it, expect } from 'vitest';
import { validateToken } from '../src/capability.js';

const subject = { kind: 'client_access', viewerId: '31', apiSessionId: '91', apiSessionGeneration: 1,
  teamId: '7', clientAccessId: '401', clientId: '41', conversationId: '101', accessEpisode: '501', contextVersion: 'context' };
const token = () => ({ token: 'opaque', expiresAt: new Date(Date.now() + 900000).toISOString(), mpId: 'team-comms',
  mpVersion: '1.0.0', tenantId: 'team-7', instanceId: 'panel', effectiveScopes: [], subject });

describe('client subject token binding', () => {
  it('requires every canonical identity component and rejects a staff token in the subject world', () => {
    expect(validateToken(token(), { subject }).mpId).toBe('team-comms');
    for (const key of ['viewerId', 'apiSessionId', 'teamId', 'clientAccessId', 'clientId', 'conversationId', 'accessEpisode']) {
      expect(() => validateToken({ ...token(), subject: { ...subject, [key]: '999' } }, { subject })).toThrow();
    }
    expect(() => validateToken({ ...token(), subject: { ...subject, apiSessionGeneration: 2 } }, { subject })).toThrow();
    expect(() => validateToken({ ...token(), subject: undefined }, { subject })).toThrow();
    expect(() => validateToken(token(), { subject: null })).toThrow();
    expect(() => validateToken({ ...token(), tenantId: 'team-8' }, { subject })).toThrow();
    expect(() => validateToken({ ...token(), expiresAt: 'invalid' }, { subject })).toThrow();
  });
});
