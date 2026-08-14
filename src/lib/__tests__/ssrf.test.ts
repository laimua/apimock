/**
 * SSRF protection tests
 * 关键：阻止 mock route 调用内网 IP / localhost
 *
 * 注：validateUrlSafe 现为 async（对非 IP 字面量做 DNS 解析）。
 * "通过"用例改用公网 IP 字面量，避免单测依赖真实网络（dns.lookup 对 IP
 * 字面量本地解析，不触网）。
 */

import { describe, it, expect } from 'vitest';
import { validateUrlSafe, isPrivateIP } from '../ssrf';

describe('validateUrlSafe', () => {
  it('accepts public IP-literal HTTP URLs', async () => {
    const r = await validateUrlSafe('http://8.8.8.8');
    expect(r.safe).toBe(true);
  });

  it('accepts public IP-literal HTTPS URLs', async () => {
    const r = await validateUrlSafe('https://1.1.1.1');
    expect(r.safe).toBe(true);
  });

  it('rejects localhost', async () => {
    const r = await validateUrlSafe('http://localhost:3000');
    expect(r.safe).toBe(false);
  });

  it('rejects 127.0.0.1', async () => {
    const r = await validateUrlSafe('http://127.0.0.1:8080');
    expect(r.safe).toBe(false);
  });

  it('rejects IPv6 loopback ::1', async () => {
    const r = await validateUrlSafe('http://[::1]:8080');
    expect(r.safe).toBe(false);
  });

  it('rejects private 10.x.x.x', async () => {
    const r = await validateUrlSafe('http://10.0.0.1');
    expect(r.safe).toBe(false);
  });

  it('rejects private 192.168.x.x', async () => {
    const r = await validateUrlSafe('http://192.168.1.1');
    expect(r.safe).toBe(false);
  });

  it('rejects private 172.16.x.x', async () => {
    const r = await validateUrlSafe('http://172.16.0.1');
    expect(r.safe).toBe(false);
  });

  it('rejects 169.254.x.x (link-local / AWS metadata)', async () => {
    const r = await validateUrlSafe('http://169.254.169.254'); // AWS IMDS
    expect(r.safe).toBe(false);
  });

  it('rejects non-http(s) schemes (file:, ftp:, etc)', async () => {
    expect((await validateUrlSafe('file:///etc/passwd')).safe).toBe(false);
    expect((await validateUrlSafe('ftp://example.com')).safe).toBe(false);
    expect((await validateUrlSafe('javascript:alert(1)')).safe).toBe(false);
  });

  it('rejects malformed URLs', async () => {
    expect((await validateUrlSafe('not-a-url')).safe).toBe(false);
    expect((await validateUrlSafe('')).safe).toBe(false);
  });

  it('returns reason string on rejection', async () => {
    const r = await validateUrlSafe('http://localhost');
    expect(r.safe).toBe(false);
    expect(typeof r.reason).toBe('string');
    expect(r.reason!.length).toBeGreaterThan(0);
  });
});

describe('isPrivateIP', () => {
  describe('IPv6 link-local fe80::/10 (P1-18)', () => {
    // /10 范围 = fe80:: 至 febf::(高 10 位固定,第三 nibble ∈ {8,9,a,b})
    it('拦截 fe80::1(link-local 起点)', () => {
      expect(isPrivateIP('fe80::1')).toBe(true);
    });
    it('拦截 fe90::1', () => {
      expect(isPrivateIP('fe90::1')).toBe(true);
    });
    it('拦截 fea0::1', () => {
      expect(isPrivateIP('fea0::1')).toBe(true);
    });
    it('拦截 febf::1(link-local 终点)', () => {
      expect(isPrivateIP('febf::1')).toBe(true);
    });
    it('放行 fec0::1(site-local 已弃用,不在 fe80::/10 范围)', () => {
      expect(isPrivateIP('fec0::1')).toBe(false);
    });
    it('放行公网 IPv6 (2001:4860:4860::8888)', () => {
      expect(isPrivateIP('2001:4860:4860::8888')).toBe(false);
    });

    it('validateUrlSafe 拒绝 http://[fe80::1]/', async () => {
      const r = await validateUrlSafe('http://[fe80::1]/');
      expect(r.safe).toBe(false);
    });
    it('validateUrlSafe 拒绝 http://[febf::1]/(/10 范围终点)', async () => {
      const r = await validateUrlSafe('http://[febf::1]/');
      expect(r.safe).toBe(false);
    });
  });

  describe('IPv6 回归(其它私有段)', () => {
    it('拦截 ::1 loopback', () => {
      expect(isPrivateIP('::1')).toBe(true);
    });
    it('拦截 :: 未指定', () => {
      expect(isPrivateIP('::')).toBe(true);
    });
    it('拦截 fc00::1 (ULA)', () => {
      expect(isPrivateIP('fc00::1')).toBe(true);
    });
    it('拦截 fd00::1 (ULA)', () => {
      expect(isPrivateIP('fd00::1')).toBe(true);
    });
    it('拦截 ::ffff:127.0.0.1 (IPv4-mapped 点分形式)', () => {
      expect(isPrivateIP('::ffff:127.0.0.1')).toBe(true);
    });
    it('放行 ::ffff:8.8.8.8 (IPv4-mapped 公网)', () => {
      expect(isPrivateIP('::ffff:8.8.8.8')).toBe(false);
    });
  });

  describe('A1 回归:IPv4-mapped IPv6 hex 形态绕过(解析成规范化地址判定)', () => {
    it('拦截 ::ffff:7f00:1(= 127.0.0.1 的 hex 形态)', () => {
      expect(isPrivateIP('::ffff:7f00:1')).toBe(true);
    });
    it('拦截 ::ffff:7f00:0001(= 127.0.0.1 全长 hex 形态)', () => {
      expect(isPrivateIP('::ffff:7f00:0001')).toBe(true);
    });
    it('拦截 ::ffff:10.0.0.1 / ::ffff:a00:1(= 10.0.0.1)', () => {
      expect(isPrivateIP('::ffff:10.0.0.1')).toBe(true);
      expect(isPrivateIP('::ffff:a00:1')).toBe(true);
    });
    it('拦截 ::ffff:169.254.169.254(IPv4-mapped AWS IMDS)', () => {
      expect(isPrivateIP('::ffff:169.254.169.254')).toBe(true);
    });
    it('拦截 ::7f00:1(已弃用 IPv4-compatible 的 127.0.0.1)', () => {
      expect(isPrivateIP('::7f00:1')).toBe(true);
    });
    it('拦截 ::1 / :: / fe80::1 / fd00::1(原有语义不回退)', () => {
      expect(isPrivateIP('::1')).toBe(true);
      expect(isPrivateIP('::')).toBe(true);
      expect(isPrivateIP('fe80::1')).toBe(true);
      expect(isPrivateIP('fd00::1')).toBe(true);
    });
    it('放行 ::ffff:8.8.8.8 的 hex 形态 ::ffff:808:808(= 8.8.8.8)', () => {
      expect(isPrivateIP('::ffff:808:808')).toBe(false);
    });
    it('非法 IPv6 字符串解析失败 → 不误报为私有', () => {
      expect(isPrivateIP('::gggg::1')).toBe(false);
      expect(isPrivateIP('1:2:3:4:5:6:7:8:9')).toBe(false);
    });
  });

  describe('IPv4 回归', () => {
    it('拦截 127.0.0.1', () => {
      expect(isPrivateIP('127.0.0.1')).toBe(true);
    });
    it('拦截 10.0.0.1', () => {
      expect(isPrivateIP('10.0.0.1')).toBe(true);
    });
    it('拦截 169.254.169.254 (link-local)', () => {
      expect(isPrivateIP('169.254.169.254')).toBe(true);
    });
    it('放行 8.8.8.8', () => {
      expect(isPrivateIP('8.8.8.8')).toBe(false);
    });
  });
});
