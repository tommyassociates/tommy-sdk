/**
 * Ephemeral call-context identity for a canonical store mutation. This is not
 * a principal, permission, source receipt or storage value. Only exact opaque
 * identity lets a caller recognise its own operation across an awaited turn.
 */
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
