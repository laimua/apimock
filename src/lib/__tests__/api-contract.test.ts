/**
 * api.ts 响应工厂契约测试(B1/B3)
 * - internalError:固定 500 文案 + logger.error({err}) 范式
 * - multiStatus:207 顶层带 error {code: 'PARTIAL_FAILURE'}
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

import { internalError, multiStatus } from '@/lib/api';
import { logger } from '@/lib/logger';

describe('internalError (B1)', () => {
  it('固定 500 文案,不透传 err.message', async () => {
    const err = new Error('SQLITE_CANTOPEN: /app/data/secret.db');
    const res = internalError(err, 'GET /api/x');
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(body.error.message).toBe('Internal server error');
    expect(JSON.stringify(body)).not.toContain('secret.db');
  });

  it('原始 err 进 logger.error({err}),带路由上下文', () => {
    const err = new Error('boom');
    internalError(err, 'GET /api/y');
    expect(vi.mocked(logger.error)).toHaveBeenCalledWith(
      { err },
      '[GET /api/y] unhandled error'
    );
  });
});

describe('multiStatus (B3)', () => {
  it('207 顶层带 error {code: PARTIAL_FAILURE},data 透传', async () => {
    const res = multiStatus({ total: 5, created: 3 });
    expect(res.status).toBe(207);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('PARTIAL_FAILURE');
    expect(typeof body.error.message).toBe('string');
    expect(body.data.total).toBe(5);
    expect(body.data.created).toBe(3);
  });

  it('可自定义 message', async () => {
    const res = multiStatus({}, '部分导入成功');
    const body = await res.json();
    expect(body.error.message).toBe('部分导入成功');
  });
});
