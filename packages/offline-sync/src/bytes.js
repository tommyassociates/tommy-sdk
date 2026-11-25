import { utf8Bytes } from './host-store/protocol.js';

export { utf8Bytes };

export function jsonBytes(value) {
  return utf8Bytes(typeof value === 'string' ? value : JSON.stringify(value ?? null));
}

export function utf16Units(text) {
  return String(text).length;
}

export const WRITE_BATCH_BYTES = 6 * 1024 * 1024;

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
