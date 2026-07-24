/**
 * 请求记录 API
 * GET /api/projects/[id]/endpoints/[endpointId]/requests - 获取端点的请求记录
 * DELETE /api/projects/[id]/endpoints/[endpointId]/requests - 清空请求记录
 */

import { NextRequest } from 'next/server';
import { success, Errors } from '@/lib/api';
import { db } from '@/lib/db';
import { endpoints, requests } from '@/lib/schema';
import { eq, and, desc, sql } from 'drizzle-orm';

// 安全 JSON.parse：失败返回 null（与 body 字段行为一致，避免抛错导致 500）
function safeParseOrNull<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

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

    // limit/offset：解析后做有限性校验，NaN/越界回退默认值；limit 上限 200
    let limit = queryLimit ? parseInt(queryLimit, 10) : 50;
    let offset = queryOffset ? parseInt(queryOffset, 10) : 0;
    if (!Number.isFinite(limit) || limit <= 0) limit = 50;
    if (!Number.isFinite(offset) || offset < 0) offset = 0;
    limit = Math.min(limit, 200);

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
      query: req.query ? safeParseOrNull<Record<string, string>>(req.query) : null,
      headers: req.headers ? safeParseOrNull<Record<string, string>>(req.headers) : null,
      body: req.body ? (() => {
        try {
          return JSON.parse(req.body);
        } catch {
          return req.body;
        }
      })() : null,
    }));

    // 获取总数（count(*)，避免全表扫到内存再 .length）
    const countRows = await db
      .select({ count: sql<number>`count(*)` })
      .from(requests)
      .where(eq(requests.endpointId, endpointId));
    const total = countRows[0]?.count ?? 0;

    // 统一分页风格：page/pageSize（与项目级 requests、endpoints list 一致）
    // page/pageSize 从 limit/offset 换算，保持查询参数向后兼容
    const page = Math.floor(offset / limit) + 1;
    return success({
      items: parsedRequests,
      total,
      page,
      pageSize: limit,
    });
  } catch (err) {
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

    // 删除前统计实际行数，统一返回 {deleted: N}（与项目级 requests 一致）
    const countRows = await db
      .select({ count: sql<number>`count(*)` })
      .from(requests)
      .where(eq(requests.endpointId, endpointId));
    const deleted = countRows[0]?.count ?? 0;

    // 删除所有请求记录
    await db.delete(requests).where(eq(requests.endpointId, endpointId));

    return success({ deleted: deleted as number });
  } catch (err) {
    return Errors.internal(err instanceof Error ? err.message : 'Unknown error');
  }
}
