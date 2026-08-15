/**
 * toSqliteUrl 单元测试(drizzle.config.ts 的 sqlite url 归一)
 *
 * 背景(见 drizzle.config.ts 注释):Windows 绝对路径直接作 sqlite url 传给
 * drizzle-kit 会被 libsql 按 URL scheme 解析报 URL_SCHEME_NOT_SUPPORTED;
 * 相对路径 / :memory: / 已带 file: 前缀的原样透传。
 */

import { describe, it, expect } from 'vitest';
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { toSqliteUrl } from '../drizzle.config';

describe('toSqliteUrl', () => {
  it('相对路径原样透传', () => {
    expect(toSqliteUrl('./data/apimock.db')).toBe('./data/apimock.db');
    expect(toSqliteUrl('data/apimock.db')).toBe('data/apimock.db');
  });

  it(':memory: 原样透传', () => {
    expect(toSqliteUrl(':memory:')).toBe(':memory:');
  });

  it('已带 file: 前缀的原样透传(不做二次归一)', () => {
    expect(toSqliteUrl('file:./data/apimock.db')).toBe('file:./data/apimock.db');
    expect(toSqliteUrl('file:///var/lib/apimock/data/apimock.db')).toBe(
      'file:///var/lib/apimock/data/apimock.db'
    );
  });

  it('Linux 绝对路径转为 file:/// URL', () => {
    const p = '/var/lib/apimock/data/apimock.db';
    if (process.platform === 'win32') {
      // Windows 上 POSIX 样式路径同样 isAbsolute(当前盘根相对),归一结果
      // 带盘符;断言与 pathToFileURL 语义一致即可,不做硬编码期望
      expect(isAbsolute(p)).toBe(true);
      expect(toSqliteUrl(p)).toBe(pathToFileURL(p).href);
    } else {
      expect(toSqliteUrl(p)).toBe('file:///var/lib/apimock/data/apimock.db');
    }
  });

  it('Windows 绝对路径转为 file:///D:/... URL(规避 libsql URL_SCHEME_NOT_SUPPORTED)', () => {
    const p = 'D:\\work\\apimock\\data\\apimock.db';
    if (process.platform === 'win32') {
      expect(toSqliteUrl(p)).toBe('file:///D:/work/apimock/data/apimock.db');
    } else {
      // POSIX 上该串不是绝对路径,原样透传(Windows 盘符路径本就不该出现在 Linux 部署)
      expect(isAbsolute(p)).toBe(false);
      expect(toSqliteUrl(p)).toBe(p);
    }
  });
});
