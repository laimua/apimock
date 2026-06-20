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

export const dynamic = 'force-dynamic';

export async function GET() {
  const checks: { name: string; ok: boolean; error?: string }[] = [];

  // 1. DB 可查（轻量 SELECT 1）
  try {
    await (db as unknown as { execute: (q: unknown) => Promise<unknown> }).execute(sql`SELECT 1`);
    checks.push({ name: 'db', ok: true });
  } catch (err) {
    checks.push({ name: 'db', ok: false, error: err instanceof Error ? err.message : String(err) });
  }

  // 2. 数据目录可写（仅 SQLite 模式；MySQL 模式无本地文件，跳过避免误判）
  const dbType = (process.env.DB_TYPE || 'sqlite').toLowerCase();
  if (dbType === 'sqlite') {
    const dataDir = path.resolve(process.env.SQLITE_PATH || './data');
    try {
      const probe = path.join(dataDir, `.ready-probe-${Date.now()}`);
      fs.writeFileSync(probe, '');
      fs.unlinkSync(probe);
      checks.push({ name: 'fs', ok: true });
    } catch (err) {
      checks.push({ name: 'fs', ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  const allOk = checks.every((c) => c.ok);
  return NextResponse.json(
    { status: allOk ? 'ready' : 'degraded', checks, dbType },
    { status: allOk ? 200 : 503 }
  );
}
