/**
 * SSRF 防护 — 校验 URL 是否指向私有/保留地址段
 */

import { URL } from 'url';
import { promises as dns } from 'node:dns';

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

function isPrivateIPv4(v4Str: string): boolean {
  const parts = v4Str.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => Number.isNaN(p))) return false;

  const int = ipv4ToInt(parts);
  return PRIVATE_RANGES.some(r => int >= r.start && int <= r.end);
}

function isPrivateIP(ip: string): boolean {
  // 统一去掉 IPv6 方括号并小写
  const normalized = ip.replace(/^\[|\]$/g, '').toLowerCase();

  // IPv6 loopback / 未指定
  if (normalized === '::1' || normalized === '::') return true;

  if (normalized.includes(':')) {
    // IPv6 ULA fc00::/7（本地单播，等价内网段）
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
    // IPv4-mapped IPv6 ::ffff:a.b.c.d
    const v4Match = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (v4Match) return isPrivateIPv4(v4Match[1]);
    return false;
  }

  return isPrivateIPv4(normalized);
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
export async function validateUrlSafe(
  urlStr: string
): Promise<{ safe: boolean; reason?: string }> {
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

  // DNS 解析：对非 IP 字面量的 hostname 解析实际地址，逐个校验是否命中私有段，
  // 防止域名解析到内网/元数据地址（DNS rebinding / 云元数据窃取）。
  let addresses: { address: string; family: number }[];
  try {
    addresses = await dns.lookup(hostname, { all: true });
  } catch {
    return { safe: false, reason: `Failed to resolve hostname "${hostname}"` };
  }

  for (const { address } of addresses) {
    if (isPrivateIP(address)) {
      return { safe: false, reason: 'Hostname resolves to a private IP address' };
    }
  }

  return { safe: true };
}
