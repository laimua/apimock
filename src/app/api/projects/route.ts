/**
 * 项目管理 API
 * GET /api/projects - 获取项目列表
 * POST /api/projects - 创建项目
 */

import { NextRequest } from 'next/server';
import { success, Errors, validate } from '@/lib/api';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { db } from '@/lib/db';
import { projects } from '@/lib/schema';
import { sql } from 'drizzle-orm';

// ============================================
// Schema
// ============================================
const CreateProjectSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  basePath: z.string().optional(),
});

// ============================================
// GET /api/projects
// 支持 page/pageSize 分页（可选，不传则全返以兼容旧调用方）
// ============================================
export async function GET(request?: NextRequest) {
  const searchParams = request ? new URL(request.url).searchParams : new URLSearchParams();
  const usePagination = searchParams.has('page') || searchParams.has('pageSize');

  // 转换 isActive 为布尔值
  const format = (list: typeof projects.$inferSelect[]) =>
    list.map(project => ({ ...project, isActive: Boolean(project.isActive) }));

  if (!usePagination) {
    const projectList = await db.select().from(projects);
    return success(format(projectList));
  }

  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const pageSize = Math.max(1, Math.min(100, parseInt(searchParams.get('pageSize') || '20', 10)));
  const offset = (page - 1) * pageSize;

  const [projectList, countRows] = await Promise.all([
    db.select().from(projects).orderBy(projects.createdAt).limit(pageSize).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(projects),
  ]);
  const total = countRows[0]?.count ?? 0;

  return success({ items: format(projectList), total, page, pageSize });
}

// ============================================
// POST /api/projects
// ============================================
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = validate(CreateProjectSchema, body);

    const id = nanoid();
    const slug = data.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

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

    await db.insert(projects).values(newProject);

    return success({
      ...newProject,
      isActive: Boolean(newProject.isActive),
    }, 201);
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'ValidationError') {
      return Errors.validation((err as unknown as { issues: z.ZodIssue[] }).issues);
    }
    return Errors.internal(err instanceof Error ? err.message : String(err));
  }
}
