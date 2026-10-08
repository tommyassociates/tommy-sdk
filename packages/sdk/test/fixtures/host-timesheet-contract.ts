import type { HostApi, HostTimesheet } from '../../src/types.js';

declare const host: HostApi;
host.fetchTimesheets();
host.fetchTimesheets({ dashboard: true });
host.fetchTimesheets({ shiftId: '27' });
host.fetchTimesheets({ startAt: '2026-10-01T00:00:00Z', endAt: '2026-11-01T00:00:00Z', teamMemberId: '31' });
host.fetchTimesheet('91').then((row) => {
  const nullable: HostTimesheet | null = row;
  // @ts-expect-error An exact answered absence is not a server row.
  const required: HostTimesheet = row;
  void nullable;
  void required;
});
host.timesheetsSnapshot({ timesheetId: '91' }).then((answer) => {
  const unresolved: boolean = answer.unresolved;
  const expenseRows: ReadonlyArray<Readonly<Record<string, unknown>>> = answer.timesheets[0].expenses;
  // @ts-expect-error Canonical mapped rows are readonly.
  answer.timesheets[0].status = 'approved';
  // @ts-expect-error Snapshot arrays are readonly.
  answer.timesheets.push(answer.timesheets[0]);
  // @ts-expect-error An omitted conditional calculation is not a known value.
  const calculations: Readonly<Record<string, unknown>> = answer.timesheets[0].calculations;
  void unresolved;
  void expenseRows;
  void calculations;
});
const stop: () => void = host.followTimesheets({ shiftId: '27' }, () => {});
stop();
// @ts-expect-error Invalidation notices do not expose payroll rows.
host.followTimesheets({}, (rows: HostTimesheet[]) => { void rows; });
// @ts-expect-error IDs use the mapped string contract.
host.fetchTimesheet(91);
// @ts-expect-error A dashboard query is explicitly enabled.
host.fetchTimesheets({ dashboard: false });
