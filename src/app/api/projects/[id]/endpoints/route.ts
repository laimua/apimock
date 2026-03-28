/**
 * 端点管理 API
 * GET /api/projects/[id]/endpoints - 获取端点列表（支持分页和筛选）
 * POST /api/projects/[id]/endpoints - 创建端点
 */

import { NextRequest } from 'next/server';
import { success, Errors, validate } from '@/lib/api';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { db } from '@/lib/db';
import { endpoints, projects } from '@/lib/schema';
import { eq, and, like, sql } from 'drizzle-orm';

// ============================================
// Schema
// ============================================
const CreateEndpointSchema = z.object({
  path: z.string().min(1).max(500),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']).default('GET'),
  name: z.string().optional(),
  description: z.string().optional(),
  delayMs: z.number().min(0).max(60000).optional(),
  tags: z.array(z.string()).optional(),
  // 响应配置字段
  statusCode: z.number().min(100).max(599).optional(),
  contentType: z.string().optional(),
  responseBody: z.any().optional(), // 接受任何类型
});

// ============================================
// GET /api/projects/[id]/endpoints
// 支持分页和筛选
// ============================================
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;

  // 验证项目是否存在
  const projectList = await db.select().from(projects).where(eq(projects.id, projectId));
  if (projectList.length === 0) {
    return Errors.notFound('Project');
  }

  // 解析查询参数
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1', 10);
  const pageSize = parseInt(searchParams.get('pageSize') || '20', 10);
  const search = searchParams.get('search') || '';
  const method = searchParams.get('method') || '';
  const tag = searchParams.get('tag') || '';

  // 构建查询条件
  const conditions = [eq(endpoints.projectId, projectId)];

  // 路径模糊搜索
  if (search) {
    conditions.push(like(endpoints.path, `%${search}%`));
  }

  // 方法筛选
  if (method) {
    conditions.push(eq(endpoints.method, method as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS'));
  }

  // 标签筛选（tags 是 JSON 字符串，需要用 LIKE）
  if (tag) {
    conditions.push(sql`${endpoints.tags} LIKE ${`%"${tag}"%`}`);
  }

  const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];

  // 获取总数
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(endpoints)
    .where(whereClause);

  // 如果没有分页参数，返回全部（向后兼容）
  const usePagination = searchParams.has('page') || searchParams.has('pageSize');

  let endpointList;
  if (usePagination) {
    // 分页查询
    const offset = (page - 1) * pageSize;
    endpointList = await db
      .select()
      .from(endpoints)
      .where(whereClause)
      .orderBy(endpoints.createdAt)
      .limit(pageSize)
      .offset(offset);
  } else {
    // 返回全部
    endpointList = await db
      .select()
      .from(endpoints)
      .where(whereClause)
      .orderBy(endpoints.createdAt);
  }

  // 解析每个端点的 responseBody 和 tags
  const parsedList = endpointList.map((endpoint) => {
    let parsedResponseBody: unknown = null;
    if (endpoint.responseBody) {
      try {
        parsedResponseBody = JSON.parse(endpoint.responseBody);
      } catch {
        parsedResponseBody = endpoint.responseBody;
      }
    }
    let parsedTags: string[] = [];
    if (endpoint.tags) {
      try {
        parsedTags = JSON.parse(endpoint.tags);
      } catch {
        parsedTags = [];
      }
    }
    return {
      ...endpoint,
      responseBody: parsedResponseBody,
      tags: parsedTags,
      isActive: Boolean(endpoint.isActive), // 转换为布尔值
    };
  });

  // 分页响应格式
  if (usePagination) {
    return success({
      items: parsedList,
      total: count as number,
      page,
      pageSize,
    });
  }

  // 向后兼容：无分页参数时直接返回数组
  return success(parsedList);
}

// ============================================
// POST /api/projects/[id]/endpoints
// ============================================
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const body = await request.json();
    const data = validate(CreateEndpointSchema, body);

    // 验证项目是否存在
    const projectList = await db.select().from(projects).where(eq(projects.id, projectId));
    if (projectList.length === 0) {
      return Errors.notFound('Project');
    }

    const endpointId = nanoid();
    const now = Date.now();

    // 处理 responseBody
    const responseBodyStr = data.responseBody !== undefined
      ? (typeof data.responseBody === 'string' ? data.responseBody : JSON.stringify(data.responseBody))
      : null;

    // 处理 tags
    const tagsStr = data.tags ? JSON.stringify(data.tags) : '[]';

    const newEndpoint = {
      id: endpointId,
      projectId,
      path: data.path,
      method: data.method,
      name: data.name ?? null,
      description: data.description ?? null,
      isActive: 1, // SQLite 用整数
      delayMs: data.delayMs ?? 0,
      tags: tagsStr,
      // 响应配置字段
      statusCode: data.statusCode ?? 200,
      contentType: data.contentType ?? 'application/json',
      responseBody: responseBodyStr,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(endpoints).values(newEndpoint);

    // 解析 responseBody 和 tags 用于返回
    let parsedResponseBody: unknown = null;
    if (newEndpoint.responseBody) {
      try {
        parsedResponseBody = JSON.parse(newEndpoint.responseBody);
      } catch {
        parsedResponseBody = newEndpoint.responseBody;
      }
    }
    let parsedTags: string[] = [];
    if (newEndpoint.tags) {
      try {
        parsedTags = JSON.parse(newEndpoint.tags);
      } catch {
        parsedTags = [];
      }
    }

    return success({
      ...newEndpoint,
      responseBody: parsedResponseBody,
      tags: parsedTags,
      isActive: Boolean(newEndpoint.isActive), // 转换为布尔值
    }, 201);
  } catch (err: any) {
    if (err.name === 'ValidationError') {
      return Errors.validation(err.issues);
    }
    return Errors.internal(err.message);
  }
}
