const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};
const domain = (row) => Object.fromEntries(Object.entries(row).filter(([key]) => !key.startsWith('_')));
export function holdRowFields(row, previous, fields = []) {
  if (!previous) return row;
  const kept = fields.filter((field) => !Object.hasOwn(row, field) && Object.hasOwn(previous, field));
  return kept.length ? { ...row, ...Object.fromEntries(kept.map((field) => [field, previous[field]])) } : row;
}
function withoutPath(value, [field, ...rest]) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.hasOwn(value, field)) return value;
  const out = { ...value };
  if (rest.length) out[field] = withoutPath(value[field], rest);
  else delete out[field];
  return out;
}
const comparable = (row, ignoredFields) => ignoredFields.reduce((value, path) => withoutPath(value, path.split('.')), domain(row));
const QUIET_META = new Set(['_rev', '_updatedAt', '_window', '_ackRev', '_dirty']);
const STORE_META = new Set([...QUIET_META, '_persistFailed', '_deleted', '_pushRefused', '_writeReceipt', '_dedupeKey']);
const provenance = (row) => Object.fromEntries(Object.entries(row).filter(([key]) => key.startsWith('_') && !STORE_META.has(key)));
const quietOrProvenance = (row) => Object.keys(row).every((key) => !key.startsWith('_') || QUIET_META.has(key) || !STORE_META.has(key));
export const RECENT_MS = 24 * 60 * 60 * 1000;

export function unchangedServerRow(row, previous, { paintable, now, windowKey = null, ignoredFields = [] }) {
  return !!previous && !previous._dirty && paintable(previous)
    && now() - Date.parse(previous._updatedAt || '') < RECENT_MS
    && quietOrProvenance(previous) && quietOrProvenance(row)
    && (!Object.keys(provenance(row)).length || canonical(provenance(row)) === canonical(provenance(previous)))
    && (windowKey == null || previous._window === String(windowKey))
    && canonical(comparable(row, ignoredFields)) === canonical(comparable(previous, ignoredFields));
}

// The stamp records a read of exactly this content, which is still true for unchanged rows.
export function heldProvenance(row, previous) {
  if (!previous || previous._dirty || Object.keys(provenance(row)).length) return {};
  return canonical(domain(row)) === canonical(domain(previous)) ? provenance(previous) : {};
}
