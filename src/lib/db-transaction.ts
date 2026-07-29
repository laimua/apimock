/**
 * 双栈事务工具
 *
 * 背景:drizzle 对 better-sqlite3 的事务是 sync 模式(Transaction function cannot
 * return a promise),而 mysql2 的事务是 async。两者回调签名矛盾,无法用同一份
 * drizzle 代码。本工具封装差异:
 *   - SQLite:用 better-sqlite3 原生 sqliteDb.transaction(sync 回调),回调内用
 *     drizzle 的同步 API(.run()/.all())。绕过 drizzle 的 sync/async 矛盾。
 *   - MySQL:用 drizzle 的 async transaction(await)。
 *
 * 调用方写两份回调(sqlite 同步/mysql 异步),工具按 DB_TYPE 分发。
 * 两份回调逻辑相同,只是 sync/mysql API 差异。
 */

import { db, isMysqlEnv } from './db';
import { sqliteDb } from './db-sqlite';

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}

/**
 * 在事务中执行。回调返回值会透传(sqlite 需同步返回,mysql 可 async)。
 *
 * @param sqliteFn SQLite 模式的事务体(同步,用 tx 的 .run()/.all())
 * @param mysqlFn  MySQL 模式的事务体(异步,用 tx 的 await)
 *
 * 示例:
 *   await runInTransaction(
 *     (tx) => { tx.update(t).set({...}).run(); tx.insert(t).values({...}).run(); },
 *     async (tx) => { await tx.update(t).set({...}); await tx.insert(t).values({...}); },
 *   );
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TxLike = any;

export async function runInTransaction<T>(
  sqliteFn: (tx: TxLike) => T,
  mysqlFn: (tx: TxLike) => Promise<T>,
): Promise<T> {
  // 惰性读取 DB_TYPE:调用时判定而非模块加载期固化,避免测试动态切 DB_TYPE
  // 不生效、且静默用错库。
  if (isMysqlEnv()) {
    return db.transaction(mysqlFn);
  }
  // SQLite:better-sqlite3 原生 transaction,回调内用 drizzle db 的同步 API。
  // sqliteDb.transaction 返回 sync 值,这里包 Promise 统一签名。
  return Promise.resolve(
    sqliteDb.transaction(() => {
      const r = sqliteFn(db);
      // 守卫:better-sqlite3 事务是同步的,若误传 async 回调,回调返回的 Promise
      // 会让 better-sqlite3 误以为回调已结束(静默提交事务),而 await 之后的语句
      // 被吞掉 → 部分提交污染数据。在事务提交前炸响,迫使调用方用同步实现。
      // 仅 sqlite 分支需要此守卫:mysql2 本身 async,无此陷阱。
      if (isThenable(r)) {
        throw new TypeError(
          'runInTransaction: SQLite 事务回调不能返回 Promise(thenable) —— ' +
            'better-sqlite3 事务是同步的,async 回调会导致事务静默部分提交。' +
            '请改用同步实现(移除 await / 不要返回 Promise)。',
        );
      }
      return r;
    })(),
  );
}
