/**
 * Project slug → row 缓存（mock 路由热路径优化）
 *
 * TTL 60s。进程内 Map。单实例适用，多副本需换 Redis。
 *
 * 失效传播（P1-6）：项目 CRUD（projects/[id]/route.ts）成功后调用
 * invalidateProjectCache 清掉本进程缓存。**多副本部署下本进程失效不传播**——
 * KVStore 预留的 pub/sub 未接线，其它副本最长 60s（TTL）后自然过期，期间
 * 旧 slug 的 mock 仍可命中其它副本的旧缓存（改名/关停/删除同理）。多副本
 * 场景请把 TTL 调小或接入共享 KV 后端，详见 docs/DEPLOY.md「缓存一致性」。
 */

import { db } from '@/lib/db';
import { projects } from '@/lib/schema';
import { eq } from 'drizzle-orm';

const TTL_MS = 60_000;

type ProjectRow = {
  id: string;
  isActive: number;
};

const cache = new Map<string, { project: ProjectRow; expiresAt: number }>();

export async function getCachedProject(slug: string): Promise<ProjectRow | null> {
  const now = Date.now();
  const entry = cache.get(slug);
  if (entry && entry.expiresAt > now) {
    return entry.project;
  }
  if (entry) cache.delete(slug);

  const list = await db.select().from(projects).where(eq(projects.slug, slug));
  if (list.length === 0) return null;

  const row = list[0];
  const project: ProjectRow = { id: row.id, isActive: row.isActive };
  cache.set(slug, { project, expiresAt: now + TTL_MS });
  return project;
}

export function invalidateProjectCache(slug?: string): void {
  if (slug) cache.delete(slug);
  else cache.clear();
}
