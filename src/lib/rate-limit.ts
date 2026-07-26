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
 * 故障语义（P1-19）：限流是防滥用、不是可用性关键路径。KV 后端运行时
 * 故障（Redis 网络分区 / Memory 罕见抛错）时 fail-open：放行 + logger.error
 * + rateLimitErrorTotal 指标。绝不静默吞错，也绝不因限流挂掉让 mock 业务
 * 500。一层 try/catch 覆盖抽象层所有 backend（rateLimit 只调 getKv().incr，
 * 不直接接触 kv-redis / kv-memory，故 Redis / Memory 两路径都被覆盖）。
 *
 * 调用方需 await。
 */

import { getKv } from './kv-store';
import { logger } from './logger';
import { rateLimitErrorTotal } from './metrics';

const DEFAULT_WINDOW_SEC = 60;

export type RateLimitKind = 'mock' | 'ai' | 'login' | 'ai-test' | (string & {});

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export async function rateLimit(
  key: string,
  limit: number,
  windowSec: number = DEFAULT_WINDOW_SEC,
  kind: RateLimitKind
): Promise<RateLimitResult> {
  const kv = await getKv();
  const kvKey = `rl:${key}`;
  try {
    const count = await kv.incr(kvKey, 1, windowSec);
    const allowed = count <= limit;
    const remaining = Math.max(0, limit - count);
    const resetAt = Date.now() + windowSec * 1000;
    return { allowed, remaining, resetAt };
  } catch (err) {
    // fail-open：放行，不阻塞业务。响应头填"假装正常"值（首次命中），
    // 不暴露内部故障；同时必须有可观测信号（logger + 指标），禁止静默。
    logger.error({ err, key: kvKey, kind, limit }, 'rate limit KV error, failing open');
    rateLimitErrorTotal.inc({ kind });
    return {
      allowed: true,
      remaining: Math.max(0, limit - 1),
      resetAt: Date.now() + windowSec * 1000,
    };
  }
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
 * 当前 bucket 数（监控用，非破坏性）。
 * Memory 后端遍历计数；Redis 后端 SCAN 计数（不删，不影响限流状态）。
 */
export async function getBucketCount(): Promise<number> {
  const kv = await getKv();
  return kv.countByPrefix('rl:').catch(() => 0);
}
