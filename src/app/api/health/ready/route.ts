/**
 * Readiness probe — 深探活
 * GET /api/health/ready → 200 当 DB 可查 + 数据目录可写；503 + 原因当任一失败
 *
 * 用于 K8s / Railway readiness probe：失败时从负载均衡剔除，但不重启进程。
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET() {
  const checks: { name: string; ok: boolean; error?: string }[] = [];

  // 1. DB 可查（轻量 select 1）。用 query builder 而非 db.execute（后者在
  // production bundle 下跨方言强转会被 minify 打断）。
  try {
    await db.select({ c: sql`1` }).from(sql`(select 1 as c) as t`);
    checks.push({ name: 'db', ok: true });
  } catch (err) {
    // P2-21: health/ready 是公开路由（匿名访问者可触发）。原始异常 message
    // 可能含驱动/SQL 路径细节（如 `SQLITE_CANTOPEN: /app/data/x.db`），
    // 泄露给匿名访问者属低危信息泄露。细节进 logger（受 redact 保护，
    // 仅服务端可见），对外只回固定文案。
    logger.error({ err }, 'health/ready database check failed');
    checks.push({ name: 'db', ok: false, error: 'database check failed' });
  }

  // 2. 数据目录可写（仅 SQLite 模式；MySQL 模式无本地文件，跳过避免误判）
  const dbType = (process.env.DB_TYPE || 'sqlite').toLowerCase();
  if (dbType === 'sqlite') {
    // SQLITE_PATH 指向数据库文件，取其目录作为数据目录（而非把文件路径当目录）
    const dbFilePath = process.env.SQLITE_PATH || './data/apimock.db';
    const dataDir = path.dirname(path.resolve(dbFilePath));
    try {
      const probe = path.join(dataDir, `.ready-probe-${Date.now()}`);
      fs.writeFileSync(probe, '');
      fs.unlinkSync(probe);
      checks.push({ name: 'fs', ok: true });
    } catch (err) {
      // P2-21: 同上，文件系统异常 message 可能含绝对路径细节，不外泄给匿名访问者。
      logger.error({ err }, 'health/ready filesystem check failed');
      checks.push({ name: 'fs', ok: false, error: 'filesystem check failed' });
    }
  }

  const allOk = checks.every((c) => c.ok);
  return NextResponse.json(
    { status: allOk ? 'ready' : 'degraded', checks, dbType },
    { status: allOk ? 200 : 503 }
  );
}
