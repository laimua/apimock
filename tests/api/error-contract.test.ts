/**
 * B1/B2 错误契约路由测试
 *
 * - B2:原先无 catch 的 GET/DELETE 路由,DB 异常必须返回统一 500 形状
 *   (INTERNAL_ERROR + 固定文案),不冒泡成 Next 默认 500 HTML,也不透传 err.message
 * - mock 入口(handleMock)兜底 catch:500 维持 {error, message} 形状 + CORS 头
 * - mock 413 带 CORS 头(形状不动)
 */

import { describe, it, expect, vi } from 'vitest';
import { type NextRequest } from 'next/server';
import { GET as PROJECT_GET } from '@/app/api/projects/[id]/route';
import { GET as ENDPOINTS_GET } from '@/app/api/projects/[id]/endpoints/route';
import { GET as ENDPOINT_GET, DELETE as ENDPOINT_DELETE } from '@/app/api/projects/[id]/endpoints/[endpointId]/route';
import { GET as RESPONSES_GET } from '@/app/api/projects/[id]/endpoints/[endpointId]/responses/route';
import { GET as RESPONSE_GET } from '@/app/api/projects/[id]/endpoints/[endpointId]/responses/[responseId]/route';
import { GET as MOCK_GET } from '@/app/[project]/[...path]/route';

const asReq = (r: Request): NextRequest => r as unknown as NextRequest;

// DB 抛错场景:所有 db.select 都抛(模拟 DB 文件损坏/连接断开)
vi.mock('@/lib/db', () => ({
  get db() {
    return {
      select: () => {
        throw new Error('SQLITE_CANTOPEN: /app/data/secret.db');
      },
    };
  },
  isMysqlEnv: () => false,
}));

// mock 路由依赖:限流放行 + 项目缓存查询抛错(触发兜底 catch)
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn(async () => ({ allowed: true, resetAt: Date.now() + 60_000 })),
}));
vi.mock('@/lib/project-cache', () => ({
  getCachedProject: vi.fn(async () => {
    throw new Error('cache backend exploded');
  }),
  invalidateProjectCache: vi.fn(),
}));

describe('B2 — GET/DELETE 路由 DB 异常 → 统一 500,不冒泡不透传', () => {
  const cases: Array<{ name: string; run: () => Promise<Response> }> = [
    {
      name: 'GET /api/projects/[id]',
      run: () =>
        PROJECT_GET(asReq(new Request('http://localhost/api/projects/p1')), {
          params: Promise.resolve({ id: 'p1' }),
        }),
    },
    {
      name: 'GET /api/projects/[id]/endpoints',
      run: () =>
        ENDPOINTS_GET(asReq(new Request('http://localhost/api/projects/p1/endpoints')), {
          params: Promise.resolve({ id: 'p1' }),
        }),
    },
    {
      name: 'GET /api/projects/[id]/endpoints/[endpointId]',
      run: () =>
        ENDPOINT_GET(asReq(new Request('http://localhost/api/projects/p1/endpoints/e1')), {
          params: Promise.resolve({ id: 'p1', endpointId: 'e1' }),
        }),
    },
    {
      name: 'DELETE /api/projects/[id]/endpoints/[endpointId]',
      run: () =>
        ENDPOINT_DELETE(asReq(new Request('http://localhost/api/projects/p1/endpoints/e1', { method: 'DELETE' })), {
          params: Promise.resolve({ id: 'p1', endpointId: 'e1' }),
        }),
    },
    {
      name: 'GET .../responses',
      run: () =>
        RESPONSES_GET(asReq(new Request('http://localhost/api/projects/p1/endpoints/e1/responses')), {
          params: Promise.resolve({ id: 'p1', endpointId: 'e1' }),
        }),
    },
    {
      name: 'GET .../responses/[responseId]',
      run: () =>
        RESPONSE_GET(asReq(new Request('http://localhost/api/projects/p1/endpoints/e1/responses/r1')), {
          params: Promise.resolve({ id: 'p1', endpointId: 'e1', responseId: 'r1' }),
        }),
    },
  ];

  for (const c of cases) {
    it(`${c.name} → 500 INTERNAL_ERROR 固定文案`, async () => {
      const res = await c.run();
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INTERNAL_ERROR');
      expect(body.error.message).toBe('Internal server error');
      // err.message(含 DB 路径)绝不进响应体
      expect(JSON.stringify(body)).not.toContain('secret.db');
    });
  }
});

describe('B2 — mock 入口兜底 catch', () => {
  it('findEndpoint 抛错 → 500 带 CORS 头,body 维持 {error, message} 形状', async () => {
    const res = await MOCK_GET(
      asReq(new Request('http://localhost/demo/users')),
      { params: Promise.resolve({ project: 'demo', path: ['users'] }) }
    );
    expect(res.status).toBe(500);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    const body = await res.json();
    // mock 面形状:非 ApiResponse(E2E 断言敏感)
    expect(typeof body.error).toBe('string');
    expect(typeof body.message).toBe('string');
    expect(JSON.stringify(body)).not.toContain('exploded');
  });
});

describe('B3 — mock 413 带 CORS 头(形状不动)', () => {
  it('流式读取超 1MB → 413 + Access-Control-Allow-Origin', async () => {
    // 2MB JSON body(无 content-length 的 chunked 场景走流式守卫;
    // undici 不允许手动设 content-length,故走 stream 路径)
    const bigJson = JSON.stringify({ data: 'x'.repeat(2 * 1024 * 1024) });
    const res = await MOCK_GET(
      asReq(
        new Request('http://localhost/demo/users', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: bigJson,
        })
      ),
      { params: Promise.resolve({ project: 'demo', path: ['users'] }) }
    );
    expect(res.status).toBe(413);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    const body = await res.json();
    expect(body.error).toBe('Payload Too Large');
  });
});
