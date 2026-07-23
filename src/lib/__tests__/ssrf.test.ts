/**
 * SSRF protection tests
 * 关键：阻止 mock route 调用内网 IP / localhost
 *
 * 注：validateUrlSafe 现为 async（对非 IP 字面量做 DNS 解析）。
 * "通过"用例改用公网 IP 字面量，避免单测依赖真实网络（dns.lookup 对 IP
 * 字面量本地解析，不触网）。
 */

import { describe, it, expect } from 'vitest';
import { validateUrlSafe } from '../ssrf';

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
