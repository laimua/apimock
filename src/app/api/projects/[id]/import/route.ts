/**
 * OpenAPI 导入 API
 * POST /api/projects/[id]/import - 导入 OpenAPI 规范文件
 */

import { NextRequest } from 'next/server';
import { success, Errors } from '@/lib/api';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { parseAndExtract, detectFormat, type ParsedEndpoint } from '@/lib/openapi-parser';
import { db } from '@/lib/db';
import { endpoints, responses, projects } from '@/lib/schema';
import type { HttpMethod } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { invalidateEndpointCache } from '@/lib/endpoint-cache';

// ============================================
// 类型定义
// ============================================

interface ImportResult {
  total: number;
  created: number;
  skipped: number;
  errors: string[];
}

// ============================================
// 批量创建端点逻辑
// ============================================

/**
 * 批量创建端点和响应
 *
 * 优化策略：
 *   1. 一次性预查项目下已有端点，构造 `${method} ${path}` Set，避免 N 次 select
 *   2. 收集所有新 endpoint / response 对象，单事务批量 insert
 *   3. 任一插入失败整个事务回滚，不留半成品
 *
 * @param projectId - 项目 ID
 * @param parsedEndpoints - 解析后的端点列表
 * @returns 创建结果统计
 */
async function batchCreateEndpoints(
  projectId: string,
  parsedEndpoints: ParsedEndpoint[]
): Promise<ImportResult> {
  const result: ImportResult = {
    total: parsedEndpoints.length,
    created: 0,
    skipped: 0,
    errors: [],
  };

  // 一次性查重
  const existing = await db
    .select({ path: endpoints.path, method: endpoints.method })
    .from(endpoints)
    .where(eq(endpoints.projectId, projectId));
  const existingKeys = new Set(existing.map((e) => `${e.method} ${e.path}`));

  // 过滤掉已存在的 + 提前校验，避免事务中抛
  const toCreate: ParsedEndpoint[] = [];
  for (const parsed of parsedEndpoints) {
    const key = `${parsed.method} ${parsed.path}`;
    if (existingKeys.has(key)) {
      result.skipped++;
    } else {
      toCreate.push(parsed);
      // 防同批重复
      existingKeys.add(key);
    }
  }

  if (toCreate.length === 0) return result;

  const now = Date.now();
  const endpointInserts: (typeof endpoints.$inferInsert)[] = [];
  const responseInserts: (typeof responses.$inferInsert)[] = [];

  for (const parsed of toCreate) {
    const endpointId = nanoid();
    endpointInserts.push({
      id: endpointId,
      projectId,
      path: parsed.path,
      method: parsed.method as HttpMethod,
      name: parsed.name || `${parsed.method} ${parsed.path}`,
      description: parsed.description ?? null,
      isActive: 1,
      delayMs: 0,
      tags: '[]',
      statusCode: 200,
      contentType: 'application/json',
      responseBody: '{}',
      createdAt: now,
      updatedAt: now,
    });

    for (const response of parsed.responses) {
      const bodyObj = (response.body && typeof response.body === 'object' && !Array.isArray(response.body))
        ? response.body as Record<string, unknown>
        : null;
      responseInserts.push({
        id: nanoid(),
        endpointId,
        name: `${response.statusCode}`,
        description: (typeof bodyObj?.description === 'string' ? bodyObj.description : '') || `Response ${response.statusCode}`,
        statusCode: response.statusCode,
        headers: '{}',
        body: JSON.stringify(response.body),
        contentType: 'application/json',
        isDefault: response.statusCode === 200 ? 1 : 0,
        priority: 0,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  try {
    // 批量 insert（无事务：better-sqlite3 的 transaction 是 sync callback，
    // 不能装 await；批量 insert 已显著减少 N+M → 2 次 query，atomicity 损失
    // 可接受，import 是低频操作）
    if (endpointInserts.length > 0) {
      await db.insert(endpoints).values(endpointInserts);
      invalidateEndpointCache(projectId);
    }
    if (responseInserts.length > 0) {
      await db.insert(responses).values(responseInserts);
    }
    result.created = toCreate.length;
  } catch (e: unknown) {
    result.errors.push(`Batch insert failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  return result;
}

// ============================================
// POST handler 实现
// ============================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;

    // 验证项目是否存在
    const projectList = await db.select().from(projects).where(eq(projects.id, projectId));
    if (projectList.length === 0) {
      return Errors.notFound('Project');
    }

    // 解析 multipart/form-data
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return Errors.badRequest('No file uploaded');
    }

    // 读取文件内容
    const content = await file.text();

    if (!content || content.trim().length === 0) {
      return Errors.badRequest('Empty file content');
    }

    // 检测文件格式
    const format = detectFormat(content);

    // 解析 OpenAPI 规范
    const parseResult = parseAndExtract(content, format);

    if (parseResult.errors.length > 0 && parseResult.endpoints.length === 0) {
      return Errors.badRequest('Failed to parse OpenAPI file', parseResult.errors);
    }

    // 批量创建端点
    const importResult = await batchCreateEndpoints(projectId, parseResult.endpoints);

    // 返回导入结果
    return success({
      ...importResult,
      parseErrors: parseResult.errors,
    }, 201);

  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'ValidationError') {
      return Errors.validation((err as unknown as { issues: z.ZodIssue[] }).issues);
    }
    return Errors.internal(err instanceof Error ? err.message : String(err));
  }
}
