/**
 * G1 鉴权工具测试（auth.ts）
 *
 * 重点验证 HMAC 签名/校验的安全不变量：
 * - 篡改 cookie（exp 或 hmac 任意一位）→ 拒
 * - 错 token → 拒（改 token 即全员登出）
 * - 过期 → 拒
 * - sanitizeFromPath 的开放重定向防护（漏洞D）
 */

import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  COOKIE_NAME,
  SESSION_MAX_AGE_SEC,
  signSession,
  verifySession,
  sanitizeFromPath,
} from '../auth';

const TOKEN = 'test-manage-token-0123456789abcdef';

// 用任意 exp 构造 cookie（绕过 signSession 的 Date.now()+1天，用于过期/未来场景）
function cookieWithExp(exp: number, token: string): string {
  const hmac = createHmac('sha256', token).update(`apimock-auth:${exp}`).digest('hex');
  return `${exp}.${hmac}`;
}

describe('G1 auth: 常量', () => {
  it('COOKIE_NAME 与文档约定一致', () => {
    expect(COOKIE_NAME).toBe('apimock_auth');
  });
  it('SESSION_MAX_AGE_SEC = 1 天（漏洞B：不是 7 天）', () => {
    expect(SESSION_MAX_AGE_SEC).toBe(24 * 3600);
    expect(SESSION_MAX_AGE_SEC).toBeLessThan(7 * 24 * 3600);
  });
});

describe('G1 auth: signSession', () => {
  it('产出 <exp>.<hex> 格式', () => {
    const c = signSession(TOKEN);
    const [exp, sig] = c.split('.');
    expect(exp).toMatch(/^\d+$/);
    expect(sig).toMatch(/^[0-9a-f]+$/);
    expect(sig.length).toBe(64); // sha256 hex
  });
  it('exp 为未来时间（now + 1天）', () => {
    const exp = Number(signSession(TOKEN).split('.')[0]);
    expect(exp).toBeGreaterThan(Date.now());
    expect(exp - Date.now()).toBeLessThanOrEqual(SESSION_MAX_AGE_SEC * 1000);
  });
  it('不同 token 产出不同签名（token 是 HMAC key）', () => {
    expect(signSession(TOKEN)).not.toBe(signSession('another-token-xyz'));
  });
});

describe('G1 auth: verifySession', () => {
  it('signSession 产出的 cookie 自校验通过', () => {
    expect(verifySession(signSession(TOKEN), TOKEN)).toBe(true);
  });
  it('未来 exp 的合法 cookie 通过', () => {
    expect(verifySession(cookieWithExp(Date.now() + 3600 * 1000, TOKEN), TOKEN)).toBe(true);
  });
  it('过期 cookie 拒（漏洞B）', () => {
    expect(verifySession(cookieWithExp(Date.now() - 1000, TOKEN), TOKEN)).toBe(false);
  });
  it('错 token 拒（改 token = 全员登出）', () => {
    expect(verifySession(signSession(TOKEN), 'wrong-token')).toBe(false);
  });
  it('篡改 exp（保留旧 hmac）→ 拒', () => {
    const [exp, hmac] = signSession(TOKEN).split('.');
    expect(verifySession(`${Number(exp) + 1000}.${hmac}`, TOKEN)).toBe(false);
  });
  it('篡改 hmac 末位 → 拒', () => {
    const c = signSession(TOKEN);
    const flipped = c.endsWith('a') ? c.slice(0, -1) + 'b' : c.slice(0, -1) + 'a';
    expect(verifySession(flipped, TOKEN)).toBe(false);
  });
  it('格式错误 cookie 拒', () => {
    expect(verifySession('', TOKEN)).toBe(false);
    expect(verifySession('abc', TOKEN)).toBe(false); // 无点
    expect(verifySession('abc.def.ghi', TOKEN)).toBe(false); // 多段
    expect(verifySession('.deadbeef', TOKEN)).toBe(false); // 空 exp
    expect(verifySession('12345.', TOKEN)).toBe(false); // 空 sig
  });
  it('非数字 exp 拒', () => {
    expect(verifySession('notanumber.deadbeef', TOKEN)).toBe(false);
  });
  it('空 token 入参拒（fail-closed）', () => {
    expect(verifySession(signSession(TOKEN), '')).toBe(false);
  });
  it('timing-safe：相同输入多次校验结果稳定', () => {
    const v = signSession(TOKEN);
    for (let i = 0; i < 20; i++) {
      expect(verifySession(v, TOKEN)).toBe(true);
      expect(verifySession(v, 'x'.repeat(TOKEN.length))).toBe(false);
    }
  });
});

describe('G1 auth: sanitizeFromPath（漏洞D 开放重定向防护）', () => {
  it('合法同站 path 原样返回', () => {
    expect(sanitizeFromPath('/projects')).toBe('/projects');
    expect(sanitizeFromPath('/settings/ai')).toBe('/settings/ai');
    expect(sanitizeFromPath('/')).toBe('/');
  });
  it('protocol-relative URL 拒（//evil.com 开放重定向）', () => {
    expect(sanitizeFromPath('//evil.com')).toBeNull();
    expect(sanitizeFromPath('//evil.com/path')).toBeNull();
  });
  it('绝对 URL 拒（不以 / 开头）', () => {
    expect(sanitizeFromPath('http://evil.com')).toBeNull();
    expect(sanitizeFromPath('https://evil.com')).toBeNull();
    expect(sanitizeFromPath('evil.com')).toBeNull();
  });
  it('非字符串 拒', () => {
    expect(sanitizeFromPath(undefined)).toBeNull();
    expect(sanitizeFromPath(null)).toBeNull();
    expect(sanitizeFromPath(123)).toBeNull();
    expect(sanitizeFromPath({})).toBeNull();
  });
  it('空字符串拒（不以 / 开头）', () => {
    expect(sanitizeFromPath('')).toBeNull();
  });
});
