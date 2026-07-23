/**
 * P0-1 SSRF DNS 解析修复 — 针对性验证
 *
 * 验证修复的核心新增能力:对非 IP 字面量的 hostname 触发 DNS 解析,
 * 并对解析到私有/元数据 IP 的情况拦截(DNS rebinding 防护)。
 *
 * 现有 ssrf.test.ts 只用 IP 字面量(dns.lookup 对 IP 字面量本地解析、不触网),
 * 覆盖不到"域名→解析→私有IP→拦截"这条路径。这里用 vi.hoisted 注入受控解析结果,
 * 模拟"域名解析到内网"的 rebinding 场景。
 */

import { describe, it, expect, vi } from 'vitest';

// vi.hoisted 解决 vi.mock factory 的提升/初始化顺序问题
const { lookupMock } = vi.hoisted(() => ({
  lookupMock: vi.fn(),
}));

// 全量 mock node:dns(命名导出 promises + default,满足 ssrf.ts 的 import 形状)
vi.mock('node:dns', () => ({
  default: { promises: { lookup: lookupMock } },
  promises: { lookup: lookupMock },
}));

import { validateUrlSafe } from '../ssrf';

describe('P0-1: SSRF DNS 解析拦截(DNS rebinding 防护)', () => {
  it('域名解析到公网 IP 时放行', async () => {
    lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    const r = await validateUrlSafe('https://api.openai.com');
    expect(r.safe).toBe(true);
    expect(lookupMock).toHaveBeenCalled();
  });

  it('域名解析到 10.x 私有段时拒绝(rebinding 场景)', async () => {
    lookupMock.mockResolvedValue([{ address: '10.0.0.5', family: 4 }]);
    const r = await validateUrlSafe('https://evil.example.com');
    expect(r.safe).toBe(false);
    expect(r.reason).toMatch(/private/i);
  });

  it('域名解析到 169.254.169.254(云元数据)时拒绝', async () => {
    lookupMock.mockResolvedValue([{ address: '169.254.169.254', family: 4 }]);
    const r = await validateUrlSafe('https://metadata-attacker.example.com');
    expect(r.safe).toBe(false);
    expect(r.reason).toMatch(/private/i);
  });

  it('多 A 记录中任一为私有 IP 即拒绝', async () => {
    lookupMock.mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '192.168.1.1', family: 4 },
    ]);
    const r = await validateUrlSafe('https://mixed.example.com');
    expect(r.safe).toBe(false);
  });

  it('域名解析失败(NXDOMAIN)时拒绝,而非放行', async () => {
    lookupMock.mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));
    const r = await validateUrlSafe('https://nonexistent.example.com');
    expect(r.safe).toBe(false);
    expect(r.reason).toMatch(/resolve/i);
  });

  it('IPv6 ULA 段(fd00::)被拦截', async () => {
    lookupMock.mockResolvedValue([{ address: 'fd00::1', family: 6 }]);
    const r = await validateUrlSafe('https://ipv6-ula.example.com');
    expect(r.safe).toBe(false);
    expect(r.reason).toMatch(/private/i);
  });
});
