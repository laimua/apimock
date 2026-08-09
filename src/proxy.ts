/**
 * G1 鉴权代理（Next.js 16 proxy 约定，原 middleware）
 *
 * 设计见 docs/AUTH-DESIGN.md。正向白名单 matcher 只匹配管理路径，
 * mock /[project]/[...path]、share、health、metrics、backup 全部不在 matcher，
 * 鉴权绝不拦核心 mock 服务。
 *
 * fail-closed：未配置 MANAGE_TOKEN 时管理面禁用（对齐 metrics/backup 语义）。
 */

import { NextRequest, NextResponse } from 'next/server';
import { error } from '@/lib/api';
import { COOKIE_NAME, verifySession } from '@/lib/auth';
import { safeEqual } from '@/lib/crypto-utils';

const BEARER_PREFIX = 'Bearer ';

export function proxy(req: NextRequest) {
  const manageToken = process.env.MANAGE_TOKEN;

  // fail-closed：未配置 token，管理面完全禁用
  if (!manageToken) {
    if (req.nextUrl.pathname.startsWith('/api/')) {
      return error('MANAGE_TOKEN_NOT_CONFIGURED', 'MANAGE_TOKEN not configured', 503);
    }
    return NextResponse.redirect(new URL('/login?error=no_token', req.url));
  }

  // 机器客户端（agent / 脚本 / CI）：Authorization: Bearer <MANAGE_TOKEN> 直通，
  // timing-safe 比对。浏览器走 cookie，不受影响。
  // RFC 7235：auth scheme 大小写不敏感——只比 scheme 前缀；
  // token 本体大小写有意义，原样传给 safeEqual，不做大小写折叠。
  const authz = req.headers.get('authorization');
  if (
    authz?.toLowerCase().startsWith(BEARER_PREFIX.toLowerCase()) &&
    safeEqual(authz.slice(BEARER_PREFIX.length), manageToken)
  ) {
    return NextResponse.next();
  }

  const cookieValue = req.cookies.get(COOKIE_NAME)?.value;
  if (cookieValue && verifySession(cookieValue, manageToken)) {
    return NextResponse.next();
  }

  // 未鉴权：API → 401 JSON；页面 → 跳登录（带 from 回跳参数）
  if (req.nextUrl.pathname.startsWith('/api/')) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = '/login';
  loginUrl.searchParams.set('from', req.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

// 正向白名单：只匹配管理路径。mock、share、health、metrics、backup 不在 matcher
export const config = {
  matcher: [
    '/projects/:path*',
    '/settings/:path*',
    '/api/projects/:path*',
    '/api/ai/:path*',
  ],
};
