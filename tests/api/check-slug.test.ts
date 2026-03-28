/**
 * Check Slug API Route Tests
 * Tests for GET /api/projects/check-slug - Slug availability check
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { GET } from '@/app/api/projects/check-slug/route';
import { getTestDb, setupTestDb, clearTestDb } from '../setup';
import { projects } from '@/lib/schema';
import { eq } from 'drizzle-orm';

let mockDb: ReturnType<typeof getTestDb>;

vi.mock('@/lib/db', () => ({
  get db() {
    return mockDb;
  },
  getDb: () => mockDb,
}));

beforeAll(async () => {
  mockDb = await setupTestDb('check-slug-test');
});

describe('Check Slug API', () => {
  beforeEach(async () => {
    await clearTestDb(mockDb);
  });

  afterEach(async () => {
    await clearTestDb(mockDb);
  });

  describe('GET /api/projects/check-slug', () => {
    it('should return available: true for new slug', async () => {
      const request = new Request('http://localhost/api/projects/check-slug?slug=new-project');
      const response = await GET(request as any);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.available).toBe(true);
      expect(data.data.slug).toBe('new-project');
    });

    it('should return available: false for existing slug', async () => {
      // Create a project with the slug
      await mockDb.insert(projects).values({
        id: 'proj1',
        name: 'Existing Project',
        slug: 'existing-project',
        description: null,
        basePath: null,
        isActive: 1,
        settings: '{}',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const request = new Request('http://localhost/api/projects/check-slug?slug=existing-project');
      const response = await GET(request as any);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.available).toBe(false);
      expect(data.data.slug).toBe('existing-project');
    });

    it('should handle missing slug parameter', async () => {
      const request = new Request('http://localhost/api/projects/check-slug');
      const response = await GET(request as any);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('should validate slug format', async () => {
      const request = new Request('http://localhost/api/projects/check-slug?slug=a'.repeat(300));
      const response = await GET(request as any);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('should handle empty slug', async () => {
      const request = new Request('http://localhost/api/projects/check-slug?slug=');
      const response = await GET(request as any);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });
  });
});
