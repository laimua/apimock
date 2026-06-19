/**
 * Client IP extraction tests
 * 防伪造：取 X-Forwarded-For 链尾（最接近 trusted proxy）
 */

import { describe, it, expect } from 'vitest';
import { getClientIp } from '../client-ip';

function makeHeaders(obj: Record<string, string>): Headers {
  return new Headers(obj);
}

describe('getClientIp', () => {
  it('returns null when no IP headers', () => {
    expect(getClientIp(makeHeaders({}))).toBeNull();
  });

  it('prefers X-Real-IP over X-Forwarded-For (Railway-specific, non-spoofable)', () => {
    const h = makeHeaders({
      'x-real-ip': '203.0.113.5',
      'x-forwarded-for': '1.2.3.4, 5.6.7.8',
    });
    expect(getClientIp(h)).toBe('203.0.113.5');
  });

  it('takes LAST IP from X-Forwarded-For chain (closest to trusted proxy)', () => {
    // 攻击者伪造多个 IP，Railway 在链尾追加真实 IP
    const h = makeHeaders({
      'x-forwarded-for': '1.2.3.4, 5.6.7.8, 203.0.113.99',
    });
    expect(getClientIp(h)).toBe('203.0.113.99');
  });

  it('trims whitespace around IPs', () => {
    const h = makeHeaders({
      'x-forwarded-for': '1.2.3.4 , 203.0.113.99 ',
    });
    expect(getClientIp(h)).toBe('203.0.113.99');
  });

  it('handles single IP in X-Forwarded-For', () => {
    const h = makeHeaders({ 'x-forwarded-for': '203.0.113.5' });
    expect(getClientIp(h)).toBe('203.0.113.5');
  });

  it('returns null for empty X-Forwarded-For', () => {
    const h = makeHeaders({ 'x-forwarded-for': '' });
    expect(getClientIp(h)).toBeNull();
  });

  it('returns unknown when no real IP detectable (caller falls back)', () => {
    // 无 header 时调用方应传 'unknown' 作为 key
    expect(getClientIp(makeHeaders({}))).toBeNull();
  });
});
