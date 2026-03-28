/**
 * API 响应工具函数
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';

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
  internal: (message = 'Internal server error') => error('INTERNAL_ERROR', message, 500),
  validation: (issues: z.ZodIssue[]) => error('VALIDATION_ERROR', 'Validation failed', 400, issues),
};

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
