/**
 * Projects API Route Tests
 * Tests for GET /api/projects and POST /api/projects
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { type NextRequest } from 'next/server';
import { POST, GET } from '@/app/api/projects/route';
import { getTestDb, setupTestDb, clearTestDb } from '../setup';
import { projects } from '@/lib/schema';

const asReq = (r: Request): NextRequest => r as unknown as NextRequest;

let mockDb: ReturnType<typeof getTestDb>;

// Mock the db module with a factory function
vi.mock('@/lib/db', () => ({
  get db() {
    return mockDb;
  },
}));

beforeAll(async () => {
  mockDb = await setupTestDb('projects-test');
});

describe('Projects API', () => {
  beforeEach(async () => {
    await clearTestDb(mockDb);
  });

  afterEach(async () => {
    await clearTestDb(mockDb);
  });

  describe('GET /api/projects', () => {
    it('should return empty array when no projects exist', async () => {
      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toEqual([]);
    });

    it('should return list of projects', async () => {
      const now = Date.now();
      // Insert test projects
      await mockDb.insert(projects).values([
        {
          id: 'proj1',
          name: 'Project 1',
          slug: 'project-1',
          description: 'First project',
          basePath: '/api/v1',
          isActive: 1,
          settings: '{}',
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'proj2',
          name: 'Project 2',
          slug: 'project-2',
          description: 'Second project',
          basePath: null,
          isActive: 0,
          settings: '{}',
          createdAt: now,
          updatedAt: now,
        },
      ]);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(2);
      expect(data.data[0].name).toBe('Project 1');
      expect(data.data[1].name).toBe('Project 2');
    });

    it('should paginate when page/pageSize provided', async () => {
      const now = Date.now();
      await mockDb.insert(projects).values(
        Array.from({ length: 5 }, (_, i) => ({
          id: `proj-${i}`,
          name: `Project ${i}`,
          slug: `project-${i}`,
          description: null,
          basePath: null,
          isActive: 1,
          settings: '{}',
          createdAt: now + i,
          updatedAt: now + i,
        }))
      );

      const request = new Request('http://localhost/api/projects?page=2&pageSize=2');
      const response = await GET(asReq(request));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.items).toHaveLength(2);
      expect(data.data.total).toBe(5);
      expect(data.data.page).toBe(2);
      expect(data.data.pageSize).toBe(2);
    });

    // ============================================
    // P1-8: GET /api/projects 分页 NaN 兜底 + handler try/catch
    // 原 route:Math.max(1, parseInt('abc')) = NaN → limit(NaN).offset(NaN)
    // 且 handler 无 try/catch,异常冒泡成 Next 默认 500 HTML(破坏统一错误形状)
    // 修复后:|| 1 / || 20 兜底;异常返 {success:false,error:{code,message}}
    // ============================================
    describe('P1-8: page/pageSize NaN 兜底 + try/catch', () => {
      it('page=abc 兜底为 1, 返回 200 正常分页(非 500)', async () => {
        const now = Date.now();
        await mockDb.insert(projects).values([
          {
            id: 'p1',
            name: 'P1',
            slug: 'p1',
            description: null,
            basePath: null,
            isActive: 1,
            settings: '{}',
            createdAt: now,
            updatedAt: now,
          },
        ]);

        const request = new Request('http://localhost/api/projects?page=abc');
        const response = await GET(asReq(request));
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data.page).toBe(1);
      });

      it('pageSize=abc 兜底为 20', async () => {
        const request = new Request('http://localhost/api/projects?pageSize=abc');
        const response = await GET(asReq(request));
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.data.pageSize).toBe(20);
      });

      it('pageSize 超上限被夹紧到 200', async () => {
        const request = new Request('http://localhost/api/projects?pageSize=999999');
        const response = await GET(asReq(request));
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.data.pageSize).toBe(200);
      });

      it('handler 异常返回统一错误形状 {success,error:{code,message}}(非 Next HTML)', async () => {
        // 临时让 db.select 抛错,验证 try/catch 兜成统一形状
        const spy = vi.spyOn(mockDb, 'select').mockImplementation(() => {
          throw new Error('boom from test');
        });

        const request = new Request('http://localhost/api/projects?page=1');
        const response = await GET(asReq(request));
        const data = await response.json();

        expect(response.status).toBe(500);
        expect(data.success).toBe(false);
        expect(data.error).toEqual(
          expect.objectContaining({
            code: 'INTERNAL_ERROR',
            message: expect.any(String),
          })
        );
        // 确认 message 透传(非空 HTML)
        expect(data.error.message).toContain('boom from test');

        spy.mockRestore();
      });
    });
  });

  describe('POST /api/projects', () => {
    it('should create a new project with valid data', async () => {
      const requestBody = {
        name: 'Test Project',
        description: 'A test project',
        basePath: '/api/v1',
      };

      const request = new Request('http://localhost/api/projects', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      const response = await POST(asReq(request));
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('Test Project');
      expect(data.data.description).toBe('A test project');
      expect(data.data.basePath).toBe('/api/v1');
      expect(data.data.slug).toBe('test-project');
      expect(data.data.id).toBeDefined();
      expect(data.data.isActive).toBe(true);
    });

    it('should generate slug from name', async () => {
      const requestBody = {
        name: 'My Test API Project',
      };

      const request = new Request('http://localhost/api/projects', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      const response = await POST(asReq(request));
      const data = await response.json();

      expect(data.data.slug).toBe('my-test-api-project');
    });

    it('should handle special characters in name for slug generation', async () => {
      const testCases = [
        { name: 'Test Project!!', expectedSlug: 'test-project' },
        { name: '  Spaces  Around  ', expectedSlug: 'spaces-around' },
        { name: 'Multiple---Dashes', expectedSlug: 'multiple-dashes' },
        { name: 'UPPERCASE PROJECT', expectedSlug: 'uppercase-project' },
      ];

      for (const testCase of testCases) {
        const request = new Request('http://localhost/api/projects', {
          method: 'POST',
          body: JSON.stringify({ name: testCase.name }),
        });

        const response = await POST(asReq(request));
        const data = await response.json();

        expect(data.data.slug).toBe(testCase.expectedSlug);
      }
    });

    it('should create project with optional fields omitted', async () => {
      const requestBody = {
        name: 'Minimal Project',
      };

      const request = new Request('http://localhost/api/projects', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      const response = await POST(asReq(request));
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.data.name).toBe('Minimal Project');
      expect(data.data.description).toBe(null);
      expect(data.data.basePath).toBe(null);
    });

    it('should return validation error for missing name', async () => {
      const requestBody = {
        description: 'No name provided',
      };

      const request = new Request('http://localhost/api/projects', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      const response = await POST(asReq(request));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return validation error for empty name', async () => {
      const requestBody = {
        name: '',
      };

      const request = new Request('http://localhost/api/projects', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      const response = await POST(asReq(request));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('should return validation error for name exceeding max length', async () => {
      const requestBody = {
        name: 'a'.repeat(256),
      };

      const request = new Request('http://localhost/api/projects', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      const response = await POST(asReq(request));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('should handle invalid JSON', async () => {
      const request = new Request('http://localhost/api/projects', {
        method: 'POST',
        body: 'invalid json',
      });

      const response = await POST(asReq(request));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
    });
  });
});
