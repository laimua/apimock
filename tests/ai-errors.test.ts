/**
 * handleProviderError 单元测试
 * 验证:上游错误细节不透传客户端(防泄露 API key 等),对外固定文案,
 * 上游 status 透传,原始 err 进 logger。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock 被 vitest 提升到文件顶部执行,factory 内不能引用同文件顶层 const
// (TDZ:常量在 factory 执行时尚未初始化)。故 factory 内部自行创建 vi.fn(),
// 测试体通过 vi.mocked(logger.error) 访问。
vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

import { handleProviderError } from '@/lib/ai-errors';
import { logger } from '@/lib/logger';

const loggerError = vi.mocked(logger.error);

describe('handleProviderError', () => {
  beforeEach(() => {
    loggerError.mockClear();
  });

  it('带数字 status 的上游错误 → PROVIDER_ERROR + 透传 status', async () => {
    const err = Object.assign(new Error('Incorrect API key provided: sk-xxx'), { status: 401 });
    const res = handleProviderError(err, { publicMessage: '上游 AI 服务请求失败' });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('PROVIDER_ERROR');
    expect(body.error.message).toBe('上游 AI 服务请求失败');
  });

  it('上游错误细节(API key)绝不进响应体', async () => {
    const secret = 'sk-leaked-secret-key';
    const err = Object.assign(new Error(`Incorrect API key provided: ${secret}`), { status: 401 });
    const res = handleProviderError(err, { publicMessage: 'AI 内容生成失败' });
    const text = JSON.stringify(await res.json());

    expect(text).not.toContain(secret);
    expect(text).not.toContain('Incorrect API key');
  });

  it('无 status 的错误 → 500 INTERNAL_ERROR + 固定文案', async () => {
    const err = new Error('connect ETIMEDOUT 10.0.0.1:443');
    const res = handleProviderError(err, { publicMessage: 'AI 内容生成失败' });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(body.error.message).toBe('AI 内容生成失败');
    // 内部细节(内网 IP)不进响应体
    expect(JSON.stringify(body)).not.toContain('10.0.0.1');
  });

  it('B3:status 非数字(非法)→ 固定 502 PROVIDER_ERROR', async () => {
    const err = { status: '401', message: 'weird' };
    const res = handleProviderError(err, { publicMessage: '上游 AI 服务请求失败' });
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error.code).toBe('PROVIDER_ERROR');
  });

  it('B3:status 越界(0,超时类常见)→ 固定 502', async () => {
    const err = Object.assign(new Error('Connection error'), { status: 0 });
    const res = handleProviderError(err, { publicMessage: '上游 AI 服务请求失败' });
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error.code).toBe('PROVIDER_ERROR');
  });

  it('B3:status 浮点(非整数)→ 固定 502', async () => {
    const err = Object.assign(new Error('weird'), { status: 401.5 });
    const res = handleProviderError(err, { publicMessage: '上游 AI 服务请求失败' });
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error.code).toBe('PROVIDER_ERROR');
  });

  it('原始 err + context 进 logger,不进响应体', async () => {
    const err = Object.assign(new Error('upstream detail'), { status: 429 });
    handleProviderError(err, {
      publicMessage: '上游 AI 服务请求失败',
      context: { providerId: 'p1' },
    });

    expect(loggerError).toHaveBeenCalledTimes(1);
    const [meta, msg] = loggerError.mock.calls[0];
    expect(msg).toBe('AI provider request failed');
    const ctx = meta as { err: unknown; providerId: string };
    expect(ctx.err).toBe(err);
    expect(ctx.providerId).toBe('p1');
  });

  it('429 上游限流 status 透传', async () => {
    const err = Object.assign(new Error('rate limited'), { status: 429 });
    const res = handleProviderError(err, { publicMessage: '上游 AI 服务请求失败' });
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error.code).toBe('PROVIDER_ERROR');
  });
});
