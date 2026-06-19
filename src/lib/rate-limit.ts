/**
 * Memory-based rate limiter (token bucket)
 *
 * Single-instance only (Railway replicas:1). Multi-instance would need Redis.
 * setInterval cleanup prevents Map unbounded growth under HN-traffic IP diversity.
 */

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, RateLimitBucket>();

const CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // 10 分钟扫一次
const DEFAULT_WINDOW_MS = 60 * 1000; // 1 分钟窗口

let cleanupTimer: NodeJS.Timeout | null = null;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number = DEFAULT_WINDOW_MS
): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  // 无 bucket 或已过期 = 新窗口
  if (!bucket || bucket.resetAt < now) {
    const newBucket: RateLimitBucket = { count: 1, resetAt: now + windowMs };
    buckets.set(key, newBucket);
    return { allowed: true, remaining: limit - 1, resetAt: newBucket.resetAt };
  }

  // 已达上限
  if (bucket.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: bucket.resetAt };
  }

  // 命中并计数
  bucket.count++;
  return { allowed: true, remaining: limit - bucket.count, resetAt: bucket.resetAt };
}

/**
 * 启动定时清理（去除过期 bucket）
 * 必须在 app 启动时调用一次
 */
export function startCleanup(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt < now) {
        buckets.delete(key);
      }
    }
  }, CLEANUP_INTERVAL_MS);
  // 不阻止进程退出（Node.js 0.10+）
  if (cleanupTimer.unref) cleanupTimer.unref();
}

/**
 * 重置所有状态（测试用）
 */
export function reset(): void {
  buckets.clear();
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}

/**
 * 当前 bucket 数（测试 + 监控用）
 */
export function getBucketCount(): number {
  return buckets.size;
}
