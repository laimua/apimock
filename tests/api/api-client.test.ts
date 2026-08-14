/**
 * api-client request() 错误处理测试(B3)
 *
 * - 响应体非 JSON → ApiError(不冒 SyntaxError)
 * - 207 Multi-Status → 放行 data(逐项结果不丢)
 * - 401 → 跳 /login 带 sanitized from
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { projectsApi } from '@/lib/api-client';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  // happy-dom 下 window.location.href 只读,通过删除 setter 注入的对象还原
  // (stubLocation 里用 defineProperty 覆写)
});

function stubLocation() {
  const hrefSetter = vi.fn();
  Object.defineProperty(window, 'location', {
    value: { ...window.location, set href(v: string) { hrefSetter(v); } },
    writable: true,
    configurable: true,
  });
  return hrefSetter;
}

describe('B3 — 非 JSON 响应兜底', () => {
  it('HTML 错误页 → 抛 ApiError,不抛 SyntaxError', async () => {
    const fetchMock = vi.fn(async () =>
      new Response('<html><body>502 Bad Gateway</body></html>', {
        status: 502,
        headers: { 'content-type': 'text/html' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(projectsApi.list()).rejects.toMatchObject({
      name: 'ApiError',
      status: 502,
      code: 'HTTP_ERROR',
    });
  });

  it('2xx 但非 JSON → INVALID_RESPONSE', async () => {
    const fetchMock = vi.fn(async () => new Response('plain text', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(projectsApi.list()).rejects.toMatchObject({
      name: 'ApiError',
      status: 200,
      code: 'INVALID_RESPONSE',
    });
  });
});

describe('B3 — 207 Multi-Status 放行', () => {
  it('207 + success:false → 返回 data,不抛 UNKNOWN_ERROR', async () => {
    const partial = { total: 10, created: 6, skipped: 0, errors: [{ error: 'batch fail' }] };
    const fetchMock = vi.fn(async () =>
      jsonResponse(207, {
        success: false,
        data: partial,
        error: { code: 'PARTIAL_FAILURE', message: 'partial' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    // projectsApi.list 只是载体;request<T> 泛型与具体 API 无关
    const result = await projectsApi.list() as unknown as typeof partial;
    expect(result).toEqual(partial);
  });
});

describe('B3 — 401 跳登录带 from', () => {
  it('401 → /login?from=<当前 path+search>', async () => {
    const hrefSetter = stubLocation();
    const fetchMock = vi.fn(async () =>
      jsonResponse(401, { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } })
    );
    vi.stubGlobal('fetch', fetchMock);

    // 挂起的 Promise 不会 resolve;调用不抛即算通过,断言跳转 URL
    void projectsApi.list().catch(() => {});
    await new Promise((r) => setTimeout(r, 0));
    expect(hrefSetter).toHaveBeenCalledWith(
      `/login?from=${encodeURIComponent(window.location.pathname + window.location.search)}`
    );
  });
});
