/**
 * Rate limit unit tests
 * KV-backed fixed window counter
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { rateLimit, reset, startCleanup, getBucketCount } from '../rate-limit';

describe('rateLimit', () => {
  beforeEach(async () => {
    await reset();
  });

  it('allows first hit and returns remaining count', async () => {
    const result = await rateLimit('ip-1', 10);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
  });

  it('blocks after limit reached', async () => {
    for (let i = 0; i < 10; i++) {
      await rateLimit('ip-2', 10);
    }
    const result = await rateLimit('ip-2', 10);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('resets counter after window expires', async () => {
    vi.useFakeTimers();
    await rateLimit('ip-3', 5, 60);
    vi.advanceTimersByTime(61 * 1000);
    const result = await rateLimit('ip-3', 5, 60);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
    vi.useRealTimers();
  });

  it('keeps different keys independent', async () => {
    for (let i = 0; i < 10; i++) await rateLimit('ip-A', 10);
    const a = await rateLimit('ip-A', 10);
    const b = await rateLimit('ip-B', 10);
    expect(a.allowed).toBe(false);
    expect(b.allowed).toBe(true);
    expect(b.remaining).toBe(9);
  });

  it('handles boundary: exactly limit hits allowed', async () => {
    for (let i = 0; i < 9; i++) {
      const r = await rateLimit('ip-4', 10);
      expect(r.allowed).toBe(true);
    }
    const tenth = await rateLimit('ip-4', 10);
    expect(tenth.allowed).toBe(true);
    expect(tenth.remaining).toBe(0);
    const eleventh = await rateLimit('ip-4', 10);
    expect(eleventh.allowed).toBe(false);
  });
});

describe('cleanup (noop under kv)', () => {
  beforeEach(async () => {
    await reset();
  });

  it('startCleanup is noop, no throw', () => {
    expect(() => startCleanup()).not.toThrow();
  });

  it('getBucketCount returns number (memory backend)', async () => {
    await rateLimit('ip-X', 5);
    const n = await getBucketCount();
    expect(n).toBeGreaterThanOrEqual(0);
  });
});
