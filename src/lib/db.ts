/**
 * 数据库配置 - 根据 DB_TYPE 选择驱动
 *
 * 静态导入两个驱动，按 DB_TYPE 在运行时选择。
 * 两者均为 dependencies，加载即安全；避免 require() 在 ESM 生产 bundle 中未定义。
 *
 * 类型说明：mysql 是 async、sqlite 是 sync，但所有调用点都 `await`，
 * 故将 mysql 强转为 sqlite 类型以保持调用方签名一致。运行时 await 对 sync 值也成立。
 */

import { db as sqliteDb, getDb as sqliteGetDb } from './db-sqlite';
import { db as mysqlDb, getDb as mysqlGetDb } from './db-mysql';

type Db = typeof sqliteDb;

const useMysql = (process.env.DB_TYPE || 'sqlite').toLowerCase() === 'mysql';

export const db: Db = useMysql ? (mysqlDb as unknown as Db) : sqliteDb;

export function getDb(): Db {
  return useMysql ? (mysqlGetDb() as unknown as Db) : sqliteGetDb();
}
