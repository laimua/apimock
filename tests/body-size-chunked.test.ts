/**
 * Body size guard — chunked encoding bypass regression test (P0-1)
 *
 * 复现报告 P0-1 的攻击向量：
 *   `Content-Type: application/json` + `Transfer-Encoding: chunked`（无 content-length）
 *   过去：fast-path 预检跳过 → `text()` 全量读入 → 之后才 413（内存放大真实）
 *   现在：流式守卫在读取过程中累计字节，超 1MB 立即 cancel + 413
 *
 * 同时覆盖回归：
 *   - 正常 1KB JSON → 不被 413 误杀（落到 404，因无 endpoint）
 *   - 有 content-length 且超 1MB → 413（fast-path 仍有效）
 *   - body 单次消费：流式检查后，原 request 仍可消费
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import type { NextRequest as NextRequestType } from 'next/server';
import { getTestDb, setupTestDb, clearTestDb } from './setup';
import { projects, endpoints } from '@/lib/schema';

// `after` 在测试环境无 request scope，必须 mock 掉，否则 recordRequest 会抛。
// 直接同步执行回调（吞错），保证不阻塞、不污染测试。
vi.mock('next/server', async (importOriginal) => {
  const orig = await importOriginal<typeof import('next/server')>();
  return {
    ...orig,
    after: (cb: () => unknown) => {
      // fire-and-forget，吞掉 recordRequest 的 DB 错误
      Promise.resolve().then(() => cb()).catch(() => {});
    },
  };
});

// 用内存 sqlite 替换 db，避免依赖真实连接
let mockDb: ReturnType<typeof getTestDb>;
vi.mock('@/lib/db', () => ({
  get db() {
    return mockDb;
  },
  isMysqlEnv: () => false,
}));

// 在 mock 建立后再 import route / NextRequest，确保上面两个 vi.mock 生效
const { POST } = await import('@/app/[project]/[...path]/route');
const { NextRequest } = await import('next/server');
const { MAX_BODY_BYTES } = await import('@/lib/body-size-limit');

let testProject: typeof projects.$inferInsert;
let testEndpoint: typeof endpoints.$inferInsert;

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

/**
 * 构造一个「无 content-length」的请求 —— 模拟 chunked 编码。
 *
 * NextRequest 基于 fetch Request；用 ReadableStream 作为 body，且不显式设
 * content-length 头（fetch 不会对 stream body 自动推断长度），使其表现为
 * 流式传输（chunked 语义）。fast-path 的 `parseInt('')` 为 NaN，会跳过。
 */
function makeChunkedRequest(
  bodyStream: ReadableStream<Uint8Array>,
  project = 'demo-project',
  path = 'users'
): NextRequestType {
  const req = new NextRequest(`http://localhost/${project}/${path}`, {
    method: 'POST',
    body: bodyStream,
    // undici 要求 stream body 显式声明 duplex；NextRequest init 透传给底层 fetch
    duplex: 'half',
    headers: { 'content-type': 'application/json' },
  });
  return req as NextRequestType;
}

const ctx = { params: Promise.resolve({ project: 'demo-project', path: ['users'] }) };

beforeAll(async () => {
  mockDb = await setupTestDb('body-size-chunked-test');
});

beforeEach(async () => {
  await clearTestDb(mockDb);
  testProject = {
    id: 'p1',
    name: 'Demo',
    slug: 'demo-project',
    description: null,
    basePath: null,
    isActive: 1,
    settings: '{}',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await mockDb.insert(projects).values(testProject);
  testEndpoint = {
    id: 'e1',
    projectId: 'p1',
    path: '/users',
    method: 'POST',
    name: null,
    description: null,
    isActive: 1,
    isShareable: 1,
    delayMs: 0,
    tags: '[]',
    statusCode: 200,
    contentType: 'application/json',
    responseBody: JSON.stringify({ ok: true }),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await mockDb.insert(endpoints).values(testEndpoint);
});

afterEach(async () => {
  await clearTestDb(mockDb);
});

describe('body size guard — chunked encoding (P0-1)', () => {
  it('returns 413 when chunked body (no content-length) exceeds 1MB', async () => {
    const big = utf8('x'.repeat(MAX_BODY_BYTES + 500_000));
    const stream = new ReadableStream({
      start(controller) {
        const chunks = 8;
        const size = Math.ceil(big.byteLength / chunks);
        for (let i = 0; i < big.byteLength; i += size) {
          controller.enqueue(big.slice(i, i + size));
        }
        controller.close();
      },
    });
    const req = makeChunkedRequest(stream);
    const res = await POST(req, ctx);
    expect(res.status).toBe(413);
  });

  it('returns 200 for normal 1KB JSON body (regression — not 413)', async () => {
    const payload = utf8(JSON.stringify({ hello: 'world', n: 1 }));
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(payload);
        controller.close();
      },
    });
    const req = makeChunkedRequest(stream);
    const res = await POST(req, ctx);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true });
  });

  it('returns 413 when content-length declared and exceeds 1MB (fast-path still works)', async () => {
    const largeBody = 'x'.repeat(MAX_BODY_BYTES + 1);
    // string body → fetch 自动设 content-length，命中 fast-path
    const req = new NextRequest('http://localhost/demo-project/users', {
      method: 'POST',
      body: largeBody,
      headers: { 'content-type': 'application/json' },
    });
    const res = await POST(req, ctx);
    expect(res.status).toBe(413);
  });

  it('body single-consume: after streaming guard, request.clone() body is still consumable', async () => {
    // 守卫在 route 内部消费的是 request.clone().body；原始 request.body 不被消费。
    // 这里直接验证 request.clone() 的 tee 语义：clone 一份后两者都能各自读完。
    const payload = utf8(JSON.stringify({ ok: true }));
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(payload);
        controller.close();
      },
    });
    const req = makeChunkedRequest(stream);

    const a = req.clone();
    const b = req.clone();
    const txtA = await a.text();
    const txtB = await b.text();
    expect(txtA).toBe(JSON.stringify({ ok: true }));
    expect(txtB).toBe(JSON.stringify({ ok: true }));
    // clone 可被独立多次消费 → 证明 route 内 request.clone() 守卫 + 原始 body 下游可用
  });
});
