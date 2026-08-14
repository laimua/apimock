/**
 * proxy Bearer token 测试（机器客户端通道）
 *
 * 浏览器走 HMAC cookie；agent / 脚本 / CI 走 Authorization: Bearer <MANAGE_TOKEN>。
 * 安全不变量：
 * - 正确 Bearer → 放行（NextResponse.next），零限流开销
 * - 错误 / 畸形 Bearer → 按未鉴权处理（API 401，页面跳登录）
 * - Bearer 优先于 cookie；无 Bearer 时 cookie 路径不变
 * - 未配置 MANAGE_TOKEN → fail-closed 503 不受 Bearer 影响
 * - A2: Bearer 失败按 IP 桶 + 全局桶计数，任一超限 → 统一 429 RATE_LIMITED
 * - A3: 短 MANAGE_TOKEN → warn 一次不致命
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '@/proxy';
import { signSession, COOKIE_NAME } from '../auth';

// A2: 限流 mock——默认放行，单测里按需翻转为拒绝
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn(async () => ({ allowed: true, remaining: 0, resetAt: Date.now() + 60_000 })),
}));

// A3: logger mock——断言弱 token warn，且不让日志噪声进测试输出
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { rateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

const TOKEN = 'test-manage-token-0123456789abcdef'; // 36 chars >= 32,不触发弱 token warn

function req(
  path: string,
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, { headers });
}

// NextRequest 构造时会剥掉 init headers 里的 cookie 头,需用 cookies.set 注入会话
function reqWithCookie(path: string, cookie: string, headers: Record<string, string> = {}) {
  const r = req(path, headers);
  r.cookies.set(COOKIE_NAME, cookie);
  return r;
}

describe('proxy: Bearer 机器客户端通道', () => {
  beforeEach(() => {
    process.env.MANAGE_TOKEN = TOKEN;
    vi.mocked(rateLimit).mockClear();
    vi.mocked(rateLimit).mockImplementation(
      async () => ({ allowed: true, remaining: 0, resetAt: Date.now() + 60_000 })
    );
  });
  afterEach(() => {
    delete process.env.MANAGE_TOKEN;
  });

  it('正确 Bearer → 放行管理 API（零限流开销：rateLimit 不被调用）', async () => {
    const res = await proxy(req('/api/projects', { authorization: `Bearer ${TOKEN}` }));
    expect(res.status).toBe(200); // NextResponse.next()
    expect(rateLimit).not.toHaveBeenCalled();
  });

  it('小写 bearer 前缀 + 正确 token → 放行（RFC 7235 scheme 大小写不敏感）', async () => {
    const res = await proxy(req('/api/projects', { authorization: `bearer ${TOKEN}` }));
    expect(res.status).toBe(200);
  });

  it('混合大小写 BeArEr 前缀 → 放行;token 本体大小写敏感(改一位 → 401)', async () => {
    expect(
      (await proxy(req('/api/projects', { authorization: `BeArEr ${TOKEN}` }))).status
    ).toBe(200);
    const flipped = TOKEN.endsWith('f') ? TOKEN.slice(0, -1) + 'F' : TOKEN.slice(0, -1) + 'x';
    expect(
      (await proxy(req('/api/projects', { authorization: `bearer ${flipped}` }))).status
    ).toBe(401);
  });

  it('正确 Bearer → 放行管理页面', async () => {
    const res = await proxy(req('/projects', { authorization: `Bearer ${TOKEN}` }));
    expect(res.status).toBe(200);
  });

  it('错误 Bearer → API 401（未超限）', async () => {
    const res = await proxy(req('/api/projects', { authorization: 'Bearer wrong-token' }));
    expect(res.status).toBe(401);
  });

  it('错误 Bearer → 页面跳登录', async () => {
    const res = await proxy(req('/projects', { authorization: 'Bearer wrong-token' }));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/login');
  });

  it('畸形 Authorization（非 Bearer 前缀）→ 401，不计失败桶', async () => {
    const res = await proxy(req('/api/projects', { authorization: `Basic ${TOKEN}` }));
    expect(res.status).toBe(401);
    expect(rateLimit).not.toHaveBeenCalled();
  });

  it('Bearer 前缀但空 token → 401', async () => {
    const res = await proxy(req('/api/projects', { authorization: 'Bearer ' }));
    expect(res.status).toBe(401);
  });

  it('无 Authorization 时 cookie 路径不变（合法 cookie 放行）', async () => {
    const res = await proxy(reqWithCookie('/api/projects', signSession(TOKEN)));
    expect(res.status).toBe(200);
  });

  it('无 Authorization 且无 cookie → 401（原有行为）', async () => {
    expect((await proxy(req('/api/projects'))).status).toBe(401);
  });

  it('错误 Bearer + 合法 cookie → 放行（Bearer 不破坏 cookie 会话）', async () => {
    const res = await proxy(
      reqWithCookie('/api/projects', signSession(TOKEN), {
        authorization: 'Bearer wrong-token',
      }),
    );
    expect(res.status).toBe(200);
  });

  it('未配置 MANAGE_TOKEN → fail-closed 503，Bearer 无效', async () => {
    delete process.env.MANAGE_TOKEN;
    const res = await proxy(req('/api/projects', { authorization: `Bearer ${TOKEN}` }));
    expect(res.status).toBe(503);
  });
});

describe('A2: Bearer 失败限流（per-IP 桶 + 全局桶）', () => {
  beforeEach(() => {
    process.env.MANAGE_TOKEN = TOKEN;
    vi.mocked(rateLimit).mockClear();
    vi.mocked(rateLimit).mockImplementation(
      async () => ({ allowed: true, remaining: 0, resetAt: Date.now() + 60_000 })
    );
  });
  afterEach(() => {
    delete process.env.MANAGE_TOKEN;
  });

  it('Bearer 失败一次 → 双桶计数（bearer:<ip> + bearer:__global）', async () => {
    await proxy(req('/api/projects', { authorization: 'Bearer wrong-token' }));
    const keys = vi.mocked(rateLimit).mock.calls.map(c => c[0]);
    expect(keys).toContain('bearer:unknown'); // 无代理头 → ip unknown
    expect(keys).toContain('bearer:__global');
    expect(vi.mocked(rateLimit)).toHaveBeenCalledWith('bearer:__global', 300, 60, 'bearer');
  });

  it('per-IP 桶超限 → 429 RATE_LIMITED（非 401）', async () => {
    vi.mocked(rateLimit).mockImplementation(async key =>
      key === 'bearer:unknown'
        ? { allowed: false, remaining: 0, resetAt: Date.now() + 60_000 }
        : { allowed: true, remaining: 0, resetAt: Date.now() + 60_000 }
    );
    const res = await proxy(req('/api/projects', { authorization: 'Bearer wrong-token' }));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('RATE_LIMITED');
  });

  it('全局桶超限 → 429（多 IP 轮换爆破兜底）', async () => {
    vi.mocked(rateLimit).mockImplementation(async key =>
      key === 'bearer:__global'
        ? { allowed: false, remaining: 0, resetAt: Date.now() + 60_000 }
        : { allowed: true, remaining: 0, resetAt: Date.now() + 60_000 }
    );
    const res = await proxy(req('/api/projects', { authorization: 'Bearer wrong-token' }));
    expect(res.status).toBe(429);
  });

  it('超限后正确 Bearer 仍放行（成功路径不经限流）', async () => {
    vi.mocked(rateLimit).mockImplementation(
      async () => ({ allowed: false, remaining: 0, resetAt: Date.now() + 60_000 })
    );
    const res = await proxy(req('/api/projects', { authorization: `Bearer ${TOKEN}` }));
    expect(res.status).toBe(200);
  });

  it('无 Bearer 的 401（cookie 缺失）不消耗 Bearer 失败桶', async () => {
    await proxy(req('/api/projects'));
    expect(rateLimit).not.toHaveBeenCalled();
  });
});

describe('A3: 短 MANAGE_TOKEN 弱口令 warn', () => {
  const prevWarnCalls = () => vi.mocked(logger.warn).mock.calls.length;

  afterEach(() => {
    delete process.env.MANAGE_TOKEN;
    vi.mocked(logger.warn).mockClear();
  });

  it('短 token → warn 一次（非致命，放行流程继续）', async () => {
    process.env.MANAGE_TOKEN = 'short-token';
    const before = prevWarnCalls();
    const res = await proxy(req('/api/projects', { authorization: 'Bearer short-token' }));
    expect(res.status).toBe(200); // warn 不致命，正常鉴权
    expect(prevWarnCalls()).toBe(before + 1);
    expect(vi.mocked(logger.warn).mock.calls[0]?.[0]).toContain('MANAGE_TOKEN');
  });

  it('同一进程只 warn 一次', async () => {
    process.env.MANAGE_TOKEN = 'short-token';
    await proxy(req('/api/projects', { authorization: 'Bearer short-token' }));
    const afterFirst = prevWarnCalls();
    await proxy(req('/api/projects', { authorization: 'Bearer short-token' }));
    expect(prevWarnCalls()).toBe(afterFirst);
  });
});
