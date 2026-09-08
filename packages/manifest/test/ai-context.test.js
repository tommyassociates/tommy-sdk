import { describe, expect, it } from 'vitest';
import { validateManifest } from '../src/index.js';

const context = `
    ai:
      purpose: Send an authorised direct message when the matching event occurs.
      effect: The selected recipient receives one direct message.
      affects: [workers]
      intents: [notify a worker]
      changeRisk: high
      reversible: { configuration: true, deliveredEffects: false }
      sideEffects: [Delivers a message through the current direct-message policy]
      notWhenAsked: Do not use this to notify every member of a team.
      composable: true
      moneyMoving: false
      destructive: true
      notifies: true
`;

const manifest = (extra = '') => `
manifestVersion: '1'
id: ai-context-fixture
version: 1.0.0
name: AI Context Fixture
category: comms
description: Exercises the bounded AI context grammar.
publisher: { id: tommy, name: Tommy, type: first_party }
triggers:
  local_event:
    description: A location-owned event.
    emission: async
    payloadSchema: { type: object }
activities:
  notify_worker:
    description: Sends an authorised direct message.
    callerPolicy: owner_only
    sideEffect: server_write
    idempotency: client_key
    offlineReplayable: false
    inputSchema: { type: object }
${context}${extra}`;

describe('AI context manifest grammar', () => {
  it('accepts trusted context and the existing predicate grammar', () => {
    const source = manifest(`
actions:
  location_notification:
    title: Send a location notification
    trigger: { name: local_event }
    activity: { name: notify_worker }
    enabledByDefault: false
    required: false
    userConfigurable: true
    locationOverridable: true
contributions:
  settings:
    - id: notifications
      title: Notifications
      sections:
        - id: delivery
          kind: fields
          fields:
            - key: send_enabled
              type: boolean
              locationOverridable: true
              ai:
                purpose: Allow a location to enable its own delivery policy.
                effect: Future local notifications use the location override.
                affects: [workers]
                intents: [enable local notifications]
                changeRisk: medium
                reversible: { configuration: true, deliveredEffects: false }
                sideEffects: [Does not resend earlier notifications]
                preconditions:
                  - source: { from: setting, path: send_enabled }
                    op: equals
                    operand: true
                notWhenAsked: Do not change the team-wide delivery policy.
                composable: false
                moneyMoving: false
                destructive: false
                notifies: true
`);

    const result = validateManifest(source);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('rejects an old ad-hoc precondition instead of creating a second evaluator', () => {
    const source = manifest(context.replace(
      'notWhenAsked: Do not use this to notify every member of a team.',
      'preconditions: [{ from: setting, path: enabled, eq: true }]\n      notWhenAsked: Do not use this to notify every member of a team.',
    ));

    expect(validateManifest(source).ok).toBe(false);
  });

  it('rejects a location override on a legacy store binding', () => {
    const source = manifest(`
contributions:
  settings:
    - id: notifications
      title: Notifications
      sections:
        - id: delivery
          kind: fields
          fields:
            - key: send_enabled
              type: boolean
              store: { kind: workforce_profile }
              locationOverridable: true
`);

    expect(validateManifest(source).ok).toBe(false);
  });
});
