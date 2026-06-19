/**
 * Demo project protection tests
 * demo-project (auto-seeded) cannot be deleted
 */

import { describe, it, expect, beforeEach, beforeAll, afterEach } from 'vitest';
import { DELETE } from '@/app/api/projects/[id]/route';
import { getTestDb, setupTestDb, clearTestDb } from '../setup';
import { projects } from '@/lib/schema';
import { eq } from 'drizzle-orm';

let mockDb: ReturnType<typeof getTestDb>;

vi.mock('@/lib/db', () => ({
  get db() {
    return mockDb;
  },
}));

async function insertProject(overrides: Partial<typeof projects.$inferInsert> = {}) {
  const now = Date.now();
  const defaults = {
    id: 'test-id',
    name: 'Test Project',
    slug: 'test-project',
    description: null,
    basePath: null,
    isActive: 1,
    settings: '{}',
    createdAt: now,
    updatedAt: now,
  };
  const merged = { ...defaults, ...overrides };
  await mockDb.insert(projects).values(merged);
  return merged.id;
}

beforeAll(async () => {
  mockDb = await setupTestDb('demo-protection-test');
});

describe('DELETE /api/projects/[id] - demo protection', () => {
  beforeEach(async () => {
    await clearTestDb(mockDb);
  });

  afterEach(async () => {
    await clearTestDb(mockDb);
  });

  it('returns 403 when deleting demo-project', async () => {
    const id = await insertProject({
      id: 'demo-1',
      name: 'Demo Project',
      slug: 'demo-project',
    });

    const request = new Request(`http://localhost/api/projects/${id}`, {
      method: 'DELETE',
    });
    const response = await DELETE(request as never, {
      params: Promise.resolve({ id }),
    });

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error ?? body.message ?? JSON.stringify(body)).toMatch(/demo/i);
  });

  it('allows deleting regular project', async () => {
    const id = await insertProject({
      id: 'regular-1',
      name: 'Regular',
      slug: 'regular-project',
    });

    const request = new Request(`http://localhost/api/projects/${id}`, {
      method: 'DELETE',
    });
    const response = await DELETE(request as never, {
      params: Promise.resolve({ id }),
    });

    expect(response.status).toBe(200);
    const remaining = await mockDb.select().from(projects).where(eq(projects.id, id));
    expect(remaining).toHaveLength(0);
  });
});
