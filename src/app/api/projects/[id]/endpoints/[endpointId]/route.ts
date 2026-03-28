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

// ============================================
// Schema
// ============================================
const UpdateEndpointSchema = z.object({
  path: z.string().min(1).max(500).optional(),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']).optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
  delayMs: z.number().min(0).max(60000).optional(),
  tags: z.array(z.string()).optional(),
  // 响应配置字段
  statusCode: z.number().min(100).max(599).optional(),
  contentType: z.string().optional(),
  responseBody: z.any().optional(), // 接受任何类型
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

  return success({
    ...endpoint,
    responseBody: parsedResponseBody,
    responses: responseList,
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

    // 更新端点
    await db
      .update(endpoints)
      .set(updateData)
      .where(eq(endpoints.id, endpointId));

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
    });
  } catch (err: any) {
    if (err.name === 'ValidationError') {
      return Errors.validation(err.issues);
    }
    return Errors.internal(err.message);
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

  return success({ message: 'Endpoint deleted' });
}

// ============================================
// PATCH /api/projects/[id]/endpoints/[endpointId]
// （复用 PUT 逻辑）
// ============================================
export const PATCH = PUT;
