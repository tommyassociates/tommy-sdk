/**
 * The row a declared read keeps its cursor in, in its own collection. It is
 * the service's own: never validated against the collection's record schema,
 * and never handed to a reader.
 */
export const SOURCE_META_KEY = '~meta';
