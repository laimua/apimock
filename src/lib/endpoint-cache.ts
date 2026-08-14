/**
 * Endpoint 路由表缓存（mock 路由热路径优化）
 *
 * 按 (projectId, method) 缓存该范围下所有 endpoints，精确匹配 + 参数路径模糊
 * 匹配共用同一份数据。TTL 60s。进程内 Map。单实例适用，多副本需换 Redis。
 *
 * 端点 CRUD 应调用 invalidateEndpointCache(projectId?) 失效。
 */

import { db } from '@/lib/db';
import { endpoints } from '@/lib/schema';
import { eq, and, asc } from 'drizzle-orm';

type HttpMethod = string;

const TTL_MS = 60_000;

const cache = new Map<string, { list: typeof endpoints.$inferSelect[]; expiresAt: number }>();

// C4a: 过期清扫(同 project-cache)——惰性删除对只访问一次的 key 无效,
// 定时兜底防 Map 无界增长;unref 不阻塞进程退出。
const SWEEP_INTERVAL_MS = 60_000;
const sweepTimer = setInterval(() => {
  const now = Date.now();
  for (const [k, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(k);
  }
}, SWEEP_INTERVAL_MS);
sweepTimer.unref?.();

function key(projectId: string, method: HttpMethod): string {
  return `${projectId}:${method}`;
}

/**
 * C5: 路由具体度。字面段越多越具体(/users/:id/roles 比 /users/:userId/:x 具体)。
 * 参数段(:xxx)视为通配,具体度最低。用于排序:更具体的排前面,
 * mock 模糊匹配循环取首个命中即为最具体命中(修复 /users/me 被 /users/:id 抢走)。
 */
export function countLiteralSegments(path: string): number {
  return path
    .split('/')
    .filter((seg) => seg !== '' && !seg.startsWith(':')).length;
}

/**
 * C5: 按具体度排序(缓存层排好,findEndpoint 直接顺序取)。
 * 主键:字面段数 desc;次级键:P2-12 的 createdAt asc(具体度并列时保持
 * 原有确定性语义——取最早创建的)。
 */
export function sortBySpecificity<T extends { path: string; createdAt: number }>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const lit = countLiteralSegments(b.path) - countLiteralSegments(a.path);
    if (lit !== 0) return lit;
    return a.createdAt - b.createdAt;
  });
}

export async function getCachedEndpointsByMethod(
  projectId: string,
  method: HttpMethod
): Promise<typeof endpoints.$inferSelect[]> {
  const k = key(projectId, method);
  const now = Date.now();
  const entry = cache.get(k);
  if (entry && entry.expiresAt > now) {
    return entry.list;
  }
  if (entry) cache.delete(k);

  // P2-12:加 ORDER BY created_at 保证确定性(此前无 ORDER BY 时命中依赖存储顺序)。
  // C5:DB 层保底 createdAt asc,内存再按具体度(字面段数 desc)排序——
  // /users/me 比 /users/:id 具体,必须先命中。主键具体度、次级键 createdAt。
  const rows = await db
    .select()
    .from(endpoints)
    .where(and(eq(endpoints.projectId, projectId), eq(endpoints.method, method as typeof endpoints.method.enumValues[number])))
    .orderBy(asc(endpoints.createdAt));

  const list = sortBySpecificity(rows);
  cache.set(k, { list, expiresAt: now + TTL_MS });
  return list;
}

export function invalidateEndpointCache(projectId?: string): void {
  if (!projectId) {
    cache.clear();
    return;
  }
  const prefix = `${projectId}:`;
  for (const k of cache.keys()) {
    if (k.startsWith(prefix)) cache.delete(k);
  }
}
