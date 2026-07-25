/**
 * 登录路由测试 POST /api/auth/login
 *
 * 覆盖：限流(429) / 未配置(500) / 错 token(401) / 对 token(200+种 cookie+from 透传) /
 * body 非法(400) / 漏洞D from 校验。
 *
 * mock next/headers.cookies 以验证 cookie 种植，不引入 Next 运行时。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// vi.mock 被 hoist；用 vi.hoisted 暴露 mock store 给测试断言
const { cookieStore } = vi.hoisted(() => ({
  cookieStore: {
    set: vi.fn(),
    delete: vi.fn(),
    get: vi.fn(),
  },
}));
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => cookieStore),
}));

import { POST } from './route';
import { COOKIE_NAME } from '@/lib/auth';
import { reset as resetRateLimit } from '@/lib/rate-limit';

const TOKEN = 'test-manage-token-0123456789abcdef';

function makeReq(body: unknown, ip = '1.1.1.1'): NextRequest {
  return new NextRequest('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(async () => {
  vi.stubEnv('MANAGE_TOKEN', TOKEN);
  cookieStore.set.mockClear();
  cookieStore.delete.mockClear();
  await resetRateLimit();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('login: 未配置 MANAGE_TOKEN', () => {
  beforeEach(() => {
    vi.stubEnv('MANAGE_TOKEN', '');
  });
  it('返 500 INTERNAL_ERROR', async () => {
    const res = await POST(makeReq({ token: TOKEN }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('INTERNAL_ERROR');
  });
});

describe('login: 错 token', () => {
  it('返 401 且不种 cookie', async () => {
    const res = await POST(makeReq({ token: 'wrong-token-xxxxxxxxxx' }));
    expect(res.status).toBe(401);
    expect(cookieStore.set).not.toHaveBeenCalled();
  });
  it('空 token 返 401', async () => {
    const res = await POST(makeReq({ token: '' }));
    expect(res.status).toBe(401);
  });
});

describe('login: 对 token', () => {
  it('返 200 + 种 cookie（httpOnly/lax/path/maxAge）', async () => {
    const res = await POST(makeReq({ token: TOKEN }));
    expect(res.status).toBe(200);
    expect(cookieStore.set).toHaveBeenCalledTimes(1);
    const [name, value, opts] = cookieStore.set.mock.calls[0];
    expect(name).toBe(COOKIE_NAME);
    expect(value).toMatch(/^\d+\.[0-9a-f]+$/); // <exp>.<hmac>
    expect(opts).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 24 * 3600,
    });
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.ok).toBe(true);
  });
  it('token 比对 timing-safe（长度不等也返 401，不泄露）', async () => {
    // 长度不等 → safeEqual 快返 false，仍 401（不抛）
    const res = await POST(makeReq({ token: 'short' }));
    expect(res.status).toBe(401);
  });
});

describe('login: 漏洞D from 透传', () => {
  it('合法 from 原样透传给前端', async () => {
    const res = await POST(makeReq({ token: TOKEN, from: '/projects' }));
    const json = await res.json();
    expect(json.data.from).toBe('/projects');
  });
  it('protocol-relative from → null（防开放重定向）', async () => {
    const res = await POST(makeReq({ token: TOKEN, from: '//evil.com' }));
    const json = await res.json();
    expect(json.data.from).toBeNull();
  });
  it('绝对 URL from → null', async () => {
    const res = await POST(makeReq({ token: TOKEN, from: 'https://evil.com' }));
    const json = await res.json();
    expect(json.data.from).toBeNull();
  });
});

describe('login: body 校验', () => {
  it('非 JSON body → 400', async () => {
    const res = await POST(makeReq('not-json{', '2.2.2.2'));
    expect(res.status).toBe(400);
  });
  it('缺 token → 401（空串走 safeEqual）', async () => {
    const res = await POST(makeReq({}, '3.3.3.3'));
    expect(res.status).toBe(401);
  });
});

describe('login: 限流（10/min/IP）', () => {
  it('同 IP 第 11 次 → 429', async () => {
    const ip = '9.9.9.9';
    for (let i = 0; i < 10; i++) {
      const r = await POST(makeReq({ token: 'any' }, ip));
      expect(r.status).not.toBe(429); // 前 10 次不限（401/200）
    }
    const r11 = await POST(makeReq({ token: TOKEN }, ip));
    expect(r11.status).toBe(429);
    const json = await r11.json();
    expect(json.error.code).toBe('RATE_LIMITED');
  });
  it('不同 IP 独立计数', async () => {
    for (let i = 0; i < 10; i++) {
      await POST(makeReq({ token: 'any' }, '10.0.0.1'));
    }
    // 另一 IP 仍可请求
    const r = await POST(makeReq({ token: TOKEN }, '10.0.0.2'));
    expect(r.status).toBe(200);
  });
});
