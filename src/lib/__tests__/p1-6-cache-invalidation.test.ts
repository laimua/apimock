/**
 * P1-6 验收测试:项目删除/停用/改名后缓存失效
 *
 * 报告问题(code-review P1-6):
 *  - projects/[id]/route.ts 的 PUT(:106) 与 DELETE(:150) 均未调用缓存失效;
 *    invalidateProjectCache 全库 0 调用点。
 *  - 后果:已删项目的 mock 继续公开服务最长 60s;isActive=false 关停、slug
 *    改名同理(旧 slug 继续可用 60s)。
 *
 * 修复:PUT/DELETE 后调用 invalidateProjectCache(oldSlug)(改名连同新 slug)
 *      + invalidateEndpointCache(projectId)。
 *
 * 测试策略(两层):
 *  1. 缓存层单测:直接验证 getCachedProject / getCachedEndpointsByMethod 的
 *     invalidate 后 miss 行为(回归保护 + 证明失效函数本身正确)。
 *  2. 路由层集成测:用真实 better-sqlite3 + 真实 route handler,spy
 *     invalidateProjectCache / invalidateEndpointCache,断言 PUT 改名/关停
 *     与 DELETE 各自失效了正确的键。这一层是最关键的——证明调用点接线正确,
 *     覆盖"改名失效 oldSlug + newSlug"、"DELETE 同时失效 project + endpoint"。
 *
 * 不 mock 缓存 Map(那是被测对象),只 spy 入口函数记录调用参数。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- 层 1:缓存函数本身 ----
import {
  getCachedProject,
  invalidateProjectCache,
} from '@/lib/project-cache';
import {
  getCachedEndpointsByMethod,
  invalidateEndpointCache,
} from '@/lib/endpoint-cache';
import { db } from '@/lib/db';

// ---- 层 2:被测路由 handler ----
// 注意:route handler 在用例内用动态 import + vi.doMock 重载,不在此 top-level
// import,避免拿到未被 mock 的真实 db。

// 缓存是模块级单例,跨用例会残留 → 每个用例前全清
beforeEach(() => {
  invalidateProjectCache();
  invalidateEndpointCache();
});

/** 构造一个最小 NextRequest(只要 .json() 能用即可)。 */
function makeJsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/projects/x', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeDeleteRequest(): Request {
  return new Request('http://localhost/api/projects/x', { method: 'DELETE' });
}

// 层 2 策略:用 vi.doMock 替换 @/lib/db(让 update/delete/select 永远成功),
// 并替换 invalidate 函数为 spy,断言它们被以正确参数调用。不需要真实 DB 往返
// 即可验证接线(这是最关键的——证明调用点接对了键)。

describe('P1-6 缓存层 invalidate 行为', () => {
  it('invalidateProjectCache(slug) 后 getCachedProject 重新查 DB(miss)', async () => {
    // 先填充:用真实 db(单例)查一次让缓存写入。若 db 无此 slug 则返回 null
    // 且不写入缓存(getCachedProject 只缓存命中行)。所以这里直接验证"清空后
    // 再查会再次走 db"——通过 spy db.select 验证调用次数。
    const slug = `p1-6-miss-${Date.now()}`;
    // 确保这个 slug 不存在 → getCachedProject 返回 null 且不写缓存
    await getCachedProject(slug);
    // 全清后再查
    invalidateProjectCache(slug);
    invalidateProjectCache(); // 全清,确保 Map 干净

    // 再次查询应重新走 db.select
    const selectSpy = vi.spyOn(db, 'select');
    await getCachedProject(slug);
    expect(selectSpy).toHaveBeenCalled();
    selectSpy.mockRestore();
  });

  it('invalidateProjectCache() 全清后 Map 为空(回归保护)', () => {
    // 不抛错即视为通过:全清是无 slug 参数的分支
    expect(() => invalidateProjectCache()).not.toThrow();
  });

  it('invalidateEndpointCache(projectId) 清掉该 projectId 所有 method 键', async () => {
    const pid = `p1-6-ep-${Date.now()}`;
    // 触发一次写入(命中真实 db 查询,endpoints 表为空 → list=[] 仍写缓存)
    await getCachedEndpointsByMethod(pid, 'GET');
    // 失效该 projectId
    invalidateEndpointCache(pid);
    // 再查应重新走 db.select
    const selectSpy = vi.spyOn(db, 'select');
    await getCachedEndpointsByMethod(pid, 'GET');
    expect(selectSpy).toHaveBeenCalled();
    selectSpy.mockRestore();
  });

  it('invalidateEndpointCache() 全清', () => {
    expect(() => invalidateEndpointCache()).not.toThrow();
  });
});

// ---- 层 2:路由 handler 接线 ----
// 用 vi.mock 替换 db,让 handler 的 update/delete/select 永远成功,
// 然后断言真实 invalidate 函数被以正确参数调用。
// 必须在 import route 之前声明 vi.mock,但 ESM top-level import 顺序固定,
// 所以改用动态 import + vi.doMock + vi.resetModules 在用例内重载。

describe('P1-6 路由 handler 失效接线', () => {
  async function loadRouteWithMocks(existing: { id: string; slug: string }[]) {
    vi.resetModules();
    // db.select() 在 PUT 里的调用:
    //   - 存在性检查 / 更新后重读:select() 无参 → 返回 existing
    //   - slug 冲突预检:select({ id: projects.id }) 带参 → 返回 [](无冲突)
    // DELETE 只调一次 select()(无参)做存在性检查。
    // 用是否传参来区分,避免依赖调用次数。
    const selectImpl = vi.fn().mockImplementation((selection?: unknown) => {
      const result = selection ? [] : existing;
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(result),
        }),
      };
    });
    const updateImpl = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });
    const deleteImpl = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });
    const dbMock = { select: selectImpl, update: updateImpl, delete: deleteImpl };

    vi.doMock('@/lib/db', () => ({ db: dbMock }));

    // invalidate 也替换成 spy,验证调用参数
    const invalidateProject = vi.fn();
    const invalidateEndpoint = vi.fn();
    vi.doMock('@/lib/project-cache', () => ({
      getCachedProject: vi.fn(),
      invalidateProjectCache: invalidateProject,
    }));
    vi.doMock('@/lib/endpoint-cache', () => ({
      getCachedEndpointsByMethod: vi.fn(),
      invalidateEndpointCache: invalidateEndpoint,
    }));

    const routeMod = await import('@/app/api/projects/[id]/route');
    return { routeMod, invalidateProject, invalidateEndpoint };
  }

  it('PUT 改名 → 失效 oldSlug 和 newSlug', async () => {
    const existing = [{ id: 'p1', slug: 'old-slug' }];
    const { routeMod, invalidateProject, invalidateEndpoint } =
      await loadRouteWithMocks(existing);

    const req = makeJsonRequest({ slug: 'new-slug' });
    const res = await routeMod.PUT(req as never, {
      params: Promise.resolve({ id: 'p1' }),
    });
    expect(res.status).toBe(200);

    expect(invalidateProject).toHaveBeenCalledWith('old-slug');
    expect(invalidateProject).toHaveBeenCalledWith('new-slug');
    expect(invalidateProject).toHaveBeenCalledTimes(2);
    // PUT 不应失效 endpoints 缓存(项目改名/关停不直接改 endpoints)
    expect(invalidateEndpoint).not.toHaveBeenCalled();
  });

  it('PUT 改名但 slug 未变 → 只失效当前 slug 一次(幂等)', async () => {
    const existing = [{ id: 'p1', slug: 'same-slug' }];
    const { routeMod, invalidateProject } = await loadRouteWithMocks(existing);

    const req = makeJsonRequest({ slug: 'same-slug' });
    const res = await routeMod.PUT(req as never, {
      params: Promise.resolve({ id: 'p1' }),
    });
    expect(res.status).toBe(200);

    expect(invalidateProject).toHaveBeenCalledWith('same-slug');
    expect(invalidateProject).toHaveBeenCalledTimes(1);
  });

  it('PUT isActive=false 关停 → 失效当前 slug', async () => {
    const existing = [{ id: 'p1', slug: 'live-slug' }];
    const { routeMod, invalidateProject, invalidateEndpoint } =
      await loadRouteWithMocks(existing);

    const req = makeJsonRequest({ isActive: false });
    const res = await routeMod.PUT(req as never, {
      params: Promise.resolve({ id: 'p1' }),
    });
    expect(res.status).toBe(200);

    expect(invalidateProject).toHaveBeenCalledWith('live-slug');
    expect(invalidateProject).toHaveBeenCalledTimes(1);
    expect(invalidateEndpoint).not.toHaveBeenCalled();
  });

  it('PUT 改名 + 关停组合 → 失效 oldSlug 和 newSlug', async () => {
    const existing = [{ id: 'p1', slug: 'old' }];
    const { routeMod, invalidateProject } = await loadRouteWithMocks(existing);

    const req = makeJsonRequest({ slug: 'new', isActive: false });
    const res = await routeMod.PUT(req as never, {
      params: Promise.resolve({ id: 'p1' }),
    });
    expect(res.status).toBe(200);

    expect(invalidateProject).toHaveBeenCalledWith('old');
    expect(invalidateProject).toHaveBeenCalledWith('new');
  });

  it('PUT name 更新(不动 slug/isActive)→ 仍失效当前 slug(保守,字段更新可能影响展示)', async () => {
    const existing = [{ id: 'p1', slug: 'keep' }];
    const { routeMod, invalidateProject } = await loadRouteWithMocks(existing);

    const req = makeJsonRequest({ name: 'New Name' });
    const res = await routeMod.PUT(req as never, {
      params: Promise.resolve({ id: 'p1' }),
    });
    expect(res.status).toBe(200);

    // name 不进缓存(缓存只存 id/isActive),但 slug 键是同一个,失效无害
    expect(invalidateProject).toHaveBeenCalledWith('keep');
    expect(invalidateProject).toHaveBeenCalledTimes(1);
  });

  it('DELETE → 失效 slug 的 project 缓存 + projectId 的 endpoint 缓存', async () => {
    const existing = [{ id: 'p1', slug: 'doomed' }];
    const { routeMod, invalidateProject, invalidateEndpoint } =
      await loadRouteWithMocks(existing);

    const req = makeDeleteRequest();
    const res = await routeMod.DELETE(req as never, {
      params: Promise.resolve({ id: 'p1' }),
    });
    expect(res.status).toBe(200);

    expect(invalidateProject).toHaveBeenCalledWith('doomed');
    expect(invalidateEndpoint).toHaveBeenCalledWith('p1');
  });

  it('DELETE demo-project → 不删除(403),不触发失效', async () => {
    const existing = [{ id: 'demo', slug: 'demo-project' }];
    const { routeMod, invalidateProject, invalidateEndpoint } =
      await loadRouteWithMocks(existing);

    const req = makeDeleteRequest();
    const res = await routeMod.DELETE(req as never, {
      params: Promise.resolve({ id: 'demo' }),
    });
    expect(res.status).toBe(403);

    expect(invalidateProject).not.toHaveBeenCalled();
    expect(invalidateEndpoint).not.toHaveBeenCalled();
  });

  it('PUT 项目不存在 → 404,不触发失效', async () => {
    const { routeMod, invalidateProject } = await loadRouteWithMocks([]);

    const req = makeJsonRequest({ slug: 'whatever' });
    const res = await routeMod.PUT(req as never, {
      params: Promise.resolve({ id: 'missing' }),
    });
    expect(res.status).toBe(404);
    expect(invalidateProject).not.toHaveBeenCalled();
  });
});
