/**
 * 响应规则 API
 * GET /api/projects/[id]/endpoints/[endpointId]/responses - 获取响应列表
 * POST /api/projects/[id]/endpoints/[endpointId]/responses - 创建响应
 */

import { NextRequest } from 'next/server';
import { success, Errors, validate } from '@/lib/api';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { db } from '@/lib/db';
import { responses, endpoints } from '@/lib/schema';
import { eq } from 'drizzle-orm';

// ============================================
// Schema
// ============================================
const CreateResponseSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  statusCode: z.number().min(100).max(599).default(200),
  contentType: z.string().default('application/json'),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.any().optional(),
  matchRules: z.object({
    query: z.record(z.string(), z.string()).optional(),
    header: z.record(z.string(), z.string()).optional(),
  }).optional(),
  isDefault: z.boolean().default(false),
  priority: z.number().min(0).max(1000).default(0),
});

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

// ============================================
// GET /api/projects/[id]/endpoints/[endpointId]/responses
// ============================================
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; endpointId: string }> }
) {
  const { id: projectId, endpointId } = await params;

  // 验证端点是否存在
  const endpointList = await db.select().from(endpoints).where(eq(endpoints.id, endpointId));
  if (endpointList.length === 0 || endpointList[0].projectId !== projectId) {
    return Errors.notFound('Endpoint');
  }

  const responseList = await db
    .select()
    .from(responses)
    .where(eq(responses.endpointId, endpointId));

  // 解析每个响应的 JSON 字段
  const parsedList = responseList.map((response) => {
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

  // 按优先级排序，默认响应放最后
  const sortedList = parsedList.sort((a, b) => {
    if (a.isDefault !== b.isDefault) {
      return a.isDefault ? 1 : -1;
    }
    return (b.priority || 0) - (a.priority || 0);
  });

  return success(sortedList);
}

// ============================================
// POST /api/projects/[id]/endpoints/[endpointId]/responses
// ============================================
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; endpointId: string }> }
) {
  try {
    const { id: projectId, endpointId } = await params;
    const body = await request.json();
    const data = validate(CreateResponseSchema, body);

    // 验证端点是否存在
    const endpointList = await db.select().from(endpoints).where(eq(endpoints.id, endpointId));
    if (endpointList.length === 0 || endpointList[0].projectId !== projectId) {
      return Errors.notFound('Endpoint');
    }

    const responseId = nanoid();
    const now = Date.now();

    // 处理 body
    const bodyStr = data.body !== undefined
      ? (typeof data.body === 'string' ? data.body : JSON.stringify(data.body))
      : null;

    // 如果设置为默认响应，需要清除其他响应的默认标记
    if (data.isDefault) {
      await db.update(responses)
        .set({ isDefault: 0, updatedAt: now })
        .where(eq(responses.endpointId, endpointId));
    }

    const newResponse = {
      id: responseId,
      endpointId,
      name: data.name,
      description: data.description ?? null,
      statusCode: data.statusCode,
      contentType: data.contentType,
      headers: JSON.stringify(data.headers ?? {}),
      body: bodyStr,
      matchRules: JSON.stringify(data.matchRules ?? {}),
      isDefault: data.isDefault ? 1 : 0,
      priority: data.priority,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(responses).values(newResponse);

    // 解析用于返回
    let parsedBody: unknown = null;
    if (newResponse.body) {
      try {
        parsedBody = JSON.parse(newResponse.body);
      } catch {
        parsedBody = newResponse.body;
      }
    }

    return success({
      ...newResponse,
      body: parsedBody,
      headers: data.headers ?? {},
      matchRules: data.matchRules ?? {},
      isActive: true,
      isDefault: newResponse.isDefault === 1,
    }, 201);
  } catch (err: any) {
    if (err.name === 'ValidationError') {
      return Errors.validation(err.issues);
    }
    return Errors.internal(err.message);
  }
}
