/**
 * SQLite 在线备份
 *
 * WAL 模式下 .backup() 取一致快照（db-sqlite.ts 已开 WAL）。
 * 外部触发：POST /api/admin/backup（Railway cron / GitHub Actions / UptimeRobot）。
 * 不在进程内 setInterval，避免重启漏跑 + 阻塞 event loop。
 *
 * 备份输出：./data/backups/apimock-YYYY-MM-DDTHH-MM-SS-mmm.db (UTC)
 * 文件名带毫秒精度 + 随机后缀，同秒并发两次 POST 不会撞同路径（P2-6）。
 * 进程内互斥：同一进程同时只允许一个备份进行，第二个返 conflict（P2-6）。
 *
 * 滚动保留：默认 7 份，超过自动删最旧。
 * BACKUP_KEEP=0 视为误配：拒绝备份（P2-33），因它会连当前这份一并删掉。
 */

import { sqliteDb } from './db-sqlite';
import * as fs from 'fs';
import * as path from 'path';
import { randomBytes } from 'crypto';
import { logger } from './logger';

const BACKUP_DIR = process.env.BACKUP_DIR || './data/backups';
const rawKeep = Number(process.env.BACKUP_KEEP);
// BACKUP_KEEP=0 视为"禁用备份"（误配保护，P2-33）
// 不能用 `|| 7` 静默覆盖；0 与缺失都进 isNaN 分支走默认 7，仅显式 0 走禁用
const KEEP_COUNT = Number.isFinite(rawKeep) && Number.isInteger(rawKeep) && rawKeep > 0
  ? rawKeep
  : 7;

export type BackupFailReason = 'disabled' | 'in_progress';

export interface BackupResult {
  ok: boolean;
  file?: string;
  sizeBytes?: number;
  error?: string;
  /** 失败原因码（业务层据此映射状态码，如 in_progress → 409） */
  reason?: BackupFailReason;
  pruned?: string[];
}

// 进程内互斥（P2-6）：同一时刻只允许一个备份进行。
// Node 单线程 + better-sqlite3 .backup() 是异步的，第二个并发调用会撞同
// 快照源 / 或读到写了一半的文件。简单 boolean 即可保证进程级串行化。
let backupInProgress = false;

export async function backupSqlite(): Promise<BackupResult> {
  // P2-33: BACKUP_KEEP=0 = 禁用保留 = 会把刚创建的备份也删掉 → 拒绝
  if (rawKeep === 0) {
    logger.warn(
      { BACKUP_KEEP: 0 },
      'backup rejected: BACKUP_KEEP=0 would delete the just-created backup; set BACKUP_KEEP>=1 or unset to disable'
    );
    return {
      ok: false,
      reason: 'disabled',
      error: 'BACKUP_KEEP=0 is not allowed (would delete the just-created backup)',
    };
  }

  // P2-6: 进程内互斥
  if (backupInProgress) {
    logger.warn('backup skipped: another backup is already in progress');
    return {
      ok: false,
      reason: 'in_progress',
      error: 'Another backup is already in progress',
    };
  }
  backupInProgress = true;
  try {
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }

    // P2-6: 毫秒精度 + 6 字节随机后缀，杜绝同秒并发冲突
    const now = new Date();
    const stamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 23); // YYYY-MM-DDTHH-MM-SS-mmm
    const suffix = randomBytes(6).toString('hex');
    const target = path.join(BACKUP_DIR, `apimock-${stamp}-${suffix}.db`);

    // better-sqlite3 .backup() 返回 Promise，WAL 模式下取一致快照
    await sqliteDb.backup(target);
    const sizeBytes = fs.statSync(target).size;
    const pruned = pruneOld();
    logger.info({ target, sizeBytes, pruned: pruned.length }, 'sqlite backup done');
    return { ok: true, file: target, sizeBytes, pruned };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error({ err }, 'sqlite backup failed');
    return { ok: false, error };
  } finally {
    backupInProgress = false;
  }
}

function pruneOld(): string[] {
  const files = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith('apimock-') && f.endsWith('.db'))
    .map((f) => ({ f, mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  const pruned: string[] = [];
  for (const item of files.slice(KEEP_COUNT)) {
    const full = path.join(BACKUP_DIR, item.f);
    try {
      fs.unlinkSync(full);
      pruned.push(item.f);
    } catch {
      // ignore
    }
  }
  return pruned;
}
