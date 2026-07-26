/**
 * P1-9 端点路径规范化校验 + P2-9 PUT 重复预检
 *
 * 报告:`endpoints/route.ts:20` 与 `[endpointId]/route.ts:21` 的 zod 仅 min(1).max(500),
 * 导致 `users`(无前导斜杠)与 `/users/`(尾斜杠)可被创建但**永不匹配** mock 请求。
 *
 * 本测试用真实 better-sqlite3 + :memory: 库 + 自建 schema 起 project + endpoint,
 * 直接调路由 handler,验证 zod regex 拒绝非法路径、允许合法路径,且 PUT 改 path
 * 撞唯一索引返回 409 而非 500。
 *
 * 覆盖:
 *   1. POST `users`(无前导斜杠)→ 400
 *   2. POST `/users/`(尾斜杠)→ 400
 *   3. POST 正常 `/users` → 201
 *   4. POST `/users/:id`(参数路径)→ 201
 *   5. PUT 改 path 为非法(无斜杠)→ 400
 *   6. (P2-9) PUT 改 path/method 撞唯一索引 → 409
 *
 * CI 兼容性:不依赖生产 db 单例(连文件库 ./data/apimock.db,CI 干净环境无表会炸)。
 * 用 vi.mock('@/lib/db', factory) 注入一个 :memory: better-sqlite3 + drizzle 实例,
 * factory 内自建 schema(与 drizzle/0001+0003 跑完后的表结构一致)。
 * route handler 顶部 import { db } 拿到的就是这个 mock,模块加载无副作用。
 * 参考样板:p1-4-foreign-keys / p1-5-request-retention(:memory: 自建,不落盘)。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { projects } from '@/lib/schema';
import * as schema from '@/lib/schema-sqlite';
import { NextRequest } from 'next/server';
import { nanoid } from 'nanoid';

// 自建一个 :memory: better-sqlite3 + drizzle(带真实 schema),供被测 route handler 使用。
// 不落盘、不依赖生产 db 单例(连 ./data/apimock.db 的文件库,CI 干净环境无表会炸)。
// 表结构与 drizzle/0000+0001+0003 跑完后一致(含 is_shareable / 唯一索引)。
const rawDb = new Database(':memory:');
rawDb.pragma('foreign_keys = ON');
rawDb.exec(`
  CREATE TABLE projects (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    base_path TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    settings TEXT DEFAULT '{}',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE UNIQUE INDEX projects_slug_unique ON projects (slug);
  CREATE UNIQUE INDEX projects_slug_idx ON projects (slug);
  CREATE TABLE endpoints (
    id TEXT PRIMARY KEY NOT NULL,
    project_id TEXT NOT NULL,
    path TEXT NOT NULL,
    method TEXT NOT NULL DEFAULT 'GET',
    name TEXT,
    description TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    is_shareable INTEGER NOT NULL DEFAULT 1,
    delay_ms INTEGER DEFAULT 0,
    tags TEXT DEFAULT '[]',
    status_code INTEGER DEFAULT 200,
    content_type TEXT DEFAULT 'application/json',
    response_body TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );
  CREATE UNIQUE INDEX endpoints_project_method_path_idx ON endpoints (project_id, method, path);
  CREATE TABLE responses (
    id TEXT PRIMARY KEY NOT NULL,
    endpoint_id TEXT NOT NULL,
    name TEXT,
    description TEXT,
    status_code INTEGER NOT NULL DEFAULT 200,
    headers TEXT DEFAULT '{}',
    body TEXT,
    content_type TEXT DEFAULT 'application/json',
    match_rules TEXT DEFAULT '{}',
    is_default INTEGER DEFAULT 0,
    priority INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (endpoint_id) REFERENCES endpoints(id) ON DELETE CASCADE
  );
  CREATE TABLE requests (
    id TEXT PRIMARY KEY NOT NULL,
    endpoint_id TEXT,
    method TEXT NOT NULL,
    path TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (endpoint_id) REFERENCES endpoints(id) ON DELETE CASCADE
  );
`);
const memoryDb = drizzle(rawDb, { schema });

// vi.mock 被 vitest hoist 到所有 import 之前(含 route handler 内部的 '@/lib/db')。
// factory 引用 memoryDb —— 它是模块顶层 const,在 factory 真正被调用时(模块求值完)
// 已初始化。route handler 拿到的就是这个 :memory: db,模块加载无副作用。
vi.mock('@/lib/db', () => ({ db: memoryDb }));

// 在 mock 生效后动态 import route handler,拿到注入的 :memory: db。
const { POST } = await import('../route');
const { PUT } = await import('../[endpointId]/route');

function makePostReq(projectId: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/projects/${projectId}/endpoints`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makePutReq(projectId: string, endpointId: string, body: unknown): NextRequest {
  return new NextRequest(
    `http://localhost/api/projects/${projectId}/endpoints/${endpointId}`,
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
}

async function json(res: Response) {
  return res.json() as Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string; details?: unknown } }>;
}

describe('P1-9: 端点路径规范化校验', () => {
  let projectId: string;

  beforeEach(async () => {
    // 每个用例前清表,确保起点干净(:memory: 库跨用例复用)
    rawDb.exec('DELETE FROM endpoints');
    rawDb.exec('DELETE FROM projects');
    projectId = nanoid();
    await memoryDb.insert(projects).values({
      id: projectId,
      name: `p1-9-test-${projectId}`,
      slug: `p1-9-test-${projectId}`,
      description: null,
      isActive: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });

  it('1. POST 无前导斜杠 `users` → 400 VALIDATION_ERROR', async () => {
    const res = await POST(makePostReq(projectId, { path: 'users', method: 'GET' }), {
      params: Promise.resolve({ id: projectId }),
    });
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.success).toBe(false);
    expect(body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('2. POST 尾斜杠 `/users/` → 400 VALIDATION_ERROR', async () => {
    const res = await POST(makePostReq(projectId, { path: '/users/', method: 'GET' }), {
      params: Promise.resolve({ id: projectId }),
    });
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.success).toBe(false);
    expect(body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('2b. POST 根路径 `/` → 400(无端点应服务根路径)', async () => {
    const res = await POST(makePostReq(projectId, { path: '/', method: 'GET' }), {
      params: Promise.resolve({ id: projectId }),
    });
    expect(res.status).toBe(400);
  });

  it('2c. POST 双斜杠 `//` → 400', async () => {
    const res = await POST(makePostReq(projectId, { path: '//', method: 'GET' }), {
      params: Promise.resolve({ id: projectId }),
    });
    expect(res.status).toBe(400);
  });

  it('2d. POST 中段双斜杠 `//users` → 400(空段永不匹配)', async () => {
    const res = await POST(makePostReq(projectId, { path: '//users', method: 'GET' }), {
      params: Promise.resolve({ id: projectId }),
    });
    expect(res.status).toBe(400);
  });

  it('2e. POST 中段双斜杠 `/a//b` → 400(空段永不匹配)', async () => {
    const res = await POST(makePostReq(projectId, { path: '/a//b', method: 'GET' }), {
      params: Promise.resolve({ id: projectId }),
    });
    expect(res.status).toBe(400);
  });

  it('3. POST 正常 `/users` → 201', async () => {
    const res = await POST(makePostReq(projectId, { path: '/users', method: 'GET' }), {
      params: Promise.resolve({ id: projectId }),
    });
    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.success).toBe(true);
    expect((body.data as { path: string }).path).toBe('/users');
  });

  it('4. POST 参数路径 `/users/:id` → 201', async () => {
    const res = await POST(makePostReq(projectId, { path: '/users/:id', method: 'GET' }), {
      params: Promise.resolve({ id: projectId }),
    });
    expect(res.status).toBe(201);
    const body = await json(res);
    expect((body.data as { path: string }).path).toBe('/users/:id');
  });

  it('4b. POST 多层路径 `/a/b/c` → 201', async () => {
    const res = await POST(makePostReq(projectId, { path: '/a/b/c', method: 'GET' }), {
      params: Promise.resolve({ id: projectId }),
    });
    expect(res.status).toBe(201);
  });

  it('5. PUT 改 path 为非法(无斜杠)→ 400 VALIDATION_ERROR', async () => {
    // 先建一个合法端点
    const createRes = await POST(
      makePostReq(projectId, { path: '/items', method: 'GET' }),
      { params: Promise.resolve({ id: projectId }) }
    );
    const created = (await json(createRes)).data as { id: string };
    expect(created.id).toBeTruthy();

    // PUT 改成非法 path
    const putRes = await PUT(
      makePutReq(projectId, created.id, { path: 'no-slash' }),
      { params: Promise.resolve({ id: projectId, endpointId: created.id }) }
    );
    expect(putRes.status).toBe(400);
    const body = await json(putRes);
    expect(body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('5b. PUT 改 path 为尾斜杠 `/items/` → 400', async () => {
    const createRes = await POST(
      makePostReq(projectId, { path: '/widgets', method: 'GET' }),
      { params: Promise.resolve({ id: projectId }) }
    );
    const created = (await json(createRes)).data as { id: string };

    const putRes = await PUT(
      makePutReq(projectId, created.id, { path: '/widgets/' }),
      { params: Promise.resolve({ id: projectId, endpointId: created.id }) }
    );
    expect(putRes.status).toBe(400);
  });

  it('6. (P2-9) PUT 改 path 撞唯一索引 → 409 而非 500', async () => {
    // 建两个端点
    const a = (await json(await POST(
      makePostReq(projectId, { path: '/alpha', method: 'GET' }),
      { params: Promise.resolve({ id: projectId }) }
    ))).data as { id: string };
    expect(a.id).toBeTruthy();
    const b = (await json(await POST(
      makePostReq(projectId, { path: '/beta', method: 'GET' }),
      { params: Promise.resolve({ id: projectId }) }
    ))).data as { id: string };

    // 把 b 的 path 改成与 a 相同 → 撞唯一索引
    const res = await PUT(
      makePutReq(projectId, b.id, { path: '/alpha' }),
      { params: Promise.resolve({ id: projectId, endpointId: b.id }) }
    );
    expect(res.status).toBe(409);
    const body = await json(res);
    expect(body.error?.code).toBe('CONFLICT');
  });

  it('6b. (P2-9) PUT 改 path 为自身相同值(无冲突)→ 200', async () => {
    // 边界:把 path 改成自身当前值,不应误判为冲突
    const a = (await json(await POST(
      makePostReq(projectId, { path: '/self', method: 'GET' }),
      { params: Promise.resolve({ id: projectId }) }
    ))).data as { id: string };

    const res = await PUT(
      makePutReq(projectId, a.id, { path: '/self' }),
      { params: Promise.resolve({ id: projectId, endpointId: a.id }) }
    );
    expect(res.status).toBe(200);
  });

  it('6c. (P2-9) PUT 改 method 撞唯一索引 → 409', async () => {
    // /dup GET 与 /dup POST 共存
    const getEp = (await json(await POST(
      makePostReq(projectId, { path: '/dup', method: 'GET' }),
      { params: Promise.resolve({ id: projectId }) }
    ))).data as { id: string };
    expect(getEp.id).toBeTruthy();
    const postEp = (await json(await POST(
      makePostReq(projectId, { path: '/dup', method: 'POST' }),
      { params: Promise.resolve({ id: projectId }) }
    ))).data as { id: string };

    // 把 POST 改成 GET → 撞 getEp
    const res = await PUT(
      makePutReq(projectId, postEp.id, { method: 'GET' }),
      { params: Promise.resolve({ id: projectId, endpointId: postEp.id }) }
    );
    expect(res.status).toBe(409);
  });
});
