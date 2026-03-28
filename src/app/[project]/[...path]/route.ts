/**
 * Mock 服务路由
 * 处理所有 /mock/[project]/[...path] 请求
 * 支持所有 HTTP 方法
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projects, endpoints, responses, requests } from '@/lib/schema';
import { eq, and, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';

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
// 异步记录请求
// ============================================
async function recordRequest(
  endpointId: string,
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
// Mock 路由匹配
// ============================================
async function findEndpoint(
  projectSlug: string,
  method: string,
  requestPath: string
): Promise<{ endpoint: any; response: any; delay: number } | null> {
  // 根据 slug 查找项目
  const projectList = await db
    .select()
    .from(projects)
    .where(eq(projects.slug, projectSlug));

  if (projectList.length === 0) {
    return null;
  }

  const project = projectList[0];

  // 查找精确匹配的端点
  const exactMatchList = await db
    .select()
    .from(endpoints)
    .where(
      and(
        eq(endpoints.projectId, project.id),
        eq(endpoints.path, requestPath),
        eq(endpoints.method, method as any)
      )
    );

  if (exactMatchList.length > 0) {
    const endpoint = exactMatchList[0];
    if (!endpoint.isActive) {
      return null;
    }

    // 优先使用端点级别的响应配置
    if (endpoint.responseBody !== null && endpoint.responseBody !== undefined) {
      let parsedBody: unknown = null;
      try {
        parsedBody = JSON.parse(endpoint.responseBody);
      } catch {
        parsedBody = endpoint.responseBody;
      }

      return {
        endpoint,
        response: {
          statusCode: endpoint.statusCode || 200,
          contentType: endpoint.contentType || 'application/json',
          headers: {},
          body: parsedBody,
        },
        delay: endpoint.delayMs || 0,
      };
    }

    // 如果端点没有配置响应，则查找 responses 表
    const responseList = await db
      .select()
      .from(responses)
      .where(eq(responses.endpointId, endpoint.id))
      .orderBy(desc(responses.isDefault), desc(responses.priority));

    if (responseList.length > 0) {
      const resp = responseList[0];
      // 解析 headers
      let parsedHeaders: Record<string, string> = {};
      if (resp.headers) {
        try {
          parsedHeaders = typeof resp.headers === 'string'
            ? JSON.parse(resp.headers)
            : resp.headers;
        } catch {
          parsedHeaders = {};
        }
      }

      // 解析 body
      let parsedBody: unknown = null;
      if (resp.body) {
        try {
          parsedBody = JSON.parse(resp.body);
        } catch {
          parsedBody = resp.body;
        }
      }

      return {
        endpoint,
        response: {
          statusCode: resp.statusCode || 200,
          contentType: resp.contentType || 'application/json',
          headers: parsedHeaders,
          body: parsedBody,
        },
        delay: endpoint.delayMs || 0,
      };
    }

    // 默认响应
    return {
      endpoint,
      response: {
        statusCode: 200,
        contentType: 'application/json',
        headers: {},
        body: null,
      },
      delay: endpoint.delayMs || 0,
    };
  }

  // 模糊匹配（处理路径参数）
  const allEndpointsList = await db
    .select()
    .from(endpoints)
    .where(and(eq(endpoints.projectId, project.id), eq(endpoints.method, method as any)));

  const requestParts = requestPath.split('/');

  for (const endpoint of allEndpointsList) {
    if (!endpoint.isActive) continue;

    const routeParts = endpoint.path.split('/');

    if (routeParts.length !== requestParts.length) continue;

    let match = true;
    for (let i = 0; i < routeParts.length; i++) {
      if (routeParts[i].startsWith(':')) continue; // 参数匹配
      if (routeParts[i] !== requestParts[i]) {
        match = false;
        break;
      }
    }

    if (match) {
      // 优先使用端点级别的响应配置
      if (endpoint.responseBody !== null && endpoint.responseBody !== undefined) {
        let parsedBody: unknown = null;
        try {
          parsedBody = JSON.parse(endpoint.responseBody);
        } catch {
          parsedBody = endpoint.responseBody;
        }

        return {
          endpoint,
          response: {
            statusCode: endpoint.statusCode || 200,
            contentType: endpoint.contentType || 'application/json',
            headers: {},
            body: parsedBody,
          },
          delay: endpoint.delayMs || 0,
        };
      }

      // 如果端点没有配置响应，则查找 responses 表
      const responseList = await db
        .select()
        .from(responses)
        .where(eq(responses.endpointId, endpoint.id))
        .orderBy(desc(responses.isDefault), desc(responses.priority));

      if (responseList.length > 0) {
        const resp = responseList[0];
        // 解析 headers
        let parsedHeaders: Record<string, string> = {};
        if (resp.headers) {
          try {
            parsedHeaders = typeof resp.headers === 'string'
              ? JSON.parse(resp.headers)
              : resp.headers;
          } catch {
            parsedHeaders = {};
          }
        }

        // 解析 body
        let parsedBody: unknown = null;
        if (resp.body) {
          try {
            parsedBody = JSON.parse(resp.body);
          } catch {
            parsedBody = resp.body;
          }
        }

        return {
          endpoint,
          response: {
            statusCode: resp.statusCode || 200,
            contentType: resp.contentType || 'application/json',
            headers: parsedHeaders,
            body: parsedBody,
          },
          delay: endpoint.delayMs || 0,
        };
      }

      // 默认响应
      return {
        endpoint,
        response: {
          statusCode: 200,
          contentType: 'application/json',
          headers: {},
          body: null,
        },
        delay: endpoint.delayMs || 0,
      };
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
  const method = request.method;
  const requestPath = '/' + path;
  const startTime = Date.now();

  // 获取请求信息
  const url = new URL(request.url);
  const query: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    query[key] = value;
  });

  // 获取 IP 和 User-Agent
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim()
    || request.headers.get('x-real-ip')
    || null;
  const userAgent = request.headers.get('user-agent');

  // 获取请求体（用于记录）
  let requestBody: unknown = null;
  const contentType = request.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    try {
      requestBody = await request.clone().json();
    } catch {
      // 忽略解析错误
    }
  }

  // 查找匹配的 Mock
  const mock = await findEndpoint(projectSlug, method, requestPath);

  if (!mock) {
    // 记录未找到的请求
    void recordRequest(
      '',
      method,
      requestPath,
      query,
      sanitizeHeaders(request.headers),
      requestBody,
      404,
      Date.now() - startTime,
      ip,
      userAgent
    );

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

  // 合并自定义响应头
  if (mock.response.headers) {
    Object.assign(headers, mock.response.headers);
  }

  // 处理 content-type
  const responseContentType = mock.response.contentType || 'application/json';
  headers['Content-Type'] = responseContentType;

  // 返回 Mock 数据
  const body = mock.response.body;
  const responseTime = Date.now() - startTime;
  const responseStatus = mock.response.statusCode;

  // 异步记录请求（不阻塞响应）
  void recordRequest(
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
  );

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

export async function OPTIONS(
  request: NextRequest,
  { params }: { params: Promise<{ project: string; path: string[] }> }
) {
  // OPTIONS 预检请求，直接返回 CORS 头
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(),
  });
}
