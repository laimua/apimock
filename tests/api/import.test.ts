/**
 * Import API Route Tests
 * Tests for OpenAPI import endpoints
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest';
import { type NextRequest } from 'next/server';
import { POST as IMPORT_POST } from '@/app/api/projects/[id]/import/route';
import { POST as PARSE_POST } from '@/app/api/projects/[id]/import/parse/route';
import { parseAndExtract } from '@/lib/openapi-parser';
import { getTestDb, setupTestDb, clearTestDb } from '../setup';
import { projects, endpoints, responses } from '@/lib/schema';
import { eq } from 'drizzle-orm';

const asReq = (r: Request): NextRequest => r as unknown as NextRequest;

let mockDb: ReturnType<typeof getTestDb>;

vi.mock('@/lib/db', () => ({
  get db() {
    return mockDb;
  },
}));

// Mock the openapi-parser module
vi.mock('@/lib/openapi-parser', () => ({
  detectFormat: vi.fn(() => 'openapi3'),
  parseAndExtract: vi.fn((content: string) => {
    if (content.includes('invalid')) {
      return {
        endpoints: [],
        errors: ['Invalid OpenAPI format'],
      };
    }

    return {
      endpoints: [
        {
          path: '/users',
          method: 'GET',
          name: 'listUsers',
          description: 'List all users',
          responses: [
            {
              statusCode: 200,
              body: {
                description: 'Success',
                content: [
                  { id: 1, name: 'User 1' },
                  { id: 2, name: 'User 2' },
                ],
              },
            },
          ],
        },
        {
          path: '/users',
          method: 'POST',
          name: 'createUser',
          description: 'Create a new user',
          responses: [
            {
              statusCode: 201,
              body: {
                description: 'Created',
                content: { id: 1, name: 'New User' },
              },
            },
          ],
        },
      ],
      errors: [],
    };
  }),
}));

beforeAll(async () => {
  mockDb = await setupTestDb('import-test');
});

describe('Import API', () => {
  let testProject: typeof projects.$inferInsert;

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
  });

  afterEach(async () => {
    await clearTestDb(mockDb);
  });

  describe('POST /api/projects/[id]/import', () => {
    it('should import endpoints from valid OpenAPI file', async () => {
      const formData = new FormData();
      formData.append('file', new File(['valid openapi content'], 'openapi.json', { type: 'application/json' }));

      const request = new Request('http://localhost/api/projects/proj1/import', {
        method: 'POST',
        body: formData,
      });

      const response = await IMPORT_POST(asReq(request), {
        params: Promise.resolve({ id: testProject.id }),
      });
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.data.total).toBe(2);
      expect(data.data.created).toBe(2);
      expect(data.data.skipped).toBe(0);

      // Verify endpoints were created
      const importedEndpoints = await mockDb.select().from(endpoints).where(eq(endpoints.projectId, testProject.id));
      expect(importedEndpoints).toHaveLength(2);
      expect(importedEndpoints[0].path).toBe('/users');
      expect(importedEndpoints[0].method).toBe('GET');

      // Verify responses were created
      const importedResponses = await mockDb.select().from(responses);
      expect(importedResponses.length).toBeGreaterThan(0);
    });

    it('should skip existing endpoints', async () => {
      // Create an existing endpoint
      await mockDb.insert(endpoints).values({
        id: 'ep1',
        projectId: testProject.id,
        path: '/users',
        method: 'GET',
        name: 'Existing endpoint',
        description: null,
        isActive: 1,
        delayMs: 0,
        tags: '[]',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const formData = new FormData();
      formData.append('file', new File(['valid openapi content'], 'openapi.json', { type: 'application/json' }));

      const request = new Request('http://localhost/api/projects/proj1/import', {
        method: 'POST',
        body: formData,
      });

      const response = await IMPORT_POST(asReq(request), {
        params: Promise.resolve({ id: testProject.id }),
      });
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.data.created).toBe(1);
      expect(data.data.skipped).toBe(1);
    });

    it('should return 404 for non-existent project', async () => {
      const formData = new FormData();
      formData.append('file', new File(['valid content'], 'openapi.json', { type: 'application/json' }));

      const request = new Request('http://localhost/api/projects/non-existent/import', {
        method: 'POST',
        body: formData,
      });

      const response = await IMPORT_POST(asReq(request), {
        params: Promise.resolve({ id: 'non-existent' }),
      });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
    });

    it('should return error when no file is uploaded', async () => {
      const formData = new FormData();

      const request = new Request('http://localhost/api/projects/proj1/import', {
        method: 'POST',
        body: formData,
      });

      const response = await IMPORT_POST(asReq(request), {
        params: Promise.resolve({ id: testProject.id }),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('should return error for empty file', async () => {
      const formData = new FormData();
      formData.append('file', new File([''], 'empty.json', { type: 'application/json' }));

      const request = new Request('http://localhost/api/projects/proj1/import', {
        method: 'POST',
        body: formData,
      });

      const response = await IMPORT_POST(asReq(request), {
        params: Promise.resolve({ id: testProject.id }),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('should handle parse errors', async () => {
      const formData = new FormData();
      formData.append('file', new File(['invalid openapi content'], 'invalid.json', { type: 'application/json' }));

      const request = new Request('http://localhost/api/projects/proj1/import', {
        method: 'POST',
        body: formData,
      });

      const response = await IMPORT_POST(asReq(request), {
        params: Promise.resolve({ id: testProject.id }),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error.details).toBeDefined();
    });
  });

  describe('POST /api/projects/[id]/import/parse', () => {
    it('should parse OpenAPI file and return preview', async () => {
      const formData = new FormData();
      formData.append('file', new File(['valid openapi content'], 'openapi.json', { type: 'application/json' }));

      const request = new Request('http://localhost/api/projects/proj1/import/parse', {
        method: 'POST',
        body: formData,
      });

      const response = await PARSE_POST(asReq(request), {
        params: Promise.resolve({ id: testProject.id }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.total).toBe(2);
      expect(data.data.endpoints).toHaveLength(2);
      expect(data.data.endpoints[0].path).toBe('/users');
      expect(data.data.endpoints[0].method).toBe('GET');
      expect(data.data.endpoints[0].responses).toBeDefined();

      // Verify no endpoints were created in database
      const dbEndpoints = await mockDb.select().from(endpoints).where(eq(endpoints.projectId, testProject.id));
      expect(dbEndpoints).toHaveLength(0);
    });

    it('should return 404 for non-existent project (I4: parse 校验项目存在)', async () => {
      const formData = new FormData();
      formData.append('file', new File(['valid content'], 'openapi.json', { type: 'application/json' }));

      const request = new Request('http://localhost/api/projects/non-existent/import/parse', {
        method: 'POST',
        body: formData,
      });

      const response = await PARSE_POST(asReq(request), {
        params: Promise.resolve({ id: 'non-existent' }),
      });
      const data = await response.json();

      // I4: parse 现在校验项目存在(与 import 写库对称),非存在项目返 404
      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
    });

    it('should return error when no file is uploaded', async () => {
      const formData = new FormData();

      const request = new Request('http://localhost/api/projects/proj1/import/parse', {
        method: 'POST',
        body: formData,
      });

      const response = await PARSE_POST(asReq(request), {
        params: Promise.resolve({ id: testProject.id }),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('should return error for empty file', async () => {
      const formData = new FormData();
      formData.append('file', new File([''], 'empty.json', { type: 'application/json' }));

      const request = new Request('http://localhost/api/projects/proj1/import/parse', {
        method: 'POST',
        body: formData,
      });

      const response = await PARSE_POST(asReq(request), {
        params: Promise.resolve({ id: testProject.id }),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('should handle parse errors and return empty endpoints', async () => {
      const formData = new FormData();
      formData.append('file', new File(['invalid openapi content'], 'invalid.json', { type: 'application/json' }));

      const request = new Request('http://localhost/api/projects/proj1/import/parse', {
        method: 'POST',
        body: formData,
      });

      const response = await PARSE_POST(asReq(request), {
        params: Promise.resolve({ id: testProject.id }),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error.details).toBeDefined();
    });
  });

  // ============================================
  // P2-15:文件大小上限 + 分块 insert
  // P2-17:批量结果状态码(201 / 207 / 500)
  // ============================================
  describe('P2-15/P2-17 — 文件大小上限 + 批量状态码', () => {
    const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

    afterEach(() => {
      // 恢复 parseAndExtract 默认 mock 实现(返 2 端点),避免影响后续测试
      vi.mocked(parseAndExtract).mockRestore();
    });

    it('P2-15 import: 超大文件(>5MB)→ 413 PAYLOAD_TOO_LARGE', async () => {
      const big = new Uint8Array(MAX_IMPORT_BYTES + 1);
      const formData = new FormData();
      formData.append('file', new File([big], 'huge.json', { type: 'application/json' }));

      const request = new Request('http://localhost/api/projects/proj1/import', {
        method: 'POST',
        body: formData,
      });

      const response = await IMPORT_POST(asReq(request), {
        params: Promise.resolve({ id: testProject.id }),
      });
      const data = await response.json();

      expect(response.status).toBe(413);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('PAYLOAD_TOO_LARGE');
      expect(typeof data.error.message).toBe('string');
    });

    it('P2-15 import: 正常大小文件不受影响(仍 201)', async () => {
      const formData = new FormData();
      formData.append('file', new File(['valid openapi content'], 'openapi.json', { type: 'application/json' }));

      const request = new Request('http://localhost/api/projects/proj1/import', {
        method: 'POST',
        body: formData,
      });

      const response = await IMPORT_POST(asReq(request), {
        params: Promise.resolve({ id: testProject.id }),
      });
      expect(response.status).toBe(201);
    });

    it('P2-15 parse: 超大文件(>5MB)→ 413(与 import 对称)', async () => {
      const big = new Uint8Array(MAX_IMPORT_BYTES + 1);
      const formData = new FormData();
      formData.append('file', new File([big], 'huge.json', { type: 'application/json' }));

      const request = new Request('http://localhost/api/projects/proj1/import/parse', {
        method: 'POST',
        body: formData,
      });

      const response = await PARSE_POST(asReq(request), {
        params: Promise.resolve({ id: testProject.id }),
      });
      const data = await response.json();

      expect(response.status).toBe(413);
      expect(data.error.code).toBe('PAYLOAD_TOO_LARGE');
    });

    it('P2-17 import: 全部成功 → 201', async () => {
      const formData = new FormData();
      formData.append('file', new File(['valid openapi content'], 'openapi.json', { type: 'application/json' }));

      const request = new Request('http://localhost/api/projects/proj1/import', {
        method: 'POST',
        body: formData,
      });

      const response = await IMPORT_POST(asReq(request), {
        params: Promise.resolve({ id: testProject.id }),
      });
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.data.errors).toHaveLength(0);
      expect(data.data.created).toBe(2);
    });

    it('P2-17 import: 全部失败(created===0 且有 errors)→ 500', async () => {
      // 让 parseAndExtract 返一个端点,但让 DB insert 抛错使整批失败
      vi.mocked(parseAndExtract).mockReturnValueOnce({
        endpoints: [
          {
            path: '/boom',
            method: 'GET',
            responses: [{ statusCode: 200, body: { ok: true } }],
          },
        ],
        errors: [],
      });

      // spyOn mockDb.insert 让其抛错(模拟 SQL 失败)。restore 在 finally 里恢复。
      const insertSpy = vi.spyOn(mockDb, 'insert').mockImplementation(() => {
        throw new Error('simulated SQL failure');
      });

      const formData = new FormData();
      formData.append('file', new File(['valid'], 'openapi.json', { type: 'application/json' }));
      const request = new Request('http://localhost/api/projects/proj1/import', {
        method: 'POST',
        body: formData,
      });

      try {
        const response = await IMPORT_POST(asReq(request), {
          params: Promise.resolve({ id: testProject.id }),
        });
        const data = await response.json();

        expect(response.status).toBe(500);
        expect(data.success).toBe(false);
        expect(data.error.code).toBe('INTERNAL_ERROR');
        expect(data.error.details.created).toBe(0);
        expect(data.error.details.errors.length).toBeGreaterThan(0);
      } finally {
        insertSpy.mockRestore();
      }
    });

    it('P2-17 import: 边界 — 无端点产出(解析全失败)→ 400 INVALID_OPENAPI', async () => {
      vi.mocked(parseAndExtract).mockReturnValueOnce({
        endpoints: [],
        errors: ['bad doc'],
      });

      const formData = new FormData();
      formData.append('file', new File(['invalid'], 'openapi.json', { type: 'application/json' }));
      const request = new Request('http://localhost/api/projects/proj1/import', {
        method: 'POST',
        body: formData,
      });

      const response = await IMPORT_POST(asReq(request), {
        params: Promise.resolve({ id: testProject.id }),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('INVALID_OPENAPI');
    });
  });

  // ============================================
  // P2-16:YAML 锚点循环 → 400(非 500)
  // 模拟 parseAndExtract 命中循环后返回的形态(空端点 + 循环错误),
  // 验证路由据此返 400 INVALID_OPENAPI。detectCircularRef 本身见
  // src/lib/__tests__/openapi-parser.test.ts 的真实 YAML 锚点用例。
  // ============================================
  describe('P2-16 — 循环引用 → 400 INVALID_OPENAPI', () => {
    afterEach(() => {
      vi.mocked(parseAndExtract).mockReset();
    });

    it('import: 命中循环引用(parseAndExtract 返空端点 + 循环错误)→ 400', async () => {
      vi.mocked(parseAndExtract).mockReturnValueOnce({
        endpoints: [],
        errors: ['文档含循环引用(命中路径:root.back),请去除 YAML 锚点/别名形成的环'],
      });

      const formData = new FormData();
      formData.append('file', new File(['x'], 'cyclic.yaml', { type: 'application/yaml' }));
      const request = new Request('http://localhost/api/projects/proj1/import', {
        method: 'POST',
        body: formData,
      });

      const response = await IMPORT_POST(asReq(request), {
        params: Promise.resolve({ id: testProject.id }),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('INVALID_OPENAPI');
      expect(data.error.details).toBeDefined();
      expect(JSON.stringify(data.error.details)).toContain('循环引用');
    });

    it('parse: 命中循环引用 → 400(非 500)', async () => {
      vi.mocked(parseAndExtract).mockReturnValueOnce({
        endpoints: [],
        errors: ['文档含循环引用(命中路径:root.back),请去除 YAML 锚点/别名形成的环'],
      });

      const formData = new FormData();
      formData.append('file', new File(['x'], 'cyclic.yaml', { type: 'application/yaml' }));
      const request = new Request('http://localhost/api/projects/proj1/import/parse', {
        method: 'POST',
        body: formData,
      });

      const response = await PARSE_POST(asReq(request), {
        params: Promise.resolve({ id: testProject.id }),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.code).toBe('INVALID_OPENAPI');
    });
  });
});
