/**
 * 备份端点
 * POST /api/admin/backup — 触发备份
 * GET  /api/admin/backup — 状态查询（enabled / dir / keep）
 *
 * 两方法均需头 X-Admin-Token: <ADMIN_TOKEN>。
 * ADMIN_TOKEN 未配置时返 503（端点禁用）。
 *
 * 设计为外部触发：Railway cron / GitHub Actions / UptimeRobot 定时 POST。
 * 不在进程内 setInterval，避免重启漏跑 + 阻塞 event loop。
 */

import { NextResponse } from 'next/server';
import { backupSqlite } from '@/lib/backup';
import { logger } from '@/lib/logger';
import { safeEqual } from '@/lib/crypto-utils';
import { success, Errors } from '@/lib/api';

export const dynamic = 'force-dynamic';

function checkAdminToken(request: Request): NextResponse | null {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) {
    logger.error('ADMIN_TOKEN not set, backup endpoint disabled');
    return NextResponse.json({ success: false, error: 'ADMIN_TOKEN not configured' }, { status: 503 });
  }
  const got = request.headers.get('x-admin-token');
  if (!safeEqual(got ?? '', expected)) {
    logger.warn({ ip: request.headers.get('x-forwarded-for') }, 'admin backup unauthorized');
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

export async function POST(request: Request) {
  const denied = checkAdminToken(request);
  if (denied) return denied;

  const result = await backupSqlite();
  if (!result.ok) {
    return Errors.internal(result.error || 'Backup failed');
  }
  return success(result);
}

export async function GET(request: Request) {
  const denied = checkAdminToken(request);
  if (denied) return denied;

  const rawKeep = Number(process.env.BACKUP_KEEP);
  const keep = Number.isInteger(rawKeep) && rawKeep >= 0 ? rawKeep : 7;

  return NextResponse.json({
    enabled: true,
    backupDir: process.env.BACKUP_DIR || './data/backups',
    keep,
  });
}
