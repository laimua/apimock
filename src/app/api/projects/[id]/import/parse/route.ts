/**
 * OpenAPI 解析预览 API
 * POST /api/projects/[id]/import/parse - 解析 OpenAPI 文件并返回预览
 */

import { NextRequest } from 'next/server';
import { success, Errors } from '@/lib/api';
import { parseAndExtract, detectFormat } from '@/lib/openapi-parser';
import { db } from '@/lib/db';
import { projects } from '@/lib/schema';
import { eq } from 'drizzle-orm';

/**
 * P2-15:与 import 写库路由对称的文件大小上限(5MB)。超限返 413,
 * 避免整文件读内存 + 序列化预览浪费。两端点(写库 / 预览)必须用同一上限,
 * 否则会出现"预览通过但导入 413"的不一致体验。
 */
const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

// ============================================
// POST /api/projects/[id]/import/parse
// ============================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;

    // 验证项目是否存在（与 import 写库路由对称）
    const projectList = await db.select().from(projects).where(eq(projects.id, projectId));
    if (projectList.length === 0) {
      return Errors.notFound('Project');
    }

    // 解析 multipart/form-data；非 multipart 请求体会抛异常 → 400 而非 500
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return Errors.badRequest('Expected multipart/form-data request body');
    }
    // A8:必须真实是 File（与 import 写库路由对称），非 File 字段 → 400 不 500
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return Errors.badRequest('No file uploaded');
    }

    // P2-15:文件大小上限(与 import 写库路由对称)。超限返 413。
    if (file.size > MAX_IMPORT_BYTES) {
      return Errors.payloadTooLarge(
        `File too large: ${file.size} bytes (max ${MAX_IMPORT_BYTES} bytes)`,
      );
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
      // P2-16:解析阶段无端点产出(含循环引用、结构非法等)→ 400 INVALID_OPENAPI
      // 不再返通用 BAD_REQUEST,改用更精确的业务码便于前端区分"格式坏" vs "其它参数错"
      return Errors.invalidOpenApi('Failed to parse OpenAPI file', parseResult.errors);
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

  } catch (err: unknown) {
    return Errors.internal(err instanceof Error ? err.message : String(err));
  }
}
