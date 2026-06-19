/**
 * SSRF protection tests
 * 关键：阻止 mock route 调用内网 IP / localhost
 */

import { describe, it, expect } from 'vitest';
import { validateUrlSafe } from '../ssrf';

describe('validateUrlSafe', () => {
  it('accepts public HTTPS URLs', () => {
    const r = validateUrlSafe('https://api.openai.com/v1/chat/completions');
    expect(r.safe).toBe(true);
  });

  it('accepts public HTTP URLs', () => {
    const r = validateUrlSafe('http://example.com');
    expect(r.safe).toBe(true);
  });

  it('rejects localhost', () => {
    const r = validateUrlSafe('http://localhost:3000');
    expect(r.safe).toBe(false);
  });

  it('rejects 127.0.0.1', () => {
    const r = validateUrlSafe('http://127.0.0.1:8080');
    expect(r.safe).toBe(false);
  });

  it('rejects IPv6 loopback ::1', () => {
    const r = validateUrlSafe('http://[::1]:8080');
    expect(r.safe).toBe(false);
  });

  it('rejects private 10.x.x.x', () => {
    const r = validateUrlSafe('http://10.0.0.1');
    expect(r.safe).toBe(false);
  });

  it('rejects private 192.168.x.x', () => {
    const r = validateUrlSafe('http://192.168.1.1');
    expect(r.safe).toBe(false);
  });

  it('rejects private 172.16.x.x', () => {
    const r = validateUrlSafe('http://172.16.0.1');
    expect(r.safe).toBe(false);
  });

  it('rejects 169.254.x.x (link-local / AWS metadata)', () => {
    const r = validateUrlSafe('http://169.254.169.254'); // AWS IMDS
    expect(r.safe).toBe(false);
  });

  it('rejects non-http(s) schemes (file:, ftp:, etc)', () => {
    expect(validateUrlSafe('file:///etc/passwd').safe).toBe(false);
    expect(validateUrlSafe('ftp://example.com').safe).toBe(false);
    expect(validateUrlSafe('javascript:alert(1)').safe).toBe(false);
  });

  it('rejects malformed URLs', () => {
    expect(validateUrlSafe('not-a-url').safe).toBe(false);
    expect(validateUrlSafe('').safe).toBe(false);
  });

  it('returns reason string on rejection', () => {
    const r = validateUrlSafe('http://localhost');
    expect(r.safe).toBe(false);
    expect(typeof r.reason).toBe('string');
    expect(r.reason!.length).toBeGreaterThan(0);
  });
});
