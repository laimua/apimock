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
import { eq, and } from 'drizzle-orm';

type HttpMethod = string;

const TTL_MS = 60_000;

const cache = new Map<string, { list: typeof endpoints.$inferSelect[]; expiresAt: number }>();

function key(projectId: string, method: HttpMethod): string {
  return `${projectId}:${method}`;
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

  const list = await db
    .select()
    .from(endpoints)
    .where(and(eq(endpoints.projectId, projectId), eq(endpoints.method, method as typeof endpoints.method.enumValues[number])));

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
