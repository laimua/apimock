/**
 * OpenAPI 解析预览 API
 * POST /api/projects/[id]/import/parse - 解析 OpenAPI 文件并返回预览
 */

import { NextRequest } from 'next/server';
import { success, Errors } from '@/lib/api';
import { parseAndExtract, detectFormat } from '@/lib/openapi-parser';

// ============================================
// POST /api/projects/[id]/import/parse
// ============================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;

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

    // 转换为前端期望的格式
    const endpoints = parseResult.endpoints.map((ep) => ({
      path: ep.path,
      method: ep.method,
      operationId: ep.name,
      summary: ep.name,
      description: ep.description,
      responses: ep.responses.reduce((acc, r) => {
        acc[r.statusCode.toString()] = { body: r.body };
        return acc;
      }, {} as Record<string, unknown>),
    }));

    // 返回解析结果（不创建端点）
    return success({
      endpoints,
      total: endpoints.length,
      parseErrors: parseResult.errors,
    });

  } catch (err: any) {
    return Errors.internal(err.message);
  }
}
