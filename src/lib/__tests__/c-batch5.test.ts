/**
 * C 批次小修单元测试
 * - C5: sortBySpecificity 具体度排序(字面段数 desc,createdAt asc 次级键)
 * - C6: serializeAndTruncateBody 4KB 截断 + truncated 标记
 * - C1a: endpoint-form-utils 纯抽出回归(validatePath/buildMockUrl)
 */

import { describe, it, expect } from 'vitest';
import { sortBySpecificity, countLiteralSegments } from '../endpoint-cache';
import { serializeAndTruncateBody } from '@/app/[project]/[...path]/route';
import { validatePath, buildMockUrl } from '../endpoint-form-utils';

describe('C5 — sortBySpecificity 具体度排序', () => {
  const row = (path: string, createdAt: number) => ({ path, createdAt });

  it('countLiteralSegments: 排除参数段与空段', () => {
    expect(countLiteralSegments('/users/:id')).toBe(1);
    expect(countLiteralSegments('/users/me/:action')).toBe(2);
    expect(countLiteralSegments('/:a/:b')).toBe(0);
  });

  it('字面段多的排前面(与创建顺序无关)', () => {
    const sorted = sortBySpecificity([
      row('/users/:id/:action', 1),
      row('/users/me/:action', 2),
    ]);
    expect(sorted.map((r) => r.path)).toEqual(['/users/me/:action', '/users/:id/:action']);
  });

  it('具体度并列时按 createdAt asc(P2-12 语义保留为次级键)', () => {
    const sorted = sortBySpecificity([
      row('/a/:x', 20),
      row('/b/:y', 10),
    ]);
    expect(sorted.map((r) => r.path)).toEqual(['/b/:y', '/a/:x']);
  });

  it('不修改原数组(排序返回新数组)', () => {
    const input = [row('/users/:id', 1), row('/users/me', 2)];
    const copy = [...input];
    sortBySpecificity(input);
    expect(input).toEqual(copy);
  });
});

describe('C6 — serializeAndTruncateBody', () => {
  it('null/空 body → null(不记录)', () => {
    expect(serializeAndTruncateBody(null)).toBeNull();
    expect(serializeAndTruncateBody(undefined)).toBeNull();
    expect(serializeAndTruncateBody('')).toBeNull();
  });

  it('小 body: 对象 JSON 序列化,字符串原样', () => {
    expect(serializeAndTruncateBody({ a: 1 })).toBe('{"a":1}');
    expect(serializeAndTruncateBody('raw text')).toBe('raw text');
  });

  it('超 4KB: 截断到 4096 字符 + truncated 标记', () => {
    const big = { data: 'x'.repeat(10 * 1024) };
    const out = serializeAndTruncateBody(big)!;
    expect(out.length).toBe(4096 + '...[truncated]'.length);
    expect(out.endsWith('...[truncated]')).toBe(true);
  });

  it('恰 4096 字符不截断', () => {
    const exact = 'y'.repeat(4096);
    expect(serializeAndTruncateBody(exact)).toBe(exact);
  });
});

describe('C1a — endpoint-form-utils 纯抽出回归', () => {
  it('validatePath: 空/无头斜杠/参数段非法', () => {
    expect(validatePath('')).toBe('路径不能为空');
    expect(validatePath('users')).toBe('路径必须以 / 开头');
    expect(validatePath('/users/:1bad')).toContain('格式非法');
    expect(validatePath('/users/:id')).toBeUndefined();
    expect(validatePath('/a//b')).toBeUndefined();
  });

  it('buildMockUrl: 补头斜杠 + slug 兜底', () => {
    expect(buildMockUrl('http://x.com', 'proj', '/users')).toBe('http://x.com/proj/users');
    expect(buildMockUrl('http://x.com', 'proj', 'users')).toBe('http://x.com/proj/users');
    expect(buildMockUrl('http://x.com', undefined, '/users')).toBe('http://x.com/project/users');
  });
});
