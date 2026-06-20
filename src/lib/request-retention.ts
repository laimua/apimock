/**
 * 请求记录保留策略
 *
 * mock 路由对每个请求（含 404 探测/扫描）都 insert 一条 requests 记录，无清理
 * 会让 SQLite 文件无限膨胀，反过来拖慢所有查询。本模块按"每端点保留最近 N 条"
 * 策略周期性 prune。
 *
 * 单实例内存定时器（同 rate-limit.ts 的限制：多副本下每个实例独立跑，但清理
 * 是幂等的，多跑无副作用）。
 */

import { db } from '@/lib/db';
import { requests } from './schema';
import { sql } from 'drizzle-orm';
import { pruneDeletedTotal } from './metrics';

const DEFAULT_KEEP_PER_ENDPOINT = 1000;
const DEFAULT_INTERVAL_MS = 10 * 60 * 1000; // 10 分钟

let retentionTimer: NodeJS.Timeout | null = null;

/**
 * 删除每个 endpoint_id 下超过 keep 条的旧记录。
 *
 * 实现：用 row_number() 窗口函数（SQLite 3.25+ / MySQL 8+ 支持）按 created_at
 * 降序排名，排名 > keep 的删除。
 *
 * 顶层 db.delete().where() query builder（drizzle 一等 API，两方言都支持，
 * production bundle 不会被 minify 打断）。窗口函数子查询走 sql`` 嵌入 where。
 *
 * 历史教训：之前用 (db as unknown as {execute}).execute(sql`...`) 在 dev 下
 * 能跑，但 production bundle 下 db.execute 不是函数（minify + 跨方言强转
 * 典型问题）。db.run 在 MySQL 下也不存在。db.delete().where() 避开两者。
 */
export async function pruneOldRequests(keep: number = DEFAULT_KEEP_PER_ENDPOINT): Promise<number> {
  try {
    const result = await db
      .delete(requests)
      .where(
        sql`id IN (
          SELECT id FROM (
            SELECT id,
                   ROW_NUMBER() OVER (PARTITION BY endpoint_id ORDER BY created_at DESC) AS rn
            FROM requests
          ) ranked
          WHERE rn > ${keep}
        )`
      );
    // 不同 driver 返回结构不同，尽力取 affected rows
    const affected = result as { changes?: number; affectedRows?: number; rowsAffected?: number } | undefined;
    const deleted = affected?.changes ?? affected?.affectedRows ?? affected?.rowsAffected ?? 0;
    if (deleted > 0) pruneDeletedTotal.inc(deleted);
    return deleted;
  } catch (err) {
    console.error('[request-retention] prune failed:', err);
    return -1;
  }
}

/**
 * 启动周期清理。仅启动一次。
 */
export function startRequestRetention(
  intervalMs: number = DEFAULT_INTERVAL_MS,
  keep: number = DEFAULT_KEEP_PER_ENDPOINT
): void {
  if (retentionTimer) return;
  // 启动后 1 分钟先跑一次（清掉 dev 时堆积的）
  setTimeout(() => { void pruneOldRequests(keep); }, 60 * 1000);
  retentionTimer = setInterval(() => { void pruneOldRequests(keep); }, intervalMs);
  if (retentionTimer.unref) retentionTimer.unref();
}

/**
 * 停止清理（测试用）
 */
export function stopRequestRetention(): void {
  if (retentionTimer) {
    clearInterval(retentionTimer);
    retentionTimer = null;
  }
}
