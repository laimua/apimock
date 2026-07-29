/**
 * 数据库错误判定工具
 *
 * 统一 TOCTOU 兜底里"是否唯一约束冲突"的判定,替代散落在各路由里的字符串正则:
 * 宽正则(如 /unique|constraint/i)会误吞 CHECK / 外键约束;硬编码列名的正则
 * (如 /projects\.slug/i)不可复用且绑死单表。
 *
 * - MySQL:错误码是稳定契约 —— mysql2 暴露 code === 'ER_DUP_ENTRY' 或
 *   errno === 1062。优先用机器码,不靠消息文本。
 * - SQLite:better-sqlite3 没有稳定的机器可读错误码,只能解析 message 是否含
 *   "UNIQUE constraint"(粗匹配,不硬编码列名)。这是 better-sqlite3 的限制,
 *   消息解析是不得已的手段。
 */

type DbError = {
  code?: unknown;
  errno?: unknown;
  message?: unknown;
};

export function isUniqueViolation(err: unknown): boolean {
  if (err === null || typeof err !== 'object') {
    return false;
  }

  const e = err as DbError;

  // MySQL:mysql2 稳定的错误码 / errno
  if (e.code === 'ER_DUP_ENTRY' || e.errno === 1062) {
    return true;
  }

  // SQLite / 兜底:仅匹配 UNIQUE,避免误判 CHECK / 外键约束
  if (typeof e.message === 'string' && /UNIQUE constraint/i.test(e.message)) {
    return true;
  }

  return false;
}
