/**
 * The one measure every byte budget of the host and MP stores uses: the size
 * of text in UTF-8, as the stores keep it and as a whole read, a held-rows
 * cache, a commit batch or a quota counts it. (Web Storage is the exception:
 * the browser charges it in UTF-16 code units, `utf16Units`.) The UTF-8
 * measure lives with the host store protocol, which the desktop shell
 * vendors on its own.
 */
import { utf8Bytes } from './host-store/protocol.js';

export { utf8Bytes };

/** The UTF-8 size of a value's JSON (a string is taken as JSON already). */
export function jsonBytes(value) {
  return utf8Bytes(typeof value === 'string' ? value : JSON.stringify(value ?? null));
}

/** The size of `text` in UTF-16 code units, as Web Storage quotas charge it. */
export function utf16Units(text) {
  return String(text).length;
}
