/**
 * SSRF 出口防护 —— pinned DNS lookup + undici fetch
 *
 * 设计(根治 DNS rebinding,方案见 2026-08-15 round2 定稿):
 * - 校验时(validateUrlSafe)解析并 pin 一条允许的地址;
 * - 出口连接用 undici.Agent({ connect: { lookup } }),lookup 只返回 pin 的地址,
 *   hostname 与校验值不一致直接报错 —— 连接期二次解析(攻击者 rebinding 到
 *   127.0.0.1/元数据地址)无法生效;
 * - URL 保持原 hostname 不重写为 IP:保住 Host header 与 TLS SNI/证书校验;
 * - redirect 手动逐跳处理:仅允许同 origin(protocol+host+port)跳转(保持 pin),
 *   换 host / 端口漂移 / https→http scheme 降级一律拒绝;
 *   301/302(仅 POST)/303 按 fetch 规范改写为 GET 并移除 body 与 Content-* 头;
 * - Agent 生命周期:每请求(hop)一个 Agent,创建后推入调用方传入的 agents
 *   数组统一管理,响应 body 完全消费后 close,不在返回 Response 前 destroy。
 */

import { fetch as undiciFetch, Agent, Headers as UndiciHeaders } from 'undici';
import type { Response as UndiciResponse, RequestInit as UndiciRequestInit } from 'undici';
import type { LookupFunction } from 'node:net';
import { validateUrlSafe, type DnsResolver, type ResolvedAddress } from './ssrf';

/** SSRF 校验拒绝(可被调用方识别为 4xx 语义,区别于网络错误) */
export class SsrfRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SsrfRejectedError';
  }
}

const DEFAULT_MAX_REDIRECTS = 5;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * 构造 pinned lookup:校验时确定的 hostname + 地址,出口连接强制使用。
 * lookup 回调里 hostname 与校验值不一致(重定向/代理改写/SNI 劫持等)
 * → 直接拒绝,不发连接。
 */
export function createPinnedLookup(hostname: string, pin: ResolvedAddress): LookupFunction {
  return (
    host: string,
    _options: unknown,
    callback: (err: Error | null, address: string, family: number) => void
  ) => {
    // 兼容 legacy 2 参形式 lookup(host, cb)
    const cb = typeof _options === 'function'
      ? (_options as (err: Error | null, address: string, family: number) => void)
      : callback;
    if (host.toLowerCase() !== hostname) {
      cb(new Error(`SSRF: hostname changed during connection (${host} != ${hostname})`), '', 0);
      return;
    }
    // Node 22 默认 autoSelectFamily:net 以 { all: true } 调 lookup 并期望
    // 数组形式回调;单地址形式同样支持(legacy)
    const opts = typeof _options === 'object' && _options !== null
      ? (_options as { all?: boolean })
      : {};
    if (opts.all) {
      (cb as unknown as (err: Error | null, addresses: Array<{ address: string; family: number }>) => void)(
        null,
        [{ address: pin.address, family: pin.family }]
      );
      return;
    }
    cb(null, pin.address, pin.family);
  };
}

export interface PinnedRequest {
  hostname: string;
  pin: ResolvedAddress;
}

export interface FetchWithPinOptions {
  maxRedirects?: number;
  /** 本请求创建的所有 Agent 推入此数组,由调用方在 body 消费后统一 close */
  agents?: Agent[];
}

/**
 * redirect 方法改写(fetch 规范):
 * - 303 任意方法 → GET;
 * - 301/302 仅 POST → GET(其余方法保持,如 PUT 301 后仍是 PUT);
 * - 307/308 永不改写(连 body 语义一起保留);
 * - 改写为 GET 时移除 body 与 Content-* 头(Content-Type/Length 等)。
 */
export function rewriteInitForRedirect(
  status: number,
  init: UndiciRequestInit
): UndiciRequestInit {
  const method = (init.method ?? 'GET').toUpperCase();
  const toGet = status === 303 || ((status === 301 || status === 302) && method === 'POST');
  if (!toGet) return init;

  const headers = new UndiciHeaders(init.headers as HeadersInit | undefined);
  for (const name of [...headers.keys()]) {
    if (name.toLowerCase().startsWith('content-')) headers.delete(name);
  }
  return { ...init, method: 'GET', body: undefined, headers };
}

/**
 * 底层出口 fetch:URL 保持原 hostname(Host/SNI 不变),连接 pin 到指定地址,
 * 手动逐跳处理 redirect(同 host 保持 pin;换 host 拒绝)。
 *
 * 测试注入点:可绕过 validateUrlSafe 直接给 pin(如 pin 127.0.0.1 打本地
 * server 验证 Host header 保持与 redirect 语义),生产路径走 createPinnedFetch。
 */
export async function fetchWithPin(
  urlStr: string,
  init: UndiciRequestInit = {},
  pinned: PinnedRequest,
  options: FetchWithPinOptions = {}
): Promise<UndiciResponse> {
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const agents = options.agents ?? [];

  const hop = async (url: URL, reqInit: UndiciRequestInit): Promise<UndiciResponse> => {
    const agent = new Agent({
      connect: { lookup: createPinnedLookup(pinned.hostname, pinned.pin) },
    });
    agents.push(agent);
    return undiciFetch(url, {
      ...reqInit,
      redirect: 'manual',
      // undici fetch 的 dispatcher 选项(RequestInit 扩展)
      dispatcher: agent,
    });
  };

  const initial = new URL(urlStr);
  let current = initial;
  let requestInit: UndiciRequestInit = init;
  let response = await hop(current, requestInit);
  let redirects = 0;

  while (REDIRECT_STATUSES.has(response.status)) {
    const location = response.headers.get('location');
    if (!location) break;

    // try/finally:拒绝/超限抛错路径同样先 cancel 旧 body,
    // 否则未消费的响应体会占住 socket,调用方的 Agent.close() 永远不返回
    let next!: URL;
    try {
      if (++redirects > maxRedirects) {
        throw new Error(`SSRF: too many redirects (>${maxRedirects})`);
      }

      next = new URL(location, current);
      // 跨 origin 校验:比 protocol + host(含 port),不只是 hostname ——
      // https→http scheme 降级、端口漂移、换 host 一律拒绝
      if (next.protocol !== initial.protocol || next.host !== initial.host) {
        throw new SsrfRejectedError(
          `SSRF: redirect to different origin rejected (${next.protocol}//${next.host} != ${initial.protocol}//${initial.host})`
        );
      }
      if (next.hostname.toLowerCase() !== pinned.hostname) {
        throw new SsrfRejectedError(
          `SSRF: redirect to different host rejected (${next.hostname} != ${pinned.hostname})`
        );
      }
    } finally {
      await response.body?.cancel().catch(() => undefined);
    }

    requestInit = rewriteInitForRedirect(response.status, requestInit);
    current = next;
    response = await hop(current, requestInit);
  }

  return response;
}

export interface PinnedFetch {
  /** 注入 OpenAI SDK 的 fetch 替代实现(undici fetch,类型同全局 fetch 形状) */
  fetch: (input: string | URL | Request, init?: UndiciRequestInit) => Promise<UndiciResponse>;
  /** 关闭所有已创建的 Agent(响应 body 完全消费后调用) */
  close: () => Promise<void>;
}

export interface CreatePinnedFetchOptions {
  resolver?: DnsResolver;
  maxRedirects?: number;
}

/**
 * 创建带 DNS pinning 的 fetch(供 OpenAI SDK 等注入)。
 *
 * 首次请求时校验 URL 并 pin 解析结果;后续同 hostname 请求复用 pin。
 * - 校验不通过 → SsrfRejectedError;
 * - DNS 解析失败 → fail-closed 抛错(validateUrlSafe 的 fail-open 只覆盖
 *   入库前校验,实际出口连接必须有 pin);
 * - SDK 复用同一 pinned fetch 打不同 hostname → 拒绝(需要新 host 就新建)。
 */
export function createPinnedFetch(options: CreatePinnedFetchOptions = {}): PinnedFetch {
  const agents: Agent[] = [];
  let pinned: PinnedRequest | null = null;

  const doFetch = async (
    input: string | URL | Request,
    init?: UndiciRequestInit
  ): Promise<UndiciResponse> => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(urlStr);
    const hostname = url.hostname.toLowerCase();

    if (!pinned) {
      const check = await validateUrlSafe(urlStr, { resolver: options.resolver });
      if (!check.safe) {
        throw new SsrfRejectedError(`SSRF: ${check.reason ?? 'URL rejected'}`);
      }
      if (!check.pinned) {
        // fail-open 只作用于"入库前校验";真实出口连接必须有 pin
        throw new SsrfRejectedError('SSRF: DNS resolution failed, refusing outbound request');
      }
      pinned = { hostname: check.hostname ?? hostname, pin: check.pinned };
    }

    if (hostname !== pinned.hostname) {
      throw new SsrfRejectedError(
        `SSRF: hostname changed during connection (${hostname} != ${pinned.hostname})`
      );
    }

    return fetchWithPin(urlStr, init ?? {}, pinned, {
      maxRedirects: options.maxRedirects,
      agents,
    });
  };

  return {
    fetch: doFetch,
    close: async () => {
      pinned = null;
      await Promise.all(agents.map((a) => a.close()));
      agents.length = 0;
    },
  };
}
