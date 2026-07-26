/**
 * P2-6: backup 文件名秒级精度同秒并发冲突 → 毫秒+随机后缀 + 进程内互斥
 * P2-33: BACKUP_KEEP=0 会删刚建的备份 → 拒绝备份
 *
 * 通过 mock db-sqlite 的 .backup()，避免依赖真实 DB / WAL，专注于
 * backup.ts 的命名 / 互斥 / 保留策略逻辑。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// 用工厂包一份,保证每个测试拿到干净的 backup 模块（其依赖的 backupInProgress
// 模块级状态需要重置）。
async function loadFreshBackup() {
  vi.resetModules();
  return (await import('../backup')).backupSqlite;
}

const backupMock = vi.fn();

vi.mock('../db-sqlite', () => ({
  sqliteDb: {
    backup: (target: string) => backupMock(target),
  },
}));

describe('P2-6 backup filename uniqueness + in-process mutex', () => {
  let dir: string;

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apimock-backup-test-'));
    process.env.BACKUP_DIR = dir;
    delete process.env.BACKUP_KEEP;
    backupMock.mockReset();
    // mock backup 写一个空文件到目标路径,使 pruneOld 的 statSync 可用
    backupMock.mockImplementation(async (target: string) => {
      fs.writeFileSync(target, Buffer.alloc(0));
    });
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    delete process.env.BACKUP_DIR;
    delete process.env.BACKUP_KEEP;
  });

  it('filename includes millisecond precision + random suffix (no same-second collision)', async () => {
    const backupSqlite = await loadFreshBackup();
    const r1 = await backupSqlite();
    const r2 = await backupSqlite();
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    // 两次备份目标文件路径不同（毫秒/随机后缀）
    expect(r1.file).not.toBe(r2.file);
    if (r1.file && r2.file) {
      expect(fs.existsSync(r1.file)).toBe(true);
      expect(fs.existsSync(r2.file)).toBe(true);
    }
  });

  it('concurrent calls: second is rejected with reason=in_progress (mutex)', async () => {
    const backupSqlite = await loadFreshBackup();
    let resolveFirst!: () => void;
    backupMock.mockReset();
    // 第一次调用：先写文件再挂起,使 statSync 可用,且不立即返回
    backupMock.mockImplementationOnce(
      (target: string) =>
        new Promise<void>((resolve) => {
          fs.writeFileSync(target, Buffer.alloc(0));
          resolveFirst = resolve;
        })
    );

    const first = backupSqlite();
    const second = await backupSqlite();
    // 第二个并发调用应被互斥拒绝
    expect(second.ok).toBe(false);
    expect(second.reason).toBe('in_progress');

    resolveFirst();
    const firstResult = await first;
    expect(firstResult.ok).toBe(true);
  });
});

describe('P2-33 BACKUP_KEEP=0 rejection', () => {
  let dir: string;

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apimock-backup-test-'));
    process.env.BACKUP_DIR = dir;
    process.env.BACKUP_KEEP = '0';
    backupMock.mockReset();
    backupMock.mockImplementation(async (t: string) => fs.writeFileSync(t, ''));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    delete process.env.BACKUP_DIR;
    delete process.env.BACKUP_KEEP;
  });

  it('BACKUP_KEEP=0 rejects backup with reason=disabled, no file created', async () => {
    const backupSqlite = await loadFreshBackup();
    const result = await backupSqlite();
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('disabled');
    expect(backupMock).not.toHaveBeenCalled();
    // 没有任何备份文件生成
    expect(fs.readdirSync(dir)).toHaveLength(0);
  });
});
