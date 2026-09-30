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

/**
 * The most UTF-8 bytes of rows one write batch carries: well inside the host
 * store's 8 MiB limit on a commit, a keyed read and a complete set, with room
 * for the storage fields a store adds to each row.
 */
export const WRITE_BATCH_BYTES = 6 * 1024 * 1024;

/**
 * `items` in order, in batches of at most `maxItems` items and about
 * `maxBytes` bytes (`sizeOf(item)`, the JSON size by default). A batch is
 * closed before the item that would take it past either bound; an item
 * larger than `maxBytes` alone is a batch of its own, for its store to judge.
 */
export function boundedBatches(items, { maxItems, maxBytes = WRITE_BATCH_BYTES, sizeOf = jsonBytes }) {
  const batches = [];
  let batch = [];
  let size = 0;
  for (const item of items) {
    const length = sizeOf(item);
    if (batch.length && (batch.length >= maxItems || size + length > maxBytes)) {
      batches.push(batch);
      batch = [];
      size = 0;
    }
    batch.push(item);
    size += length;
  }
  if (batch.length) batches.push(batch);
  return batches;
}
