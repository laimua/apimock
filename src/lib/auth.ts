/**
 * G1 鉴权 — cookie 签发/校验工具（HMAC 签名方案）
 *
 * 设计见 docs/AUTH-DESIGN.md。cookie 不存 token 原文，只存
 * `<exp>.<hmac>`，hmac = HMAC_SHA256(MANAGE_TOKEN, "apimock-auth:"+exp)。
 * 改 MANAGE_TOKEN 即所有会话立即失效（签名对不上）。
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

export const COOKIE_NAME = 'apimock_auth';
// 1 天（CC 审查漏洞B：stateless cookie 不可吊销，缩窗口；要即时吊销需服务端列表 v2）
export const SESSION_MAX_AGE_SEC = 24 * 3600;

/**
 * 用 MANAGE_TOKEN 签发会话 cookie 值：`<exp>.<hmac>`
 */
export function signSession(manageToken: string): string {
  const exp = Date.now() + SESSION_MAX_AGE_SEC * 1000;
  const hmac = createHmac('sha256', manageToken).update(`apimock-auth:${exp}`).digest('hex');
  return `${exp}.${hmac}`;
}

/**
 * 校验会话 cookie 值是否有效（未过期 + HMAC 匹配）。
 * timing-safe 比对，前置 length 判断。
 */
export function verifySession(cookieValue: string, manageToken: string): boolean {
  const sep = cookieValue.indexOf('.');
  if (sep <= 0) return false;
  const expStr = cookieValue.slice(0, sep);
  const sig = cookieValue.slice(sep + 1);
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;

  const expect = createHmac('sha256', manageToken).update(`apimock-auth:${expStr}`).digest();
  // Buffer.from(x,'hex') 比 32 字节（CC 审查风格清理：比 hex 字符串字节虽对，但 hex decode 更标准）
  const sigBuf = Buffer.from(sig, 'hex');
  if (sigBuf.length !== expect.length) return false;
  return timingSafeEqual(sigBuf, expect);
}

/**
 * 校验登录后跳转目标（漏洞D：防开放重定向）。
 * 只接受以 `/` 开头且非 `//host`（protocol-relative）的同站 path。
 * 非法值返回 null（前端忽略、跳默认页）。
 */
export function sanitizeFromPath(from: unknown): string | null {
  if (typeof from !== 'string') return null;
  if (!from.startsWith('/')) return null;
  if (from.startsWith('//')) return null;
  return from;
}
