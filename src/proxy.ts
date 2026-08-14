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
import { rateLimit } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/client-ip';
import { logger } from '@/lib/logger';

const BEARER_PREFIX = 'Bearer ';

// A2: Bearer 爆破限流。失败按 IP 桶 + 全局桶双计数（见 docs/AUTH-DESIGN.md）。
// per-IP 30/min 拦单源定向爆破；全局 300/min 兜底分布式撞库（多 IP 轮换时
// per-IP 桶失效，全局桶保证 token 撞试总量仍有上限）。
// 计数在「带 Bearer 前缀且 token 错误」时才发生——正确 Bearer 与浏览器
// cookie 路径零额外开销。
const BEARER_FAIL_IP_LIMIT = 30;
const BEARER_FAIL_GLOBAL_LIMIT = 300;

// A3: MANAGE_TOKEN 强度校验。短 token 让 timing-safe 比对的意义失效
// （爆破空间过小）。对齐 encryption.ts P2-29 范式：非致命 warn 一次 +
// 鼓励轮换，不抛错（避免破坏既有部署）。
const MANAGE_TOKEN_MIN_LENGTH = 32;
let manageTokenWarned = false;

function warnIfWeakManageToken(token: string): void {
  if (manageTokenWarned || token.length >= MANAGE_TOKEN_MIN_LENGTH) return;
  logger.warn(
    `[security] MANAGE_TOKEN is only ${token.length} chars (< ${MANAGE_TOKEN_MIN_LENGTH}). ` +
      'Use a strong token (>= 32 chars from a CSPRNG, e.g. `openssl rand -hex 32`) and rotate as soon as possible.'
  );
  manageTokenWarned = true;
}

export async function proxy(req: NextRequest) {
  const manageToken = process.env.MANAGE_TOKEN;

  // fail-closed：未配置 token，管理面完全禁用
  if (!manageToken) {
    if (req.nextUrl.pathname.startsWith('/api/')) {
      return error('MANAGE_TOKEN_NOT_CONFIGURED', 'MANAGE_TOKEN not configured', 503);
    }
    return NextResponse.redirect(new URL('/login?error=no_token', req.url));
  }

  warnIfWeakManageToken(manageToken);

  // 机器客户端（agent / 脚本 / CI）：Authorization: Bearer <MANAGE_TOKEN> 直通，
  // timing-safe 比对。浏览器走 cookie，不受影响。
  // RFC 7235：auth scheme 大小写不敏感——只比 scheme 前缀；
  // token 本体大小写有意义，原样传给 safeEqual，不做大小写折叠。
  const authz = req.headers.get('authorization');
  const hasBearerPrefix = authz?.toLowerCase().startsWith(BEARER_PREFIX.toLowerCase()) ?? false;
  if (hasBearerPrefix && safeEqual(authz!.slice(BEARER_PREFIX.length), manageToken)) {
    return NextResponse.next();
  }

  // A2: Bearer 前缀存在但 token 错误 → 失败计数（成功路径零开销）。
  // 任一桶超限 → 统一 429（防爆破噪声放大：401 会引导攻击者继续撞）。
  // 失败 Bearer 仍落到下方 cookie 分支——错误 Bearer 不破坏既有 cookie 会话。
  if (hasBearerPrefix) {
    const ip = getClientIp(req.headers) ?? 'unknown';
    const [ipRl, globalRl] = await Promise.all([
      rateLimit(`bearer:${ip}`, BEARER_FAIL_IP_LIMIT, 60, 'bearer'),
      rateLimit('bearer:__global', BEARER_FAIL_GLOBAL_LIMIT, 60, 'bearer'),
    ]);
    if (!ipRl.allowed || !globalRl.allowed) {
      return error('RATE_LIMITED', 'Too many failed Bearer attempts, try again later', 429);
    }
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
