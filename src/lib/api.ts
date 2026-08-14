/**
 * API 响应工具函数
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { logger } from './logger';

// ============================================
// 响应格式
// ============================================
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

// ============================================
// 成功响应
// ============================================
export function success<T>(data: T, status = 200): NextResponse<ApiResponse<T>> {
  return NextResponse.json(
    { success: true, data },
    { status }
  );
}

/**
 * 207 Multi-Status:批量操作部分成功时使用。
 * body 仍是标准 `{success, data}` 形状,但 success=false 表示"并非全部成功"
 * (data 内含每项结果/错误)。前端应优先看 HTTP 状态码 207 区分全成功 vs 部分成功。
 * B3:顶层补 `error: {code: 'PARTIAL_FAILURE', message}`,让只读 error 形状的
 * 调用方(api-client 兜底、通用错误 UI)也能拿到结构化原因,而非 undefined。
 */
export function multiStatus<T>(
  data: T,
  message = 'Partial success: some items failed'
): NextResponse<ApiResponse<T>> {
  return NextResponse.json(
    {
      success: false,
      data,
      error: { code: 'PARTIAL_FAILURE', message },
    },
    { status: 207 }
  );
}

// ============================================
// 错误响应
// ============================================
export function error(
  code: string,
  message: string,
  status = 400,
  details?: unknown
): NextResponse<ApiResponse> {
  return NextResponse.json(
    {
      success: false,
      error: { code, message, details },
    },
    { status }
  );
}

// ============================================
// 常见错误
// ============================================
export const Errors = {
  notFound: (resource = 'Resource') => error('NOT_FOUND', `${resource} not found`, 404),
  badRequest: (message: string, details?: unknown) => error('BAD_REQUEST', message, 400, details),
  unauthorized: () => error('UNAUTHORIZED', 'Unauthorized', 401),
  forbidden: () => error('FORBIDDEN', 'Forbidden', 403),
  conflict: (message: string, details?: unknown) => error('CONFLICT', message, 409, details),
  internal: (message = 'Internal server error') => error('INTERNAL_ERROR', message, 500),
  validation: (issues: z.ZodIssue[]) => error('VALIDATION_ERROR', 'Validation failed', 400, issues),
  // P2-15:上传文件超大小上限 → 413
  payloadTooLarge: (message: string, details?: unknown) => error('PAYLOAD_TOO_LARGE', message, 413, details),
  // P2-16:OpenAPI 文档无法解析(含循环引用、结构非法等)→ 400
  invalidOpenApi: (message: string, details?: unknown) => error('INVALID_OPENAPI', message, 400, details),
};

/**
 * B1:路由兜底 catch 统一范式(参照 health/ready/route.ts)。
 * 原始 err 只进 logger(受 redact 保护,仅服务端可见),对外固定 500 文案 ——
 * err.message 可能含 SQL 路径、驱动细节、内部状态,透传给客户端属信息泄露。
 *
 * @param err - 捕获的异常
 * @param route - 路由标识(进日志上下文,如 'GET /api/projects')
 */
export function internalError(err: unknown, route: string): NextResponse<ApiResponse> {
  logger.error({ err }, `[${route}] unhandled error`);
  return Errors.internal();
}

// ============================================
// 验证工具
// ============================================
export function validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ValidationError(result.error.issues);
  }
  return result.data;
}

export class ValidationError extends Error {
  constructor(public issues: z.ZodIssue[]) {
    super('Validation failed');
    this.name = 'ValidationError';
  }
}
