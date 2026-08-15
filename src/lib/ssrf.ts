/**
 * SSRF 防护 — 校验 URL 是否指向私有/保留地址段
 */

import { URL } from 'url';
import { promises as dns } from 'node:dns';
import { logger } from './logger';

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
  // P2-27:补四段内网/保留段(纵深防御,便宜)
  // 100.64.0.0/10 (CGNAT RFC 6598,Tailscale/内网 NAT 常用)
  { start: 0x64400000, end: 0x647FFFFF },
  // 198.18.0.0/15 (RFC 2544 网络互联设备性能基准测试保留)
  { start: 0xC6120000, end: 0xC613FFFF },
  // 224.0.0.0/4 (RFC 5771 组播,mock 不应主动连接)
  { start: 0xE0000000, end: 0xEFFFFFFF },
  // 240.0.0.0/4 (RFC 1112 保留,含 255.255.255.255 有限广播)
  { start: 0xF0000000, end: 0xFFFFFFFF },
];

function ipv4ToInt(octets: number[]): number {
  return ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
}

function isPrivateIPv4(v4Str: string): boolean {
  const parts = v4Str.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => Number.isNaN(p))) return false;

  return isPrivateIPv4Int(ipv4ToInt(parts));
}

function isPrivateIPv4Int(int: number): boolean {
  return PRIVATE_RANGES.some(r => int >= r.start && int <= r.end);
}

/**
 * 解析 IPv6 字符串为 8 组 16-bit 数值（规范化地址）。
 * 支持 "::" 压缩与末段内嵌 IPv4 点分形式（如 ::ffff:127.0.0.1）。
 * 非法输入返回 null。
 *
 * A1:不做字符串前缀匹配，统一解析后按地址段判断 ——
 * 否则 ::ffff:7f00:1 这类 hex 形态的 IPv4-mapped 地址可绕过点分正则。
 */
function parseIPv6(ip: string): number[] | null {
  const input = ip.toLowerCase();
  const dbl = input.indexOf('::');
  let headStr: string;
  let tailStr: string | null = null;
  if (dbl !== -1) {
    // "::" 只允许出现一次
    if (input.indexOf('::', dbl + 1) !== -1) return null;
    headStr = input.slice(0, dbl);
    tailStr = input.slice(dbl + 2);
  } else {
    headStr = input;
  }

  const parseGroups = (s: string, groups: number[]): boolean => {
    if (s === '') return true;
    for (const seg of s.split(':')) {
      if (seg === '') return false;
      if (seg.includes('.')) {
        // 内嵌 IPv4（仅合法于最后一段，占 2 组）
        const parts = seg.split('.').map(Number);
        if (parts.length !== 4 || parts.some(p => !Number.isInteger(p) || p < 0 || p > 255)) return false;
        groups.push((parts[0] << 8) | parts[1]);
        groups.push((parts[2] << 8) | parts[3]);
      } else {
        if (!/^[0-9a-f]{1,4}$/.test(seg)) return false;
        groups.push(parseInt(seg, 16));
      }
    }
    return true;
  };

  const head: number[] = [];
  const tail: number[] = [];
  if (!parseGroups(headStr, head)) return null;
  if (tailStr !== null && !parseGroups(tailStr, tail)) return null;

  if (tailStr === null) {
    // 无 "::" 压缩：必须恰好 8 组
    return head.length === 8 ? head : null;
  }
  const fill = 8 - head.length - tail.length;
  if (fill < 0) return null;
  return [...head, ...new Array<number>(fill).fill(0), ...tail];
}

export function isPrivateIP(ip: string): boolean {
  // 统一去掉 IPv6 方括号并小写
  const normalized = ip.replace(/^\[|\]$/g, '').toLowerCase();

  if (!normalized.includes(':')) {
    return isPrivateIPv4(normalized);
  }

  // IPv6：解析成 8 组后按规范化地址段判断（A1：字符串形态匹配可被
  // IPv4-mapped 的 hex/点分两种写法绕过，全部走地址解析）
  const groups = parseIPv6(normalized);
  if (!groups) return false;

  // IPv4-mapped ::ffff:0:0/96（点分 ::ffff:127.0.0.1 与 hex ::ffff:7f00:1 等价）
  if (groups.slice(0, 5).every(g => g === 0) && groups[5] === 0xffff) {
    return isPrivateIPv4Int(((groups[6] << 16) | groups[7]) >>> 0);
  }

  // 前 96 位为 0：覆盖 ::（未指定）、::1（loopback，0.0.0.1 命中 0.0.0.0/8）
  // 及已弃用的 IPv4-compatible ::a.b.c.d / ::7f00:1 —— 均按低 32 位 IPv4 段判
  if (groups.slice(0, 6).every(g => g === 0)) {
    return isPrivateIPv4Int(((groups[6] << 16) | groups[7]) >>> 0);
  }

  // IPv6 ULA fc00::/7（fc/fd 开头，本地单播，等价内网段）
  if ((groups[0] & 0xfe00) === 0xfc00) return true;

  // IPv6 link-local fe80::/10（fe80:: - febf::）
  if ((groups[0] & 0xffc0) === 0xfe80) return true;

  return false;
}

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'ip6-localhost',
  'ip6-loopback',
  'metadata.google.internal', // GCP metadata
]);

/** DNS 解析结果(单条地址) */
export interface ResolvedAddress {
  address: string;
  family: number;
}

/**
 * DNS resolver 抽象 —— 测试注入受控解析序列用(rebinding 场景:
 * 首次解析公网、连接时解析内网),生产用默认的 dns.lookup(all: true)。
 */
export type DnsResolver = (hostname: string) => Promise<ResolvedAddress[]>;

export const defaultDnsResolver: DnsResolver = (hostname) =>
  dns.lookup(hostname, { all: true });

export interface UrlSafetyResult {
  safe: boolean;
  reason?: string;
  /** 校验通过的 hostname(小写,URL 原样保留不重写为 IP) */
  hostname?: string;
  /**
   * 校验时确定的 pin 地址(出口连接强制用它,防 DNS rebinding)。
   * 全部地址校验通过后取第一条(确定性)。
   * DNS 解析失败(fail-open 放行)时为 null —— 出口侧 fail-closed。
   */
  pinned?: ResolvedAddress | null;
}

export interface ValidateUrlOptions {
  resolver?: DnsResolver;
}

/**
 * 校验 URL 是否安全（不指向私有地址）
 * 返回 { safe: false, reason } 或
 * { safe: true, hostname, pinned: 校验时解析到的地址 }
 */
export async function validateUrlSafe(
  urlStr: string,
  options: ValidateUrlOptions = {}
): Promise<UrlSafetyResult> {
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
  //
  // fail-open 策略：DNS 解析失败时放行（仅记录警告），而非拒绝。
  // 理由：解析失败 ≠ 不安全（可能是 CI/无 DNS 环境的临时网络问题），
  // 强制拒绝会让服务在 DNS 不可用时完全瘫痪。核心防护价值在"解析到私有 IP
  // 则拦截"，这点不受影响；字面 IP / hostname 黑名单检查已在上面完成。
  // 出口连接侧(ssrf-fetch)对无 pin 的请求 fail-closed,补上这里的缺口。
  const resolver = options.resolver ?? defaultDnsResolver;
  let addresses: ResolvedAddress[];
  try {
    addresses = await resolver(hostname);
  } catch {
    logger.warn({ hostname }, '[SSRF] DNS lookup failed, skipping resolution check (fail-open)');
    return { safe: true, hostname, pinned: null };
  }

  for (const { address } of addresses) {
    if (isPrivateIP(address)) {
      return { safe: false, reason: 'Hostname resolves to a private IP address' };
    }
  }

  return { safe: true, hostname, pinned: addresses[0] ?? null };
}
