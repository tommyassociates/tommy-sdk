import type { HostCollection } from '../../src/types.js';

type Client = { id: string; name: string };
declare const clients: HostCollection<Client>;

clients.subscribe((rows) => {
  const whole: readonly Client[] = rows;
  const name: string = rows[0].name;
  void whole;
  void name;
});

clients.subscribe((rows) => {
  const whole: readonly Client[] = rows;
  void whole;
}, { onError: (error) => { const reason: unknown = error; void reason; } });

clients.subscribe((rows) => {
  const selected: readonly (Client | null)[] = rows;
  const first: Client | null = rows[0];
  if (first !== null) { const name: string = first.name; void name; }
  // @ts-expect-error a selected key may have no row
  const whole: readonly Client[] = rows;
  // @ts-expect-error selected rows must be narrowed before field access
  const unsafe: string = rows[0].name;
  // @ts-expect-error subscription rows are read-only
  rows.push({ id: '1', name: 'Changed' });
  void selected;
  void whole;
  void unsafe;
}, { keys: ['1', '2'] });

clients.subscribe((rows) => {
  const selected: readonly (Client | null)[] = rows;
  void selected;
}, { keys: ['1'] as const, onError: (error) => { const reason: unknown = error; void reason; } });

// @ts-expect-error keys must be a list
clients.subscribe(() => {}, { keys: '1' });
// @ts-expect-error public keys are strings
clients.subscribe(() => {}, { keys: [1] });
// @ts-expect-error a selected subscription cannot promise non-null rows
clients.subscribe((_rows: readonly Client[]) => {}, { keys: ['1'] });
