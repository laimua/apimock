/**
 * KV 抽象层（统一 Memory / Redis 双后端）
 *
 * 上层（rate-limit / project-cache / endpoint-cache / ai-budget）调 kv.* 接口，
 * 按 REDIS_URL 自动切后端。无 Redis 走 Memory（单实例精确），有 Redis 走
 * ioredis（多副本一致）。
 *
 * 设计取舍：限流用固定窗口计数器（INCR + EXPIRE）而非 token bucket。
 * 原因：Redis 原子 INCR 远比 token bucket 的 Lua 脚本简单，且窗口短（60s）
 * 边界效应可接受。Memory 后端也用同样语义，切换无行为差异。
 */

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

  /** 清空（仅测试 / 失效全部） */
  clear(): Promise<void>;

  /** pub/sub（可选实现，Memory noop 也 OK，TTL 兜底） */
  publish?(channel: string, message: string): Promise<void>;
  subscribe?(channel: string, callback: (message: string) => void): Promise<void>;

  /** 后端类型（debug 用） */
  readonly backend: 'memory' | 'redis';
}

let _store: KVStore | null = null;

/**
 * 取当前 KV 实例。首次调用按 REDIS_URL 决定后端，后续复用。
 *
 * Redis 初始化失败时 fallback Memory，log warn，不阻断启动。
 */
export async function getKv(): Promise<KVStore> {
  if (_store) return _store;

  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    try {
      const { createRedisKv } = await import('./kv-redis');
      _store = await createRedisKv(redisUrl);
    } catch (err) {
      console.warn('[kv] Redis init failed, falling back to memory:', err);
      const { createMemoryKv } = await import('./kv-memory');
      _store = createMemoryKv();
    }
  } else {
    const { createMemoryKv } = await import('./kv-memory');
    _store = createMemoryKv();
  }

  return _store;
}

/** 测试用：强制注入 KV 实例 */
export function _setKvForTest(store: KVStore | null): void {
  _store = store;
}
