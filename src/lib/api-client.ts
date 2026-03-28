/**
 * API 客户端
 * 封装所有 API 调用，提供类型安全和错误处理
 */

const API_BASE = '/api';

// ============================================
// 类型定义
// ============================================
export interface Project {
  id: string;
  name: string;
  slug: string;
  description?: string;
  basePath?: string;
  isActive: boolean;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// ============================================
// 端点分页响应类型
// ============================================
export interface ListEndpointsResponse {
  items: Endpoint[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Endpoint {
  id: string;
  projectId: string;
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';
  name?: string;
  description?: string;
  isActive: boolean;
  delayMs: number;
  tags: string[];
  statusCode?: number;
  contentType?: string;
  responseBody?: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectDto {
  name: string;
  description?: string;
  basePath?: string;
}

export interface CreateEndpointDto {
  path: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';
  name?: string;
  description?: string;
  delayMs?: number;
  tags?: string[];
  statusCode?: number;
  contentType?: string;
  responseBody?: unknown;
}

export interface UpdateEndpointDto {
  path?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';
  name?: string;
  description?: string;
  delayMs?: number;
  tags?: string[];
  statusCode?: number;
  contentType?: string;
  responseBody?: unknown;
  isActive?: boolean;
}

export interface UpdateProjectDto {
  name?: string;
  description?: string;
  basePath?: string;
  isActive?: boolean;
}

// ============================================
// 请求记录类型
// ============================================
export interface RequestRecord {
  id: string;
  endpointId: string;
  method: string;
  path: string;
  query: Record<string, string> | null;
  headers: Record<string, string> | null;
  body: unknown;
  responseStatus: number;
  responseTime: number;
  ip: string | null;
  userAgent: string | null;
  createdAt: number;
  endpoint?: {
    path: string;
    method: string;
    name?: string;
  } | null;
}

export interface ListRequestsResponse {
  requests: RequestRecord[];
  total: number;
  limit: number;
  offset: number;
}

// ============================================
// 响应规则类型
// ============================================
export interface ResponseRule {
  id: string;
  endpointId: string;
  name: string;
  description?: string;
  statusCode: number;
  contentType: string;
  headers: Record<string, string>;
  body?: unknown;
  matchRules: {
    query?: Record<string, string>;
    header?: Record<string, string>;
  };
  isDefault: boolean;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateResponseRuleDto {
  name: string;
  description?: string;
  statusCode?: number;
  contentType?: string;
  headers?: Record<string, string>;
  body?: unknown;
  matchRules?: {
    query?: Record<string, string>;
    header?: Record<string, string>;
  };
  isDefault?: boolean;
  priority?: number;
}

export interface UpdateResponseRuleDto {
  name?: string;
  description?: string;
  statusCode?: number;
  contentType?: string;
  headers?: Record<string, string>;
  body?: unknown;
  matchRules?: {
    query?: Record<string, string>;
    header?: Record<string, string>;
  };
  isDefault?: boolean;
  priority?: number;
}

// ============================================
// API 错误类
// ============================================
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ============================================
// 基础请求函数
// ============================================
async function request<T>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new ApiError(
      response.status,
      data.error?.code || 'UNKNOWN_ERROR',
      data.error?.message || 'Request failed'
    );
  }

  return data.data;
}

export interface CheckSlugResponse {
  slug: string;
  available: boolean;
}

// ============================================
// 项目 API
// ============================================
export const projectsApi = {
  list: () => request<Project[]>('/projects'),
  checkSlug: (slug: string) =>
    request<CheckSlugResponse>(`/projects/check-slug?slug=${encodeURIComponent(slug)}`),
  create: (data: CreateProjectDto) =>
    request<Project>('/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  get: (id: string) => request<Project>(`/projects/${id}`),
  update: (id: string, data: UpdateProjectDto) =>
    request<Project>(`/projects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    request<void>(`/projects/${id}`, { method: 'DELETE' }),
};

// ============================================
// 端点 API
// ============================================
export const endpointsApi = {
  list: (
    projectId: string,
    options?: {
      page?: number;
      pageSize?: number;
      search?: string;
      method?: string;
      tag?: string;
    }
  ) => {
    const params = new URLSearchParams();
    if (options?.page) params.set('page', options.page.toString());
    if (options?.pageSize) params.set('pageSize', options.pageSize.toString());
    if (options?.search) params.set('search', options.search);
    if (options?.method) params.set('method', options.method);
    if (options?.tag) params.set('tag', options.tag);

    const queryString = params.toString();
    const url = `/projects/${projectId}/endpoints${queryString ? `?${queryString}` : ''}`;

    // 如果有分页参数，返回分页响应类型，否则返回数组类型（向后兼容）
    return request<Endpoint[] | ListEndpointsResponse>(url);
  },
  create: (projectId: string, data: CreateEndpointDto) =>
    request<Endpoint>(`/projects/${projectId}/endpoints`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  get: (projectId: string, id: string) =>
    request<Endpoint>(`/projects/${projectId}/endpoints/${id}`),
  update: (projectId: string, id: string, data: UpdateEndpointDto) =>
    request<Endpoint>(`/projects/${projectId}/endpoints/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  delete: (projectId: string, id: string) =>
    request<void>(`/projects/${projectId}/endpoints/${id}`, {
      method: 'DELETE',
    }),
};

// ============================================
// 响应规则 API
// ============================================
export const responsesApi = {
  list: (projectId: string, endpointId: string) =>
    request<ResponseRule[]>(`/projects/${projectId}/endpoints/${endpointId}/responses`),
  get: (projectId: string, endpointId: string, id: string) =>
    request<ResponseRule>(`/projects/${projectId}/endpoints/${endpointId}/responses/${id}`),
  create: (projectId: string, endpointId: string, data: CreateResponseRuleDto) =>
    request<ResponseRule>(`/projects/${projectId}/endpoints/${endpointId}/responses`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (projectId: string, endpointId: string, id: string, data: UpdateResponseRuleDto) =>
    request<ResponseRule>(`/projects/${projectId}/endpoints/${endpointId}/responses/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  delete: (projectId: string, endpointId: string, id: string) =>
    request<void>(`/projects/${projectId}/endpoints/${endpointId}/responses/${id}`, {
      method: 'DELETE',
    }),
};

// ============================================
// 请求记录 API
// ============================================
export const requestsApi = {
  list: (projectId: string, endpointId: string, limit = 50, offset = 0) =>
    request<ListRequestsResponse>(
      `/projects/${projectId}/endpoints/${endpointId}/requests?limit=${limit}&offset=${offset}`
    ),
  clear: (projectId: string, endpointId: string) =>
    request<void>(`/projects/${projectId}/endpoints/${endpointId}/requests`, {
      method: 'DELETE',
    }),
};

// 项目级请求记录 API
export interface ProjectRequestsOptions {
  page?: number;
  pageSize?: number;
  endpointId?: string;
  startTime?: number;
  endTime?: number;
}

export interface ListProjectRequestsResponse {
  items: RequestRecord[];
  total: number;
  page: number;
  pageSize: number;
}

export const projectRequestsApi = {
  list: (projectId: string, options?: ProjectRequestsOptions) => {
    const params = new URLSearchParams();
    if (options?.page) params.set('page', options.page.toString());
    if (options?.pageSize) params.set('pageSize', options.pageSize.toString());
    if (options?.endpointId) params.set('endpointId', options.endpointId);
    if (options?.startTime) params.set('startTime', options.startTime.toString());
    if (options?.endTime) params.set('endTime', options.endTime.toString());

    const queryString = params.toString();
    const url = `/projects/${projectId}/requests${queryString ? `?${queryString}` : ''}`;

    return request<ListProjectRequestsResponse>(url);
  },
  clear: (projectId: string, endpointId?: string) => {
    const params = new URLSearchParams();
    if (endpointId) params.set('endpointId', endpointId);

    const queryString = params.toString();
    const url = `/projects/${projectId}/requests${queryString ? `?${queryString}` : ''}`;

    return request<{ deleted: number }>(url, { method: 'DELETE' });
  },
};
