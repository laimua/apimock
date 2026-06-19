/**
 * Mock 服务路由
 * 处理所有 /mock/[project]/[...path] 请求
 * 支持所有 HTTP 方法
 */

import { NextRequest, NextResponse, after } from 'next/server';
import { db } from '@/lib/db';
import { projects, endpoints, responses, requests } from '@/lib/schema';
import type { Endpoint, Response, HttpMethod } from '@/lib/schema';
import { eq, and, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { isBodyTooLarge, utf8ByteLength } from '@/lib/body-size-limit';
import { rateLimit } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/client-ip';
import { getCachedProject } from '@/lib/project-cache';

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
    console.error('Failed to record request:', err);
  }
}

// ============================================
// 解析响应体
// ============================================
function parseJsonSafe(raw: string | null | undefined): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

// ============================================
// matchRules 匹配评估
// ============================================
type MatchRules = { query?: Record<string, string>; header?: Record<string, string> };

function parseMatchRules(raw: string | null | undefined): MatchRules {
  if (!raw || raw === '{}' || raw === '') return {};
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null) return parsed;
  } catch { /* ignore */ }
  return {};
}

function hasRules(rules: MatchRules): boolean {
  const qLen = Object.keys(rules.query || {}).length;
  const hLen = Object.keys(rules.header || {}).length;
  return qLen + hLen > 0;
}

function matchRule(
  rules: MatchRules,
  requestQuery: Record<string, string>,
  requestHeaders: Record<string, string>
): boolean {
  if (rules.query) {
    for (const [key, value] of Object.entries(rules.query)) {
      if (requestQuery[key] !== value) return false;
    }
  }
  if (rules.header) {
    const lowerHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(requestHeaders)) {
      lowerHeaders[k.toLowerCase()] = v;
    }
    for (const [key, value] of Object.entries(rules.header)) {
      if (lowerHeaders[key.toLowerCase()] !== value) return false;
    }
  }
  return true;
}

type ResponseSource = { statusCode: number | null; contentType: string | null; headers: string | null; body: string | null } | null;

function toResponseObj(endpoint: Endpoint, resp: ResponseSource): { endpoint: Endpoint; response: { statusCode: number; contentType: string; headers: Record<string, string>; body: unknown }; delay: number } {
  let parsedHeaders: Record<string, string> = {};
  if (resp?.headers) {
    try {
      parsedHeaders = typeof resp.headers === 'string'
        ? JSON.parse(resp.headers)
        : resp.headers;
    } catch {
      parsedHeaders = {};
    }
  }
  return {
    endpoint,
    response: {
      statusCode: resp?.statusCode || 200,
      contentType: resp?.contentType || 'application/json',
      headers: parsedHeaders,
      body: parseJsonSafe(resp?.body),
    },
    delay: endpoint.delayMs || 0,
  };
}

// ============================================
// 构建 endpoint 的 mock 响应
// ============================================
async function buildEndpointResponse(
  endpoint: Endpoint,
  requestQuery: Record<string, string>,
  requestHeaders: Record<string, string>
): Promise<{ endpoint: Endpoint; response: { statusCode: number; contentType: string; headers: Record<string, string>; body: unknown }; delay: number }> {
  // 查找 responses 表（规则匹配优先于端点级 responseBody）
  const responseList = await db
    .select()
    .from(responses)
    .where(eq(responses.endpointId, endpoint.id))
    .orderBy(desc(responses.priority));

  // 分组：规则匹配 > 默认 > 无规则
  let matched: Response | null = null;
  let fallback: Response | null = null;

  for (const resp of responseList) {
    const rules = parseMatchRules(resp.matchRules);

    if (hasRules(rules)) {
      if (!matched && matchRule(rules, requestQuery, requestHeaders)) {
        matched = resp;
      }
    } else if (resp.isDefault) {
      if (!fallback) fallback = resp;
    } else if (!fallback) {
      fallback = resp;
    }
  }

  if (matched) {
    return toResponseObj(endpoint, matched);
  }

  // 端点级 responseBody 作 fallback（responses 无匹配或为空时使用）
  if (endpoint.responseBody !== null && endpoint.responseBody !== undefined) {
    return toResponseObj(endpoint, {
      statusCode: endpoint.statusCode,
      contentType: endpoint.contentType,
      headers: '{}',
      body: endpoint.responseBody,
    });
  }

  return toResponseObj(endpoint, fallback);
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

  // 精确匹配
  const exactMatchList = await db
    .select()
    .from(endpoints)
    .where(
      and(
        eq(endpoints.projectId, project.id),
        eq(endpoints.path, requestPath),
        eq(endpoints.method, method)
      )
    );

  if (exactMatchList.length > 0) {
    const endpoint = exactMatchList[0];
    if (!endpoint.isActive) return null;
    return buildEndpointResponse(endpoint, requestQuery, requestHeaders);
  }

  // 模糊匹配（路径参数）
  const allEndpointsList = await db
    .select()
    .from(endpoints)
    .where(and(eq(endpoints.projectId, project.id), eq(endpoints.method, method)));

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
  const rl = rateLimit(`mock:${clientIp}`, MOCK_RATE_LIMIT);
  if (!rl.allowed) {
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
  let requestBody: unknown = null;
  const contentType = request.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    try {
      const cloned = request.clone();
      const rawText = await cloned.text();
      if (isBodyTooLarge(utf8ByteLength(rawText))) {
        return makePayloadTooLarge();
      }
      requestBody = JSON.parse(rawText);
    } catch {
      // 忽略解析错误
    }
  } else if (method !== 'GET' && method !== 'HEAD' && declaredContentLength > 0) {
    // 非 JSON 请求：仅当 content-length 超标时拒绝（不全量读 body）
    if (isBodyTooLarge(declaredContentLength)) {
      return makePayloadTooLarge();
    }
    // 不读取 body（不必要且浪费内存）；如需记录可后续按需 stream
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
  const headers: Record<string, string> = {
    ...corsHeaders,
    'X-Mock-Server': 'ApiMock',
    'X-Mock-Project': projectSlug,
    'X-Mock-Endpoint': mock.endpoint.path,
  };

  // 合并自定义响应头（过滤 CORS 头，防止覆盖安全策略）
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

  // 返回 Mock 数据
  const body = mock.response.body;
  const responseTime = Date.now() - startTime;
  const responseStatus = mock.response.statusCode;

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

  // 对于非 JSON 内容类型，返回原始文本
  if (responseContentType !== 'application/json') {
    const bodyText = body !== null && body !== undefined
      ? (typeof body === 'string' ? body : String(body))
      : '';
    return new NextResponse(bodyText, {
      status: responseStatus,
      headers,
    });
  }

  // 对于 JSON 类型，使用 NextResponse.json
  return NextResponse.json(body ?? {}, {
    status: responseStatus,
    headers,
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
