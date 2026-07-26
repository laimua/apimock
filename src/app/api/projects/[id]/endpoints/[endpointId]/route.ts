/**
 * 单个端点管理 API
 * GET /api/projects/[id]/endpoints/[endpointId] - 获取端点详情
 * PUT /api/projects/[id]/endpoints/[endpointId] - 更新端点
 * PATCH /api/projects/[id]/endpoints/[endpointId] - 更新端点（部分更新）
 * DELETE /api/projects/[id]/endpoints/[endpointId] - 删除端点
 */

import { NextRequest } from 'next/server';
import { success, Errors, validate } from '@/lib/api';
import { z } from 'zod';
import { db } from '@/lib/db';
import { endpoints, responses } from '@/lib/schema';
import { eq, and } from 'drizzle-orm';
import { invalidateEndpointCache } from '@/lib/endpoint-cache';

// ============================================
// Schema
// ============================================
// P1-9: 端点路径规范化校验（与 POST 一致，见 endpoints/route.ts 注释）。
// 必须以 `/` 开头、不能以 `/` 结尾、不能含空段（`//users`、`/a//b`）。
const ENDPOINT_PATH_REGEX = /^\/([^/]+\/)*[^/]+$/;
const ENDPOINT_PATH_MESSAGE =
  'path must start with "/" and must not end with "/" or contain empty segments (e.g. "/users", "/users/:id")';

const UpdateEndpointSchema = z.object({
  path: z.string().min(1).max(500).regex(ENDPOINT_PATH_REGEX, ENDPOINT_PATH_MESSAGE).optional(),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']).optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
  isShareable: z.boolean().optional(),
  delayMs: z.number().min(0).max(60000).optional(),
  tags: z.array(z.string()).optional(),
  // 响应配置字段
  statusCode: z.number().min(100).max(599).optional(),
  contentType: z.string().optional(),
  responseBody: z.any().refine(
    (v) => v === undefined || v === null || JSON.stringify(v).length <= 1_000_000,
    'responseBody too large (max 1MB)'
  ).optional(),
});

// ============================================
// GET /api/projects/[id]/endpoints/[endpointId]
// ============================================
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; endpointId: string }> }
) {
  const { id: projectId, endpointId } = await params;

  const endpointList = await db
    .select()
    .from(endpoints)
    .where(and(eq(endpoints.id, endpointId), eq(endpoints.projectId, projectId)));

  if (endpointList.length === 0) {
    return Errors.notFound('Endpoint');
  }

  const endpoint = endpointList[0];

  // 解析 responseBody
  let parsedResponseBody: unknown = null;
  if (endpoint.responseBody) {
    try {
      parsedResponseBody = JSON.parse(endpoint.responseBody);
    } catch {
      parsedResponseBody = endpoint.responseBody;
    }
  }

  // 获取关联的响应
  const responseList = await db
    .select()
    .from(responses)
    .where(eq(responses.endpointId, endpointId));

  // 解析关联响应的 JSON 字段（与 responses GET 一致），整数布尔转 boolean
  const parsedResponses = responseList.map((response) => {
    let parsedBody: unknown = null;
    if (response.body) {
      try {
        parsedBody = JSON.parse(response.body);
      } catch {
        parsedBody = response.body;
      }
    }

    let parsedHeaders: Record<string, string> = {};
    if (response.headers) {
      try {
        parsedHeaders = JSON.parse(response.headers);
      } catch {
        parsedHeaders = {};
      }
    }

    let parsedMatchRules: { query?: Record<string, string>; header?: Record<string, string> } = {};
    if (response.matchRules) {
      try {
        parsedMatchRules = JSON.parse(response.matchRules);
      } catch {
        parsedMatchRules = {};
      }
    }

    return {
      ...response,
      body: parsedBody,
      headers: parsedHeaders,
      matchRules: parsedMatchRules,
      isDefault: !!response.isDefault,
    };
  });

  return success({
    ...endpoint,
    isActive: Boolean(endpoint.isActive),
    isShareable: Boolean(endpoint.isShareable),
    responseBody: parsedResponseBody,
    responses: parsedResponses,
  });
}

// ============================================
// PUT /api/projects/[id]/endpoints/[endpointId]
// ============================================
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; endpointId: string }> }
) {
  try {
    const { id: projectId, endpointId } = await params;
    const body = await request.json();
    const data = validate(UpdateEndpointSchema, body);

    // 检查端点是否存在
    const endpointList = await db
      .select()
      .from(endpoints)
      .where(and(eq(endpoints.id, endpointId), eq(endpoints.projectId, projectId)));

    if (endpointList.length === 0) {
      return Errors.notFound('Endpoint');
    }

    // 构建更新数据
    const updateData: Record<string, unknown> = {
      updatedAt: Date.now(),
    };

    if (data.path !== undefined) updateData.path = data.path;
    if (data.method !== undefined) updateData.method = data.method;
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.isActive !== undefined) updateData.isActive = data.isActive ? 1 : 0;
    if (data.isShareable !== undefined) updateData.isShareable = data.isShareable ? 1 : 0;
    if (data.delayMs !== undefined) updateData.delayMs = data.delayMs;
    if (data.tags !== undefined) updateData.tags = JSON.stringify(data.tags);
    // 响应配置字段
    if (data.statusCode !== undefined) updateData.statusCode = data.statusCode;
    if (data.contentType !== undefined) updateData.contentType = data.contentType;
    if (data.responseBody !== undefined) {
      updateData.responseBody = typeof data.responseBody === 'string'
        ? data.responseBody
        : JSON.stringify(data.responseBody);
    }

    // P2-9: PUT 改 path/method 时重复预检（与 POST 一致），避免撞唯一索引抛裸 500。
    // 仅在本次更新涉及 path 或 method 时才查；否则跳过省一次 DB roundtrip。
    if (updateData.path !== undefined || updateData.method !== undefined) {
      const newPath = (updateData.path as string | undefined) ?? endpointList[0].path;
      const newMethod = (updateData.method as string | undefined) ?? endpointList[0].method;
      const duplicate = await db
        .select({ id: endpoints.id })
        .from(endpoints)
        .where(
          and(
            eq(endpoints.projectId, projectId),
            eq(endpoints.method, newMethod as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS'),
            eq(endpoints.path, newPath),
          )
        );
      // 排除自身（同 path+method 但不同 id 视为冲突）
      if (duplicate.some((d) => d.id !== endpointId)) {
        return Errors.conflict(
          `Endpoint ${newMethod} ${newPath} already exists in this project`
        );
      }
    }

    // 更新端点
    try {
      await db
        .update(endpoints)
        .set(updateData)
        .where(eq(endpoints.id, endpointId));
    } catch (err: unknown) {
      // 兜底:预检存在 TOCTOU 窗口,并发撞唯一索引时转 409 而非裸 500
      const msg = err instanceof Error ? err.message : String(err);
      if (/unique|constraint/i.test(msg)) {
        return Errors.conflict('Endpoint with this path and method already exists');
      }
      throw err;
    }
    invalidateEndpointCache(projectId);

    // 返回更新后的数据
    const updatedList = await db
      .select()
      .from(endpoints)
      .where(eq(endpoints.id, endpointId));

    const updated = updatedList[0];

    // 解析 responseBody
    let parsedResponseBody: unknown = null;
    if (updated.responseBody) {
      try {
        parsedResponseBody = JSON.parse(updated.responseBody);
      } catch {
        parsedResponseBody = updated.responseBody;
      }
    }

    return success({
      ...updated,
      responseBody: parsedResponseBody,
      isActive: Boolean(updated.isActive),
      isShareable: Boolean(updated.isShareable),
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'ValidationError') {
      return Errors.validation((err as unknown as { issues: z.ZodIssue[] }).issues);
    }
    return Errors.internal(err instanceof Error ? err.message : String(err));
  }
}

// ============================================
// DELETE /api/projects/[id]/endpoints/[endpointId]
// ============================================
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; endpointId: string }> }
) {
  const { id: projectId, endpointId } = await params;

  // 检查端点是否存在
  const endpointList = await db
    .select()
    .from(endpoints)
    .where(and(eq(endpoints.id, endpointId), eq(endpoints.projectId, projectId)));

  if (endpointList.length === 0) {
    return Errors.notFound('Endpoint');
  }

  // 删除端点（关联的响应会由于 cascade 自动删除）
  await db.delete(endpoints).where(eq(endpoints.id, endpointId));
  invalidateEndpointCache(projectId);

  return success({ message: 'Endpoint deleted' });
}

// ============================================
// PATCH /api/projects/[id]/endpoints/[endpointId]
// （复用 PUT 逻辑）
// ============================================
export const PATCH = PUT;
