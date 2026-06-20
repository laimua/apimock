/**
 * 限流（基于 KV 抽象层）
 *
 * 算法：固定窗口计数器。每个 key 在窗口期内计数，超 limit 拒绝。
 *
 * 后端：
 *   - 无 REDIS_URL：进程内 Memory（单实例精确）
 *   - 有 REDIS_URL：Redis（多副本一致，INCR 原子 + 首次 EXPIRE）
 *
 * 语义变化（vs 旧 token bucket）：
 *   - 不再支持突发（token bucket 容量内可瞬时打满）
 *   - 改为严格窗口限流：每分钟硬上限，更适合防滥用场景
 *   - 窗口边界效应：临界点双倍流量可能漏过，可接受
 *
 * 调用方需 await。
 */

import { getKv } from './kv-store';

const DEFAULT_WINDOW_SEC = 60;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export async function rateLimit(
  key: string,
  limit: number,
  windowSec: number = DEFAULT_WINDOW_SEC
): Promise<RateLimitResult> {
  const kv = await getKv();
  const kvKey = `rl:${key}`;
  const count = await kv.incr(kvKey, 1, windowSec);
  const allowed = count <= limit;
  const remaining = Math.max(0, limit - count);
  const resetAt = Date.now() + windowSec * 1000;
  return { allowed, remaining, resetAt };
}

/**
 * 兼容旧 API（noop）：清理逻辑已下沉到 KV 后端（Memory 自带 TTL；Redis 自带 EXPIRE）。
 * 保留导出避免 instrumentation.ts 等老调用点报错。
 */
export function startCleanup(): void {
  // noop — TTL handled by backend
}

/**
 * 重置所有状态（测试用）。Memory 后端清空，Redis 后端 noop（避免误清生产数据）。
 */
export async function reset(): Promise<void> {
  const kv = await getKv();
  if (kv.backend === 'memory') {
    await kv.clear();
  }
}

/**
 * 当前 bucket 数（监控用）。Memory 后端返真实数，Redis 后端返 0（不查 SCAN 避免开销）。
 */
export async function getBucketCount(): Promise<number> {
  const kv = await getKv();
  if (kv.backend !== 'memory') return 0;
  return kv.delByPrefix('rl:').then((n) => n).catch(() => 0);
}
