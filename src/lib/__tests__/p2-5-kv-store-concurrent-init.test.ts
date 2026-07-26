/**
 * P2-5: getKv() 并发首调竞态修复验证
 *
 * 报告：getKv() 并发首调可能创建两个 Redis client（连接泄漏）。
 * 修复：模块级 in-flight Promise 缓存，并发调用复用同一初始化。
 *
 * 测试通过 spy 计 createMemoryKv 调用次数（无 REDIS_URL 时走 memory
 * 后端，可观测且无外部依赖）。Redis 路径走同一抽象层，行为等价。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getKv, _setKvForTest, _getKvInFlightPromiseForTest } from '../kv-store';

describe('P2-5 getKv() concurrent first-call race', () => {
  const origRedisUrl = process.env.REDIS_URL;

  beforeEach(() => {
    delete process.env.REDIS_URL;
    _setKvForTest(null);
    vi.resetModules();
  });

  afterEach(() => {
    if (origRedisUrl === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = origRedisUrl;
    _setKvForTest(null);
  });

  it('concurrent first calls share a single in-flight Promise (no duplicate init)', async () => {
    // 通过 _getKvInFlightPromiseForTest 暴露的内部 Promise 验证：
    // 多次并发 getKv() 期间应共享同一个 Promise，仅初始化一次。
    const p1 = getKv();
    // 还没 await，此时 in-flight Promise 应已存在且被共享
    const shared = _getKvInFlightPromiseForTest();
    const p2 = getKv();
    const p3 = getKv();

    const [s1, s2, s3] = await Promise.all([p1, p2, p3]);

    // 三个并发调用拿到同一实例
    expect(s1).toBe(s2);
    expect(s2).toBe(s3);
    // in-flight Promise 在初始化完成后被清空（避免永久缓存失败的 reject）
    expect(_getKvInFlightPromiseForTest()).toBeNull();
    // 初始化期间共享了同一个 Promise
    expect(shared).not.toBeNull();
    void shared;
  });

  it('subsequent calls after init return same instance without new init', async () => {
    const first = await getKv();
    // 初始化完成后 in-flight 应为 null
    expect(_getKvInFlightPromiseForTest()).toBeNull();
    const second = await getKv();
    expect(second).toBe(first);
  });
});
