/**
 * Responses API Route Tests
 * Tests for CRUD operations on endpoint responses
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { GET as GET_LIST, POST } from '@/app/api/projects/[id]/endpoints/[endpointId]/responses/route';
import { GET as GET_ONE, PATCH, DELETE } from '@/app/api/projects/[id]/endpoints/[endpointId]/responses/[responseId]/route';
import { getTestDb, setupTestDb, clearTestDb } from '../setup';
import { projects, endpoints, responses } from '@/lib/schema';
import { eq, and } from 'drizzle-orm';

let mockDb: ReturnType<typeof getTestDb>;

vi.mock('@/lib/db', () => ({
  get db() {
    return mockDb;
  },
}));

beforeAll(async () => {
  mockDb = await setupTestDb('responses-test');
});

describe('Responses API', () => {
  let testProject: any;
  let testEndpoint: any;
  let testResponse: any;

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

    // Create test response
    testResponse = {
      id: 'resp1',
      endpointId: testEndpoint.id,
      name: 'Success',
      description: 'Success response',
      statusCode: 200,
      contentType: 'application/json',
      headers: JSON.stringify({ 'x-custom': 'value' }),
      body: JSON.stringify({ message: 'Success' }),
      matchRules: JSON.stringify({}),
      isDefault: 0,
      priority: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await mockDb.insert(responses).values(testResponse);
  });

  afterEach(async () => {
    await clearTestDb(mockDb);
  });

  describe('GET /api/projects/[id]/endpoints/[endpointId]/responses', () => {
    it('should return list of responses', async () => {
      const request = new Request('http://localhost/api/projects/proj1/endpoints/ep1/responses');
      const response = await GET_LIST(request as any, {
        params: Promise.resolve({ id: testProject.id, endpointId: testEndpoint.id }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(1);
      expect(data.data[0].id).toBe(testResponse.id);
      expect(data.data[0].body).toEqual({ message: 'Success' });
      expect(data.data[0].headers).toEqual({ 'x-custom': 'value' });
    });

    it('should return empty array when no responses exist', async () => {
      await mockDb.delete(responses).where(eq(responses.endpointId, testEndpoint.id));

      const request = new Request('http://localhost/api/projects/proj1/endpoints/ep1/responses');
      const response = await GET_LIST(request as any, {
        params: Promise.resolve({ id: testProject.id, endpointId: testEndpoint.id }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data).toEqual([]);
    });

    it('should sort responses by priority and isDefault', async () => {
      // Add more responses with different priorities
      const responsesData = [
        {
          id: 'resp2',
          endpointId: testEndpoint.id,
          name: 'High Priority',
          description: null,
          statusCode: 200,
          contentType: 'application/json',
          headers: '{}',
          body: '{}',
          matchRules: '{}',
          isDefault: 0,
          priority: 10,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: 'resp3',
          endpointId: testEndpoint.id,
          name: 'Default',
          description: null,
          statusCode: 200,
          contentType: 'application/json',
          headers: '{}',
          body: '{}',
          matchRules: '{}',
          isDefault: 1,
          priority: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];
      await mockDb.insert(responses).values(responsesData);

      const request = new Request('http://localhost/api/projects/proj1/endpoints/ep1/responses');
      const response = await GET_LIST(request as any, {
        params: Promise.resolve({ id: testProject.id, endpointId: testEndpoint.id }),
      });
      const data = await response.json();

      expect(data.data).toHaveLength(3);
      expect(data.data[0].isDefault).toBe(false);
      expect(data.data[0].priority).toBe(10);
      expect(data.data[2].isDefault).toBe(true);
    });

    it('should return 404 for non-existent endpoint', async () => {
      const request = new Request('http://localhost/api/projects/proj1/endpoints/non-existent/responses');
      const response = await GET_LIST(request as any, {
        params: Promise.resolve({ id: testProject.id, endpointId: 'non-existent' }),
      });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
    });
  });

  describe('POST /api/projects/[id]/endpoints/[endpointId]/responses', () => {
    it('should create a new response', async () => {
      const requestBody = {
        name: 'New Response',
        statusCode: 200,
        body: { data: 'test' },
        contentType: 'application/json',
      };

      const request = new Request('http://localhost/api/projects/proj1/endpoints/ep1/responses', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      const response = await POST(request as any, {
        params: Promise.resolve({ id: testProject.id, endpointId: testEndpoint.id }),
      });
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('New Response');
      expect(data.data.statusCode).toBe(200);
      expect(data.data.body).toEqual({ data: 'test' });
      expect(data.data.id).toBeDefined();
    });

    it('should set default response and clear other defaults', async () => {
      // Set existing response as default
      await mockDb.update(responses)
        .set({ isDefault: 1 })
        .where(eq(responses.id, testResponse.id));

      const requestBody = {
        name: 'New Default',
        statusCode: 200,
        body: {},
        isDefault: true,
      };

      const request = new Request('http://localhost/api/projects/proj1/endpoints/ep1/responses', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      const response = await POST(request as any, {
        params: Promise.resolve({ id: testProject.id, endpointId: testEndpoint.id }),
      });
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.data.isDefault).toBe(true);

      // Check old default is cleared
      const oldResponse = await mockDb.select().from(responses).where(eq(responses.id, testResponse.id));
      expect(oldResponse[0].isDefault).toBe(0);
    });

    it('should validate required fields', async () => {
      const requestBody = {
        statusCode: 200,
      };

      const request = new Request('http://localhost/api/projects/proj1/endpoints/ep1/responses', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      const response = await POST(request as any, {
        params: Promise.resolve({ id: testProject.id, endpointId: testEndpoint.id }),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('should validate statusCode range', async () => {
      const requestBody = {
        name: 'Invalid Status',
        statusCode: 700,
        body: {},
      };

      const request = new Request('http://localhost/api/projects/proj1/endpoints/ep1/responses', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      const response = await POST(request as any, {
        params: Promise.resolve({ id: testProject.id, endpointId: testEndpoint.id }),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });
  });

  describe('GET /api/projects/[id]/endpoints/[endpointId]/responses/[responseId]', () => {
    it('should return single response', async () => {
      const request = new Request('http://localhost/api/projects/proj1/endpoints/ep1/responses/resp1');
      const response = await GET_ONE(request as any, {
        params: Promise.resolve({ id: testProject.id, endpointId: testEndpoint.id, responseId: testResponse.id }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.id).toBe(testResponse.id);
      expect(data.data.name).toBe(testResponse.name);
      expect(data.data.body).toEqual({ message: 'Success' });
    });

    it('should return 404 for non-existent response', async () => {
      const request = new Request('http://localhost/api/projects/proj1/endpoints/ep1/responses/non-existent');
      const response = await GET_ONE(request as any, {
        params: Promise.resolve({ id: testProject.id, endpointId: testEndpoint.id, responseId: 'non-existent' }),
      });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
    });
  });

  describe('PATCH /api/projects/[id]/endpoints/[endpointId]/responses/[responseId]', () => {
    it('should update response', async () => {
      const requestBody = {
        name: 'Updated Name',
        statusCode: 201,
        priority: 10,
      };

      const request = new Request('http://localhost/api/projects/proj1/endpoints/ep1/responses/resp1', {
        method: 'PATCH',
        body: JSON.stringify(requestBody),
      });

      const response = await PATCH(request as any, {
        params: Promise.resolve({ id: testProject.id, endpointId: testEndpoint.id, responseId: testResponse.id }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('Updated Name');
      expect(data.data.statusCode).toBe(201);
      expect(data.data.priority).toBe(10);
    });

    it('should update body field', async () => {
      const requestBody = {
        body: { updated: true, count: 10 },
      };

      const request = new Request('http://localhost/api/projects/proj1/endpoints/ep1/responses/resp1', {
        method: 'PATCH',
        body: JSON.stringify(requestBody),
      });

      const response = await PATCH(request as any, {
        params: Promise.resolve({ id: testProject.id, endpointId: testEndpoint.id, responseId: testResponse.id }),
      });
      const data = await response.json();

      expect(data.data.body).toEqual({ updated: true, count: 10 });
    });

    it('should return 404 for non-existent response', async () => {
      const requestBody = { name: 'Updated' };

      const request = new Request('http://localhost/api/projects/proj1/endpoints/ep1/responses/non-existent', {
        method: 'PATCH',
        body: JSON.stringify(requestBody),
      });

      const response = await PATCH(request as any, {
        params: Promise.resolve({ id: testProject.id, endpointId: testEndpoint.id, responseId: 'non-existent' }),
      });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
    });
  });

  describe('DELETE /api/projects/[id]/endpoints/[endpointId]/responses/[responseId]', () => {
    it('should delete response', async () => {
      const request = new Request('http://localhost/api/projects/proj1/endpoints/ep1/responses/resp1', {
        method: 'DELETE',
      });

      const response = await DELETE(request as any, {
        params: Promise.resolve({ id: testProject.id, endpointId: testEndpoint.id, responseId: testResponse.id }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.message).toBe('Response deleted successfully');

      const remaining = await mockDb.select().from(responses).where(eq(responses.id, testResponse.id));
      expect(remaining).toHaveLength(0);
    });

    it('should return 404 for non-existent response', async () => {
      const request = new Request('http://localhost/api/projects/proj1/endpoints/ep1/responses/non-existent', {
        method: 'DELETE',
      });

      const response = await DELETE(request as any, {
        params: Promise.resolve({ id: testProject.id, endpointId: testEndpoint.id, responseId: 'non-existent' }),
      });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
    });
  });
});
