/**
 * Requests API Route Tests
 * Tests for GET/DELETE /api/projects/[id]/requests and /api/projects/[id]/endpoints/[endpointId]/requests
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { GET as GET_PROJECT_REQUESTS, DELETE as DELETE_PROJECT_REQUESTS } from '@/app/api/projects/[id]/requests/route';
import { GET as GET_ENDPOINT_REQUESTS, DELETE as DELETE_ENDPOINT_REQUESTS } from '@/app/api/projects/[id]/endpoints/[endpointId]/requests/route';
import { getTestDb, setupTestDb, clearTestDb } from '../setup';
import { projects, endpoints, requests } from '@/lib/schema';
import { eq, and } from 'drizzle-orm';

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
  let testProject: any;
  let testEndpoint: any;
  let testRequests: any[] = [];

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
      const response = await GET_PROJECT_REQUESTS(request as any, {
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
      const response = await GET_PROJECT_REQUESTS(request as any, {
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
      await mockDb.insert(endpoints).values(endpoint2);

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
      const response = await GET_PROJECT_REQUESTS(httpRequest as any, {
        params: Promise.resolve({ id: testProject.id }),
      });
      const data = await response.json();

      expect(data.data.items).toHaveLength(2);
      expect(data.data.items[0].endpointId).toBe(testEndpoint.id);
    });

    it('should return 404 for non-existent project', async () => {
      const request = new Request('http://localhost/api/projects/non-existent/requests');
      const response = await GET_PROJECT_REQUESTS(request as any, {
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
      const response = await GET_PROJECT_REQUESTS(request as any, {
        params: Promise.resolve({ id: otherProject.id }),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('should return empty array when no requests exist', async () => {
      await mockDb.delete(requests).where(eq(requests.endpointId, testEndpoint.id));

      const request = new Request('http://localhost/api/projects/proj1/requests');
      const response = await GET_PROJECT_REQUESTS(request as any, {
        params: Promise.resolve({ id: testProject.id }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.items).toEqual([]);
      expect(data.data.total).toBe(0);
    });
  });

  describe('DELETE /api/projects/[id]/requests', () => {
    it('should delete all requests for a project', async () => {
      const request = new Request('http://localhost/api/projects/proj1/requests', {
        method: 'DELETE',
      });

      const response = await DELETE_PROJECT_REQUESTS(request as any, {
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

      const response = await DELETE_PROJECT_REQUESTS(request as any, {
        params: Promise.resolve({ id: testProject.id }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('GET /api/projects/[id]/endpoints/[endpointId]/requests', () => {
    it('should return requests for an endpoint', async () => {
      const request = new Request('http://localhost/api/projects/proj1/endpoints/ep1/requests');
      const response = await GET_ENDPOINT_REQUESTS(request as any, {
        params: Promise.resolve({ id: testProject.id, endpointId: testEndpoint.id }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.requests).toHaveLength(2);
      expect(data.data.total).toBe(2);
      expect(data.data.requests[0].query.page).toBe('1');
    });

    it('should support limit and offset', async () => {
      const request = new Request('http://localhost/api/projects/proj1/endpoints/ep1/requests?limit=1&offset=0');
      const response = await GET_ENDPOINT_REQUESTS(request as any, {
        params: Promise.resolve({ id: testProject.id, endpointId: testEndpoint.id }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.requests).toHaveLength(1);
      expect(data.data.limit).toBe(1);
      expect(data.data.offset).toBe(0);
    });

    it('should return 404 for non-existent endpoint', async () => {
      const request = new Request('http://localhost/api/projects/proj1/endpoints/non-existent/requests');
      const response = await GET_ENDPOINT_REQUESTS(request as any, {
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

      const response = await DELETE_ENDPOINT_REQUESTS(request as any, {
        params: Promise.resolve({ id: testProject.id, endpointId: testEndpoint.id }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.message).toBe('Request records cleared');

      const remainingRequests = await mockDb.select().from(requests);
      expect(remainingRequests).toHaveLength(0);
    });

    it('should return 404 for non-existent endpoint', async () => {
      const request = new Request('http://localhost/api/projects/proj1/endpoints/non-existent/requests', {
        method: 'DELETE',
      });

      const response = await DELETE_ENDPOINT_REQUESTS(request as any, {
        params: Promise.resolve({ id: testProject.id, endpointId: 'non-existent' }),
      });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
    });
  });
});
