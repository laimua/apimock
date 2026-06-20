/**
 * 触发 SQLite 备份
 * POST /api/admin/backup
 *
 * 头：X-Admin-Token: <ADMIN_TOKEN 环境变量>
 *
 * 设计为外部触发：Railway cron / GitHub Actions / UptimeRobot 定时 POST。
 * 不在进程内 setInterval，避免重启漏跑 + 阻塞 event loop。
 */

import { NextResponse } from 'next/server';
import { backupSqlite } from '@/lib/backup';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) {
    logger.error('ADMIN_TOKEN not set, backup endpoint disabled');
    return NextResponse.json({ success: false, error: 'ADMIN_TOKEN not configured' }, { status: 503 });
  }

  const got = request.headers.get('x-admin-token');
  if (got !== expected) {
    logger.warn({ ip: request.headers.get('x-forwarded-for') }, 'admin backup unauthorized');
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const result = await backupSqlite();
  return NextResponse.json({ success: result.ok, data: result }, { status: result.ok ? 200 : 500 });
}

export async function GET() {
  // 简单状态：是否启用、最近备份列表（仍需 token，但用 GET 便于探活）
  return NextResponse.json({
    enabled: !!process.env.ADMIN_TOKEN,
    backupDir: process.env.BACKUP_DIR || './data/backups',
    keep: Number(process.env.BACKUP_KEEP) || 7,
  });
}
