/**
 * 单个响应规则 API
 * GET /api/projects/[id]/endpoints/[endpointId]/responses/[responseId] - 获取单个响应
 * PATCH /api/projects/[id]/endpoints/[endpointId]/responses/[responseId] - 更新响应
 * DELETE /api/projects/[id]/endpoints/[endpointId]/responses/[responseId] - 删除响应
 */

import { NextRequest } from 'next/server';
import { success, Errors, validate } from '@/lib/api';
import { z } from 'zod';
import { db } from '@/lib/db';
import { responses, endpoints } from '@/lib/schema';
import { eq, and } from 'drizzle-orm';

// ============================================
// Schema
// ============================================
const UpdateResponseSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  statusCode: z.number().min(100).max(599).optional(),
  contentType: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.any().optional(),
  matchRules: z.object({
    query: z.record(z.string(), z.string()).optional(),
    header: z.record(z.string(), z.string()).optional(),
  }).optional(),
  isDefault: z.boolean().optional(),
  priority: z.number().min(0).max(1000).optional(),
});

// 辅助函数：解析响应数据
function parseResponse(response: typeof responses.$inferSelect) {
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
}

// ============================================
// GET /api/projects/[id]/endpoints/[endpointId]/responses/[responseId]
// ============================================
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; endpointId: string; responseId: string }> }
) {
  const { id: projectId, endpointId, responseId } = await params;

  // 验证端点是否存在
  const endpointList = await db.select().from(endpoints).where(eq(endpoints.id, endpointId));
  if (endpointList.length === 0 || endpointList[0].projectId !== projectId) {
    return Errors.notFound('Endpoint');
  }

  const responseList = await db
    .select()
    .from(responses)
    .where(and(eq(responses.id, responseId), eq(responses.endpointId, endpointId)));

  if (responseList.length === 0) {
    return Errors.notFound('Response');
  }

  return success(parseResponse(responseList[0]));
}

// ============================================
// PATCH /api/projects/[id]/endpoints/[endpointId]/responses/[responseId]
// ============================================
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; endpointId: string; responseId: string }> }
) {
  try {
    const { id: projectId, endpointId, responseId } = await params;
    const body = await request.json();
    const data = validate(UpdateResponseSchema, body);

    // 验证端点是否存在
    const endpointList = await db.select().from(endpoints).where(eq(endpoints.id, endpointId));
    if (endpointList.length === 0 || endpointList[0].projectId !== projectId) {
      return Errors.notFound('Endpoint');
    }

    // 验证响应是否存在
    const responseList = await db
      .select()
      .from(responses)
      .where(and(eq(responses.id, responseId), eq(responses.endpointId, endpointId)));

    if (responseList.length === 0) {
      return Errors.notFound('Response');
    }

    const now = Date.now();
    const updateData: Record<string, unknown> = { updatedAt: now };

    // 处理各种字段
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.statusCode !== undefined) updateData.statusCode = data.statusCode;
    if (data.contentType !== undefined) updateData.contentType = data.contentType;
    if (data.priority !== undefined) updateData.priority = data.priority;
    if (data.isDefault !== undefined) updateData.isDefault = data.isDefault ? 1 : 0;

    if (data.headers !== undefined) {
      updateData.headers = JSON.stringify(data.headers);
    }

    if (data.body !== undefined) {
      updateData.body = typeof data.body === 'string' ? data.body : JSON.stringify(data.body);
    }

    if (data.matchRules !== undefined) {
      updateData.matchRules = JSON.stringify(data.matchRules);
    }

    // 如果设置为默认响应，需要清除其他响应的默认标记
    if (data.isDefault === true) {
      await db.update(responses)
        .set({ isDefault: 0, updatedAt: now })
        .where(and(eq(responses.endpointId, endpointId)));
    }

    // 更新响应
    await db.update(responses)
      .set(updateData)
      .where(and(eq(responses.id, responseId), eq(responses.endpointId, endpointId)));

    // 获取更新后的响应
    const updatedList = await db
      .select()
      .from(responses)
      .where(and(eq(responses.id, responseId), eq(responses.endpointId, endpointId)));

    return success(parseResponse(updatedList[0]));
  } catch (err: any) {
    if (err.name === 'ValidationError') {
      return Errors.validation(err.issues);
    }
    return Errors.internal(err.message);
  }
}

// ============================================
// DELETE /api/projects/[id]/endpoints/[endpointId]/responses/[responseId]
// ============================================
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; endpointId: string; responseId: string }> }
) {
  try {
    const { id: projectId, endpointId, responseId } = await params;

    // 验证端点是否存在
    const endpointList = await db.select().from(endpoints).where(eq(endpoints.id, endpointId));
    if (endpointList.length === 0 || endpointList[0].projectId !== projectId) {
      return Errors.notFound('Endpoint');
    }

    // 验证响应是否存在
    const responseList = await db
      .select()
      .from(responses)
      .where(and(eq(responses.id, responseId), eq(responses.endpointId, endpointId)));

    if (responseList.length === 0) {
      return Errors.notFound('Response');
    }

    // 删除响应
    await db.delete(responses)
      .where(and(eq(responses.id, responseId), eq(responses.endpointId, endpointId)));

    return success({ message: 'Response deleted successfully' });
  } catch (err: any) {
    return Errors.internal(err.message);
  }
}
