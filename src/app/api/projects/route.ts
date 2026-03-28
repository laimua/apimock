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
// ============================================
export async function GET() {
  const projectList = await db.select().from(projects);
  // 转换 isActive 为布尔值
  const formattedList = projectList.map(project => ({
    ...project,
    isActive: Boolean(project.isActive),
  }));
  return success(formattedList);
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
  } catch (err: any) {
    if (err.name === 'ValidationError') {
      return Errors.validation(err.issues);
    }
    return Errors.internal(err.message || String(err));
  }
}
