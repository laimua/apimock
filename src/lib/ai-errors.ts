/**
 * 上游 AI Provider 错误统一处理
 *
 * 安全要点:上游错误(如 OpenAI "Incorrect API key provided: sk-xxx")的原始
 * message 绝不能透传给客户端——会泄露 API key、内部端点等敏感细节。这里把
 * 对外文案固定为调用方提供的 publicMessage,原始 err 只进 logger.error。
 *
 * 透传逻辑保留:若 err 带数字 status(如 401/429/超时映射的 status),按
 * error('PROVIDER_ERROR', publicMessage, status) 返回上游状态码(契约
 * docs/API-ERROR-SHAPE.md: PROVIDER_ERROR = 上游 AI Provider 返回错误,透传
 * 状态码);否则按 Errors.internal(publicMessage) 返 500 INTERNAL_ERROR。
 */

import { NextResponse } from 'next/server';
import { error, Errors, type ApiResponse } from './api';
import { logger } from './logger';

export interface ProviderErrorOptions {
  /** 对外固定文案(不含上游细节,防泄露)。 */
  publicMessage: string;
  /** 进 logger 的上下文(如 providerId),绝不进响应体。 */
  context?: Record<string, unknown>;
}

/**
 * 处理上游 Provider 错误:固定对外文案 + 透传上游 status + 原始 err 进日志。
 */
export function handleProviderError(
  err: unknown,
  opts: ProviderErrorOptions,
): NextResponse<ApiResponse> {
  // 原始 err(含上游 message)只进日志,便于排查,不进响应体。
  logger.error({ err, ...opts.context }, 'AI provider request failed');

  if (err !== null && typeof err === 'object' && 'status' in err) {
    const status = (err as { status?: unknown }).status;
    if (typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599) {
      return error('PROVIDER_ERROR', opts.publicMessage, status);
    }
    // B3:status 存在但非法(0 / 浮点 / 越界,常见于超时类错误)→ 固定 502
    // (上游不可达/网关错误语义),而非把非法状态码透传给 NextResponse.json
    return error('PROVIDER_ERROR', opts.publicMessage, 502);
  }

  return Errors.internal(opts.publicMessage);
}
