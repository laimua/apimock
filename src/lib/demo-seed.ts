/**
 * Demo project seed data
 *
 * Auto-seeds demo-project on first run when:
 *   - NODE_ENV is "production" or "development" (NOT "test")
 *   - SKIP_SEED env var is not "true"
 *   - projects table is empty
 *
 * Used by:
 *   - src/instrumentation.ts (auto-seed on boot)
 *   - scripts/seed-demo.ts (manual seed script)
 */

import { generateMockData } from './mock-data-templates';
import { nanoid } from 'nanoid';
import { eq } from 'drizzle-orm';
import { projects, endpoints } from './schema';
import type { db as dbType } from './db';
import { logger } from './logger';

export const DEMO_PROJECT_SLUG = 'demo-project';

export interface DemoEndpoint {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  name: string;
  description: string;
  prompt: string; // 用于 generateMockData
  count: number;
}

export const DEMO_ENDPOINTS: DemoEndpoint[] = [
  {
    path: '/users',
    method: 'GET',
    name: '用户列表',
    description: '获取所有用户',
    prompt: '用户列表',
    count: 10,
  },
  {
    path: '/users/:id',
    method: 'GET',
    name: '用户详情',
    description: '获取单个用户',
    prompt: '用户',
    count: 1,
  },
  {
    path: '/orders',
    method: 'GET',
    name: '订单列表',
    description: '获取所有订单',
    prompt: '订单',
    count: 10,
  },
];

export type DbClient = typeof dbType;

/**
 * 判断是否应该 auto-seed
 * @param projectCount 当前 projects 表行数
 */
export function shouldAutoSeed(projectCount: number): boolean {
  // 测试环境永远不 seed
  if (process.env.NODE_ENV === 'test') return false;
  // 显式跳过
  if (process.env.SKIP_SEED === 'true') return false;
  // 已有项目 = 不 seed
  if (projectCount > 0) return false;
  return true;
}

/**
 * 生成 demo endpoint 的 responseBody
 */
export function generateDemoResponseBody(endpoint: DemoEndpoint): string {
  const data = generateMockData(endpoint.prompt, endpoint.count);
  return JSON.stringify(data, null, 2);
}

/**
 * 实际执行 seed：插入 demo-project + 3 endpoints
 * 幂等：若 demo-project 已存在则跳过
 *
 * 使用 drizzle query API 跨 SQLite/MySQL 方言
 */
export async function runSeed(db: DbClient): Promise<{ seeded: boolean; reason?: string }> {
  // 检查 demo-project 是否存在
  // drizzle SQLite findFirst 是 sync, MySQL 是 async, await 都安全
  const existing = await db.query.projects.findFirst({
    where: eq(projects.slug, DEMO_PROJECT_SLUG),
  }) as unknown;
  if (existing) {
    return { seeded: false, reason: 'demo-project already exists' };
  }

  const now = Date.now();
  const projectId = nanoid();

  // 插入 project
  await db.insert(projects).values({
    id: projectId,
    name: 'Demo Project',
    slug: DEMO_PROJECT_SLUG,
    description: 'Auto-seeded demo project for first-time users',
    basePath: '',
    isActive: 1,
    settings: '{}',
    createdAt: now,
    updatedAt: now,
  });

  // 插入 endpoints
  for (const ep of DEMO_ENDPOINTS) {
    const endpointId = nanoid();
    const responseBody = generateDemoResponseBody(ep);
    await db.insert(endpoints).values({
      id: endpointId,
      projectId,
      path: ep.path,
      method: ep.method,
      name: ep.name,
      description: ep.description,
      isActive: 1,
      delayMs: 0,
      tags: '[]',
      statusCode: 200,
      contentType: 'application/json',
      responseBody,
      createdAt: now,
      updatedAt: now,
    });
  }

  return { seeded: true };
}

/**
 * Auto-seed 入口：检查环境 + 调用 runSeed
 */
export async function autoSeedIfNeeded(db: DbClient): Promise<void> {
  try {
    const allProjects = await db.query.projects.findMany() as unknown[];
    const count = Array.isArray(allProjects) ? allProjects.length : 0;

    if (!shouldAutoSeed(count)) return;

    const result = await runSeed(db);
    if (result.seeded) {
      console.log('[demo-seed] Auto-seeded demo-project with', DEMO_ENDPOINTS.length, 'endpoints');
    }
  } catch (err) {
    // seed 失败不影响 app 启动
    logger.error({ err }, 'demo-seed auto-seed failed');
  }
}
