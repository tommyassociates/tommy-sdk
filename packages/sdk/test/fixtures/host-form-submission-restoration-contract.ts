import type { HostApi, HostFormSubmissionWindowRestoration } from '../../src/types.js';
declare const host: HostApi;
const restored: Promise<HostFormSubmissionWindowRestoration> = host.restoreFormSubmissionWindow({ window: 'opaque', throughPage: 24 });
restored.then((answer) => {
  const page: number = answer.page;
  const limit: number = answer.limit;
  const nonAtomic: false = answer.atomic;
  const incompleteQuery: false = answer.queryComplete;
  const terminal: boolean | null = answer.more;
  const count: number | null = answer.count;
  void [page, limit, nonAtomic, incompleteQuery, terminal, count];
  // @ts-expect-error A restoration receipt contains no response rows.
  answer.rows;
  // @ts-expect-error Window admission proof is internal to the host.
  answer.proof;
});
// @ts-expect-error Navigation intent must name its own followed window.
host.restoreFormSubmissionWindow({ throughPage: 3 });
// @ts-expect-error Extent is numeric, not a coercible string.
host.restoreFormSubmissionWindow({ window: 'opaque', throughPage: '24' });
// @ts-expect-error The window already captures its query; it cannot be retargeted.
host.restoreFormSubmissionWindow({ window: 'opaque', query: { name: 'Other' } });

host.restoreFormSubmissionWindow({ window: 'opaque', onRead(rows) {
  const id: string | undefined = rows[0]?.id;
  const fields: Readonly<Record<string, unknown>> | undefined = rows[0]?.fields;
  void [id, fields];
  // @ts-expect-error A raw source read is readonly to the caller.
  rows.push(rows[0]);
  return undefined;
} });
// @ts-expect-error Fresh read observers must be callable.
host.restoreFormSubmissionWindow({ window: 'opaque', onRead: 'callback' });
// @ts-expect-error Fresh read observers must finish synchronously.
host.restoreFormSubmissionWindow({ window: 'opaque', onRead: async () => undefined });
