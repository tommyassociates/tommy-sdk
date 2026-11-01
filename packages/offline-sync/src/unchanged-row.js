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
// Omitted fields keep the value at the write turn. Explicit null/zero wins.
export function holdRowFields(row, previous, fields = []) {
  if (!previous) return row;
  const kept = fields.filter((field) => !Object.hasOwn(row, field) && Object.hasOwn(previous, field));
  return kept.length ? { ...row, ...Object.fromEntries(kept.map((field) => [field, previous[field]])) } : row;
}
// Ignore declared response-only paths for equality, without changing the DTO
// or the value stored when any meaningful field changes.
function withoutPath(value, [field, ...rest]) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.hasOwn(value, field)) return value;
  const out = { ...value };
  if (rest.length) out[field] = withoutPath(value[field], rest);
  else delete out[field];
  return out;
}
const comparable = (row, ignoredFields) => ignoredFields.reduce((value, path) => withoutPath(value, path.split('.')), domain(row));
// Metadata a server row may carry and still be the same row to a reader.
const QUIET_META = new Set(['_rev', '_updatedAt', '_window', '_ackRev', '_dirty']);
// Metadata the store keeps on a row itself. Any other `_` key came with a
// server answer: a read's provenance stamp (the Forms exact-entry stamp).
const STORE_META = new Set([...QUIET_META, '_persistFailed', '_deleted', '_pushRefused', '_writeReceipt', '_dedupeKey']);
const provenance = (row) => Object.fromEntries(Object.entries(row).filter(([key]) => key.startsWith('_') && !STORE_META.has(key)));
const quietOrProvenance = (row) => Object.keys(row).every((key) => !key.startsWith('_') || QUIET_META.has(key) || !STORE_META.has(key));
// A row stamped this recently still paints and is within every store's age
// limit, so writing it again would show a reader nothing new. A row read
// again after this is written as before, so one still being read is
// restamped at least daily.
export const RECENT_MS = 24 * 60 * 60 * 1000;

/**
 * The server answered `row` exactly as `previous` is held: clean, painting,
 * recently stamped, in the window this read names, with no flag a write
 * would clear, and the answer brings no provenance stamp but the one held
 * (a new stamp is written; an answer with none keeps the held one). Writing
 * it again changes nothing a reader sees, and every
 * write is announced, so a reconcile leaves it as it is. Announcing it moved
 * every reader of the collection: two strict reads over shared rows (a
 * team-wide and an own documents catalogue) voided each other's receipt and
 * refetched each other without end.
 */
export function unchangedServerRow(row, previous, { paintable, now, windowKey = null, ignoredFields = [] }) {
  return !!previous && !previous._dirty && paintable(previous)
    && now() - Date.parse(previous._updatedAt || '') < RECENT_MS
    && quietOrProvenance(previous) && quietOrProvenance(row)
    && (!Object.keys(provenance(row)).length || canonical(provenance(row)) === canonical(provenance(previous)))
    && (windowKey == null || previous._window === String(windowKey))
    && canonical(comparable(row, ignoredFields)) === canonical(comparable(previous, ignoredFields));
}

/**
 * The provenance stamp a clean held row keeps through a server write that
 * brings none of its own over the same content: the stamp records a read of
 * exactly this content, which is still true. Over changed content the server
 * holds a newer version no stamped read saw, so the stamp is dropped.
 */
export function heldProvenance(row, previous) {
  if (!previous || previous._dirty || Object.keys(provenance(row)).length) return {};
  return canonical(domain(row)) === canonical(domain(previous)) ? provenance(previous) : {};
}
