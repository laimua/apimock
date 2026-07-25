/**
 * 登录路由
 * POST /api/auth/login — 校验管理令牌,签发 HMAC cookie
 *
 * 设计见 docs/AUTH-DESIGN.md。
 * 漏洞A(CRITICAL):token 比对必须 timing-safe,禁止 ===。
 * 登录限流:rateLimit(`login:<ip>`, 10/min/IP),防暴力撞 token,超额返 429。
 * 漏洞D:from 参数只接受同站 path(/开头且非 //),否则忽略(前端按返回值跳转)。
 */

import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { success, Errors, error } from '@/lib/api';
import { safeEqual } from '@/lib/crypto-utils';
import { rateLimit } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/client-ip';
import { COOKIE_NAME, SESSION_MAX_AGE_SEC, sanitizeFromPath, signSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// 登录限流:10 次/min/IP(防暴力撞 token)
const LOGIN_RATE_LIMIT = 10;

export async function POST(request: NextRequest) {
  // 限流(防暴力撞 token)
  const ip = getClientIp(request.headers) ?? 'unknown';
  const rl = await rateLimit(`login:${ip}`, LOGIN_RATE_LIMIT, 60, 'login');
  if (!rl.allowed) {
    return error('RATE_LIMITED', 'Too many login attempts, try again later', 429);
  }

  const expected = process.env.MANAGE_TOKEN;
  if (!expected) {
    return Errors.internal('MANAGE_TOKEN not configured');
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Errors.badRequest('Invalid request body');
  }

  const token =
    typeof (body as { token?: unknown } | null)?.token === 'string'
      ? (body as { token: string }).token
      : '';
  // 漏洞A CRITICAL:必须 timing-safe,禁止 ===
  if (!token || !safeEqual(token, expected)) {
    return Errors.unauthorized();
  }

  // 签发 cookie(httpOnly + sameSite=lax + secure(prod),防 XSS 读取 + CSRF)
  const cookieValue = signSession(expected);
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, cookieValue, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_SEC,
  });

  // 漏洞D:from 只接受同站 path,否则忽略(前端按返回值跳转)
  return success({ ok: true, from: sanitizeFromPath((body as { from?: unknown } | null)?.from) });
}
