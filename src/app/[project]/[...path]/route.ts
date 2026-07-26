/**
 * Mock 服务路由
 * 处理所有 /mock/[project]/[...path] 请求
 * 支持所有 HTTP 方法
 */

import { NextRequest, NextResponse, after } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { responses, requests } from '@/lib/schema';
import type { Endpoint, HttpMethod } from '@/lib/schema';
import { eq, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { isBodyTooLarge, readBodyWithLimit } from '@/lib/body-size-limit';
import { rateLimit } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/client-ip';
import { getCachedProject } from '@/lib/project-cache';
import { getCachedEndpointsByMethod } from '@/lib/endpoint-cache';
import { mockRequestsTotal, mockRequestDuration, rateLimitRejectedTotal } from '@/lib/metrics';
import { selectResponse, serializeMockResponse } from '@/lib/mock-response-selector';

// Mock 服务限流：100 req/min/IP
const MOCK_RATE_LIMIT = 100;

// ============================================
// 敏感信息脱敏
// ============================================
function sanitizeHeaders(headers: Headers): Record<string, string> {
  const sanitized: Record<string, string> = {};
  const sensitiveHeaders = ['authorization', 'cookie', 'set-cookie', 'x-api-key'];

  headers.forEach((value, key) => {
    const lowerKey = key.toLowerCase();
    if (sensitiveHeaders.includes(lowerKey)) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = value;
    }
  });

  return sanitized;
}

// ============================================
// P2-38: HTTP 响应头值 Latin-1 安全化
// ============================================
// undici/Next 的 Headers 实现要求 header value 为 Latin-1(0x00–0xFF),
// 任何超出范围的字符(如中文 `\u4e2d`、emoji)会触发 `TypeError: Invalid value`
// 未捕获 → 裸 500。mock 端点 path 含中文(`X-Mock-Endpoint: /用户/list`)或
// 用户自定义响应头含中文时即触发。这里在构造 headers 对象时统一做安全处理。

/**
 * 把任意字符串安全化为 Latin-1 兼容的 header value。
 * 超出 Latin-1(>0xFF)的码点替换为 `?`,保留 ASCII 与 Latin-1 补充字符。
 * 选择 `?` 而非丢弃/编码:HTTP 头值本就不应承载二进制/多字节文本,`?` 是
 * 最低惊讶的可读占位符(与浏览器渲染非法字符的行为一致)。
 *
 * 单独导出便于单测覆盖。非 header 值场景(如 X-Mock-Endpoint 的 path)用
 * `encodeHeaderValueAsAscii` 做 percent-encoding,保留可还原语义。
 */
export function sanitizeHeaderValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = typeof value === 'string' ? value : String(value);
  // 替换所有非 Latin-1 码点。charCodeAt 返回 UTF-16 code unit;
  // 对于 BMP 外字符( surrogate pair),高位 surrogate(>0xFFFF 不会出现于单 charCodeAt)
  // 仍会被各自的 code unit 过滤为 `?`,结果仍 Latin-1 安全。
  let out = '';
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    out += code > 0xff ? '?' : str[i];
  }
  return out;
}

/**
 * 用 percent-encoding 把任意字符串编码为纯 ASCII,适合需要可还原语义的头值
 * (如 `X-Mock-Endpoint: <path>`)。`encodeURIComponent` 已把所有非 ASCII 与
 * 部分 ASCII 保留字符编码,输出保证只含 ASCII(Latin-1 子集)。
 */
export function encodeHeaderValueAsAscii(value: string): string {
  return encodeURIComponent(value);
}

/**
 * 构造 Latin-1 安全的响应头对象:对所有 value 应用 sanitizeHeaderValue。
 * 调用方对个别需要可还原语义的头(如 X-Mock-Endpoint path)在传入前自行
 * 用 encodeHeaderValueAsAscii 预处理。
 */
function buildSafeHeaders(input: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    out[key] = sanitizeHeaderValue(value);
  }
  return out;
}

// ============================================
// Body 大小限制
// ============================================
function makePayloadTooLarge(): NextResponse {
  return NextResponse.json(
    { error: 'Payload Too Large', message: 'Request body exceeds 1MB limit' },
    { status: 413 }
  );
}

// ============================================
// 异步记录请求
// ============================================
async function recordRequest(
  endpointId: string | null,
  method: string,
  path: string,
  query: Record<string, string>,
  headers: Record<string, string>,
  body: unknown,
  responseStatus: number,
  responseTime: number,
  ip: string | null,
  userAgent: string | null
): Promise<void> {
  try {
    await db.insert(requests).values({
      id: nanoid(),
      endpointId,
      method,
      path,
      query: query ? JSON.stringify(query) : null,
      headers: headers ? JSON.stringify(headers) : null,
      body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null,
      responseStatus,
      responseTime,
      ip,
      userAgent,
      createdAt: Date.now(),
    });
  } catch (err) {
    // 静默失败，不影响响应
    logger.error({ err }, 'Failed to record request');
  }
}

// ============================================
// matchRules 匹配评估（已抽到 src/lib/mock-response-selector.ts，供单测覆盖）
// route.ts 仅保留 buildEndpointResponse 的 DB 查询 + 装配；选择逻辑委派 selectResponse
// ============================================

// ============================================
// 构建 endpoint 的 mock 响应
// ============================================
async function buildEndpointResponse(
  endpoint: Endpoint,
  requestQuery: Record<string, string>,
  requestHeaders: Record<string, string>
): Promise<{ endpoint: Endpoint; response: { statusCode: number; contentType: string; headers: Record<string, string>; body: unknown }; delay: number }> {
  // 查找 responses 表（按 priority desc；P2-13 已知次级键缺失，本路由暂不改）
  const responseList = await db
    .select()
    .from(responses)
    .where(eq(responses.endpointId, endpoint.id))
    .orderBy(desc(responses.priority));

  // 选择逻辑委派纯函数 selectResponse（P1-2/P1-3 抽离 + P1-3 修复 defaultResp 优先）。
  // 语义保持：matched（规则命中）> 端点级 responseBody > responses fallback > 空 200。
  // 选择内部 P1-3 修正：fallback 内 isDefault 优先于非默认无规则响应（不影响 matched 优先级）。
  const sel = selectResponse(
    {
      responseBody: endpoint.responseBody,
      statusCode: endpoint.statusCode,
      contentType: endpoint.contentType,
      delayMs: endpoint.delayMs,
    },
    responseList.map((r) => ({
      statusCode: r.statusCode,
      contentType: r.contentType,
      headers: r.headers,
      body: r.body,
      isDefault: r.isDefault,
      priority: r.priority,
      matchRules: r.matchRules,
    })),
    requestQuery,
    requestHeaders,
  );

  return {
    endpoint,
    response: {
      statusCode: sel.statusCode,
      contentType: sel.contentType,
      headers: sel.headers,
      body: sel.body,
    },
    delay: sel.delay,
  };
}

// ============================================
// Mock 路由匹配
// ============================================
async function findEndpoint(
  projectSlug: string,
  method: HttpMethod,
  requestPath: string,
  requestQuery: Record<string, string>,
  requestHeaders: Record<string, string>
): Promise<{ endpoint: Endpoint; response: { statusCode: number; contentType: string; headers: Record<string, string>; body: unknown }; delay: number } | null> {
  // Slug → project 缓存（TTL 60s，mock 热路径减一次 DB roundtrip）
  const project = await getCachedProject(projectSlug);
  if (!project) return null;
  if (!project.isActive) return null;

  // 一次性取该 project+method 全部 endpoints（带 TTL 缓存），精确匹配 + 参数
  // 模糊匹配共用同一份数据。/users/:id 等参数路径不再每次请求全表扫。
  const allEndpointsList = await getCachedEndpointsByMethod(project.id, method);

  // 精确匹配
  const exactMatch = allEndpointsList.find((e) => e.path === requestPath);
  if (exactMatch) {
    if (!exactMatch.isActive) return null;
    return buildEndpointResponse(exactMatch, requestQuery, requestHeaders);
  }

  // 模糊匹配（路径参数）

  const requestParts = requestPath.split('/');

  for (const endpoint of allEndpointsList) {
    if (!endpoint.isActive) continue;
    const routeParts = endpoint.path.split('/');
    if (routeParts.length !== requestParts.length) continue;

    const isMatch = routeParts.every(
      (part, i) => part.startsWith(':') || part === requestParts[i]
    );

    if (isMatch) {
      return buildEndpointResponse(endpoint, requestQuery, requestHeaders);
    }
  }

  return null;
}

// ============================================
// CORS 响应头
// ============================================
function getCorsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

// ============================================
// 通用处理函数
// ============================================
async function handleMock(request: NextRequest, projectSlug: string, path: string) {
  const method = request.method as HttpMethod;
  const requestPath = '/' + path;
  const startTime = Date.now();

  // 获取请求信息
  const url = new URL(request.url);
  const query: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    query[key] = value;
  });

  // 获取 IP 和 User-Agent（防伪造：取 X-Real-IP 或 X-Forwarded-For 链尾）
  const ip = getClientIp(request.headers);
  const userAgent = request.headers.get('user-agent');

  // 限流：100 req/min/IP
  const clientIp = ip || 'unknown';
  const rl = await rateLimit(`mock:${clientIp}`, MOCK_RATE_LIMIT, 60, 'mock');
  if (!rl.allowed) {
    rateLimitRejectedTotal.inc({ kind: 'mock' });
    return NextResponse.json(
      { error: 'Too Many Requests', message: 'Rate limit exceeded. Try again later.' },
      {
        status: 429,
        headers: {
          'X-RateLimit-Limit': String(MOCK_RATE_LIMIT),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil(rl.resetAt / 1000)),
          ...getCorsHeaders(),
        },
      }
    );
  }

  // Body 大小守卫（fast-path）：检查 content-length，避免全量读取
  const declaredContentLength = parseInt(request.headers.get('content-length') ?? '', 10);
  if (!Number.isNaN(declaredContentLength) && isBodyTooLarge(declaredContentLength)) {
    return makePayloadTooLarge();
  }

  // 获取请求体（用于记录）+ 大小守卫（覆盖所有 content-type）
  // 流式守卫：通过 `request.clone()` 读取 clone 的 body，
  // 原 request 不被消费，下游（如需 request.json()/text()）仍可用。
  // 流式读取在累计字节超 MAX_BODY_BYTES 时立即 cancel + 413，
  // 堵住 `Transfer-Encoding: chunked`（无 content-length）绕过 fast-path 的内存放大。
  let requestBody: unknown = null;
  const contentType = request.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    try {
      const cloned = request.clone();
      // cloned.body 在 GET/HEAD 等无 body 场景可能为 null；非 JSON 分支已隔离，此处 JSON 必有 body
      if (cloned.body) {
        const { tooLarge, text: rawText } = await readBodyWithLimit(cloned.body);
        if (tooLarge) {
          return makePayloadTooLarge();
        }
        requestBody = JSON.parse(rawText);
      }
    } catch {
      // 忽略解析错误
    }
  } else if (method !== 'GET' && method !== 'HEAD' && declaredContentLength > 0) {
    // 非 JSON 请求：content-length 超标时拒绝（不全量读 body）。
    // fast-path(:316) 已对 declaredContentLength 做过同样判断，此处不再重复，
    // 仅保留分支用于未来按需 stream 非 JSON body 的扩展位。
  }

  // 构建请求 headers map（小写 key）
  const requestHeaders: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    requestHeaders[key] = value;
  });

  // 查找匹配的 Mock
  const mock = await findEndpoint(projectSlug, method, requestPath, query, requestHeaders);

  if (!mock) {
    // 记录未找到的请求
    after(() => recordRequest(
      null,
      method,
      requestPath,
      query,
      sanitizeHeaders(request.headers),
      requestBody,
      404,
      Date.now() - startTime,
      ip,
      userAgent
    ));

    return NextResponse.json(
      {
        error: 'Not Found',
        message: `No mock found for ${method} ${requestPath} in project ${projectSlug}`,
      },
      {
        status: 404,
        headers: getCorsHeaders(),
      }
    );
  }

  // 模拟延迟
  if (mock.delay > 0) {
    await new Promise((resolve) => setTimeout(resolve, mock.delay));
  }

  // 构建 CORS 响应头
  const corsHeaders = getCorsHeaders();

  // 构建响应头
  // P2-38:`X-Mock-Endpoint: <path>` 中 path 可能含中文等非 Latin-1 字符,
  // 直接设置会让 undici Headers 抛 TypeError → 裸 500。这里对 path 做
  // percent-encoding(纯 ASCII,可还原),用户自定义头值则在最后统一 sanitize。
  const headers: Record<string, string> = {
    ...corsHeaders,
    'X-Mock-Server': 'ApiMock',
    'X-Mock-Project': projectSlug,
    'X-Mock-Endpoint': encodeHeaderValueAsAscii(mock.endpoint.path),
  };

  // 合并自定义响应头(过滤 CORS 头,防止覆盖安全策略)
  if (mock.response.headers) {
    for (const [key, value] of Object.entries(mock.response.headers)) {
      if (!key.toLowerCase().startsWith('access-control-')) {
        headers[key] = value;
      }
    }
  }

  // 处理 content-type
  const responseContentType = mock.response.contentType || 'application/json';
  headers['Content-Type'] = responseContentType;

  // P2-38:对所有头值做 Latin-1 安全化(用户自定义头可能含中文等非法字符)。
  // X-Mock-Endpoint 已 percent-encode,sanitizeHeaderValue 对纯 ASCII 是 no-op。
  const safeHeaders = buildSafeHeaders(headers);

  // 返回 Mock 数据
  const body = mock.response.body;
  const responseTime = Date.now() - startTime;
  const responseStatus = mock.response.statusCode;

  // metrics（不带 project label——slug 无限增长会基数爆炸）
  mockRequestsTotal.inc({ method, status: String(responseStatus) });
  mockRequestDuration.observe({ method }, responseTime);

  // 异步记录请求（响应返回后执行，serverless 下保证完成）
  after(() => recordRequest(
    mock.endpoint.id,
    method,
    requestPath,
    query,
    sanitizeHeaders(request.headers),
    requestBody,
    responseStatus,
    responseTime,
    ip,
    userAgent
  ));

  // 序列化决策(P1-10):纯函数,与响应构建逻辑对齐,便于单测覆盖。
  //   - 非 JSON content-type 或 body 为字符串 → text(原始文本,不经 JSON 序列化)
  //   - 否则 → json(NextResponse.json)
  // P1-10 关键:body 为字符串(如 error-scenarios 的 malformed-json 预设
  // `'{invalid json response}'`)时走 text,避免 NextResponse.json 把字符串再序列化成
  // 合法 JSON 字符串导致客户端永远收不到 malformed JSON。
  // 与 P2-39(contentType 精确比较)无冲突:本函数不改 contentType 比较逻辑。
  const serialized = serializeMockResponse(body, responseContentType);
  if (serialized.kind === 'text') {
    return new NextResponse(serialized.text, {
      status: responseStatus,
      headers: safeHeaders,
    });
  }
  return NextResponse.json(serialized.value, {
    status: responseStatus,
    headers: safeHeaders,
  });
}

// ============================================
// HTTP 方法处理
// ============================================
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ project: string; path: string[] }> }
) {
  const { project, path } = await params;
  return handleMock(request, project, path.join('/'));
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ project: string; path: string[] }> }
) {
  const { project, path } = await params;
  return handleMock(request, project, path.join('/'));
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ project: string; path: string[] }> }
) {
  const { project, path } = await params;
  return handleMock(request, project, path.join('/'));
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ project: string; path: string[] }> }
) {
  const { project, path } = await params;
  return handleMock(request, project, path.join('/'));
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ project: string; path: string[] }> }
) {
  const { project, path } = await params;
  return handleMock(request, project, path.join('/'));
}

export async function HEAD(
  request: NextRequest,
  { params }: { params: Promise<{ project: string; path: string[] }> }
) {
  const { project, path } = await params;
  return handleMock(request, project, path.join('/'));
}

export async function OPTIONS() {
  // OPTIONS 预检请求，直接返回 CORS 头
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(),
  });
}
