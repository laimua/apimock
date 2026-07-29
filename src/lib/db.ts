/**
 * 数据库配置 - 根据 DB_TYPE 选择驱动
 *
 * 静态导入两个驱动，按 DB_TYPE 在运行时选择。
 * 两者均为 dependencies，加载即安全；避免 require() 在 ESM 生产 bundle 中未定义。
 *
 * 类型说明：mysql 是 async、sqlite 是 sync，但所有调用点都 `await`，
 * 故将 mysql 强转为 sqlite 类型以保持调用方签名一致。运行时 await 对 sync 值也成立。
 *
 * DB_TYPE 真实边界:驱动选择在进程启动期(模块加载)读取一次后固定。运行时再改
 * process.env.DB_TYPE 不会切换已初始化的 `db`——单进程内驱动不变。测试通过
 * vi.mock('@/lib/db') 整体替换模块,故 DB_TYPE 在测试里不影响驱动选择。
 * 需要调用时感知 DB_TYPE 的场景(如 db-transaction 的 sync/async 分发)用
 * isMysqlEnv() 惰性读取,勿依赖模块加载期固化的值。
 */

import { db as sqliteDb } from './db-sqlite';
import { db as mysqlDb } from './db-mysql';

type Db = typeof sqliteDb;

/** 调用时(惰性)读取 DB_TYPE,避免模块加载期固化导致测试动态切换失效。 */
export function isMysqlEnv(): boolean {
  return (process.env.DB_TYPE || 'sqlite').toLowerCase() === 'mysql';
}

export const db: Db = isMysqlEnv() ? (mysqlDb as unknown as Db) : sqliteDb;
