/**
 * SSRF DNS pinning 出口防护测试 — 全部本地,无外网依赖
 *
 * 覆盖:
 * - validateUrlSafe 返回 hostname + pinned IP(多地址确定性取第一条)
 * - pinned lookup 冻结解析结果:resolver 二次调用返回 127.0.0.1(rebinding)
 *   仍 pin 首次公网地址;hostname 不一致直接拒绝
 * - fetchWithPin:URL 保持原 hostname(Host header 不重写为 IP)、
 *   同 host redirect 跟随、跨 host redirect 拒绝、redirect 上限
 * - createPinnedFetch:fail-closed(无 pin 不出口)、跨 host 拒绝
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  createServer,
  type Server,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Agent } from 'undici';
import { validateUrlSafe, type DnsResolver } from '../ssrf';
import {
  createPinnedLookup,
  fetchWithPin,
  createPinnedFetch,
  SsrfRejectedError,
} from '../ssrf-fetch';

// ============================================
// 工具:本地 http server(127.0.0.1)
// ============================================
const servers: Server[] = [];

function startLocalServer(
  handler: (req: IncomingMessage, url: URL, res: ServerResponse) => void
): Promise<{ server: Server; origin: string }> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      handler(req, new URL(req.url ?? '/', 'http://placeholder.local'), res);
    });
    server.listen(0, '127.0.0.1', () => {
      servers.push(server);
      const addr = server.address() as AddressInfo;
      resolve({ server, origin: `http://127.0.0.1:${addr.port}` });
    });
  });
}

async function closeAll(): Promise<void> {
  await Promise.all(
    servers.splice(0).map(
      (s) => new Promise<void>((resolve) => s.close(() => resolve()))
    )
  );
}

/** 收集请求的 server(记录 Host header / path / method / header 名集合 / body) */
interface SeenRequest {
  host: string | undefined;
  path: string;
  method: string | undefined;
  headerNames: string[];
  body: string;
}

function recordingServer(responses: Array<{ status: number; body?: string; location?: string }>) {
  const seen: SeenRequest[] = [];
  const promise = startLocalServer((req, url, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      seen.push({
        host: req.headers.host,
        path: url.pathname,
        method: req.method,
        headerNames: Object.keys(req.headers),
        body: Buffer.concat(chunks).toString('utf8'),
      });
      const next = responses[Math.min(seen.length - 1, responses.length - 1)];
      if (next.location) res.writeHead(next.status, { location: next.location });
      else res.writeHead(next.status, { 'content-type': 'application/json' });
      res.end(next.body ?? '{"ok":true}');
    });
  });
  return { promise, seen };
}

afterEach(closeAll);

// ============================================
// validateUrlSafe:返回 pinned
// ============================================
describe('validateUrlSafe 返回校验过的 hostname + pinned IP', () => {
  it('域名解析通过时返回首条地址作为 pin', async () => {
    const resolver: DnsResolver = vi.fn().mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
    ]);
    const r = await validateUrlSafe('https://api.example.com/v1', { resolver });
    expect(r.safe).toBe(true);
    expect(r.hostname).toBe('api.example.com');
    expect(r.pinned).toEqual({ address: '93.184.216.34', family: 4 });
  });

  it('多公网地址时确定性取第一条', async () => {
    const resolver: DnsResolver = vi
      .fn()
      .mockResolvedValue([
        { address: '93.184.216.34', family: 4 },
        { address: '1.1.1.1', family: 4 },
      ]);
    const r = await validateUrlSafe('https://multi.example.com', { resolver });
    expect(r.pinned?.address).toBe('93.184.216.34');
  });

  it('多地址任一私有即拒绝(不产生 pin)', async () => {
    const resolver: DnsResolver = vi
      .fn()
      .mockResolvedValue([
        { address: '93.184.216.34', family: 4 },
        { address: '192.168.1.1', family: 4 },
      ]);
    const r = await validateUrlSafe('https://mixed.example.com', { resolver });
    expect(r.safe).toBe(false);
    expect(r.pinned).toBeUndefined();
  });

  it('IPv6 解析结果 pin family 6', async () => {
    const resolver: DnsResolver = vi
      .fn()
      .mockResolvedValue([{ address: '2606:4700:4700::1111', family: 6 }]);
    const r = await validateUrlSafe('https://v6.example.com', { resolver });
    expect(r.safe).toBe(true);
    expect(r.pinned).toEqual({ address: '2606:4700:4700::1111', family: 6 });
  });

  it('公网 IP 字面量 pin 到字面量本身', async () => {
    const r = await validateUrlSafe('http://8.8.8.8');
    expect(r.safe).toBe(true);
    expect(r.pinned?.address).toBe('8.8.8.8');
  });

  it('DNS 解析失败仍 fail-open 放行(入库前校验语义),pinned 为 null', async () => {
    const resolver: DnsResolver = vi.fn().mockRejectedValue(new Error('ENOTFOUND'));
    const r = await validateUrlSafe('https://gone.example.com', { resolver });
    expect(r.safe).toBe(true);
    expect(r.pinned).toBeNull();
  });
});

// ============================================
// pinned lookup:冻结解析结果
// ============================================
describe('createPinnedLookup — DNS rebinding 根治点', () => {
  it('resolver 二次解析返回 127.0.0.1 时,lookup 仍返回首次 pin 的公网地址', async () => {
    // 攻击场景:校验时解析公网,连接时(攻击者切 DNS)解析 127.0.0.1
    const resolver = vi.fn<DnsResolver>();
    resolver.mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }]);
    resolver.mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }]);

    const r = await validateUrlSafe('https://evil.example.com', { resolver });
    expect(r.safe).toBe(true);

    // 出口连接用的 lookup 不再查 resolver —— 只吐校验时的 pin
    const lookup = createPinnedLookup('evil.example.com', r.pinned!);
    await new Promise<void>((resolve) => {
      lookup('evil.example.com', {}, (_err, address, family) => {
        expect(address).toBe('93.184.216.34');
        expect(family).toBe(4);
        resolve();
      });
    });
    // rebinding 后的第二次解析(127.0.0.1)从未进入出口路径
    expect(resolver).toHaveBeenCalledTimes(1);
  });

  it('hostname 与校验值不一致时直接拒绝连接', async () => {
    const lookup = createPinnedLookup('good.example.com', {
      address: '93.184.216.34',
      family: 4,
    });
    await new Promise<void>((resolve) => {
      lookup('other.example.com', {}, (err) => {
        expect(err).toBeInstanceOf(Error);
        expect(err?.message).toMatch(/hostname changed during connection/);
        resolve();
      });
    });
  });

  it('IPv6 pin 原样返回 address + family 6', async () => {
    const lookup = createPinnedLookup('v6.example.com', {
      address: '2606:4700:4700::1111',
      family: 6,
    });
    await new Promise<void>((resolve) => {
      lookup('v6.example.com', {}, (_err, address, family) => {
        expect(address).toBe('2606:4700:4700::1111');
        expect(family).toBe(6);
        resolve();
      });
    });
  });
});

// ============================================
// fetchWithPin:本地 server 集成
// ============================================
describe('fetchWithPin — URL 保持原 hostname + redirect 处理', () => {
  const localPin = { hostname: 'host.test', pin: { address: '127.0.0.1', family: 4 } };

  it('连接 pin 到 127.0.0.1,Host header 保持原 hostname(不重写为 IP → SNI/证书校验前提)', async () => {
    const { promise, seen } = recordingServer([{ status: 200, body: '{"ok":true}' }]);
    const { origin } = await promise;
    const port = new URL(origin).port;

    const res = await fetchWithPin(`http://host.test:${port}/x`, {}, localPin);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    // 关键不变量:出口 URL 用原 hostname,服务器看到的 Host 是 host.test:port
    expect(seen[0].host).toBe(`host.test:${port}`);
  });

  it('同 host redirect 逐跳跟随(保持 pin)', async () => {
    const { promise, seen } = recordingServer([
      { status: 302, location: '/final' },
      { status: 200, body: '{"hop":2}' },
    ]);
    const { origin } = await promise;
    const port = new URL(origin).port;

    const res = await fetchWithPin(`http://host.test:${port}/first`, {}, localPin);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ hop: 2 });
    expect(seen.map((s) => s.path)).toEqual(['/first', '/final']);
  });

  it('跨 host redirect 一律拒绝(不允许未校验跨 host 跳转)', async () => {
    const other = recordingServer([{ status: 200 }]);
    const { origin: otherOrigin } = await other.promise;
    const { promise } = recordingServer([
      { status: 302, location: otherOrigin.replace('127.0.0.1', 'other-host.test') },
    ]);
    const { origin } = await promise;
    const port = new URL(origin).port;

    await expect(
      fetchWithPin(`http://host.test:${port}/r`, {}, localPin)
    ).rejects.toThrow(SsrfRejectedError);
  });

  it('redirect 指向私有 IP 字面量同样被拒(跨 host)', async () => {
    const { promise } = recordingServer([
      { status: 302, location: 'http://127.0.0.1:1/inner' },
    ]);
    const { origin } = await promise;
    const port = new URL(origin).port;

    await expect(
      fetchWithPin(`http://host.test:${port}/r`, {}, localPin)
    ).rejects.toThrow(SsrfRejectedError);
  });

  it('pin 的 hostname 与请求 URL hostname 不一致时,连接在 lookup 层被拒', async () => {
    const { promise } = recordingServer([{ status: 200 }]);
    const { origin } = await promise;
    const port = new URL(origin).port;

    // pin 属于 other.test,但 URL 是 host.test → undici 连接前 lookup 即报错
    const wrongPin = { hostname: 'other.test', pin: { address: '127.0.0.1', family: 4 } };
    await expect(
      fetchWithPin(`http://host.test:${port}/x`, {}, wrongPin)
    ).rejects.toThrow();
  });

  it('redirect 超过上限报错', async () => {
    // 每次都 302 到下一跳(同 host)
    const { promise } = recordingServer([{ status: 302, location: '/loop' }]);
    const { origin } = await promise;
    const port = new URL(origin).port;

    await expect(
      fetchWithPin(`http://host.test:${port}/start`, {}, localPin, { maxRedirects: 2 })
    ).rejects.toThrow(/too many redirects/);
  });

  it('跨 host 拒绝路径已 cancel 旧 body,Agent.close() 能返回', async () => {
    const agents: Agent[] = [];
    const { promise } = recordingServer([{ status: 302, location: 'http://other.test/x' }]);
    const { origin } = await promise;
    const port = new URL(origin).port;

    await expect(
      fetchWithPin(`http://host.test:${port}/r`, {}, localPin, { agents })
    ).rejects.toThrow(SsrfRejectedError);

    // 未 cancel 的 body 会占住 socket → close() 永不 resolve;给 3s 兜底超时
    await Promise.race([
      Promise.all(agents.map((a) => a.close())),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Agent.close() 未返回 — redirect body 未 cancel')), 3000)
      ),
    ]);
  }, 10_000);

  it('超限路径同样已 cancel body,Agent.close() 能返回', async () => {
    const agents: Agent[] = [];
    const { promise } = recordingServer([{ status: 302, location: '/loop' }]);
    const { origin } = await promise;
    const port = new URL(origin).port;

    await expect(
      fetchWithPin(`http://host.test:${port}/start`, {}, localPin, {
        maxRedirects: 2,
        agents,
      })
    ).rejects.toThrow(/too many redirects/);

    await Promise.race([
      Promise.all(agents.map((a) => a.close())),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Agent.close() 未返回 — redirect body 未 cancel')), 3000)
      ),
    ]);
  }, 10_000);

  it('redirect scheme 变化(降级/升级)被拒 — 只比 hostname 会漏掉', async () => {
    const { promise } = recordingServer([
      { status: 302, location: `https://host.test/x` }, // hostname 相同,scheme 变了
    ]);
    const { origin } = await promise;
    const port = new URL(origin).port;

    await expect(
      fetchWithPin(`http://host.test:${port}/r`, {}, localPin)
    ).rejects.toThrow(/different origin/);
  });

  it('redirect 端口漂移被拒(同 hostname 不同 port)', async () => {
    const { promise } = recordingServer([
      { status: 302, location: `http://host.test:1/x` },
    ]);
    const { origin } = await promise;
    const port = new URL(origin).port;

    await expect(
      fetchWithPin(`http://host.test:${port}/r`, {}, localPin)
    ).rejects.toThrow(/different origin/);
  });

  it('303 任意方法改写为 GET,body 与 Content-* 头被移除', async () => {
    const { promise, seen } = recordingServer([
      { status: 303, location: '/final' },
      { status: 200, body: '{"ok":true}' },
    ]);
    const { origin } = await promise;
    const port = new URL(origin).port;

    const res = await fetchWithPin(
      `http://host.test:${port}/first`,
      {
        method: 'POST',
        body: '{"a":1}',
        headers: {
          'content-type': 'application/json',
          'content-length': '7',
          'x-keep': '1',
        },
      },
      localPin
    );
    expect(res.status).toBe(200);
    expect(seen[1].method).toBe('GET');
    expect(seen[1].body).toBe('');
    expect(seen[1].headerNames.some((h) => h.startsWith('content-'))).toBe(false);
    expect(seen[1].headerNames).toContain('x-keep');
  });

  it('302 + POST 改写为 GET(fetch 规范)', async () => {
    const { promise, seen } = recordingServer([
      { status: 302, location: '/final' },
      { status: 200 },
    ]);
    const { origin } = await promise;
    const port = new URL(origin).port;

    const res = await fetchWithPin(
      `http://host.test:${port}/first`,
      { method: 'POST', body: 'x' },
      localPin
    );
    expect(res.status).toBe(200);
    expect(seen[1].method).toBe('GET');
    expect(seen[1].body).toBe('');
  });

  it('301 非 POST 方法不改写(PUT 保持 PUT)', async () => {
    const { promise, seen } = recordingServer([
      { status: 301, location: '/final' },
      { status: 200 },
    ]);
    const { origin } = await promise;
    const port = new URL(origin).port;

    const res = await fetchWithPin(
      `http://host.test:${port}/first`,
      { method: 'PUT', body: 'x' },
      localPin
    );
    expect(res.status).toBe(200);
    expect(seen[1].method).toBe('PUT');
    expect(seen[1].body).toBe('x');
  });

  it('307 保持方法与 body(语义转发)', async () => {
    const { promise, seen } = recordingServer([
      { status: 307, location: '/final' },
      { status: 200 },
    ]);
    const { origin } = await promise;
    const port = new URL(origin).port;

    const res = await fetchWithPin(
      `http://host.test:${port}/first`,
      {
        method: 'POST',
        body: '{"keep":true}',
        headers: { 'content-type': 'application/json' },
      },
      localPin
    );
    expect(res.status).toBe(200);
    expect(seen[1].method).toBe('POST');
    expect(seen[1].body).toBe('{"keep":true}');
    expect(seen[1].headerNames).toContain('content-type');
  });
});

// ============================================
// createPinnedFetch:出口 fail-closed
// ============================================
describe('createPinnedFetch — 出口侧 fail-closed', () => {
  it('校验不通过(解析到私有段)→ SsrfRejectedError', async () => {
    const resolver: DnsResolver = vi.fn().mockResolvedValue([
      { address: '10.0.0.5', family: 4 },
    ]);
    const pinned = createPinnedFetch({ resolver });
    try {
      await expect(pinned.fetch('https://evil.example.com/v1')).rejects.toThrow(
        SsrfRejectedError
      );
    } finally {
      await pinned.close();
    }
  });

  it('DNS 解析失败(validateUrlSafe fail-open)→ 出口拒绝(fail-closed)', async () => {
    const resolver: DnsResolver = vi.fn().mockRejectedValue(new Error('ENOTFOUND'));
    const pinned = createPinnedFetch({ resolver });
    try {
      await expect(pinned.fetch('https://gone.example.com/v1')).rejects.toThrow(
        /refusing outbound request/
      );
    } finally {
      await pinned.close();
    }
  });

  it('同一 pinned fetch 打不同 hostname → 拒绝', async () => {
    const resolver: DnsResolver = vi.fn().mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
    ]);
    const pinned = createPinnedFetch({ resolver });
    try {
      // 首次请求用预 abort 的 signal:pin 已记录,但不发起真实外网连接
      await pinned
        .fetch('https://host-a.example.com/v1', { signal: AbortSignal.abort() })
        .catch(() => undefined);
      await expect(pinned.fetch('https://host-b.example.com/v1')).rejects.toThrow(
        SsrfRejectedError
      );
    } finally {
      await pinned.close();
    }
  });
});
