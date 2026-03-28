/**
 * Projects API Route Tests
 * Tests for GET /api/projects and POST /api/projects
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { POST, GET } from '@/app/api/projects/route';
import { getTestDb, setupTestDb, clearTestDb, cleanupTestDb } from '../setup';
import { projects } from '@/lib/schema';
import { eq } from 'drizzle-orm';

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

      const response = await POST(request as any);
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

      const response = await POST(request as any);
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

        const response = await POST(request as any);
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

      const response = await POST(request as any);
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

      const response = await POST(request as any);
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

      const response = await POST(request as any);
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

      const response = await POST(request as any);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('should handle invalid JSON', async () => {
      const request = new Request('http://localhost/api/projects', {
        method: 'POST',
        body: 'invalid json',
      });

      const response = await POST(request as any);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
    });
  });
});
