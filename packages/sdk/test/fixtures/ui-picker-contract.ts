import type { UiApi, PickOptions } from '../../src/types.js';

declare const ui: UiApi;
const booking: PickOptions = { kinds: ['team_member'], purpose: 'booking_assignee', preselectedUserIds: ['101'] };
ui.pick(booking);
ui.pickTeamMember({ purpose: 'booking_assignee', preselected: ['1'] });
ui.pick({ kinds: ['team_member', 'location'], multiple: true });
// @ts-expect-error An unknown purpose is not part of the host contract.
ui.pick({ kinds: ['team_member'], purpose: 'automatic_admin' });
