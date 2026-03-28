/**
 * 请求记录 API
 * GET /api/projects/[id]/requests - 获取项目的请求记录列表（支持分页和筛选）
 * DELETE /api/projects/[id]/requests - 清空项目的请求记录
 */

import { NextRequest } from 'next/server';
import { success, Errors } from '@/lib/api';
import { db } from '@/lib/db';
import { projects, endpoints, requests } from '@/lib/schema';
import { eq, and, desc, gte, lte, sql, inArray, or } from 'drizzle-orm';

// ============================================
// GET /api/projects/[id]/requests
// 支持分页、按端点筛选、按时间范围筛选
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
  const endpointId = searchParams.get('endpointId') || '';
  const startTime = searchParams.get('startTime');
  const endTime = searchParams.get('endTime');

  // 获取项目的所有端点ID
  const projectEndpoints = await db
    .select({ id: endpoints.id })
    .from(endpoints)
    .where(eq(endpoints.projectId, projectId));

  const endpointIds = projectEndpoints.map(e => e.id);

  // 验证端点筛选是否属于该项目
  let targetEndpointIds = endpointIds;
  if (endpointId) {
    const endpointList = await db
      .select()
      .from(endpoints)
      .where(and(eq(endpoints.id, endpointId), eq(endpoints.projectId, projectId)));

    if (endpointList.length === 0) {
      return Errors.badRequest('Endpoint does not belong to this project');
    }
    targetEndpointIds = [endpointId];
  }

  if (targetEndpointIds.length === 0) {
    return success({
      items: [],
      total: 0,
      page,
      pageSize,
    });
  }

  // 构建查询条件
  const conditions: any[] = [];
  conditions.push(inArray(requests.endpointId, targetEndpointIds));

  // 添加时间筛选
  if (startTime) {
    const start = parseInt(startTime, 10);
    if (!isNaN(start)) {
      conditions.push(gte(requests.createdAt, start));
    }
  }

  if (endTime) {
    const end = parseInt(endTime, 10);
    if (!isNaN(end)) {
      conditions.push(lte(requests.createdAt, end));
    }
  }

  const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];

  // 获取总数
  const [{ count: totalCount }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(requests)
    .where(whereClause);

  // 分页查询
  const offset = (page - 1) * pageSize;
  const requestList = await db
    .select()
    .from(requests)
    .where(whereClause)
    .orderBy(desc(requests.createdAt))
    .limit(pageSize)
    .offset(offset);

  // 获取端点信息（批量查询）
  const uniqueEndpointIds = Array.from(new Set(requestList.map(r => r.endpointId)));
  const endpointMap = new Map<string, { path: string; method: string; name?: string }>();

  if (uniqueEndpointIds.length > 0) {
    const endpointInfoList = await db
      .select({ id: endpoints.id, path: endpoints.path, method: endpoints.method, name: endpoints.name })
      .from(endpoints)
      .where(inArray(endpoints.id, uniqueEndpointIds));

    for (const ep of endpointInfoList) {
      endpointMap.set(ep.id, { path: ep.path, method: ep.method, name: ep.name ?? undefined });
    }
  }

  // 解析 JSON 字段并添加端点信息
  const parsedList = requestList.map((req) => {
    let parsedQuery: Record<string, string> | null = null;
    let parsedHeaders: Record<string, string> | null = null;
    let parsedBody: unknown = null;

    if (req.query) {
      try {
        parsedQuery = JSON.parse(req.query);
      } catch {
        parsedQuery = null;
      }
    }

    if (req.headers) {
      try {
        parsedHeaders = JSON.parse(req.headers);
      } catch {
        parsedHeaders = null;
      }
    }

    if (req.body) {
      try {
        parsedBody = JSON.parse(req.body);
      } catch {
        parsedBody = req.body;
      }
    }

    return {
      ...req,
      query: parsedQuery,
      headers: parsedHeaders,
      body: parsedBody,
      endpoint: endpointMap.get(req.endpointId) || null,
    };
  });

  return success({
    items: parsedList,
    total: totalCount as number,
    page,
    pageSize,
  });
}

// ============================================
// DELETE /api/projects/[id]/requests
// 清空项目的所有请求记录（支持按端点筛选）
// ============================================
export async function DELETE(
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
  const endpointId = searchParams.get('endpointId') || '';

  // 获取项目的所有端点ID
  const projectEndpoints = await db
    .select({ id: endpoints.id })
    .from(endpoints)
    .where(eq(endpoints.projectId, projectId));

  const endpointIds = projectEndpoints.map(e => e.id);

  // 如果指定了端点，验证端点是否属于该项目
  let targetEndpointIds = endpointIds;
  if (endpointId) {
    const endpointList = await db
      .select()
      .from(endpoints)
      .where(and(eq(endpoints.id, endpointId), eq(endpoints.projectId, projectId)));

    if (endpointList.length === 0) {
      return Errors.badRequest('Endpoint does not belong to this project');
    }
    targetEndpointIds = [endpointId];
  }

  if (targetEndpointIds.length === 0) {
    return success({ deleted: 0 });
  }

  // 删除请求记录
  for (const eid of targetEndpointIds) {
    await db.delete(requests).where(eq(requests.endpointId, eid));
  }

  return success({ deleted: targetEndpointIds.length });
}
