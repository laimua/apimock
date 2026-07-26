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
import { invalidateEndpointCache } from '@/lib/endpoint-cache';

// ============================================
// Schema
// ============================================
// P1-9: 端点路径规范化校验。
// 必须以 `/` 开头且不能以 `/` 结尾，拒绝：
//   - `users`(无前导斜杠):routeParts 比 requestParts 少一段 → 永不匹配
//   - `/users/`(尾斜杠):Next 默认 trailingSlash:false 会 308 到无斜杠,requestPath 不等 → 永不匹配
//   - `/`(根路径)、`//`(空段):无意义,无端点应服务根路径
// 允许 `/users`、`/users/:id`、`/a/b/c` 等参数与多层路径。
const ENDPOINT_PATH_REGEX = /^\/.*[^/]$/;
const ENDPOINT_PATH_MESSAGE =
  'path must start with "/" and must not end with "/" (e.g. "/users", "/users/:id")';

const CreateEndpointSchema = z.object({
  path: z.string().min(1).max(500).regex(ENDPOINT_PATH_REGEX, ENDPOINT_PATH_MESSAGE),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']).default('GET'),
  name: z.string().optional(),
  description: z.string().optional(),
  delayMs: z.number().min(0).max(60000).optional(),
  tags: z.array(z.string()).optional(),
  isShareable: z.boolean().optional(),
  // 响应配置字段
  statusCode: z.number().min(100).max(599).optional(),
  contentType: z.string().optional(),
  responseBody: z.any().refine(
    (v) => v === undefined || v === null || JSON.stringify(v).length <= 1_000_000,
    'responseBody too large (max 1MB)'
  ).optional(),
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
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  // pageSize 上限保护(防 DoS:无上限可一次拉巨量数据)
  const rawPageSize = parseInt(searchParams.get('pageSize') || '20', 10) || 20;
  const pageSize = Math.min(Math.max(1, rawPageSize), 200);
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

  // 标签筛选（tags 是 JSON 数组字符串）
  if (tag) {
    const isMysql = (process.env.DB_TYPE || 'sqlite').toLowerCase() === 'mysql';
    if (isMysql) {
      // MySQL: JSON_CONTAINS(tags, JSON_QUOTE(?))
      conditions.push(sql`JSON_CONTAINS(${endpoints.tags}, JSON_QUOTE(${tag}))`);
    } else {
      // SQLite: json_each
      conditions.push(sql`${endpoints.id} IN (SELECT e.id FROM endpoints e, json_each(e.tags) WHERE e.project_id = ${projectId} AND json_each.value = ${tag})`);
    }
  }

  const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];

  // 如果没有分页参数，返回全部（向后兼容）
  const usePagination = searchParams.has('page') || searchParams.has('pageSize');

  // 获取总数（仅分页时需要，无分页场景省一次 count 查询）
  let count = 0;
  if (usePagination) {
    const countRows = await db
      .select({ count: sql<number>`count(*)` })
      .from(endpoints)
      .where(whereClause);
    count = countRows[0]?.count ?? 0;
  }

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
      isShareable: Boolean(endpoint.isShareable),
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

    // 预检重复（避免 unique 约束冲突抛裸 500）
    const duplicate = await db
      .select({ id: endpoints.id })
      .from(endpoints)
      .where(
        and(
          eq(endpoints.projectId, projectId),
          eq(endpoints.method, data.method),
          eq(endpoints.path, data.path)
        )
      )
      .limit(1);
    if (duplicate.length > 0) {
      return Errors.conflict(
        `Endpoint ${data.method} ${data.path} already exists in this project`,
        { endpointId: duplicate[0].id }
      );
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
      isShareable: data.isShareable === false ? 0 : 1, // 默认可见，显式 false 才隐藏
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
    invalidateEndpointCache(projectId);

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
      isShareable: Boolean(newEndpoint.isShareable),
    }, 201);
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'ValidationError') {
      return Errors.validation((err as unknown as { issues: z.ZodIssue[] }).issues);
    }
    return Errors.internal(err instanceof Error ? err.message : String(err));
  }
}
