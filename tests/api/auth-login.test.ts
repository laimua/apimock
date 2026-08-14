/**
 * B3 — login 未配置 MANAGE_TOKEN → 503(对齐 proxy 的 fail-closed 语义)
 */

import { describe, it, expect, afterEach } from 'vitest';
import { type NextRequest } from 'next/server';
import { POST } from '@/app/api/auth/login/route';

const asReq = (r: Request): NextRequest => r as unknown as NextRequest;

describe('POST /api/auth/login', () => {
  const prevToken = process.env.MANAGE_TOKEN;

  afterEach(() => {
    if (prevToken === undefined) delete process.env.MANAGE_TOKEN;
    else process.env.MANAGE_TOKEN = prevToken;
  });

  it('B3: 未配置 MANAGE_TOKEN → 503 MANAGE_TOKEN_NOT_CONFIGURED(非 500)', async () => {
    delete process.env.MANAGE_TOKEN;

    const req = asReq(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: 'whatever' }),
      })
    );

    const res = await POST(req);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('MANAGE_TOKEN_NOT_CONFIGURED');
    expect(typeof body.error.message).toBe('string');
  });
});
