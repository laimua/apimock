/**
 * SQLite 在线备份
 *
 * WAL 模式下 .backup() 取一致快照（db-sqlite.ts 已开 WAL）。
 * 外部触发：POST /api/admin/backup（Railway cron / GitHub Actions / UptimeRobot）。
 * 不在进程内 setInterval，避免重启漏跑 + 阻塞 event loop。
 *
 * 备份输出：./data/backups/apimock-YYYYMMDD-HHmmss.db
 * 滚动保留：默认 7 份，超过自动删最旧。
 */

import { sqliteDb } from './db-sqlite';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from './logger';

const BACKUP_DIR = process.env.BACKUP_DIR || './data/backups';
const KEEP_COUNT = Number(process.env.BACKUP_KEEP) || 7;

export interface BackupResult {
  ok: boolean;
  file?: string;
  sizeBytes?: number;
  error?: string;
  pruned?: string[];
}

export async function backupSqlite(): Promise<BackupResult> {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const target = path.join(BACKUP_DIR, `apimock-${stamp}.db`);

  try {
    // better-sqlite3 .backup() 返回 Promise，WAL 模式下取一致快照
    await sqliteDb.backup(target);
    const sizeBytes = fs.statSync(target).size;
    const pruned = pruneOld();
    logger.info({ target, sizeBytes, pruned: pruned.length }, 'sqlite backup done');
    return { ok: true, file: target, sizeBytes, pruned };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error({ err, target }, 'sqlite backup failed');
    return { ok: false, error };
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
