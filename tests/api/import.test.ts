/**
 * Import API Route Tests
 * Tests for OpenAPI import endpoints
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { POST as IMPORT_POST } from '@/app/api/projects/[id]/import/route';
import { POST as PARSE_POST } from '@/app/api/projects/[id]/import/parse/route';
import { getTestDb, setupTestDb, clearTestDb } from '../setup';
import { projects, endpoints, responses } from '@/lib/schema';
import { eq } from 'drizzle-orm';

let mockDb: ReturnType<typeof getTestDb>;

vi.mock('@/lib/db', () => ({
  get db() {
    return mockDb;
  },
}));

// Mock the openapi-parser module
vi.mock('@/lib/openapi-parser', () => ({
  detectFormat: vi.fn(() => 'openapi3'),
  parseAndExtract: vi.fn((content: string, format: string) => {
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
  let testProject: any;

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

      const response = await IMPORT_POST(request as any, {
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

      const response = await IMPORT_POST(request as any, {
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

      const response = await IMPORT_POST(request as any, {
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

      const response = await IMPORT_POST(request as any, {
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

      const response = await IMPORT_POST(request as any, {
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

      const response = await IMPORT_POST(request as any, {
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

      const response = await PARSE_POST(request as any, {
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

    it('should parse even for non-existent project', async () => {
      const formData = new FormData();
      formData.append('file', new File(['valid content'], 'openapi.json', { type: 'application/json' }));

      const request = new Request('http://localhost/api/projects/non-existent/import/parse', {
        method: 'POST',
        body: formData,
      });

      const response = await PARSE_POST(request as any, {
        params: Promise.resolve({ id: 'non-existent' }),
      });
      const data = await response.json();

      // Parse endpoint doesn't check project existence, it just parses the file
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.endpoints).toBeDefined();
    });

    it('should return error when no file is uploaded', async () => {
      const formData = new FormData();

      const request = new Request('http://localhost/api/projects/proj1/import/parse', {
        method: 'POST',
        body: formData,
      });

      const response = await PARSE_POST(request as any, {
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

      const response = await PARSE_POST(request as any, {
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

      const response = await PARSE_POST(request as any, {
        params: Promise.resolve({ id: testProject.id }),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error.details).toBeDefined();
    });
  });
});
