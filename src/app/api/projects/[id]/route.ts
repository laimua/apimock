/**
 * 单个项目 API
 * GET /api/projects/[id] - 获取单个项目
 * PUT /api/projects/[id] - 更新项目
 * PATCH /api/projects/[id] - 更新项目（部分更新）
 * DELETE /api/projects/[id] - 删除项目
 */

import { NextRequest } from 'next/server';
import { success, Errors, validate } from '@/lib/api';
import { z } from 'zod';
import { db } from '@/lib/db';
import { projects } from '@/lib/schema';
import { eq } from 'drizzle-orm';

// ============================================
// Schema
// ============================================
const UpdateProjectSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  basePath: z.string().optional(),
  isActive: z.boolean().optional(),
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

  return success(projectList[0]);
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
      // 更新 slug
      updateData.slug = data.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
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

    // 返回更新后的数据
    const updated = await db.select().from(projects).where(eq(projects.id, id));
    return success(updated[0]);
  } catch (err: any) {
    if (err.name === 'ValidationError') {
      return Errors.validation(err.issues);
    }
    return Errors.internal(err.message || String(err));
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

    // 删除项目（级联删除端点和响应）
    await db.delete(projects).where(eq(projects.id, id));

    return success({ deleted: true });
  } catch (err: any) {
    return Errors.internal(err.message || String(err));
  }
}

// ============================================
// PATCH /api/projects/[id]
// （复用 PUT 逻辑）
// ============================================
export const PATCH = PUT;
