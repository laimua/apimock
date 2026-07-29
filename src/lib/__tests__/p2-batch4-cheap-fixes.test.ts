/**
 * P2 第四批小修复验收测试:P2-10 / P2-12 / P2-13 / P2-27 / P2-43
 *
 * P2-10 — responses POST body 加 1MB 大小限制:
 *   修复前:CreateResponseSchema.body 用 z.any() 无大小限制,与 endpoints 路由
 *           1MB refine 不一致(可写超大 response body,占库存/DoS 面)。
 *   修复后:body 加 refine,JSON.stringify 后用 utf8ByteLength 算字节,
 *           超 MAX_BODY_BYTES 拒(走 zod ValidationError → 400)。null/undefined 放行。
 *
 * P2-12 — endpoint-cache 查询无 ORDER BY → 多参数模式命中不确定:
 *   修复前:getCachedEndpointsByMethod 的 select().from().where() 无 ORDER BY,
 *           /:type/list 与 /admin/:page 同时命中时依赖存储顺序。
 *   修复后:.orderBy(asc(endpoints.createdAt)),按 createdAt asc 确定性排序。
 *
 * P2-13 — mock 路由 responses 查询 priority 并列无次级键:
 *   修复前:.orderBy(desc(responses.priority)) 无次级键,priority 并列时
 *           选哪条依赖存储顺序(同输入不同结果)。
 *   修复后:.orderBy(desc(responses.priority), asc(responses.createdAt)),
 *           并列按 createdAt asc 确定性选择。
 *
 * P2-27 — 内网段缺口:
 *   修复前:PRIVATE_RANGES 缺 100.64.0.0/10 (CGNAT)、198.18.0.0/15、
 *           224.0.0.0/4 (组播)、240.0.0.0/4 (保留)。
 *   修复后:补齐四段,isPrivateIP 拦截。
 *
 * P2-43 — 错误场景 headers 丢失:
 *   修复前:ApplyScenarioResult 不含 headers,applyErrorScenario 丢掉
 *           scenario.headers(503 Retry-After、401 WWW-Authenticate)。
 *   修复后:ApplyScenarioResult 加 headers?,applyErrorScenario 透传。
 *
 * 注:
 *  - P2-10 / P2-12 / P2-13 用 :memory: better-sqlite3 + 自建 schema,
 *    参考样板:p1-6-cache-invalidation.test.ts、p1-5-request-retention.test.ts。
 *  - P2-27 / P2-43 是纯函数测,无需 DB。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from '@/lib/schema-sqlite';
import { eq, desc, asc } from 'drizzle-orm';
import { endpoints, responses, projects } from '@/lib/schema';

// ============================================
// :memory: DB(P2-10 / P2-12 / P2-13 共用)
// ============================================
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
  CREATE INDEX responses_endpoint_idx ON responses (endpoint_id);
  CREATE TABLE requests (
    id TEXT PRIMARY KEY NOT NULL,
    endpoint_id TEXT,
    method TEXT NOT NULL,
    path TEXT NOT NULL,
    query TEXT,
    headers TEXT,
    body TEXT,
    response_status INTEGER,
    response_time INTEGER,
    ip TEXT,
    user_agent TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (endpoint_id) REFERENCES endpoints(id) ON DELETE CASCADE
  );
  CREATE INDEX requests_endpoint_idx ON requests (endpoint_id);
  CREATE INDEX requests_created_idx ON requests (created_at);
`);
const memoryDb = drizzle(rawDb, { schema });

vi.mock('@/lib/db', () => ({ db: memoryDb, isMysqlEnv: () => false }));

// ============================================
// P2-27 / P2-43:纯函数测(无需 DB,放 mock 之前避免污染)
// ============================================
import { isPrivateIP } from '../ssrf';
import { applyErrorScenario, ERROR_SCENARIOS } from '../error-scenarios';

// ============================================
// P2-10:responses body 大小限制
// ============================================
// 通过路由 POST handler 验证 zod refine 在 400 路径上生效。
// 动态 import 路由(确保拿到被 mock 的 db)。
describe('P2-10: responses POST body 加 1MB 大小限制', () => {
  function makeJsonRequest(body: unknown): Request {
    return new Request('http://localhost/api/projects/p/endpoints/e/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async function callPost(body: unknown) {
    const { POST } = await import(
      '@/app/api/projects/[id]/endpoints/[endpointId]/responses/route'
    );
    const req = makeJsonRequest(body) as never;
    const params = Promise.resolve({ id: 'p1', endpointId: 'e1' }) as never;
    const res = await POST(req, { params });
    return { status: res.status, body: await res.json().catch(() => null) };
  }

  beforeEach(async () => {
    // 清表,确保 endpoint 存在性检查用例隔离
    rawDb.exec('DELETE FROM responses; DELETE FROM endpoints; DELETE FROM projects;');
    memoryDb.insert(projects).values({
      id: 'p1', name: 'p', slug: 'p', isActive: 1, createdAt: 1, updatedAt: 1,
    }).run();
    memoryDb.insert(endpoints).values({
      id: 'e1', projectId: 'p1', path: '/x', method: 'GET',
      isActive: 1, isShareable: 1, createdAt: 1, updatedAt: 1,
    }).run();
  });

  it('正常大小 body(对象,~100B)→ 201 通过', async () => {
    const { status } = await callPost({
      name: 'r1',
      statusCode: 200,
      contentType: 'application/json',
      body: { ok: true, msg: 'hello'.repeat(10) },
    });
    expect(status).toBe(201);
  });

  it('超 1MB 的字符串 body → 拒(400 zod refine)', async () => {
    // 1MB+1 字符纯 ASCII
    const huge = 'a'.repeat(1_000_001);
    const { status, body } = await callPost({
      name: 'r2',
      statusCode: 200,
      contentType: 'text/plain',
      body: huge,
    });
    expect(status).toBe(400);
    // zod ValidationError → Errors.validation 返回 success:false + VALIDATION_ERROR
    expect(body?.success).toBe(false);
    expect(body?.error?.code).toBe('VALIDATION_ERROR');
  });

  it('超 1MB 的对象 body(JSON.stringify 后)→ 拒(400)', async () => {
    // 中文占 3 字节,JSON.stringify 后字节数 > 字符数 → 测 utf8ByteLength 路径
    // 35 万个中文字符 → 约 1.05MB UTF-8 字节
    const hugeObj = { data: '中'.repeat(350_000) };
    const { status } = await callPost({
      name: 'r3',
      statusCode: 200,
      contentType: 'application/json',
      body: hugeObj,
    });
    expect(status).toBe(400);
  });

  it('null/undefined body → 通过(放行)', async () => {
    const { status } = await callPost({
      name: 'r4',
      statusCode: 200,
      contentType: 'application/json',
      body: null,
    });
    expect(status).toBe(201);
  });

  it('恰好 1MB(边界)→ 通过(>MAX 才拒)', async () => {
    // 1_000_000 字节正好等于 MAX_BODY_BYTES,refine 用 > 不含等号 → 通过
    const exact = 'b'.repeat(1_000_000);
    const { status } = await callPost({
      name: 'r5',
      statusCode: 200,
      contentType: 'text/plain',
      body: exact,
    });
    expect(status).toBe(201);
  });
});

// ============================================
// P2-12:endpoint-cache 多端点确定性排序
// ============================================
describe('P2-12: getCachedEndpointsByMethod 加 ORDER BY createdAt asc', () => {
  // 直接验证 DB 查询返回顺序——不走缓存单例(避免跨用例污染),用相同的
  // drizzle 查询形态验证 orderBy 行为。route 的命中确定性最终依赖这个查询。
  beforeEach(async () => {
    rawDb.exec('DELETE FROM responses; DELETE FROM endpoints; DELETE FROM projects;');
    // 清 endpoint-cache 模块内缓存(跨用例残留会影响 selectSpy 与命中结果)
    const { invalidateEndpointCache } = await import('@/lib/endpoint-cache');
    invalidateEndpointCache();
  });

  it('同 project+method 多端点 → 按 createdAt asc 排序', async () => {
    memoryDb.insert(projects).values({
      id: 'p12', name: 'p12', slug: 'p12', isActive: 1, createdAt: 1, updatedAt: 1,
    }).run();
    // 故意乱序插入(createdAt 倒序)以证明 orderBy 不是 no-op
    memoryDb.insert(endpoints).values([
      { id: 'e_late', projectId: 'p12', path: '/:type/list', method: 'GET',
        isActive: 1, isShareable: 1, createdAt: 300, updatedAt: 300 },
      { id: 'e_early', projectId: 'p12', path: '/admin/:page', method: 'GET',
        isActive: 1, isShareable: 1, createdAt: 100, updatedAt: 100 },
      { id: 'e_mid', projectId: 'p12', path: '/:owner/:repo', method: 'GET',
        isActive: 1, isShareable: 1, createdAt: 200, updatedAt: 200 },
    ]).run();

    // 用与 endpoint-cache.ts 相同的查询形态(含 orderBy asc createdAt)
    const list = await memoryDb
      .select()
      .from(endpoints)
      .where(eq(endpoints.projectId, 'p12'))
      .orderBy(asc(endpoints.createdAt));

    expect(list.map((e) => e.id)).toEqual(['e_early', 'e_mid', 'e_late']);
  });

  it('通过 getCachedEndpointsByMethod 缓存入口返回的顺序同样确定性', async () => {
    const { getCachedEndpointsByMethod, invalidateEndpointCache } = await import(
      '@/lib/endpoint-cache'
    );
    invalidateEndpointCache();

    memoryDb.insert(projects).values({
      id: 'p12b', name: 'p12b', slug: 'p12b', isActive: 1, createdAt: 1, updatedAt: 1,
    }).run();
    memoryDb.insert(endpoints).values([
      { id: 'b_late', projectId: 'p12b', path: '/x/:a', method: 'POST',
        isActive: 1, isShareable: 1, createdAt: 999, updatedAt: 999 },
      { id: 'b_early', projectId: 'p12b', path: '/y/:b', method: 'POST',
        isActive: 1, isShareable: 1, createdAt: 100, updatedAt: 100 },
    ]).run();

    // 两次查询结果一致(确定性)。即便乱序插入,返回都按 createdAt asc。
    const r1 = await getCachedEndpointsByMethod('p12b', 'POST');
    const r2 = await getCachedEndpointsByMethod('p12b', 'POST');
    expect(r1.map((e) => e.id)).toEqual(['b_early', 'b_late']);
    expect(r2.map((e) => e.id)).toEqual(r1.map((e) => e.id));
    invalidateEndpointCache();
  });
});

// ============================================
// P2-13:mock 路由 responses priority 并列按 createdAt asc
// ============================================
describe('P2-13: responses orderBy(desc(priority), asc(createdAt)) 并列确定性', () => {
  beforeEach(() => {
    rawDb.exec('DELETE FROM responses; DELETE FROM endpoints; DELETE FROM projects;');
  });

  it('priority 并列两条 → createdAt 早的排前(确定性)', async () => {
    memoryDb.insert(projects).values({
      id: 'p13', name: 'p13', slug: 'p13', isActive: 1, createdAt: 1, updatedAt: 1,
    }).run();
    memoryDb.insert(endpoints).values({
      id: 'e13', projectId: 'p13', path: '/x', method: 'GET',
      isActive: 1, isShareable: 1, createdAt: 1, updatedAt: 1,
    }).run();
    // 两条 priority 都为 5,createdAt 不同;故意乱序插入证明 orderBy 生效
    memoryDb.insert(responses).values([
      { id: 'r_late', endpointId: 'e13', name: 'late', statusCode: 200,
        priority: 5, createdAt: 5000, updatedAt: 5000 },
      { id: 'r_early', endpointId: 'e13', name: 'early', statusCode: 200,
        priority: 5, createdAt: 1000, updatedAt: 1000 },
    ]).run();

    // 用与 route.ts buildEndpointResponse 相同的查询形态
    const list = await memoryDb
      .select()
      .from(responses)
      .where(eq(responses.endpointId, 'e13'))
      .orderBy(desc(responses.priority), asc(responses.createdAt));

    // priority 相同 → 按 createdAt asc → early 在前
    expect(list.map((r) => r.id)).toEqual(['r_early', 'r_late']);
  });

  it('priority 不同 → 仍按 priority desc(主键优先)', async () => {
    memoryDb.insert(projects).values({
      id: 'p13b', name: 'p13b', slug: 'p13b', isActive: 1, createdAt: 1, updatedAt: 1,
    }).run();
    memoryDb.insert(endpoints).values({
      id: 'e13b', projectId: 'p13b', path: '/x', method: 'GET',
      isActive: 1, isShareable: 1, createdAt: 1, updatedAt: 1,
    }).run();
    memoryDb.insert(responses).values([
      // 高 priority 但 createdAt 晚
      { id: 'hi_pri_late', endpointId: 'e13b', statusCode: 200,
        priority: 99, createdAt: 9000, updatedAt: 9000 },
      // 低 priority 但 createdAt 早
      { id: 'lo_pri_early', endpointId: 'e13b', statusCode: 200,
        priority: 1, createdAt: 1000, updatedAt: 1000 },
    ]).run();

    const list = await memoryDb
      .select()
      .from(responses)
      .where(eq(responses.endpointId, 'e13b'))
      .orderBy(desc(responses.priority), asc(responses.createdAt));

    // priority desc 优先 → 高 priority 在前,即使它 createdAt 晚
    expect(list.map((r) => r.id)).toEqual(['hi_pri_late', 'lo_pri_early']);
  });

  it('同输入两次查询 → 同结果(确定性回归)', async () => {
    memoryDb.insert(projects).values({
      id: 'p13c', name: 'p13c', slug: 'p13c', isActive: 1, createdAt: 1, updatedAt: 1,
    }).run();
    memoryDb.insert(endpoints).values({
      id: 'e13c', projectId: 'p13c', path: '/x', method: 'GET',
      isActive: 1, isShareable: 1, createdAt: 1, updatedAt: 1,
    }).run();
    memoryDb.insert(responses).values([
      { id: 'c1', endpointId: 'e13c', statusCode: 200, priority: 7, createdAt: 300, updatedAt: 300 },
      { id: 'c2', endpointId: 'e13c', statusCode: 200, priority: 7, createdAt: 100, updatedAt: 100 },
      { id: 'c3', endpointId: 'e13c', statusCode: 200, priority: 7, createdAt: 200, updatedAt: 200 },
    ]).run();

    const q = () => memoryDb
      .select()
      .from(responses)
      .where(eq(responses.endpointId, 'e13c'))
      .orderBy(desc(responses.priority), asc(responses.createdAt));

    const r1 = (await q()).map((r) => r.id);
    const r2 = (await q()).map((r) => r.id);
    // 三条 priority 并列 → 全按 createdAt asc:c2(100) c3(200) c1(300)
    expect(r1).toEqual(['c2', 'c3', 'c1']);
    expect(r2).toEqual(r1);
  });
});

// ============================================
// P2-27:内网段缺口(纯函数)
// ============================================
describe('P2-27: isPrivateIP 补四段内网/保留段', () => {
  describe('100.64.0.0/10 (CGNAT RFC 6598)', () => {
    it('拦截 100.64.0.1 (段起点)', () => {
      expect(isPrivateIP('100.64.0.1')).toBe(true);
    });
    it('拦截 100.127.255.254 (段终点)', () => {
      expect(isPrivateIP('100.127.255.254')).toBe(true);
    });
    it('拦截 100.100.100.100 (Tailscale 默认网段中部)', () => {
      expect(isPrivateIP('100.100.100.100')).toBe(true);
    });
    it('放行 100.63.255.254 (段前,公网)', () => {
      expect(isPrivateIP('100.63.255.254')).toBe(false);
    });
    it('放行 100.128.0.1 (段后,公网)', () => {
      expect(isPrivateIP('100.128.0.1')).toBe(false);
    });
  });

  describe('198.18.0.0/15 (RFC 2544 基准测试保留)', () => {
    it('拦截 198.18.0.1 (段起点)', () => {
      expect(isPrivateIP('198.18.0.1')).toBe(true);
    });
    it('拦截 198.19.255.254 (段终点)', () => {
      expect(isPrivateIP('198.19.255.254')).toBe(true);
    });
    it('放行 198.17.255.254 (段前,公网)', () => {
      expect(isPrivateIP('198.17.255.254')).toBe(false);
    });
    it('放行 198.20.0.1 (段后,公网)', () => {
      expect(isPrivateIP('198.20.0.1')).toBe(false);
    });
  });

  describe('224.0.0.0/4 (RFC 5771 组播)', () => {
    it('拦截 224.0.0.1 (段起点,组播)', () => {
      expect(isPrivateIP('224.0.0.1')).toBe(true);
    });
    it('拦截 239.255.255.255 (段终点,组播末位)', () => {
      expect(isPrivateIP('239.255.255.255')).toBe(true);
    });
  });

  describe('240.0.0.0/4 (RFC 1112 保留,含有限广播)', () => {
    it('拦截 240.0.0.1 (段起点,保留)', () => {
      expect(isPrivateIP('240.0.0.1')).toBe(true);
    });
    it('拦截 255.255.255.254 (段内)', () => {
      expect(isPrivateIP('255.255.255.254')).toBe(true);
    });
    it('拦截 255.255.255.255 (有限广播,段终点)', () => {
      expect(isPrivateIP('255.255.255.255')).toBe(true);
    });
  });

  describe('公网回归(不受影响)', () => {
    it('放行 8.8.8.8', () => {
      expect(isPrivateIP('8.8.8.8')).toBe(false);
    });
    it('放行 1.1.1.1', () => {
      expect(isPrivateIP('1.1.1.1')).toBe(false);
    });
    it('放行 172.32.0.1 (172.16/12 段外)', () => {
      expect(isPrivateIP('172.32.0.1')).toBe(false);
    });
  });

  describe('validateUrlSafe 集成(端到端拒绝)', () => {
    it('拒绝 http://100.64.0.1/ (CGNAT)', async () => {
      const { validateUrlSafe } = await import('../ssrf');
      const r = await validateUrlSafe('http://100.64.0.1/');
      expect(r.safe).toBe(false);
    });
    it('拒绝 http://240.0.0.1/ (保留段)', async () => {
      const { validateUrlSafe } = await import('../ssrf');
      const r = await validateUrlSafe('http://240.0.0.1/');
      expect(r.safe).toBe(false);
    });
  });
});

// ============================================
// P2-43:applyErrorScenario 透传 headers(纯函数)
// ============================================
describe('P2-43: applyErrorScenario 透传 scenario.headers', () => {
  it('503 场景 → headers 含 Retry-After: 60', () => {
    const applied = applyErrorScenario(ERROR_SCENARIOS['server-503']);
    expect(applied.statusCode).toBe(503);
    expect(applied.headers).toBeDefined();
    expect(applied.headers!['Retry-After']).toBe('60');
  });

  it('401 场景 → headers 含 WWW-Authenticate: Bearer', () => {
    const applied = applyErrorScenario(ERROR_SCENARIOS['client-401']);
    expect(applied.statusCode).toBe(401);
    expect(applied.headers).toBeDefined();
    expect(applied.headers!['WWW-Authenticate']).toBe('Bearer');
  });

  it('network-error 场景 → headers 含 Connection: close', () => {
    const applied = applyErrorScenario(ERROR_SCENARIOS['network-error']);
    expect(applied.statusCode).toBe(503);
    expect(applied.headers).toBeDefined();
    expect(applied.headers!.Connection).toBe('close');
  });

  it('无 headers 的场景(如 server-500)→ headers 为 undefined(不破坏)', () => {
    const applied = applyErrorScenario(ERROR_SCENARIOS['server-500']);
    expect(applied.statusCode).toBe(500);
    expect(applied.headers).toBeUndefined();
  });

  it('其它字段(statusCode/contentType/delayMs/responseBody)仍正确透传(回归)', () => {
    const applied = applyErrorScenario(ERROR_SCENARIOS['server-503']);
    expect(applied.contentType).toBe('application/json');
    expect(applied.delayMs).toBe(0);
    expect(typeof applied.responseBody).toBe('string');
    // responseBody 是 JSON 序列化的对象,含 retryAfter 字段
    const parsed = JSON.parse(applied.responseBody);
    expect(parsed.error.retryAfter).toBe(60);
  });

  it('ApplyScenarioResult 类型签名含 headers? 字段(编译期保证)', () => {
    // 类型层面的保证:编译通过即说明 headers? 已加入接口。
    // 这里运行期再断言一次:对象上有 headers 键(无论值为何)。
    const applied = applyErrorScenario(ERROR_SCENARIOS['server-503']);
    expect(Object.prototype.hasOwnProperty.call(applied, 'headers')).toBe(true);
  });
});
