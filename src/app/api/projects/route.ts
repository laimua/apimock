/**
 * 项目管理 API
 * GET /api/projects - 获取项目列表
 * POST /api/projects - 创建项目
 */

import { NextRequest } from 'next/server';
import { success, Errors, validate, internalError } from '@/lib/api';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { db } from '@/lib/db';
import { projects } from '@/lib/schema';
import { sql, desc, eq } from 'drizzle-orm';
import { SLUG_REGEX, MAX_SLUG_LENGTH, generateSlug, isReservedSlug } from '@/lib/slug';
import { logger } from '@/lib/logger';
import { isUniqueViolation } from '@/lib/db-error';

// ============================================
// Schema
// ============================================
const CreateProjectSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().regex(SLUG_REGEX).min(1).max(MAX_SLUG_LENGTH).optional(),
  description: z.string().optional(),
  basePath: z.string().optional(),
});

// ============================================
// GET /api/projects
// 支持 page/pageSize 分页（可选，不传则全返以兼容旧调用方）
// ============================================
export async function GET(request?: NextRequest) {
  try {
    const searchParams = request ? new URL(request.url).searchParams : new URLSearchParams();
    const usePagination = searchParams.has('page') || searchParams.has('pageSize');

    // 转换 isActive 为布尔值
    const format = (list: typeof projects.$inferSelect[]) =>
      list.map(project => ({ ...project, isActive: Boolean(project.isActive) }));

    if (!usePagination) {
      const projectList = await db.select().from(projects).orderBy(desc(projects.createdAt));
      return success(format(projectList));
    }

    // 分页参数兜底(P1-8):Math.max 遇 NaN 返 NaN → limit(NaN).offset(NaN) 未定义行为
    // - ?page=abc → page 兜底 1
    // - ?pageSize=abc → pageSize 兜底 20,上限 200(与 endpoints/requests 路由一致)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const rawPageSize = parseInt(searchParams.get('pageSize') || '20', 10) || 20;
    const pageSize = Math.min(Math.max(1, rawPageSize), 200);
    const offset = (page - 1) * pageSize;

    const [projectList, countRows] = await Promise.all([
      // P2-25: 与无分页分支(L41 desc)排序方向一致,最新项目优先
      db.select().from(projects).orderBy(desc(projects.createdAt)).limit(pageSize).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(projects),
    ]);
    const total = countRows[0]?.count ?? 0;

    return success({ items: format(projectList), total, page, pageSize });
  } catch (err) {
    // handler 异常时返回统一错误形状,避免冒泡成 Next 默认 500 HTML
    return internalError(err, 'GET /api/projects');
  }
}

// ============================================
// POST /api/projects
// ============================================
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = validate(CreateProjectSchema, body);

    const id = nanoid();
    // 优先用提交的 slug；否则用 name 生成（CJK 名会产空，下面校验拦截）
    const slug = (data.slug?.trim() || generateSlug(data.name)).trim();

    if (!slug) {
      return Errors.validation([
        { path: ['slug'], message: 'Slug 不能为空，中文项目名请手动填写英文 Slug' } as unknown as z.ZodIssue,
      ]);
    }
    if (isReservedSlug(slug)) {
      return Errors.validation([
        { path: ['slug'], message: `Slug "${slug}" 为保留字，不可使用` } as unknown as z.ZodIssue,
      ]);
    }
    // slug 唯一性检查，撞库返回友好错误而非 500
    const slugTaken = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.slug, slug));
    if (slugTaken.length > 0) {
      return Errors.validation([
        { path: ['slug'], message: `Slug "${slug}" 已被使用` } as unknown as z.ZodIssue,
      ]);
    }

    const now = Date.now();
    const newProject = {
      id,
      slug,
      name: data.name,
      description: data.description ?? null,
      basePath: data.basePath ?? null,
      isActive: 1,
      settings: '{}',
      createdAt: now,
      updatedAt: now,
    };

    // P2-4: 上面的 slug 预检存在 TOCTOU 窗口(并发请求都通过预检后第二个撞唯一索引)。
    // 捕获 insert 抛出的唯一约束冲突,转 409 而非裸 500 + SQL 错误透客户端。
    // 判定走 isUniqueViolation(MySQL 用稳定错误码 ER_DUP_ENTRY/1062,SQLite 解析
    // "UNIQUE constraint" 消息),避免宽正则误吞 CHECK / 外键约束或硬编码列名。
    try {
      await db.insert(projects).values(newProject);
    } catch (err: unknown) {
      if (isUniqueViolation(err)) {
        logger.error({ slug, err }, 'Project slug unique violation');
        return Errors.conflict(`Slug "${slug}" already exists`);
      }
      throw err;
    }

    return success({
      ...newProject,
      isActive: Boolean(newProject.isActive),
    }, 201);
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'ValidationError') {
      return Errors.validation((err as unknown as { issues: z.ZodIssue[] }).issues);
    }
    return internalError(err, 'POST /api/projects');
  }
}
