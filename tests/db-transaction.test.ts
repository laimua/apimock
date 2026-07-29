/**
 * runInTransaction thenable 守卫测试
 * 验证:SQLite 分支误传 async 回调(返回 Promise)时,在事务提交前抛 TypeError,
 * 防 better-sqlite3 静默部分提交;同步回调正常透传返回值。
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: {},
  isMysqlEnv: () => false, // 强制走 SQLite 分支
}));

// 模拟 better-sqlite3:transaction(fn) 返回 fn 本身,调用它即同步执行回调
vi.mock('@/lib/db-sqlite', () => ({
  sqliteDb: { transaction: (fn: (...a: unknown[]) => unknown) => fn },
}));

import { runInTransaction } from '@/lib/db-transaction';

describe('runInTransaction thenable 守卫', () => {
  it('async 回调(返回 Promise)→ 在事务提交前抛 TypeError', async () => {
    // 模拟"误传 async 函数给 sqlite 分支"的运行时错误场景:
    // TS 签名要求 sqliteFn 同步,这里用 as any 绕过类型检查,验证运行时守卫。
    await expect(
      runInTransaction(
        (async () => 'should-not-commit') as unknown as () => string,
        async () => 'mysql-not-used',
      ),
    ).rejects.toThrow(TypeError);

    await expect(
      runInTransaction(
        (async () => 'should-not-commit') as unknown as () => string,
        async () => 'mysql-not-used',
      ),
    ).rejects.toThrow(/Promise|thenable/);
  });

  it('同步回调正常透传返回值,不误报', async () => {
    const result = await runInTransaction(
      () => 42,
      async () => 0,
    );
    expect(result).toBe(42);
  });

  it('同步回调返回对象(非 thenable)正常透传', async () => {
    const payload = { ok: true };
    const result = await runInTransaction(
      () => payload,
      async () => null,
    );
    expect(result).toEqual({ ok: true });
  });
});
