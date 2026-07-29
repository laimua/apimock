/**
 * isUniqueViolation 单元测试
 * 验证唯一约束判定:MySQL 走稳定错误码,SQLite 走 "UNIQUE constraint" 消息,
 * CHECK / 外键约束不被误判。
 */

import { describe, it, expect } from 'vitest';
import { isUniqueViolation } from '@/lib/db-error';

describe('isUniqueViolation', () => {
  describe('MySQL 稳定错误码', () => {
    it('code === ER_DUP_ENTRY 判定命中', () => {
      expect(isUniqueViolation({ code: 'ER_DUP_ENTRY', errno: 1062 })).toBe(true);
    });

    it('仅 errno === 1062 也命中', () => {
      expect(isUniqueViolation({ errno: 1062 })).toBe(true);
    });

    it('其它 MySQL 错误码不命中', () => {
      expect(isUniqueViolation({ code: 'ER_BAD_NULL_ERROR', errno: 1048 })).toBe(false);
    });
  });

  describe('SQLite 消息匹配', () => {
    it('UNIQUE constraint failed 消息命中', () => {
      expect(isUniqueViolation(new Error('UNIQUE constraint failed: projects.slug'))).toBe(true);
    });

    it('大小写不敏感', () => {
      expect(isUniqueViolation(new Error('Sqlite error: unique constraint failed: x'))).toBe(true);
    });

    it('CHECK constraint 不被误判', () => {
      expect(isUniqueViolation(new Error('CHECK constraint failed: x'))).toBe(false);
    });

    it('FOREIGN KEY constraint 不被误判', () => {
      expect(isUniqueViolation(new Error('FOREIGN KEY constraint failed: x'))).toBe(false);
    });
  });

  describe('非对象 / 边界', () => {
    it('null 不命中', () => {
      expect(isUniqueViolation(null)).toBe(false);
    });
    it('undefined 不命中', () => {
      expect(isUniqueViolation(undefined)).toBe(false);
    });
    it('字符串不命中', () => {
      expect(isUniqueViolation('UNIQUE constraint failed')).toBe(false);
    });
    it('无 code/message 的空对象不命中', () => {
      expect(isUniqueViolation({})).toBe(false);
    });
  });
});
