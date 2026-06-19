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
import { sql } from 'drizzle-orm';

const DEFAULT_KEEP_PER_ENDPOINT = 1000;
const DEFAULT_INTERVAL_MS = 10 * 60 * 1000; // 10 分钟

let retentionTimer: NodeJS.Timeout | null = null;

/**
 * 删除每个 endpoint_id 下超过 keep 条的旧记录。
 *
 * 实现：用 row_number() 窗口函数（SQLite 3.25+ / MySQL 8+ 支持）按 created_at
 * 降序排名，排名 > keep 的删除。
 *
 * 统一走 db.execute：SQLite BaseSQLiteDatabase 和 MySQL MySqlDatabase 都有
 * execute()，但只有 SQLite 有 run()。db.run 在 MySQL 下 undefined，会导致
 * 清理永远不跑（codex 复核发现的回归）。
 */
export async function pruneOldRequests(keep: number = DEFAULT_KEEP_PER_ENDPOINT): Promise<number> {
  try {
    const result = await (db as unknown as { execute: (q: unknown) => Promise<unknown> }).execute(
      sql`DELETE FROM requests
        WHERE id IN (
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
    return affected?.changes ?? affected?.affectedRows ?? affected?.rowsAffected ?? 0;
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
