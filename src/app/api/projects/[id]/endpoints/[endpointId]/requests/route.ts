/**
 * 请求记录 API
 * GET /api/projects/[id]/endpoints/[endpointId]/requests - 获取端点的请求记录
 * DELETE /api/projects/[id]/endpoints/[endpointId]/requests - 清空请求记录
 */

import { NextRequest } from 'next/server';
import { success, Errors } from '@/lib/api';
import { z } from 'zod';
import { db } from '@/lib/db';
import { endpoints, requests } from '@/lib/schema';
import { eq, and, desc } from 'drizzle-orm';

// ============================================
// Schema
// ============================================
const GetRequestsSchema = z.object({
  limit: z.string().optional().transform((val) => (val ? parseInt(val) : 50)),
  offset: z.string().optional().transform((val) => (val ? parseInt(val) : 0)),
});

// ============================================
// GET /api/projects/[id]/endpoints/[endpointId]/requests
// ============================================
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; endpointId: string }> }
) {
  try {
    const { id: projectId, endpointId } = await params;

    // 检查端点是否存在
    const endpointList = await db
      .select()
      .from(endpoints)
      .where(and(eq(endpoints.id, endpointId), eq(endpoints.projectId, projectId)));

    if (endpointList.length === 0) {
      return Errors.notFound('Endpoint');
    }

    // 解析查询参数
    const { searchParams } = new URL(request.url);
    const queryLimit = searchParams.get('limit');
    const queryOffset = searchParams.get('offset');

    const limit = queryLimit ? parseInt(queryLimit) : 50;
    const offset = queryOffset ? parseInt(queryOffset) : 0;

    // 查询请求记录（最新在前）
    const requestList = await db
      .select()
      .from(requests)
      .where(eq(requests.endpointId, endpointId))
      .orderBy(desc(requests.createdAt))
      .limit(limit)
      .offset(offset);

    // 解析 JSON 字段
    const parsedRequests = requestList.map((req) => ({
      ...req,
      query: req.query ? (JSON.parse(req.query) as Record<string, string>) : null,
      headers: req.headers ? (JSON.parse(req.headers) as Record<string, string>) : null,
      body: req.body ? (() => {
        try {
          return JSON.parse(req.body);
        } catch {
          return req.body;
        }
      })() : null,
    }));

    // 获取总数
    const totalCount = await db
      .select({ count: requests.id })
      .from(requests)
      .where(eq(requests.endpointId, endpointId));

    return success({
      requests: parsedRequests,
      total: totalCount.length,
      limit,
      offset,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Errors.validation(err.issues);
    }
    return Errors.internal(err instanceof Error ? err.message : 'Unknown error');
  }
}

// ============================================
// DELETE /api/projects/[id]/endpoints/[endpointId]/requests
// ============================================
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; endpointId: string }> }
) {
  try {
    const { id: projectId, endpointId } = await params;

    // 检查端点是否存在
    const endpointList = await db
      .select()
      .from(endpoints)
      .where(and(eq(endpoints.id, endpointId), eq(endpoints.projectId, projectId)));

    if (endpointList.length === 0) {
      return Errors.notFound('Endpoint');
    }

    // 删除所有请求记录
    await db.delete(requests).where(eq(requests.endpointId, endpointId));

    return success({ message: 'Request records cleared' });
  } catch (err) {
    return Errors.internal(err instanceof Error ? err.message : 'Unknown error');
  }
}
