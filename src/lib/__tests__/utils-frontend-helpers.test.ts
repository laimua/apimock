/**
 * 前端防御性辅助函数测试(P1-11/12/13/14/17)。
 *
 * 覆盖 src/lib/utils.ts 新增的纯函数:parseTags / splitTags / readErrorMessage /
 * resolveBodyOnContentTypeChange。这些都是 UI 渲染/输入归一化关键路径,必须有单测。
 */

import { describe, it, expect } from 'vitest';
import {
  parseTags,
  splitTags,
  resolveBodyOnContentTypeChange,
} from '../utils';

describe('parseTags', () => {
  it('解析合法 JSON 字符串数组', () => {
    expect(parseTags('["a","b"]')).toEqual(['a', 'b']);
  });

  it('null/undefined/空串返回空数组', () => {
    expect(parseTags(null)).toEqual([]);
    expect(parseTags(undefined)).toEqual([]);
    expect(parseTags('')).toEqual([]);
  });

  it('非 JSON 字符串返回空数组(防御脏数据,不抛)', () => {
    // P1-12:公开分享页 DB tags 可能非 JSON,绝不能白屏
    expect(parseTags('普通文本')).toEqual([]);
    expect(parseTags('[broken')).toEqual([]);
    expect(parseTags('123')).toEqual([]);
  });

  it('解析出非数组(JSON 对象/数字/字符串)返回空数组', () => {
    expect(parseTags('{}')).toEqual([]);
    expect(parseTags('"单个字符串"')).toEqual([]);
    expect(parseTags('42')).toEqual([]);
  });

  it('过滤掉非字符串元素', () => {
    expect(parseTags('["a", 1, true, null, "b"]')).toEqual(['a', 'b']);
  });
});

describe('splitTags', () => {
  it('逗号分隔 + trim + 去空', () => {
    expect(splitTags('a, b , ,c')).toEqual(['a', 'b', 'c']);
  });

  it('去重', () => {
    expect(splitTags('a, a, b, a')).toEqual(['a', 'b']);
  });

  it('空串/纯逗号返回空数组', () => {
    expect(splitTags('')).toEqual([]);
    expect(splitTags(' , , ')).toEqual([]);
  });

  it('保留内部空格(只 trim 首尾)', () => {
    expect(splitTags('foo bar, baz')).toEqual(['foo bar', 'baz']);
  });
});

describe('resolveBodyOnContentTypeChange', () => {
  const DEFAULTS = {
    'application/json': '{\n  "success": true\n}',
    'text/plain': 'Success',
    'text/html': '<div>Success</div>',
  };

  it('当前 body 为空时,替换为新类型的默认模板', () => {
    expect(
      resolveBodyOnContentTypeChange('', 'application/json', 'text/plain', DEFAULTS),
    ).toBe('Success');
    expect(
      resolveBodyOnContentTypeChange('   ', 'application/json', 'text/html', DEFAULTS),
    ).toBe('<div>Success</div>');
  });

  it('当前 body 等于当前类型默认模板时,替换为新类型默认', () => {
    expect(
      resolveBodyOnContentTypeChange(
        DEFAULTS['application/json'],
        'application/json',
        'text/plain',
        DEFAULTS,
      ),
    ).toBe('Success');
  });

  it('当前 body 已被用户自定义(非空且非模板)时,保留原文不替换', () => {
    // P1-17 核心诉求:别静默清空用户已写内容
    const custom = '{\n  "hello": "world"\n}';
    expect(
      resolveBodyOnContentTypeChange(custom, 'application/json', 'text/plain', DEFAULTS),
    ).toBe(custom);
  });

  it('新类型在 DEFAULTS 里缺失时,空 body 场景返回空串', () => {
    expect(
      resolveBodyOnContentTypeChange('', 'application/json', 'unknown/type', DEFAULTS),
    ).toBe('');
  });

  it('新类型缺失 + 用户已写内容,仍保留原文', () => {
    const custom = 'keep me';
    expect(
      resolveBodyOnContentTypeChange(custom, 'application/json', 'unknown/type', DEFAULTS),
    ).toBe(custom);
  });
});
