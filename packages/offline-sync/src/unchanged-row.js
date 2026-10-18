// Whether a server row answered again is the row a store already holds.

// The same JSON whatever the key order.
const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};
const domain = (row) => Object.fromEntries(Object.entries(row).filter(([key]) => !key.startsWith('_')));
// Metadata a server row may carry and still be the same row to a reader.
const QUIET_META = new Set(['_rev', '_updatedAt', '_window', '_ackRev', '_dirty']);
// A row stamped this recently still paints and is within every store's age
// limit, so writing it again would show a reader nothing new. A row read
// again after this is written as before, so one still being read is
// restamped at least daily.
export const RECENT_MS = 24 * 60 * 60 * 1000;

/**
 * The server answered `row` exactly as `previous` is held: clean, painting,
 * recently stamped, in the window this read names, with no flag a write
 * would clear, and the answer brings no metadata of its own (a read's
 * provenance stamp is written). Writing it again changes nothing a reader sees, and every
 * write is announced, so a reconcile leaves it as it is. Announcing it moved
 * every reader of the collection: two strict reads over shared rows (a
 * team-wide and an own documents catalogue) voided each other's receipt and
 * refetched each other without end.
 */
export function unchangedServerRow(row, previous, { paintable, now, windowKey = null }) {
  return !!previous && !previous._dirty && paintable(previous)
    && now() - Date.parse(previous._updatedAt || '') < RECENT_MS
    && Object.keys(previous).every((key) => !key.startsWith('_') || QUIET_META.has(key))
    && Object.keys(row).every((key) => !key.startsWith('_') || QUIET_META.has(key))
    && (windowKey == null || previous._window === String(windowKey))
    && canonical(domain(row)) === canonical(domain(previous));
}
