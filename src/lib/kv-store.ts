/**
 * KV 抽象层（统一 Memory / Redis 双后端）
 *
 * 实际接入情况(注意:并非所有缓存都走 kv):
 *   - rate-limit / ai-budget:走 kv.* 接口,按 REDIS_URL 自动切后端。
 *   - project-cache / endpoint-cache:**不调 kv**,各自用进程内 Map(单实例精确,
 *     多副本靠 TTL 兜底)。
 *
 * 按 REDIS_URL 自动切后端:无 Redis 走 Memory（单实例精确），有 Redis 走
 * ioredis（多副本一致）。
 *
 * 设计取舍：限流用固定窗口计数器（INCR + EXPIRE）而非 token bucket。
 * 原因：Redis 原子 INCR 远比 token bucket 的 Lua 脚本简单，且窗口短（60s）
 * 边界效应可接受。Memory 后端也用同样语义，切换无行为差异。
 */

import { logger } from './logger';

export interface KVStore {
  /** 取值。不存在返 null */
  get(key: string): Promise<string | null>;

  /** 设值。ttlSec 缺省时永久 */
  set(key: string, value: string, ttlSec?: number): Promise<void>;

  /** 原子自增 by（默认 1），返回自增后值。首次自增时设 ttlSec */
  incr(key: string, by?: number, ttlSec?: number): Promise<number>;

  /** 删 key */
  del(key: string): Promise<void>;

  /** 按前缀批量删。用于缓存失效 */
  delByPrefix(prefix: string): Promise<number>;

  /** 按前缀计数（非破坏性）。用于监控，不删 key */
  countByPrefix(prefix: string): Promise<number>;

  /** 清空（仅测试 / 失效全部） */
  clear(): Promise<void>;

  /** pub/sub（可选实现，Memory noop 也 OK，TTL 兜底） */
  publish?(channel: string, message: string): Promise<void>;
  subscribe?(channel: string, callback: (message: string) => void): Promise<void>;

  /** 后端类型（debug 用） */
  readonly backend: 'memory' | 'redis';
}

let _store: KVStore | null = null;
// in-flight 初始化 Promise。并发首调竞态修复（P2-5）：两个调用者同时进入
// getKv() 且 _store 尚未赋值时，会各自创建 Redis client → 连接泄漏。
// 复用同一 Promise 让并发调用等同一个初始化结果。
let _storePromise: Promise<KVStore> | null = null;

/**
 * 取当前 KV 实例。首次调用按 REDIS_URL 决定后端，后续复用。
 *
 * 并发首调安全：通过模块级 in-flight Promise 缓存，并发的首个调用共享
 * 同一次初始化，不会重复创建 Redis client（P2-5）。
 *
 * Redis 初始化失败时 fallback Memory，log warn，不阻断启动。
 */
export async function getKv(): Promise<KVStore> {
  if (_store) return _store;
  if (_storePromise) return _storePromise;

  _storePromise = (async () => {
    const redisUrl = process.env.REDIS_URL;
    let store: KVStore;
    if (redisUrl) {
      try {
        const { createRedisKv } = await import('./kv-redis');
        store = await createRedisKv(redisUrl);
      } catch (err) {
        logger.warn({ err }, '[kv] Redis init failed, falling back to memory');
        const { createMemoryKv } = await import('./kv-memory');
        store = createMemoryKv();
      }
    } else {
      const { createMemoryKv } = await import('./kv-memory');
      store = createMemoryKv();
    }
    _store = store;
    return store;
  })();

  try {
    return await _storePromise;
  } finally {
    // 初始化完成（成功或失败）后清掉 in-flight Promise：
    // 失败时下次调用应重试，而不是永久返回同一被 reject 的 Promise。
    _storePromise = null;
  }
}

/** 测试用：强制注入 KV 实例（同时清掉 in-flight Promise） */
export function _setKvForTest(store: KVStore | null): void {
  _store = store;
  _storePromise = null;
}

/** 测试用：观察 in-flight Promise 状态（P2-5 测试用） */
export function _getKvInFlightPromiseForTest(): Promise<KVStore> | null {
  return _storePromise;
}
