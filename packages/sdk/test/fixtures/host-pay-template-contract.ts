import type { HostApi } from '../../src/types.js';

declare const host: HostApi;
host.payTemplates();
host.payTemplates({ force: true, teamMemberId: '31' });
host.readSchedulingPayContexts({ userIds: ['101'], force: true }).then((rows) => {
  const id: string | null = rows[0].payTemplateId;
  const exists: boolean = rows[0].employeeExists;
  void id;
  void exists;
  // @ts-expect-error A complete absence or null override is not a template ID.
  const required: string = rows[0].payTemplateId;
  // @ts-expect-error Returned context is readonly.
  rows[0].payTemplateId = '9';
  // @ts-expect-error No raw employee salary is public.
  rows[0].annual_salary;
  void required;
});
// @ts-expect-error User IDs are strings.
host.readSchedulingPayContexts({ userIds: [101] });
const stop: () => void = host.followSchedulingPayData({ userIds: ['101'], onChange() {}, onError(error) { void error; } });
stop();
// @ts-expect-error Invalidation callbacks receive no payroll rows.
host.followSchedulingPayData({ onChange(rows: unknown[]) { void rows; } });
