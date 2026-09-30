/**
 * bytes.test.js — the one UTF-8 measure every store byte budget uses, and
 * the UTF-16 count Web Storage quotas take.
 */
import { describe, it, expect } from 'vitest';
import { utf8Bytes, jsonBytes, utf16Units } from '../src/bytes.js';

const encoded = (text) => new TextEncoder().encode(text).byteLength;

describe('utf8Bytes', () => {
  it.each([
    ['', 0], ['plain', 5], ['é', 2], ['李', 3], ['😀', 4], ['\ud800', 3], ['a\udc00b', 5],
  ])('measures %j as TextEncoder does', (text, size) => {
    expect(utf8Bytes(text)).toBe(size);
    expect(utf8Bytes(text)).toBe(encoded(text));
  });

  it('measures long text, past the reused buffer, as TextEncoder does', () => {
    const text = 'Zoë 李 😀 '.repeat(200000);
    expect(utf8Bytes(text)).toBe(encoded(text));
    expect(utf8Bytes('é'.repeat(30000))).toBe(60000);
  });

  it('measures a value by its JSON, and counts UTF-16 code units apart', () => {
    expect(jsonBytes({ name: 'é' })).toBe(encoded('{"name":"é"}'));
    expect(jsonBytes(undefined)).toBe(4);
    expect(utf16Units('😀é')).toBe(3);
  });
});
