/**
 * Body size limit unit tests
 */

import { describe, it, expect } from 'vitest';
import { MAX_BODY_BYTES, isBodyTooLarge, utf8ByteLength } from '../body-size-limit';

describe('MAX_BODY_BYTES', () => {
  it('is 1MB (1_000_000 bytes)', () => {
    expect(MAX_BODY_BYTES).toBe(1_000_000);
  });
});

describe('isBodyTooLarge', () => {
  it('returns false for 0 bytes', () => {
    expect(isBodyTooLarge(0)).toBe(false);
  });

  it('returns false for exactly 1MB (boundary)', () => {
    expect(isBodyTooLarge(MAX_BODY_BYTES)).toBe(false);
  });

  it('returns true for 1MB + 1 byte', () => {
    expect(isBodyTooLarge(MAX_BODY_BYTES + 1)).toBe(true);
  });

  it('returns true for 10MB', () => {
    expect(isBodyTooLarge(10 * 1024 * 1024)).toBe(true);
  });
});

describe('utf8ByteLength', () => {
  it('returns ASCII length for ASCII string', () => {
    expect(utf8ByteLength('hello')).toBe(5);
  });

  it('returns 3 bytes per Chinese character', () => {
    // 中文 1 字符 = 3 字节 UTF-8
    expect(utf8ByteLength('你好')).toBe(6);
  });

  it('returns 4 bytes per emoji', () => {
    expect(utf8ByteLength('🚀')).toBe(4);
  });
});
