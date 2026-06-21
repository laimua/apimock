/**
 * demo-seed runSeed integration tests
 * 实际写入 in-memory DB，验证 insert 路径
 */

import { describe, it, expect, beforeEach, beforeAll, afterEach } from 'vitest';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from '@/lib/schema-sqlite';
import { runSeed, autoSeedIfNeeded, DEMO_PROJECT_SLUG, DEMO_ENDPOINTS, type DbClient } from '../demo-seed';
import { projects, endpoints } from '@/lib/schema';
import { eq } from 'drizzle-orm';

let mockDb: DbClient;

async function makeDb(): Promise<DbClient> {
  const sqlite = new Database(':memory:');
  const db = drizzle(sqlite, { schema }) as DbClient;
  // 创建表
  await db.run(`CREATE TABLE projects (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
    description TEXT, base_path TEXT, is_active INTEGER NOT NULL DEFAULT 1,
    settings TEXT DEFAULT '{}', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  )`);
  await db.run(`CREATE TABLE endpoints (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, path TEXT NOT NULL,
    method TEXT NOT NULL DEFAULT 'GET', name TEXT, description TEXT,
    is_active INTEGER NOT NULL DEFAULT 1, is_shareable INTEGER NOT NULL DEFAULT 1,
    delay_ms INTEGER DEFAULT 0,
    tags TEXT DEFAULT '[]', status_code INTEGER DEFAULT 200,
    content_type TEXT DEFAULT 'application/json', response_body TEXT,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  )`);
  return db;
}

beforeAll(async () => {
  mockDb = await makeDb();
});

describe('runSeed', () => {
  beforeEach(async () => {
    await mockDb.run('DELETE FROM endpoints');
    await mockDb.run('DELETE FROM projects');
  });

  afterEach(async () => {
    await mockDb.run('DELETE FROM endpoints');
    await mockDb.run('DELETE FROM projects');
  });

  it('inserts demo-project with 3 endpoints', async () => {
    const result = await runSeed(mockDb);
    expect(result.seeded).toBe(true);

    const projectRows = await mockDb.select().from(projects).where(eq(projects.slug, DEMO_PROJECT_SLUG));
    expect(projectRows).toHaveLength(1);

    const endpointRows = await mockDb.select().from(endpoints);
    expect(endpointRows).toHaveLength(DEMO_ENDPOINTS.length);

    const paths = endpointRows.map(e => e.path);
    expect(paths).toContain('/users');
    expect(paths).toContain('/users/:id');
    expect(paths).toContain('/orders');
  });

  it('is idempotent (skips when demo-project already exists)', async () => {
    await runSeed(mockDb); // first seed
    const result = await runSeed(mockDb); // second seed
    expect(result.seeded).toBe(false);
    expect(result.reason).toContain('already exists');

    // 仍只有 1 个 project + 3 endpoints
    const projects2 = await mockDb.select().from(projects);
    expect(projects2).toHaveLength(1);
    const endpoints2 = await mockDb.select().from(endpoints);
    expect(endpoints2).toHaveLength(DEMO_ENDPOINTS.length);
  });

  it('each endpoint has responseBody with valid JSON', async () => {
    await runSeed(mockDb);
    const endpointRows = await mockDb.select().from(endpoints);
    for (const ep of endpointRows) {
      expect(ep.responseBody).toBeTruthy();
      const parsed = JSON.parse(ep.responseBody!);
      expect(parsed).toHaveProperty('code', 0);
      expect(parsed).toHaveProperty('data.list');
      expect(parsed).toHaveProperty('data.total');
    }
  });
});

describe('autoSeedIfNeeded', () => {
  beforeEach(async () => {
    await mockDb.run('DELETE FROM endpoints');
    await mockDb.run('DELETE FROM projects');
    process.env = { ...process.env, NODE_ENV: 'production', SKIP_SEED: undefined };
  });

  it('seeds when conditions met', async () => {
    await autoSeedIfNeeded(mockDb);
    const projects2 = await mockDb.select().from(projects);
    expect(projects2).toHaveLength(1);
    expect(projects2[0].slug).toBe(DEMO_PROJECT_SLUG);
  });

  it('does not seed when SKIP_SEED=true', async () => {
    process.env.SKIP_SEED = 'true';
    await autoSeedIfNeeded(mockDb);
    const projects2 = await mockDb.select().from(projects);
    expect(projects2).toHaveLength(0);
  });

  it('does not seed when NODE_ENV=test', async () => {
    process.env.NODE_ENV = 'test';
    await autoSeedIfNeeded(mockDb);
    const projects2 = await mockDb.select().from(projects);
    expect(projects2).toHaveLength(0);
  });

  it('does not seed when projects table has data', async () => {
    const now = Date.now();
    await mockDb.insert(projects).values({
      id: 'other-1', name: 'Other', slug: 'other-project',
      isActive: 1, settings: '{}', createdAt: now, updatedAt: now,
    });
    await autoSeedIfNeeded(mockDb);
    const projects2 = await mockDb.select().from(projects);
    expect(projects2).toHaveLength(1);
    expect(projects2[0].slug).toBe('other-project');
  });

  it('swallows DB errors (does not throw)', async () => {
    // 删表模拟 schema 不存在场景
    await mockDb.run('DROP TABLE endpoints');
    await mockDb.run('DROP TABLE projects');
    await expect(autoSeedIfNeeded(mockDb)).resolves.not.toThrow();
    // 重建表供后续测试
    mockDb = await makeDb();
  });
});
