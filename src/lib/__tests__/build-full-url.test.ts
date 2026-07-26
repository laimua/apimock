/**
 * P2-49 纯函数单测:buildFullUrl。
 *
 * 原 share 页 fullUrl 构造用 `queryParams ? \`${url}?${qs}\` : url`,而 queryParams
 * 初始为 `{}`(truthy),导致无参数时 fullUrl 恒带尾部 `?`。本函数以"是否有键"
 * 为判据,空对象 / null / undefined 不带 `?`。
 */
import { describe, it, expect } from 'vitest';
import { buildFullUrl } from '../utils';

describe('buildFullUrl', () => {
  it('queryParams 为空对象时不带尾部 `?`(P2-49 核心回归)', () => {
    expect(buildFullUrl('http://x/api/foo', {})).toBe('http://x/api/foo');
  });

  it('queryParams 为 null / undefined 时不带尾部 `?`', () => {
    expect(buildFullUrl('http://x/api/foo', null)).toBe('http://x/api/foo');
    expect(buildFullUrl('http://x/api/foo', undefined)).toBe('http://x/api/foo');
  });

  it('有参数时构造 `?key=value` 形式', () => {
    expect(buildFullUrl('http://x/api/foo', { a: '1', b: '2' })).toBe(
      'http://x/api/foo?a=1&b=2',
    );
  });

  it('单个参数', () => {
    expect(buildFullUrl('http://x/api/foo', { token: 'abc' })).toBe(
      'http://x/api/foo?token=abc',
    );
  });

  it('值需要 URL 编码时正确编码', () => {
    expect(buildFullUrl('http://x/api/foo', { q: 'a b' })).toBe(
      'http://x/api/foo?q=a+b',
    );
  });

  it('值为空串的键仍保留(空串是合法值,与"无键"语义不同)', () => {
    const url = buildFullUrl('http://x/api/foo', { empty: '' });
    expect(url).toBe('http://x/api/foo?empty=');
  });

  it('baseUrl 仅 path 形式也工作', () => {
    expect(buildFullUrl('/api/foo', { a: '1' })).toBe('/api/foo?a=1');
  });
});
