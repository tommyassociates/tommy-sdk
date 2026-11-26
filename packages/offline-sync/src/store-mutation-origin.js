const ORIGIN = Symbol('canonical-store-mutation-origin');
export function storeMutationOrigin(options) {
  return options && typeof options === 'object' ? options[ORIGIN] ?? null : null;
}
export function withStoreMutationOrigin(options, origin) {
  if (origin == null) return options;
  if (!options || typeof options !== 'object' || Array.isArray(options)
    || (typeof origin !== 'object' && typeof origin !== 'function')) {
    throw new TypeError('A canonical mutation origin requires options and opaque identity');
  }
  const marked = { ...options };
  Object.defineProperty(marked, ORIGIN, { value: origin });
  return marked;
}
