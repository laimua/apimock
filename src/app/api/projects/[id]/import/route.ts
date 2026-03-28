/**
 * OpenAPI 导入 API
 * POST /api/projects/[id]/import - 导入 OpenAPI 规范文件
 */

import { NextRequest } from 'next/server';
import { success, Errors } from '@/lib/api';
import { nanoid } from 'nanoid';
import { parseAndExtract, detectFormat, type ParsedEndpoint } from '@/lib/openapi-parser';
import { db } from '@/lib/db';
import { endpoints, responses, projects } from '@/lib/schema';
import { eq, and } from 'drizzle-orm';

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

  for (const parsed of parsedEndpoints) {
    try {
      // 检查是否已存在相同的端点
      const existing = await db
        .select()
        .from(endpoints)
        .where(
          and(
            eq(endpoints.projectId, projectId),
            eq(endpoints.path, parsed.path),
            eq(endpoints.method, parsed.method as any)
          )
        );

      if (existing.length > 0) {
        result.skipped++;
        continue;
      }

      // 创建端点
      const endpointId = nanoid();
      const now = Date.now();
      const newEndpoint = {
        id: endpointId,
        projectId,
        path: parsed.path,
        method: parsed.method as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS',
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
      };

      await db.insert(endpoints).values(newEndpoint);

      // 创建响应
      for (const response of parsed.responses) {
        const responseId = nanoid();
        const newResponse = {
          id: responseId,
          endpointId,
          name: `${response.statusCode}`,
          description: response.body?.description || `Response ${response.statusCode}`,
          statusCode: response.statusCode,
          headers: '{}',
          body: JSON.stringify(response.body),
          contentType: 'application/json',
          isDefault: response.statusCode === 200 ? 1 : 0,
          priority: 0,
          createdAt: now,
          updatedAt: now,
        };

        await db.insert(responses).values(newResponse);
      }

      result.created++;
    } catch (e: any) {
      result.errors.push(`${parsed.method} ${parsed.path}: ${e.message}`);
    }
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

  } catch (err: any) {
    if (err.name === 'ValidationError') {
      return Errors.validation(err.issues);
    }
    return Errors.internal(err.message);
  }
}
