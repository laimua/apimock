/**
 * Rate limit unit tests
 * KV-backed fixed window counter
 *
 * P1-19 覆盖:KV 后端故障时 fail-open(放行 + logger.error + 指标)。
 * 同时覆盖 Redis 和 Memory 两路径:rateLimit 只调 kv-store 抽象层,故通过
 * _setKvForTest 注入一个会抛错的 mock store 即代表"任意 backend 抛错"。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { rateLimit, reset, startCleanup, getBucketCount } from '../rate-limit';
import { _setKvForTest } from '../kv-store';
import type { KVStore } from '../kv-store';
import { logger } from '../logger';

describe('rateLimit', () => {
  beforeEach(async () => {
    await reset();
  });

  it('allows first hit and returns remaining count', async () => {
    const result = await rateLimit('ip-1', 10, 60, 'mock');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
  });

  it('blocks after limit reached', async () => {
    for (let i = 0; i < 10; i++) {
      await rateLimit('ip-2', 10, 60, 'mock');
    }
    const result = await rateLimit('ip-2', 10, 60, 'mock');
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('resets counter after window expires', async () => {
    vi.useFakeTimers();
    await rateLimit('ip-3', 5, 60, 'mock');
    vi.advanceTimersByTime(61 * 1000);
    const result = await rateLimit('ip-3', 5, 60, 'mock');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
    vi.useRealTimers();
  });

  it('keeps different keys independent', async () => {
    for (let i = 0; i < 10; i++) await rateLimit('ip-A', 10, 60, 'mock');
    const a = await rateLimit('ip-A', 10, 60, 'mock');
    const b = await rateLimit('ip-B', 10, 60, 'mock');
    expect(a.allowed).toBe(false);
    expect(b.allowed).toBe(true);
    expect(b.remaining).toBe(9);
  });

  it('handles boundary: exactly limit hits allowed', async () => {
    for (let i = 0; i < 9; i++) {
      const r = await rateLimit('ip-4', 10, 60, 'mock');
      expect(r.allowed).toBe(true);
    }
    const tenth = await rateLimit('ip-4', 10, 60, 'mock');
    expect(tenth.allowed).toBe(true);
    expect(tenth.remaining).toBe(0);
    const eleventh = await rateLimit('ip-4', 10, 60, 'mock');
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
    await rateLimit('ip-X', 5, 60, 'mock');
    const n = await getBucketCount();
    expect(n).toBeGreaterThanOrEqual(0);
  });
});

/**
 * P1-19:KV 后端故障 → fail-open。
 * 通过 _setKvForTest 注入会抛错的 mock store,代表任意 backend(Redis/Memory)
 * 运行时抛错的情况。rateLimit 调的是抽象层 getKv().incr,与具体 backend 解耦,
 * 所以这里注入的 mock 同时覆盖两条路径。
 */
describe('rateLimit fail-open on KV error (P1-19)', () => {
  let savedStore: KVStore | null;

  beforeEach(() => {
    // 保留默认 store,本组每个用例手动注入抛错 store
    savedStore = null;
  });

  afterEach(() => {
    // 复位注入,避免泄漏到其它 describe
    _setKvForTest(savedStore);
    vi.restoreAllMocks();
  });

  /** 构造一个 incr 永远抛错的 KVStore(模拟 Redis 网络分区 / Memory 罕见抛错) */
  function makeThrowingKv(): KVStore {
    return {
      backend: 'redis',
      async get() {
        return null;
      },
      async set() {
        /* noop */
      },
      async incr() {
        throw new Error('simulated KV outage (redis network partition)');
      },
      async del() {
        /* noop */
      },
      async delByPrefix() {
        return 0;
      },
      async countByPrefix() {
        return 0;
      },
      async clear() {
        /* noop */
      },
    };
  }

  it('KV incr throws → fail-open: allowed=true', async () => {
    _setKvForTest(makeThrowingKv());
    const result = await rateLimit('partition-ip', 10, 60, 'mock');
    expect(result.allowed).toBe(true);
  });

  it('KV incr throws → response header hides internal failure', async () => {
    // remaining 应当是"假装首次命中"的合理值(limit-1),不是负数或 0,
    // 避免暴露内部故障给客户端。resetAt 必须是未来时间戳。
    _setKvForTest(makeThrowingKv());
    const before = Date.now();
    const result = await rateLimit('partition-ip', 10, 60, 'mock');
    expect(result.remaining).toBe(9); // limit - 1 = 9
    expect(result.resetAt).toBeGreaterThanOrEqual(before + 59_000);
    expect(result.resetAt).toBeLessThanOrEqual(before + 61_000);
  });

  it('KV incr throws → logger.error called with key + kind', async () => {
    _setKvForTest(makeThrowingKv());
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => logger);
    await rateLimit('partition-ip', 10, 60, 'mock');
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [ctx, msg] = errorSpy.mock.calls[0];
    expect(msg).toMatch(/rate limit KV error/i);
    expect(ctx as Record<string, unknown>).toMatchObject({
      key: 'rl:partition-ip',
      kind: 'mock',
      limit: 10,
    });
    expect((ctx as Record<string, unknown>).err).toBeInstanceOf(Error);
  });

  it('KV incr throws → rateLimitErrorTotal metric exposes kind label', async () => {
    _setKvForTest(makeThrowingKv());
    await rateLimit('partition-ip', 10, 60, 'ai');
    // prom-client Counter.inc 不便于直接读回,改通过 metrics 输出文本验证指标存在
    // 且 kind label 正确(下方用例进一步验证"递增"行为)。
    const { metricsOutput } = await import('../metrics');
    const out = await metricsOutput();
    expect(out).toContain('apimock_rate_limit_error_total');
    expect(out).toContain('kind="ai"');
  });

  it('fail-open path does not silently swallow errors (logger + metric both fire)', async () => {
    _setKvForTest(makeThrowingKv());
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => logger);
    const { metricsOutput } = await import('../metrics');
    const before = (await metricsOutput()).match(/apimock_rate_limit_error_total\{kind="login"\} (\d+)/);
    const beforeVal = before ? Number(before[1]) : 0;

    await rateLimit('partition-login', 5, 60, 'login');

    expect(errorSpy).toHaveBeenCalledTimes(1); // 可观测信号 1:日志
    const after = (await metricsOutput()).match(/apimock_rate_limit_error_total\{kind="login"\} (\d+)/);
    const afterVal = after ? Number(after[1]) : 0;
    expect(afterVal).toBe(beforeVal + 1); // 可观测信号 2:指标递增
  });

  it('normal incr path → does NOT trigger fail-open (no logger, no error metric)', async () => {
    // 注入正常 store:incr 始终返回 1(首次命中)
    const healthyKv: KVStore = {
      backend: 'memory',
      async get() {
        return null;
      },
      async set() {
        /* noop */
      },
      async incr() {
        return 1;
      },
      async del() {
        /* noop */
      },
      async delByPrefix() {
        return 0;
      },
      async countByPrefix() {
        return 0;
      },
      async clear() {
        /* noop */
      },
    };
    _setKvForTest(healthyKv);
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => logger);
    const result = await rateLimit('healthy-ip', 10, 60, 'mock');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9); // limit - count(=1) = 9
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('KV error path works regardless of backend label (Memory-style backend also fail-open)', async () => {
    // 即使 backend 标 memory,incr 抛错同样 fail-open —— 抽象层一层 try/catch 覆盖
    const memoryThrowing: KVStore = {
      ...makeThrowingKv(),
      backend: 'memory',
    };
    _setKvForTest(memoryThrowing);
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => logger);
    const result = await rateLimit('mem-fail-ip', 10, 60, 'mock');
    expect(result.allowed).toBe(true);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});
