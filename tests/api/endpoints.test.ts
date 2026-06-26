/**
 * Endpoints API Route Tests
 * Tests for CRUD operations on endpoints
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { type NextRequest } from 'next/server';
import { GET, POST } from '@/app/api/projects/[id]/endpoints/route';
import { GET as GET_ONE, PUT, DELETE } from '@/app/api/projects/[id]/endpoints/[endpointId]/route';
import { getTestDb, setupTestDb, clearTestDb } from '../setup';
import { projects, endpoints } from '@/lib/schema';

const asReq = (r: Request): NextRequest => r as unknown as NextRequest;

let mockDb: ReturnType<typeof getTestDb>;

// Mock the db module with a factory function
vi.mock('@/lib/db', () => ({
  get db() {
    return mockDb;
  },
}));

beforeAll(async () => {
  mockDb = await setupTestDb('endpoints-test');
});

describe('Endpoints API', () => {
  let testProject: typeof projects.$inferInsert;

  beforeEach(async () => {
    await clearTestDb(mockDb);

    // Create a test project
    const now = Date.now();
    const projectData = {
      id: 'test-proj',
      name: 'Test Project',
      slug: 'test-project',
      description: 'Test description',
      basePath: '/api/v1',
      isActive: 1,
      settings: '{}',
      createdAt: now,
      updatedAt: now,
    };

    await mockDb.insert(projects).values(projectData);
    testProject = projectData;
  });

  afterEach(async () => {
    await clearTestDb(mockDb);
  });

  describe('GET /api/projects/[id]/endpoints', () => {
    it('should return empty array when no endpoints exist', async () => {
      const request = new Request(`http://localhost/api/projects/${testProject.id}/endpoints`);
      const response = await GET(asReq(request), { params: Promise.resolve({ id: testProject.id }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toEqual([]);
    });

    it('should return list of endpoints for a project', async () => {
      const now = Date.now();
      // Insert test endpoints
      await mockDb.insert(endpoints).values([
        {
          id: 'ep1',
          projectId: testProject.id,
          path: '/users',
          method: 'GET',
          name: 'List users',
          description: 'Get all users',
          isActive: 1,
          delayMs: 0,
          tags: '["users"]',
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'ep2',
          projectId: testProject.id,
          path: '/users',
          method: 'POST',
          name: 'Create user',
          description: 'Create a new user',
          isActive: 1,
          delayMs: 0,
          tags: '["users"]',
          createdAt: now,
          updatedAt: now,
        },
      ]);

      const request = new Request(`http://localhost/api/projects/${testProject.id}/endpoints`);
      const response = await GET(asReq(request), { params: Promise.resolve({ id: testProject.id }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(2);
      expect(data.data[0].path).toBe('/users');
      expect(data.data[0].method).toBe('GET');
      expect(data.data[1].method).toBe('POST');
    });

    it('should return 404 for non-existent project', async () => {
      const request = new Request('http://localhost/api/projects/non-existent/endpoints');
      const response = await GET(asReq(request), { params: Promise.resolve({ id: 'non-existent' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('NOT_FOUND');
    });

    it('should only return endpoints for the specified project', async () => {
      // Create another project
      const otherProject = {
        id: 'other-proj',
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

      // Insert endpoints for both projects
      await mockDb.insert(endpoints).values([
        { id: 'ep1', projectId: testProject.id, path: '/users', method: 'GET', isActive: 1, delayMs: 0, tags: '[]', createdAt: Date.now(), updatedAt: Date.now() },
        { id: 'ep2', projectId: otherProject.id, path: '/items', method: 'GET', isActive: 1, delayMs: 0, tags: '[]', createdAt: Date.now(), updatedAt: Date.now() },
      ]);

      const request = new Request(`http://localhost/api/projects/${testProject.id}/endpoints`);
      const response = await GET(asReq(request), { params: Promise.resolve({ id: testProject.id }) });
      const data = await response.json();

      expect(data.data).toHaveLength(1);
      expect(data.data[0].path).toBe('/users');
    });

    it('should return 409 when creating duplicate method+path', async () => {
      // 预先建一个 GET /users
      await mockDb.insert(endpoints).values({
        id: 'existing-ep',
        projectId: testProject.id,
        path: '/users',
        method: 'GET',
        name: null,
        description: null,
        isActive: 1,
        delayMs: 0,
        tags: '[]',
        statusCode: 200,
        contentType: 'application/json',
        responseBody: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as typeof endpoints.$inferInsert);

      const request = new Request(`http://localhost/api/projects/${testProject.id}/endpoints`, {
        method: 'POST',
        body: JSON.stringify({ path: '/users', method: 'GET', name: 'dup' }),
      });

      const response = await POST(asReq(request), {
        params: Promise.resolve({ id: testProject.id }),
      });
      const data = await response.json();

      expect(response.status).toBe(409);
      expect(data.success).toBe(false);
      expect(data.error.message).toContain('already exists');
    });
  });

  describe('POST /api/projects/[id]/endpoints', () => {
    it('should create a new endpoint with valid data', async () => {
      const requestBody = {
        path: '/products',
        method: 'GET',
        name: 'List products',
        description: 'Get all products',
        delayMs: 100,
        tags: ['products', 'catalog'],
      };

      const request = new Request(`http://localhost/api/projects/${testProject.id}/endpoints`, {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      const response = await POST(asReq(request), { params: Promise.resolve({ id: testProject.id }) });
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.data.path).toBe('/products');
      expect(data.data.method).toBe('GET');
      expect(data.data.name).toBe('List products');
      expect(data.data.description).toBe('Get all products');
      expect(data.data.delayMs).toBe(100);
      expect(data.data.tags).toEqual(['products', 'catalog']);
      expect(data.data.id).toBeDefined();
      expect(data.data.isActive).toBe(true);
    });

    it('should create endpoint with default values', async () => {
      const requestBody = {
        path: '/health',
      };

      const request = new Request(`http://localhost/api/projects/${testProject.id}/endpoints`, {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      const response = await POST(asReq(request), { params: Promise.resolve({ id: testProject.id }) });
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.data.method).toBe('GET');
      expect(data.data.delayMs).toBe(0);
      expect(data.data.tags).toEqual([]);
    });

    it('should validate path is required', async () => {
      const requestBody = {
        method: 'GET',
      };

      const request = new Request(`http://localhost/api/projects/${testProject.id}/endpoints`, {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      const response = await POST(asReq(request), { params: Promise.resolve({ id: testProject.id }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('should validate HTTP methods', async () => {
      const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];

      for (const method of validMethods) {
        await clearTestDb(mockDb);
        await mockDb.insert(projects).values(testProject);

        const requestBody = { path: '/test', method };
        const request = new Request(`http://localhost/api/projects/${testProject.id}/endpoints`, {
          method: 'POST',
          body: JSON.stringify(requestBody),
        });

        const response = await POST(asReq(request), { params: Promise.resolve({ id: testProject.id }) });
        const data = await response.json();

        expect(response.status).toBe(201);
        expect(data.data.method).toBe(method);
      }
    });

    it('should validate delay range', async () => {
      const requestBody = {
        path: '/test',
        delayMs: 100000,
      };

      const request = new Request(`http://localhost/api/projects/${testProject.id}/endpoints`, {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      const response = await POST(asReq(request), { params: Promise.resolve({ id: testProject.id }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('should return 404 for non-existent project', async () => {
      const requestBody = { path: '/test' };

      const request = new Request('http://localhost/api/projects/non-existent/endpoints', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      const response = await POST(asReq(request), { params: Promise.resolve({ id: 'non-existent' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
    });
  });

  describe('GET /api/projects/[id]/endpoints/[endpointId]', () => {
    it('should return endpoint details', async () => {
      const endpoint = {
        id: 'ep1',
        projectId: testProject.id,
        path: '/users',
        method: 'GET',
        name: 'List users',
        description: 'Get all users',
        isActive: 1,
        delayMs: 0,
        tags: '["users"]',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await mockDb.insert(endpoints).values(endpoint as typeof endpoints.$inferInsert);

      const request = new Request(`http://localhost/api/projects/${testProject.id}/endpoints/${endpoint.id}`);
      const response = await GET_ONE(asReq(request), {
        params: Promise.resolve({ id: testProject.id, endpointId: endpoint.id }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.id).toBe(endpoint.id);
      expect(data.data.path).toBe('/users');
      expect(data.data.responses).toBeDefined();
    });

    it('should return 404 for non-existent endpoint', async () => {
      const request = new Request(`http://localhost/api/projects/${testProject.id}/endpoints/non-existent`);
      const response = await GET_ONE(asReq(request), {
        params: Promise.resolve({ id: testProject.id, endpointId: 'non-existent' }),
      });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
    });
  });

  describe('PUT /api/projects/[id]/endpoints/[endpointId]', () => {
    it('should update endpoint', async () => {
      const endpoint = {
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

      await mockDb.insert(endpoints).values(endpoint as typeof endpoints.$inferInsert);

      const updateData = {
        name: 'Updated name',
        delayMs: 500,
        isActive: false,
      };

      const request = new Request(`http://localhost/api/projects/${testProject.id}/endpoints/${endpoint.id}`, {
        method: 'PUT',
        body: JSON.stringify(updateData),
      });

      const response = await PUT(asReq(request), {
        params: Promise.resolve({ id: testProject.id, endpointId: endpoint.id }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('Updated name');
      expect(data.data.delayMs).toBe(500);
      expect(data.data.isActive).toBe(false);
    });

    it('should update method', async () => {
      const endpoint = {
        id: 'ep1',
        projectId: testProject.id,
        path: '/users',
        method: 'GET',
        name: 'List users',
        description: null,
        isActive: 1,
        delayMs: 0,
        tags: '[]',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await mockDb.insert(endpoints).values(endpoint as typeof endpoints.$inferInsert);

      const updateData = { method: 'POST' };

      const request = new Request(`http://localhost/api/projects/${testProject.id}/endpoints/${endpoint.id}`, {
        method: 'PUT',
        body: JSON.stringify(updateData),
      });

      const response = await PUT(asReq(request), {
        params: Promise.resolve({ id: testProject.id, endpointId: endpoint.id }),
      });
      const data = await response.json();

      expect(data.data.method).toBe('POST');
    });

    it('should return 404 for non-existent endpoint', async () => {
      const request = new Request(`http://localhost/api/projects/${testProject.id}/endpoints/non-existent`, {
        method: 'PUT',
        body: JSON.stringify({ name: 'Updated' }),
      });

      const response = await PUT(asReq(request), {
        params: Promise.resolve({ id: testProject.id, endpointId: 'non-existent' }),
      });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
    });

    it('should reject responseBody exceeding 1MB on update (body-size guard)', async () => {
      const endpoint = {
        id: 'ep1',
        projectId: testProject.id,
        path: '/users',
        method: 'GET',
        name: 'List users',
        description: null,
        isActive: 1,
        delayMs: 0,
        tags: '[]',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await mockDb.insert(endpoints).values(endpoint as typeof endpoints.$inferInsert);

      // 构造 >1MB 的 responseBody（1.2MB 字符串）
      const hugeBody = 'x'.repeat(1_200_000);

      const request = new Request(`http://localhost/api/projects/${testProject.id}/endpoints/${endpoint.id}`, {
        method: 'PUT',
        body: JSON.stringify({ responseBody: hugeBody }),
      });

      const response = await PUT(asReq(request), {
        params: Promise.resolve({ id: testProject.id, endpointId: endpoint.id }),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });
  });

  describe('DELETE /api/projects/[id]/endpoints/[endpointId]', () => {
    it('should delete endpoint', async () => {
      const endpoint = {
        id: 'ep1',
        projectId: testProject.id,
        path: '/users',
        method: 'GET',
        name: 'List users',
        description: null,
        isActive: 1,
        delayMs: 0,
        tags: '[]',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await mockDb.insert(endpoints).values(endpoint as typeof endpoints.$inferInsert);

      const request = new Request(`http://localhost/api/projects/${testProject.id}/endpoints/${endpoint.id}`, {
        method: 'DELETE',
      });

      const response = await DELETE(asReq(request), {
        params: Promise.resolve({ id: testProject.id, endpointId: endpoint.id }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.message).toBe('Endpoint deleted');
    });

    it('should return 404 for non-existent endpoint', async () => {
      const request = new Request(`http://localhost/api/projects/${testProject.id}/endpoints/non-existent`, {
        method: 'DELETE',
      });

      const response = await DELETE(asReq(request), {
        params: Promise.resolve({ id: testProject.id, endpointId: 'non-existent' }),
      });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
    });
  });
});

