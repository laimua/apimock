/**
 * endpoint-form-utils C1b 下沉函数单测
 *
 * - safeTagsToForm: unknown → string[] 防御性归一化
 * - endpointToForm: 服务端 Endpoint → 表单状态(初始加载/保存回写共用)
 */

import { describe, it, expect } from 'vitest';
import type { Endpoint } from '@/lib/api-client';
import {
  DEFAULT_RESPONSES,
  EMPTY_ENDPOINT_FORM,
  safeTagsToForm,
  endpointToForm,
} from '@/lib/endpoint-form-utils';

// 构造一个最小合法 Endpoint,测试里按需覆写
function makeEndpoint(overrides: Partial<Endpoint>): Endpoint {
  return {
    id: 'ep1',
    projectId: 'p1',
    path: '/users',
    method: 'GET',
    isActive: true,
    isShareable: true,
    delayMs: 0,
    tags: [],
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...overrides,
  };
}

describe('safeTagsToForm', () => {
  it('数组:过滤掉非字符串元素', () => {
    expect(safeTagsToForm(['a', 1, 'b', null, undefined])).toEqual(['a', 'b']);
  });

  it('字符串:按 DB JSON 解析', () => {
    expect(safeTagsToForm('["x","y"]')).toEqual(['x', 'y']);
  });

  it('字符串:非法 JSON → []', () => {
    expect(safeTagsToForm('not-json')).toEqual([]);
  });

  it('undefined/null/数字 → []', () => {
    expect(safeTagsToForm(undefined)).toEqual([]);
    expect(safeTagsToForm(null)).toEqual([]);
    expect(safeTagsToForm(42)).toEqual([]);
  });
});

describe('endpointToForm', () => {
  it('responseBody 为字符串时原样保留', () => {
    const form = endpointToForm(makeEndpoint({ responseBody: '{"a":1}' }));
    expect(form.responseBody).toBe('{"a":1}');
  });

  it('responseBody 为对象时 pretty-print', () => {
    const form = endpointToForm(makeEndpoint({ responseBody: { a: 1 } }));
    expect(form.responseBody).toBe(JSON.stringify({ a: 1 }, null, 2));
  });

  it('responseBody 为空串时落默认 JSON 模板', () => {
    const form = endpointToForm(makeEndpoint({ responseBody: '' }));
    expect(form.responseBody).toBe(DEFAULT_RESPONSES['application/json']);
  });

  it('responseBody 为 null/undefined 时序列化为 {}', () => {
    expect(endpointToForm(makeEndpoint({ responseBody: null })).responseBody).toBe('{}');
    expect(endpointToForm(makeEndpoint({ responseBody: undefined })).responseBody).toBe('{}');
  });

  it('可选字段缺省归一化: name/description → "", delayMs → 0, statusCode → 200, contentType → application/json', () => {
    const form = endpointToForm(makeEndpoint({
      name: undefined,
      description: undefined,
      delayMs: undefined as unknown as number,
      statusCode: undefined,
      contentType: undefined,
    }));
    expect(form.name).toBe('');
    expect(form.description).toBe('');
    expect(form.delayMs).toBe(0);
    expect(form.statusCode).toBe(200);
    expect(form.contentType).toBe('application/json');
  });

  it('isShareable: 仅显式 false 为 false,其余(含 undefined)为 true', () => {
    expect(endpointToForm(makeEndpoint({ isShareable: false })).isShareable).toBe(false);
    expect(endpointToForm(makeEndpoint({ isShareable: true })).isShareable).toBe(true);
    expect(endpointToForm(makeEndpoint({ isShareable: undefined as unknown as boolean })).isShareable).toBe(true);
  });

  it('tags 走 safeTagsToForm 归一化', () => {
    const form = endpointToForm(makeEndpoint({ tags: '["a","b"]' as unknown as string[] }));
    expect(form.tags).toEqual(['a', 'b']);
  });

  it('path/method 原样透传', () => {
    const form = endpointToForm(makeEndpoint({ path: '/a/:id', method: 'DELETE' }));
    expect(form.path).toBe('/a/:id');
    expect(form.method).toBe('DELETE');
  });
});

describe('EMPTY_ENDPOINT_FORM', () => {
  it('与新建页原初始值一致', () => {
    expect(EMPTY_ENDPOINT_FORM).toEqual({
      path: '',
      method: 'GET',
      name: '',
      description: '',
      delayMs: 0,
      statusCode: 200,
      contentType: 'application/json',
      responseBody: DEFAULT_RESPONSES['application/json'],
      tags: [],
      isShareable: true,
    });
  });
});
