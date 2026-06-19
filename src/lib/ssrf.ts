/**
 * SSRF 防护 — 校验 URL 是否指向私有/保留地址段
 */

import { URL } from 'url';

const PRIVATE_RANGES: Array<{ start: number; end: number }> = [
  // 10.0.0.0/8
  { start: 0x0A000000, end: 0x0AFFFFFF },
  // 172.16.0.0/12
  { start: 0xAC100000, end: 0xAC1FFFFF },
  // 192.168.0.0/16
  { start: 0xC0A80000, end: 0xC0A8FFFF },
  // 127.0.0.0/8 (loopback)
  { start: 0x7F000000, end: 0x7FFFFFFF },
  // 169.254.0.0/16 (link-local)
  { start: 0xA9FE0000, end: 0xA9FEFFFF },
  // 0.0.0.0/8
  { start: 0x00000000, end: 0x00FFFFFF },
];

function ipv4ToInt(octets: number[]): number {
  return ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
}

function isPrivateIP(ip: string): boolean {
  // IPv6 loopback（含/不含方括号）
  const normalized = ip.replace(/^\[|\]$/g, '');
  if (normalized === '::1' || normalized === '::') return true;
  // IPv4-mapped IPv6
  const v4Match = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  const v4Str = v4Match ? v4Match[1] : normalized;
  const parts = v4Str.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => isNaN(p))) return false;

  const int = ipv4ToInt(parts);
  return PRIVATE_RANGES.some(r => int >= r.start && int <= r.end);
}

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'ip6-localhost',
  'ip6-loopback',
  'metadata.google.internal', // GCP metadata
]);

/**
 * 校验 URL 是否安全（不指向私有地址）
 * 返回 { safe: true } 或 { safe: false, reason: string }
 */
export function validateUrlSafe(urlStr: string): { safe: boolean; reason?: string } {
  let url: URL;
  try {
    url = new URL(urlStr);
  } catch {
    return { safe: false, reason: 'Invalid URL format' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { safe: false, reason: 'Only http/https protocols allowed' };
  }

  const hostname = url.hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { safe: false, reason: `Hostname "${hostname}" is blocked` };
  }

  if (isPrivateIP(hostname)) {
    return { safe: false, reason: 'Private IP addresses are not allowed' };
  }

  return { safe: true };
}
