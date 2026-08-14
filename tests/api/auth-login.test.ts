/**
 * B3 — login 未配置 MANAGE_TOKEN → 503(对齐 proxy 的 fail-closed 语义)
 * A3 — 登录全局桶 login:__global 超限 → 429(多 IP 轮换撞库兜底)
 */

import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { type NextRequest } from 'next/server';
import { POST } from '@/app/api/auth/login/route';

// 限流 mock:默认放行,A3 用例按 key 翻转
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn(async () => ({ allowed: true, remaining: 0, resetAt: Date.now() + 60_000 })),
}));

import { rateLimit } from '@/lib/rate-limit';

const asReq = (r: Request): NextRequest => r as unknown as NextRequest;

function loginReq(): NextRequest {
  return asReq(
    new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'whatever' }),
    })
  );
}

describe('POST /api/auth/login', () => {
  const prevToken = process.env.MANAGE_TOKEN;

  afterEach(() => {
    if (prevToken === undefined) delete process.env.MANAGE_TOKEN;
    else process.env.MANAGE_TOKEN = prevToken;
  });

  it('B3: 未配置 MANAGE_TOKEN → 503 MANAGE_TOKEN_NOT_CONFIGURED(非 500)', async () => {
    delete process.env.MANAGE_TOKEN;

    const res = await POST(loginReq());
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('MANAGE_TOKEN_NOT_CONFIGURED');
    expect(typeof body.error.message).toBe('string');
  });
});

describe('A3 — 登录全局桶 login:__global', () => {
  beforeEach(() => {
    vi.mocked(rateLimit).mockClear();
    vi.mocked(rateLimit).mockImplementation(
      async () => ({ allowed: true, remaining: 0, resetAt: Date.now() + 60_000 })
    );
  });

  afterEach(() => {
    delete process.env.MANAGE_TOKEN;
  });

  it('每次登录双桶计数(per-IP + __global,与 per-IP 独立额度)', async () => {
    process.env.MANAGE_TOKEN = 't'.repeat(40);
    await POST(loginReq());
    const keys = vi.mocked(rateLimit).mock.calls.map(c => c[0]);
    expect(keys).toContain('login:unknown');
    expect(keys).toContain('login:__global');
    expect(vi.mocked(rateLimit)).toHaveBeenCalledWith('login:__global', 100, 60, 'login');
  });

  it('全局桶超限 → 429 RATE_LIMITED(per-IP 未超)', async () => {
    process.env.MANAGE_TOKEN = 't'.repeat(40);
    vi.mocked(rateLimit).mockImplementation(async key =>
      key === 'login:__global'
        ? { allowed: false, remaining: 0, resetAt: Date.now() + 60_000 }
        : { allowed: true, remaining: 0, resetAt: Date.now() + 60_000 }
    );
    const res = await POST(loginReq());
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error.code).toBe('RATE_LIMITED');
  });
});
