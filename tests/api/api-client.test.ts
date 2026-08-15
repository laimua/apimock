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

// stubLocation 覆写前先快照 location 的属性描述符,afterEach 里恢复
const originalLocationDesc = Object.getOwnPropertyDescriptor(window, 'location');

afterEach(() => {
  vi.unstubAllGlobals();
  // 恢复 stubLocation 覆写前的原始 location:
  // - 原本是 window 自有属性 → 重define 回原描述符
  // - 原本在原型链上(descriptor 为 undefined)→ 删掉覆写产生的自有属性,
  //   原型链上的访问器自然重新生效
  if (originalLocationDesc) {
    Object.defineProperty(window, 'location', originalLocationDesc);
  } else {
    delete (window as Partial<Record<'location', unknown>>).location;
  }
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
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
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

describe('C2 — FormData 分支与 importApi', () => {
  it('FormData body: 不强设 Content-Type(浏览器自动带 boundary)', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse(200, { success: true, data: { endpoints: [], total: 0, parseErrors: [] } })
    );
    vi.stubGlobal('fetch', fetchMock);

    const { importApi } = await import('@/lib/api-client');
    const file = new File(['{"openapi":"3.0.0"}'], 'spec.json', { type: 'application/json' });
    await importApi.parse('p1', file);

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.body).toBeInstanceOf(FormData);
    const headers = (init.headers ?? {}) as Record<string, string>;
    expect(headers['Content-Type']).toBeUndefined();
  });

  it('JSON body: 仍默认 Content-Type: application/json', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse(200, { success: true, data: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await projectsApi.list();

    const init = fetchMock.mock.calls[0][1] as RequestInit | undefined;
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('importApi.parse: POST multipart 到 /import/parse 并返回预览 data', async () => {
    const preview = { endpoints: [{ path: '/a', method: 'get' }], total: 1, parseErrors: [] };
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse(200, { success: true, data: preview }));
    vi.stubGlobal('fetch', fetchMock);

    const { importApi } = await import('@/lib/api-client');
    const file = new File(['x'], 'spec.yaml', { type: 'application/x-yaml' });
    const result = await importApi.parse('p1', file);

    expect(fetchMock.mock.calls[0][0]).toBe('/api/projects/p1/import/parse');
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe('POST');
    expect(result).toEqual(preview);
  });

  it('importApi.import: 207 部分成功放行,逐项 errors 不丢', async () => {
    const payload = {
      total: 5,
      created: 3,
      skipped: 1,
      errors: [{ error: 'Batch insert failed (endpoints 0–4): too many SQL variables' }],
      parseErrors: ['warning: missing info'],
    };
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse(207, {
        success: false,
        data: payload,
        error: { code: 'PARTIAL_FAILURE', message: 'Partial success: some items failed' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const { importApi } = await import('@/lib/api-client');
    const file = new File(['x'], 'spec.json', { type: 'application/json' });
    const result = await importApi.import('p1', file);

    expect(fetchMock.mock.calls[0][0]).toBe('/api/projects/p1/import');
    expect(result).toEqual(payload);
    expect(result.errors).toHaveLength(1);
  });

  it('importApi.import: 500 全部失败抛 ApiError', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse(500, {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Import failed: no endpoints created' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const { importApi } = await import('@/lib/api-client');
    const file = new File(['x'], 'spec.json', { type: 'application/json' });
    await expect(importApi.import('p1', file)).rejects.toMatchObject({
      name: 'ApiError',
      status: 500,
      code: 'INTERNAL_ERROR',
    });
  });
});
