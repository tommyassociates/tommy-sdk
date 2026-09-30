/**
 * The one measure every byte budget of the host and MP stores uses: the size
 * of text in UTF-8, as the stores keep it and as a whole read, a held-rows
 * cache, a commit batch or a quota counts it. (Web Storage is the exception:
 * the browser charges it in UTF-16 code units, `utf16Units`.)
 */
const encoder = new TextEncoder();
// Reused for the text that fits (at most three bytes a UTF-16 code unit).
const SCRATCH_LIMIT = 1024 * 1024;
let scratch = new Uint8Array(64 * 1024);

/** The UTF-8 size of `text`, in bytes. */
export function utf8Bytes(text) {
  const string = String(text);
  const most = string.length * 3;
  if (most > scratch.length) {
    if (most > SCRATCH_LIMIT) return encoder.encode(string).byteLength;
    scratch = new Uint8Array(most);
  }
  return encoder.encodeInto(string, scratch).written;
}

/** The UTF-8 size of a value's JSON (a string is taken as JSON already). */
export function jsonBytes(value) {
  return utf8Bytes(typeof value === 'string' ? value : JSON.stringify(value ?? null));
}

/** The size of `text` in UTF-16 code units, as Web Storage quotas charge it. */
export function utf16Units(text) {
  return String(text).length;
}
