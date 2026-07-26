/**
 * 单个项目 API
 * GET /api/projects/[id] - 获取单个项目
 * PUT /api/projects/[id] - 更新项目
 * PATCH /api/projects/[id] - 更新项目（部分更新）
 * DELETE /api/projects/[id] - 删除项目
 */

import { NextRequest, NextResponse } from 'next/server';
import { success, Errors, validate } from '@/lib/api';
import { z } from 'zod';
import { db } from '@/lib/db';
import { projects } from '@/lib/schema';
import { eq, and, ne } from 'drizzle-orm';
import { DEMO_PROJECT_SLUG } from '@/lib/demo-seed';
import { SLUG_REGEX, MAX_SLUG_LENGTH, isReservedSlug } from '@/lib/slug';
import { invalidateProjectCache } from '@/lib/project-cache';
import { invalidateEndpointCache } from '@/lib/endpoint-cache';

// ============================================
// Schema
// ============================================
const UpdateProjectSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  slug: z.string().regex(SLUG_REGEX).min(1).max(MAX_SLUG_LENGTH).optional(),
  description: z.string().optional(),
  basePath: z.string().optional(),
  isActive: z.boolean().optional(),
});

const formatProject = (p: typeof projects.$inferSelect) => ({
  ...p,
  isActive: Boolean(p.isActive),
});

// ============================================
// GET /api/projects/[id]
// ============================================
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const projectList = await db.select().from(projects).where(eq(projects.id, id));
  
  if (projectList.length === 0) {
    return Errors.notFound('Project');
  }

  return success(formatProject(projectList[0]));
}

// ============================================
// PUT /api/projects/[id]
// ============================================
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const data = validate(UpdateProjectSchema, body);

    // 检查项目是否存在
    const existing = await db.select().from(projects).where(eq(projects.id, id));
    if (existing.length === 0) {
      return Errors.notFound('Project');
    }

    // 构建更新数据
    const updateData: Record<string, unknown> = {
      updatedAt: Date.now(),
    };

    if (data.name !== undefined) {
      updateData.name = data.name;
    }
    if (data.slug !== undefined) {
      // 保留字拦截（后端 API 防绕过：curl 直接 PATCH 也拦）
      if (isReservedSlug(data.slug)) {
        return Errors.validation([
          { path: ['slug'], message: `Slug "${data.slug}" 为保留字，不可使用` } as unknown as z.ZodIssue,
        ]);
      }
      const conflict = await db
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.slug, data.slug), ne(projects.id, id)));
      if (conflict.length > 0) {
        return Errors.validation([
          { path: ['slug'], message: `Slug "${data.slug}" 已被使用` } as unknown as z.ZodIssue,
        ]);
      }
      updateData.slug = data.slug;
    }
    if (data.description !== undefined) {
      updateData.description = data.description;
    }
    if (data.basePath !== undefined) {
      updateData.basePath = data.basePath;
    }
    if (data.isActive !== undefined) {
      updateData.isActive = data.isActive ? 1 : 0;
    }

    await db.update(projects).set(updateData).where(eq(projects.id, id));

    // P1-6: 项目改名/关停/恢复后失效 project 缓存，避免 mock 路由继续命中旧 slug
    // 或旧的 isActive。改名场景同时失效旧 slug 和新 slug（旧 slug 缓存里还是
    // 改名前的项目；新 slug 可能缓存了同名残留或尚未缓存，都需清掉）。
    // 注意：project 缓存只存 {id, isActive}，endpoints 缓存键是 projectId 不含
    // slug/isActive，因此 PUT 不需要失效 endpoints 缓存（mock 路由先查 project，
    // isActive 正确后再查 endpoints，project 失效即保证关停立即生效）。
    const oldSlug = existing[0].slug;
    invalidateProjectCache(oldSlug);
    if (data.slug !== undefined && data.slug !== oldSlug) {
      invalidateProjectCache(data.slug);
    }

    // 返回更新后的数据
    const updated = await db.select().from(projects).where(eq(projects.id, id));
    if (!updated[0]) {
      return Errors.notFound('Project');
    }
    return success(formatProject(updated[0]));
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'ValidationError') {
      return Errors.validation((err as unknown as { issues: z.ZodIssue[] }).issues);
    }
    return Errors.internal(err instanceof Error ? err.message : String(err));
  }
}

// ============================================
// DELETE /api/projects/[id]
// ============================================
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // 检查项目是否存在
    const existing = await db.select().from(projects).where(eq(projects.id, id));
    if (existing.length === 0) {
      return Errors.notFound('Project');
    }

    // demo-project 不可删（防止恶意清空 demo 站）
    if (existing[0].slug === DEMO_PROJECT_SLUG) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'DEMO_PROTECTED',
            message: `Demo project (${DEMO_PROJECT_SLUG}) is protected and cannot be deleted`,
          },
        },
        { status: 403 }
      );
    }

    // 删除项目（级联删除端点和响应）
    await db.delete(projects).where(eq(projects.id, id));

    // P1-6: 删除后失效 project 缓存（slug 键）和 endpoints 缓存（projectId 键）。
    // project 缓存失效后 mock 路由 getCachedProject 直接 miss → 404，不再命中
    // 缓存里的旧项目继续公开服务。endpoints 缓存清掉释放内存 + 防止 project
    // 失效窗口内（同进程下不存在窗口，跨副本 60s）仍可能命中残留 endpoints。
    invalidateProjectCache(existing[0].slug);
    invalidateEndpointCache(id);

    return success({ deleted: true });
  } catch (err: unknown) {
    return Errors.internal(err instanceof Error ? err.message : String(err));
  }
}

// ============================================
// PATCH /api/projects/[id]
// （复用 PUT 逻辑）
// ============================================
export const PATCH = PUT;
