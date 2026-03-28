/**
 * Share API Route Tests
 * Tests for GET /api/share/[slug] - Public project sharing
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { GET } from '@/app/api/share/[slug]/route';
import { getTestDb, setupTestDb, clearTestDb } from '../setup';
import { projects, endpoints } from '@/lib/schema';
import { eq } from 'drizzle-orm';

let mockDb: ReturnType<typeof getTestDb>;

vi.mock('@/lib/db', () => ({
  get db() {
    return mockDb;
  },
}));

beforeAll(async () => {
  mockDb = await setupTestDb('share-test');
});

describe('Share API', () => {
  let testProject: any;
  let testEndpoints: any[] = [];

  beforeEach(async () => {
    await clearTestDb(mockDb);

    // Create a test project
    const projectData = {
      id: 'proj1',
      name: 'Test Project',
      slug: 'test-project',
      description: 'A shared test project',
      basePath: '/api/v1',
      isActive: 1,
      settings: '{}',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await mockDb.insert(projects).values(projectData);
    testProject = projectData;

    // Create test endpoints
    const endpointsData = [
      {
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
        tags: '[]',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];

    await mockDb.insert(endpoints).values(endpointsData);
    testEndpoints = endpointsData;
  });

  afterEach(async () => {
    await clearTestDb(mockDb);
  });

  describe('GET /api/share/[slug]', () => {
    it('should return public project and endpoints', async () => {
      const request = new Request('http://localhost/api/share/test-project');
      const response = await GET(request as any, {
        params: Promise.resolve({ slug: testProject.slug }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.project.name).toBe(testProject.name);
      expect(data.project.slug).toBe(testProject.slug);
      expect(data.project.description).toBe(testProject.description);
      expect(data.endpoints).toHaveLength(2);
      expect(data.endpoints[0].path).toBe('/users');
      expect(data.endpoints[0].method).toBe('GET');
      expect(data.baseUrl).toContain(testProject.slug);
    });

    it('should return 404 for non-existent slug', async () => {
      const request = new Request('http://localhost/api/share/non-existent');
      const response = await GET(request as any, {
        params: Promise.resolve({ slug: 'non-existent' }),
      });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBeDefined();
    });

    it('should return endpoints sorted by method and path', async () => {
      const additionalEndpoints = [
        {
          id: 'ep3',
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
        },
      ];

      await mockDb.insert(endpoints).values(additionalEndpoints);

      const request = new Request('http://localhost/api/share/test-project');
      const response = await GET(request as any, {
        params: Promise.resolve({ slug: testProject.slug }),
      });
      const data = await response.json();

      expect(data.endpoints).toHaveLength(3);
      expect(data.endpoints[0].method).toBe('GET');
      expect(data.endpoints[1].method).toBe('GET');
      expect(data.endpoints[2].method).toBe('POST');
    });

    it('should handle project with no endpoints', async () => {
      await mockDb.delete(endpoints).where(eq(endpoints.projectId, testProject.id));

      const request = new Request('http://localhost/api/share/test-project');
      const response = await GET(request as any, {
        params: Promise.resolve({ slug: testProject.slug }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.endpoints).toHaveLength(0);
      expect(data.project.name).toBe(testProject.name);
    });
  });
});
