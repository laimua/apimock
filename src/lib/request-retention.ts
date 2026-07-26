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
 * 实现：LEFT JOIN 自连接按 (created_at, id) 降序排名。每行 r1 配对同 endpoint
 * 下比它新的 r2，COUNT(r2.id) >= keep 即 r1 排名在 keep 之后，删除。
 * 派生表 to_delete 绕 MySQL 1093（不能 DELETE 同时从同表直接 SELECT）。
 *
 * 兼容 MySQL 5.7（无 ROW_NUMBER）+ SQLite 3.x。不依赖 window function。
 *
 * NULL 桶：mock 未命中（404 探测/扫描）写 endpoint_id=NULL 的请求记录
 * （route.ts recordRequest(null,...)）。SQL NULL = NULL 永假，原 ON
 * `r2.endpoint_id = r1.endpoint_id` 对 NULL 行不配对，COUNT 恒 0，永不删除
 * → 存储单调无限增长（P0-1 之上叠加持续写盘 DoS）。这里把所有 NULL 行归
 * 同一虚拟桶（IS NULL AND IS NULL），与非 NULL 一样按 created_at 统一截断。
 *
 * 顶层 db.delete().where() query builder（drizzle 一等 API，两方言都支持，
 * production bundle 不会被 minify 打断）。子查询走 sql`` 嵌入 where。
 */
export async function pruneOldRequests(keep: number = DEFAULT_KEEP_PER_ENDPOINT): Promise<number> {
  try {
    const result = await db
      .delete(requests)
      .where(
        sql`id IN (
          SELECT id FROM (
            SELECT r1.id
            FROM requests r1
            LEFT JOIN requests r2
              ON (r2.endpoint_id = r1.endpoint_id
                  OR (r2.endpoint_id IS NULL AND r1.endpoint_id IS NULL))
             AND (r2.created_at > r1.created_at
                  OR (r2.created_at = r1.created_at AND r2.id > r1.id))
            GROUP BY r1.id
            HAVING COUNT(r2.id) >= ${keep}
          ) to_delete
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
