/**
 * Rate limit unit tests
 * Memory token bucket + setInterval cleanup
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { rateLimit, reset, startCleanup, getBucketCount } from '../rate-limit';

describe('rateLimit', () => {
  beforeEach(() => {
    reset();
  });

  it('allows first hit and returns remaining count', () => {
    const result = rateLimit('ip-1', 10);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
  });

  it('blocks after limit reached', () => {
    for (let i = 0; i < 10; i++) {
      rateLimit('ip-2', 10);
    }
    const result = rateLimit('ip-2', 10);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('resets counter after window expires', () => {
    vi.useFakeTimers();
    rateLimit('ip-3', 5);
    vi.advanceTimersByTime(61 * 1000); // 61 seconds
    const result = rateLimit('ip-3', 5);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
    vi.useRealTimers();
  });

  it('keeps different keys independent', () => {
    for (let i = 0; i < 10; i++) rateLimit('ip-A', 10);
    const a = rateLimit('ip-A', 10);
    const b = rateLimit('ip-B', 10);
    expect(a.allowed).toBe(false);
    expect(b.allowed).toBe(true);
    expect(b.remaining).toBe(9);
  });

  it('handles boundary: exactly limit hits allowed', () => {
    for (let i = 0; i < 9; i++) {
      const r = rateLimit('ip-4', 10);
      expect(r.allowed).toBe(true);
    }
    const tenth = rateLimit('ip-4', 10);
    expect(tenth.allowed).toBe(true);
    expect(tenth.remaining).toBe(0);
    const eleventh = rateLimit('ip-4', 10);
    expect(eleventh.allowed).toBe(false);
  });
});

describe('cleanup', () => {
  beforeEach(() => {
    reset();
  });

  afterEach(() => {
    reset();
  });

  it('startCleanup removes expired buckets periodically', () => {
    vi.useFakeTimers();
    // 加 3 个 bucket，全过期
    rateLimit('expired-1', 1);
    rateLimit('expired-2', 1);
    rateLimit('expired-3', 1);
    expect(getBucketCount()).toBe(3);

    // 时间过 61 秒，bucket 全过期
    vi.advanceTimersByTime(61 * 1000);

    startCleanup();
    // 触发 setInterval 第一次 tick（10 分钟周期）
    vi.advanceTimersByTime(10 * 60 * 1000);

    expect(getBucketCount()).toBe(0);
    vi.useRealTimers();
  });
});
