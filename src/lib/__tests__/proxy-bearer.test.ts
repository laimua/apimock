/**
 * proxy Bearer token 测试（机器客户端通道）
 *
 * 浏览器走 HMAC cookie；agent / 脚本 / CI 走 Authorization: Bearer <MANAGE_TOKEN>。
 * 安全不变量：
 * - 正确 Bearer → 放行（NextResponse.next）
 * - 错误 / 畸形 Bearer → 按未鉴权处理（API 401，页面跳登录）
 * - Bearer 优先于 cookie；无 Bearer 时 cookie 路径不变
 * - 未配置 MANAGE_TOKEN → fail-closed 503 不受 Bearer 影响
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '@/proxy';
import { signSession, COOKIE_NAME } from '../auth';

const TOKEN = 'test-manage-token-0123456789abcdef';

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
  });
  afterEach(() => {
    delete process.env.MANAGE_TOKEN;
  });

  it('正确 Bearer → 放行管理 API', () => {
    const res = proxy(req('/api/projects', { authorization: `Bearer ${TOKEN}` }));
    expect(res.status).toBe(200); // NextResponse.next()
  });

  it('小写 bearer 前缀 + 正确 token → 放行（RFC 7235 scheme 大小写不敏感）', () => {
    const res = proxy(req('/api/projects', { authorization: `bearer ${TOKEN}` }));
    expect(res.status).toBe(200);
  });

  it('混合大小写 BeArEr 前缀 → 放行;token 本体大小写敏感(改一位 → 401)', () => {
    expect(proxy(req('/api/projects', { authorization: `BeArEr ${TOKEN}` })).status).toBe(200);
    const flipped = TOKEN.endsWith('f') ? TOKEN.slice(0, -1) + 'F' : TOKEN.slice(0, -1) + 'x';
    expect(proxy(req('/api/projects', { authorization: `bearer ${flipped}` })).status).toBe(401);
  });

  it('正确 Bearer → 放行管理页面', () => {
    const res = proxy(req('/projects', { authorization: `Bearer ${TOKEN}` }));
    expect(res.status).toBe(200);
  });

  it('错误 Bearer → API 401', () => {
    const res = proxy(req('/api/projects', { authorization: 'Bearer wrong-token' }));
    expect(res.status).toBe(401);
  });

  it('错误 Bearer → 页面跳登录', () => {
    const res = proxy(req('/projects', { authorization: 'Bearer wrong-token' }));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/login');
  });

  it('畸形 Authorization（非 Bearer 前缀）→ 401', () => {
    const res = proxy(req('/api/projects', { authorization: `Basic ${TOKEN}` }));
    expect(res.status).toBe(401);
  });

  it('Bearer 前缀但空 token → 401', () => {
    const res = proxy(req('/api/projects', { authorization: 'Bearer ' }));
    expect(res.status).toBe(401);
  });

  it('无 Authorization 时 cookie 路径不变（合法 cookie 放行）', () => {
    const res = proxy(reqWithCookie('/api/projects', signSession(TOKEN)));
    expect(res.status).toBe(200);
  });

  it('无 Authorization 且无 cookie → 401（原有行为）', () => {
    expect(proxy(req('/api/projects')).status).toBe(401);
  });

  it('错误 Bearer + 合法 cookie → 放行（Bearer 不破坏 cookie 会话）', () => {
    const res = proxy(
      reqWithCookie('/api/projects', signSession(TOKEN), {
        authorization: 'Bearer wrong-token',
      }),
    );
    expect(res.status).toBe(200);
  });

  it('未配置 MANAGE_TOKEN → fail-closed 503，Bearer 无效', () => {
    delete process.env.MANAGE_TOKEN;
    const res = proxy(req('/api/projects', { authorization: `Bearer ${TOKEN}` }));
    expect(res.status).toBe(503);
  });
});
