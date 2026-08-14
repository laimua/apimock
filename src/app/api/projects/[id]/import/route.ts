/**
 * OpenAPI 导入 API
 * POST /api/projects/[id]/import - 导入 OpenAPI 规范文件
 */

import { NextRequest } from 'next/server';
import { success, multiStatus, error, Errors } from '@/lib/api';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { parseAndExtract, detectFormat, type ParsedEndpoint } from '@/lib/openapi-parser';
import { db } from '@/lib/db';
import { endpoints, responses, projects } from '@/lib/schema';
import type { HttpMethod } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { invalidateEndpointCache } from '@/lib/endpoint-cache';
import { runInTransaction } from '@/lib/db-transaction';

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
// P2-15 常量
// ============================================

/**
 * 上传文件大小上限:5MB。
 * OpenAPI 文档极少超此规模;超限多为误传(如整个仓库 zip / 二进制)。超出返 413,
 * 避免整文件读入内存 + 后续解析/insert 浪费。
 */
const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

/**
 * 批量 insert 单批端点数上限。
 *
 * 背景(P2-15):SQLite 单条 prepared statement 的绑定变量数受 `SQLITE_MAX_VARIABLE_NUMBER`
 * 限制(默认编译期 999,新版本 32766)。每个 endpoint 行约 13 列 + 每个 response 行约 12 列,
 * 2500+ 端点(再加每端点若干 response)单条 SQL 变量数轻松破万 → 整批 insert 抛
 * `too many SQL variables` 整批失败。MySQL 无此限制(prepared statement 不强绑变量上限)。
 *
 * 修复:按端点数分块提交事务,每块 ≤ 此值(端点数,非变量数)。500 端点 × ~25 变量 ≈ 1.25 万,
 * 仍可能在极旧 SQLite(<3.32,上限 999)超限 —— 但 better-sqlite3 预编译版用新版 SQLite
 * (上限 32766),500 端点安全。两端栈行为一致:SQLite 分块避免超限,MySQL 顺带也分块
 * (虽无超限风险,但分块减小单事务体积,失败回滚粒度更细)。
 */
const INSERT_CHUNK_SIZE = 500;

// ============================================
// 批量创建端点逻辑
// ============================================

/**
 * 批量创建端点和响应
 *
 * 优化策略：
 *   1. 一次性预查项目下已有端点，构造 `${method} ${path}` Set，避免 N 次 select
 *   2. P2-15:按 INSERT_CHUNK_SIZE 分块 insert(每块独立事务),避免单条 SQL 变量数
 *      超 SQLite MAX_VARIABLE_NUMBER(2500+ 端点会触发)。MySQL 无此限制,分块顺带
 *      减小单事务体积。
 *   3. 单块事务内 endpoint + 其 response 同事务,任一失败整块回滚,不留半成品(I1);
 *      某块失败不影响其它块 → 部分成功(P2-17:返 207)。
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

  // P2-15:按端点数分块 insert,避免单条 SQL 变量数超 SQLite MAX_VARIABLE_NUMBER。
  // 每块独立事务:某块失败只回滚该块,其余块仍可成功 → 部分成功(207)而非整批失败。
  for (let i = 0; i < toCreate.length; i += INSERT_CHUNK_SIZE) {
    const chunk = toCreate.slice(i, i + INSERT_CHUNK_SIZE);
    const endpointInserts: (typeof endpoints.$inferInsert)[] = [];
    const responseInserts: (typeof responses.$inferInsert)[] = [];

    for (const parsed of chunk) {
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
        // P1-2 修复：导入时 responseBody 置 null，让 mock 路由的 fallback 链路生效，
        // 由 responses 表的 isDefault 响应承载真实示例体。原值 '{}' 会因求值顺序
        // （端点级 responseBody 在 responses fallback 之前返回）恒抢占，导致导入端点永远返回 '{}'。
        // 详见 docs/CODE-REVIEW-2026-07-25.md P1-2 节。
        responseBody: null,
        createdAt: now,
        updatedAt: now,
      });

      // I2:每个端点最多一个默认响应。原逻辑 statusCode===200 即设默认,
      // 多个 200 响应会产生多个 isDefault=1。改为只把该端点第一个 200 设默认。
      let first200ForEndpoint = true;
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
          isDefault: response.statusCode === 200 && first200ForEndpoint ? 1 : 0,
          priority: 0,
          createdAt: now,
          updatedAt: now,
        });
        if (response.statusCode === 200) first200ForEndpoint = false;
      }
    }

    try {
      // 单块事务:块内 endpoint + 其 response 同事务,任一失败整块回滚(I1:不留无响应的半成品端点)
      // 用 runInTransaction 封装双栈(sqlite sync / mysql async)差异
      await runInTransaction(
        (tx) => {
          if (endpointInserts.length > 0) tx.insert(endpoints).values(endpointInserts).run();
          if (responseInserts.length > 0) tx.insert(responses).values(responseInserts).run();
        },
        async (tx) => {
          if (endpointInserts.length > 0) await tx.insert(endpoints).values(endpointInserts);
          if (responseInserts.length > 0) await tx.insert(responses).values(responseInserts);
        },
      );
      result.created += chunk.length;
    } catch (e: unknown) {
      // 该块失败:记录错误(含块端点范围),继续下一块 → 部分成功
      result.errors.push(`Batch insert failed (endpoints ${i}–${i + chunk.length - 1}): ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (result.created > 0) invalidateEndpointCache(projectId);

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

    // 解析 multipart/form-data；非 multipart 请求体会抛异常 → 400 而非 500
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return Errors.badRequest('Expected multipart/form-data request body');
    }
    // A8:必须真实是 File。原先 `as File` 强转，字符串字段会让 .size/.text
    // 变 undefined → 后续抛 TypeError → 500。
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return Errors.badRequest('No file uploaded');
    }

    // P2-15:文件大小上限。file.size 对常规 multipart 上传由运行时填充;
    // 超限返 413 + 明确错误形状,避免整文件读内存 + 后续解析浪费。
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
      return Errors.invalidOpenApi('Failed to parse OpenAPI file', parseResult.errors);
    }

    // 批量创建端点
    const importResult = await batchCreateEndpoints(projectId, parseResult.endpoints);

    // P2-17:根据批量结果决定状态码
    //   - 全部失败(created===0 且有 errors)→ 500(整批未落地)
    //   - 部分成功(created>0 且 errors 非空)→ 207 Multi-Status
    //   - 全部成功(无 errors)→ 201
    const payload = {
      ...importResult,
      parseErrors: parseResult.errors,
    };

    if (importResult.created === 0 && importResult.errors.length > 0) {
      // 全部失败:语义偏服务端(批量 insert 抛错),返 500。
      // 用 error() 而非 Errors.internal(),因需把批量结果详情放进 details 透给前端。
      return error(
        'INTERNAL_ERROR',
        'Import failed: no endpoints created',
        500,
        payload,
      );
    }

    if (importResult.errors.length > 0) {
      // 部分成功 → 207
      return multiStatus(payload);
    }

    // 全部成功 → 201
    return success(payload, 201);

  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'ValidationError') {
      return Errors.validation((err as unknown as { issues: z.ZodIssue[] }).issues);
    }
    return Errors.internal(err instanceof Error ? err.message : String(err));
  }
}
