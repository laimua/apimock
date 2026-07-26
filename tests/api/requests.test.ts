/**
 * Requests API Route Tests
 * Tests for GET/DELETE /api/projects/[id]/requests and /api/projects/[id]/endpoints/[endpointId]/requests
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { type NextRequest } from 'next/server';
import { GET as GET_PROJECT_REQUESTS, DELETE as DELETE_PROJECT_REQUESTS } from '@/app/api/projects/[id]/requests/route';
import { GET as GET_ENDPOINT_REQUESTS, DELETE as DELETE_ENDPOINT_REQUESTS } from '@/app/api/projects/[id]/endpoints/[endpointId]/requests/route';
import { getTestDb, setupTestDb, clearTestDb } from '../setup';
import { projects, endpoints, requests } from '@/lib/schema';
import { eq } from 'drizzle-orm';

const asReq = (r: Request): NextRequest => r as unknown as NextRequest;

let mockDb: ReturnType<typeof getTestDb>;

vi.mock('@/lib/db', () => ({
  get db() {
    return mockDb;
  },
}));

beforeAll(async () => {
  mockDb = await setupTestDb('requests-test');
});

describe('Requests API', () => {
  let testProject: typeof projects.$inferInsert;
  let testEndpoint: typeof endpoints.$inferInsert;
  let testRequests: typeof requests.$inferInsert[] = [];

  beforeEach(async () => {
    await clearTestDb(mockDb);

    // Create test project
    testProject = {
      id: 'proj1',
      name: 'Test Project',
      slug: 'test-project',
      description: 'Test description',
      basePath: '/api/v1',
      isActive: 1,
      settings: '{}',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await mockDb.insert(projects).values(testProject);

    // Create test endpoint
    testEndpoint = {
      id: 'ep1',
      projectId: testProject.id,
      path: '/users',
      method: 'GET',
      name: 'List users',
      description: 'Get all users',
      isActive: 1,
      delayMs: 0,
      tags: '[]',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await mockDb.insert(endpoints).values(testEndpoint);

    // Create test requests
    testRequests = [
      {
        id: 'req1',
        endpointId: testEndpoint.id,
        method: 'GET',
        path: '/users',
        query: JSON.stringify({ page: '1' }),
        headers: JSON.stringify({ 'content-type': 'application/json' }),
        body: null,
        responseStatus: 200,
        createdAt: Date.now(),
      },
      {
        id: 'req2',
        endpointId: testEndpoint.id,
        method: 'GET',
        path: '/users',
        query: JSON.stringify({ page: '2' }),
        headers: JSON.stringify({ 'content-type': 'application/json' }),
        body: null,
        responseStatus: 200,
        createdAt: Date.now() - 1000,
      },
    ];
    await mockDb.insert(requests).values(testRequests);
  });

  afterEach(async () => {
    await clearTestDb(mockDb);
  });

  describe('GET /api/projects/[id]/requests', () => {
    it('should return requests for a project', async () => {
      const request = new Request('http://localhost/api/projects/proj1/requests');
      const response = await GET_PROJECT_REQUESTS(asReq(request), {
        params: Promise.resolve({ id: testProject.id }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.items).toHaveLength(2);
      expect(data.data.total).toBe(2);
      expect(data.data.items[0].query.page).toBe('1');
      expect(data.data.items[0].endpoint).toBeDefined();
      expect(data.data.items[0].endpoint.path).toBe('/users');
    });

    it('should support pagination', async () => {
      const request = new Request('http://localhost/api/projects/proj1/requests?page=1&pageSize=1');
      const response = await GET_PROJECT_REQUESTS(asReq(request), {
        params: Promise.resolve({ id: testProject.id }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.items).toHaveLength(1);
      expect(data.data.page).toBe(1);
      expect(data.data.pageSize).toBe(1);
    });

    it('should filter by endpointId', async () => {
      // Create another endpoint and requests
      const endpoint2 = {
        id: 'ep2',
        projectId: testProject.id,
        path: '/items',
        method: 'GET',
        name: 'List items',
        description: null,
        isActive: 1,
        delayMs: 0,
        tags: '[]',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await mockDb.insert(endpoints).values(endpoint2 as typeof endpoints.$inferInsert);

      const request2 = {
        id: 'req3',
        endpointId: endpoint2.id,
        method: 'GET',
        path: '/items',
        query: null,
        headers: '{}',
        body: null,
        responseStatus: 200,
        createdAt: Date.now(),
      };
      await mockDb.insert(requests).values(request2);

      const httpRequest = new Request(`http://localhost/api/projects/proj1/requests?endpointId=${testEndpoint.id}`);
      const response = await GET_PROJECT_REQUESTS(asReq(httpRequest), {
        params: Promise.resolve({ id: testProject.id }),
      });
      const data = await response.json();

      expect(data.data.items).toHaveLength(2);
      expect(data.data.items[0].endpointId).toBe(testEndpoint.id);
    });

    it('should return 404 for non-existent project', async () => {
      const request = new Request('http://localhost/api/projects/non-existent/requests');
      const response = await GET_PROJECT_REQUESTS(asReq(request), {
        params: Promise.resolve({ id: 'non-existent' }),
      });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
    });

    it('should handle endpoint not belonging to project', async () => {
      // Create another project
      const otherProject = {
        id: 'proj2',
        name: 'Other Project',
        slug: 'other-project',
        description: null,
        basePath: null,
        isActive: 1,
        settings: '{}',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await mockDb.insert(projects).values(otherProject);

      const request = new Request(`http://localhost/api/projects/proj2/requests?endpointId=${testEndpoint.id}`);
      const response = await GET_PROJECT_REQUESTS(asReq(request), {
        params: Promise.resolve({ id: otherProject.id }),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('should return empty array when no requests exist', async () => {
      await mockDb.delete(requests).where(eq(requests.endpointId, testEndpoint.id));

      const request = new Request('http://localhost/api/projects/proj1/requests');
      const response = await GET_PROJECT_REQUESTS(asReq(request), {
        params: Promise.resolve({ id: testProject.id }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.items).toEqual([]);
      expect(data.data.total).toBe(0);
    });

    // ============================================
    // P1-7: 项目级 requests 分页参数零校验
    // 原 route 直接 parseInt 无兜底无上限:
    //   - pageSize=10000000 拉全表(DoS)
    //   - pageSize=-1 → SQLite LIMIT -1 无上限 / MySQL 语法错误 500
    //   - page=abc → NaN → offset(NaN) 未定义行为
    // 修复后:page 兜底 1,pageSize 兜底 20 且夹紧 [1,200]
    // 双栈声明:兜底后 page/pageSize 永为正整数,limit/offset 不再传非法值,
    // SQLite 与 MySQL 行为一致(SQLite 不再无上限,MySQL 不再语法错误)。
    // 本测试在 SQLite 栈下验证兜底;MySQL 栈因不传非法 LIMIT 同样安全。
    // ============================================
    describe('P1-7: page/pageSize 零校验', () => {
      it('pageSize=10000000 被夹紧到 200(防 DoS 拉全表)', async () => {
        const request = new Request(
          'http://localhost/api/projects/proj1/requests?pageSize=10000000'
        );
        const response = await GET_PROJECT_REQUESTS(asReq(request), {
          params: Promise.resolve({ id: testProject.id }),
        });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.data.pageSize).toBe(200);
        // 只有 2 条种子数据,items 不超 200 也证明未拉异常量
        expect(data.data.items).toHaveLength(2);
      });

      it('pageSize=-1 被夹紧(SQLite 不再无上限, MySQL 不再语法错误 500)', async () => {
        const request = new Request(
          'http://localhost/api/projects/proj1/requests?pageSize=-1'
        );
        const response = await GET_PROJECT_REQUESTS(asReq(request), {
          params: Promise.resolve({ id: testProject.id }),
        });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.data.pageSize).toBe(1); // Math.max(1, -1) = 1
        expect(data.data.items).toHaveLength(1);
      });

      it('page=abc 兜底为 1(NaN 防护)', async () => {
        const request = new Request(
          'http://localhost/api/projects/proj1/requests?page=abc'
        );
        const response = await GET_PROJECT_REQUESTS(asReq(request), {
          params: Promise.resolve({ id: testProject.id }),
        });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.data.page).toBe(1);
        expect(data.data.items).toHaveLength(2);
      });

      it('pageSize=abc 兜底为 20(NaN 防护)', async () => {
        const request = new Request(
          'http://localhost/api/projects/proj1/requests?pageSize=abc'
        );
        const response = await GET_PROJECT_REQUESTS(asReq(request), {
          params: Promise.resolve({ id: testProject.id }),
        });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.data.pageSize).toBe(20);
      });

      it('pageSize=0 兜底为 20', async () => {
        const request = new Request(
          'http://localhost/api/projects/proj1/requests?pageSize=0'
        );
        const response = await GET_PROJECT_REQUESTS(asReq(request), {
          params: Promise.resolve({ id: testProject.id }),
        });
        const data = await response.json();

        expect(response.status).toBe(200);
        // parseInt('0')||20 → 0 是 falsy → 兜底 20
        expect(data.data.pageSize).toBe(20);
      });

      it('正常分页 page=2&pageSize=1 仍工作', async () => {
        const request = new Request(
          'http://localhost/api/projects/proj1/requests?page=2&pageSize=1'
        );
        const response = await GET_PROJECT_REQUESTS(asReq(request), {
          params: Promise.resolve({ id: testProject.id }),
        });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.data.page).toBe(2);
        expect(data.data.pageSize).toBe(1);
        expect(data.data.items).toHaveLength(1);
        expect(data.data.total).toBe(2);
      });
    });
  });

  describe('DELETE /api/projects/[id]/requests', () => {
    it('should delete all requests for a project', async () => {
      const request = new Request('http://localhost/api/projects/proj1/requests', {
        method: 'DELETE',
      });

      const response = await DELETE_PROJECT_REQUESTS(asReq(request), {
        params: Promise.resolve({ id: testProject.id }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.deleted).toBeDefined();

      const remainingRequests = await mockDb.select().from(requests);
      expect(remainingRequests).toHaveLength(0);
    });

    it('should delete requests for specific endpoint', async () => {
      const request = new Request(`http://localhost/api/projects/proj1/requests?endpointId=${testEndpoint.id}`, {
        method: 'DELETE',
      });

      const response = await DELETE_PROJECT_REQUESTS(asReq(request), {
        params: Promise.resolve({ id: testProject.id }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      // B2: deleted 应为该端点的实际请求数(2),而非端点计数
      expect(data.data.deleted).toBe(2);

      const remainingRequests = await mockDb.select().from(requests);
      expect(remainingRequests).toHaveLength(0);
    });

    // B2 针对性验证:inArray 批量删只删目标端点,不影响其它端点;
    // deleted 返回真实删除行数而非端点数
    it('B2: 多端点场景按 endpointId 删除只删目标端点的请求', async () => {
      // 新增第二个端点及其请求
      const secondEndpoint = { ...testEndpoint, id: 'ep2', path: '/posts', name: 'List posts' };
      await mockDb.insert(endpoints).values(secondEndpoint);
      const secondEndpointRequests = [
        {
          id: 'req3',
          endpointId: 'ep2',
          method: 'GET',
          path: '/posts',
          query: null,
          headers: null,
          body: null,
          responseStatus: 200,
          createdAt: Date.now(),
        },
        {
          id: 'req4',
          endpointId: 'ep2',
          method: 'POST',
          path: '/posts',
          query: null,
          headers: null,
          body: null,
          responseStatus: 201,
          createdAt: Date.now(),
        },
      ];
      await mockDb.insert(requests).values(secondEndpointRequests);

      // 删除 ep1 的请求(ep1 有 2 条,ep2 有 2 条)
      const request = new Request(`http://localhost/api/projects/proj1/requests?endpointId=ep1`, {
        method: 'DELETE',
      });
      const response = await DELETE_PROJECT_REQUESTS(asReq(request), {
        params: Promise.resolve({ id: testProject.id }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      // deleted 是 ep1 的 2 条,不是端点数 1,也不是全部 4 条
      expect(data.data.deleted).toBe(2);

      // ep2 的 2 条请求应保留
      const remaining = await mockDb.select().from(requests);
      expect(remaining).toHaveLength(2);
      expect(remaining.every((r) => r.endpointId === 'ep2')).toBe(true);
    });

    // B2: 删除不存在的端点验证归属(防越权删别人的端点)
    it('B2: 删除不属于该项目的端点返回 400', async () => {
      const request = new Request(`http://localhost/api/projects/proj1/requests?endpointId=foreign-ep`, {
        method: 'DELETE',
      });
      const response = await DELETE_PROJECT_REQUESTS(asReq(request), {
        params: Promise.resolve({ id: testProject.id }),
      });

      expect(response.status).toBe(400);
      // 原有请求不应被删
      const remaining = await mockDb.select().from(requests);
      expect(remaining).toHaveLength(2);
    });
  });

  describe('GET /api/projects/[id]/endpoints/[endpointId]/requests', () => {
    it('should return requests for an endpoint', async () => {
      const request = new Request('http://localhost/api/projects/proj1/endpoints/ep1/requests');
      const response = await GET_ENDPOINT_REQUESTS(asReq(request), {
        params: Promise.resolve({ id: testProject.id, endpointId: testEndpoint.id }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.items).toHaveLength(2);
      expect(data.data.total).toBe(2);
      expect(data.data.items[0].query.page).toBe('1');
    });

    it('should support limit and offset', async () => {
      const request = new Request('http://localhost/api/projects/proj1/endpoints/ep1/requests?limit=1&offset=0');
      const response = await GET_ENDPOINT_REQUESTS(asReq(request), {
        params: Promise.resolve({ id: testProject.id, endpointId: testEndpoint.id }),
      });
      const data = await response.json();

      // B3: 端点级 GET 统一分页风格 {items, total, page, pageSize}
      // limit=1/offset=0 → page=1, pageSize=1
      expect(response.status).toBe(200);
      expect(data.data.items).toHaveLength(1);
      expect(data.data.page).toBe(1);
      expect(data.data.pageSize).toBe(1);
    });

    it('should return 404 for non-existent endpoint', async () => {
      const request = new Request('http://localhost/api/projects/proj1/endpoints/non-existent/requests');
      const response = await GET_ENDPOINT_REQUESTS(asReq(request), {
        params: Promise.resolve({ id: testProject.id, endpointId: 'non-existent' }),
      });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
    });
  });

  describe('DELETE /api/projects/[id]/endpoints/[endpointId]/requests', () => {
    it('should delete all requests for an endpoint', async () => {
      const request = new Request('http://localhost/api/projects/proj1/endpoints/ep1/requests', {
        method: 'DELETE',
      });

      const response = await DELETE_ENDPOINT_REQUESTS(asReq(request), {
        params: Promise.resolve({ id: testProject.id, endpointId: testEndpoint.id }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      // B3: 端点级 DELETE 统一返回 {deleted: N}（不再返回 message）
      expect(data.data.deleted).toBe(2);

      const remainingRequests = await mockDb.select().from(requests);
      expect(remainingRequests).toHaveLength(0);
    });

    it('should return 404 for non-existent endpoint', async () => {
      const request = new Request('http://localhost/api/projects/proj1/endpoints/non-existent/requests', {
        method: 'DELETE',
      });

      const response = await DELETE_ENDPOINT_REQUESTS(asReq(request), {
        params: Promise.resolve({ id: testProject.id, endpointId: 'non-existent' }),
      });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
    });
  });

  // ============================================
  // B3 针对性验证:端点级 GET 形状统一 + page/pageSize 换算
  // 原有测试只覆盖项目级 GET,端点级 GET(GET_ENDPOINT_REQUESTS)
  // 从未在测试中调用。这里验证 CC 的 limit/offset→page/pageSize 换算、
  // items 内容、limit 上限、NaN 防护等关键改动。
  // ============================================
  describe('GET /api/projects/[id]/endpoints/[endpointId]/requests (B3 形状验证)', () => {
    it('返回统一分页形状 {items,total,page,pageSize}(非旧 {requests,limit,offset})', async () => {
      const request = new Request('http://localhost/api/projects/proj1/endpoints/ep1/requests');
      const response = await GET_ENDPOINT_REQUESTS(asReq(request), {
        params: Promise.resolve({ id: testProject.id, endpointId: testEndpoint.id }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      // 新形状字段存在
      expect(data.data.items).toBeDefined();
      expect(data.data.total).toBeDefined();
      expect(data.data.page).toBeDefined();
      expect(data.data.pageSize).toBeDefined();
      // 旧形状字段不存在
      expect(data.data.requests).toBeUndefined();
      expect(data.data.limit).toBeUndefined();
      expect(data.data.offset).toBeUndefined();
    });

    it('默认 limit=50/offset=0 正确换算为 page=1/pageSize=50', async () => {
      const request = new Request('http://localhost/api/projects/proj1/endpoints/ep1/requests');
      const response = await GET_ENDPOINT_REQUESTS(asReq(request), {
        params: Promise.resolve({ id: testProject.id, endpointId: testEndpoint.id }),
      });
      const data = await response.json();

      expect(data.data.page).toBe(1);
      expect(data.data.pageSize).toBe(50);
      expect(data.data.total).toBe(2);
      expect(data.data.items).toHaveLength(2);
    });

    it('自定义 limit=1/offset=1 正确换算为 page=2/pageSize=1', async () => {
      const request = new Request('http://localhost/api/projects/proj1/endpoints/ep1/requests?limit=1&offset=1');
      const response = await GET_ENDPOINT_REQUESTS(asReq(request), {
        params: Promise.resolve({ id: testProject.id, endpointId: testEndpoint.id }),
      });
      const data = await response.json();

      // page = floor(offset/limit)+1 = floor(1/1)+1 = 2
      expect(data.data.page).toBe(2);
      expect(data.data.pageSize).toBe(1);
      expect(data.data.items).toHaveLength(1);
      expect(data.data.total).toBe(2); // total 是全部计数,不受分页影响
    });

    it('items 内容正确:query/headers 已 JSON 解析,非原始字符串', async () => {
      const request = new Request('http://localhost/api/projects/proj1/endpoints/ep1/requests');
      const response = await GET_ENDPOINT_REQUESTS(asReq(request), {
        params: Promise.resolve({ id: testProject.id, endpointId: testEndpoint.id }),
      });
      const data = await response.json();

      const firstItem = data.data.items[0];
      // query 应被解析为对象,而非 JSON 字符串
      expect(firstItem.query).toEqual({ page: '1' });
      expect(typeof firstItem.query).toBe('object');
      // headers 同理
      expect(firstItem.headers).toEqual({ 'content-type': 'application/json' });
      // 基础字段
      expect(firstItem.method).toBe('GET');
      expect(firstItem.path).toBe('/users');
    });

    it('limit=NaN 回退默认值 50(Q1 NaN 防护)', async () => {
      const request = new Request('http://localhost/api/projects/proj1/endpoints/ep1/requests?limit=abc');
      const response = await GET_ENDPOINT_REQUESTS(asReq(request), {
        params: Promise.resolve({ id: testProject.id, endpointId: testEndpoint.id }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.pageSize).toBe(50); // NaN 回退
    });

    it('limit 超上限被夹紧到 200(Q7)', async () => {
      const request = new Request('http://localhost/api/projects/proj1/endpoints/ep1/requests?limit=999999');
      const response = await GET_ENDPOINT_REQUESTS(asReq(request), {
        params: Promise.resolve({ id: testProject.id, endpointId: testEndpoint.id }),
      });
      const data = await response.json();

      expect(data.data.pageSize).toBe(200);
    });

    it('不存在的端点返回 404', async () => {
      const request = new Request('http://localhost/api/projects/proj1/endpoints/non-existent/requests');
      const response = await GET_ENDPOINT_REQUESTS(asReq(request), {
        params: Promise.resolve({ id: testProject.id, endpointId: 'non-existent' }),
      });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
    });
  });
});
