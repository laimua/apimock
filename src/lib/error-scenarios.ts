/**
 * 错误场景模拟配置
 * 用于快速配置常见的错误响应
 */

// 错误场景类型
export type ErrorScenarioType =
  | 'server-500'
  | 'server-502'
  | 'server-503'
  | 'server-504'
  | 'client-400'
  | 'client-401'
  | 'client-403'
  | 'client-404'
  | 'timeout'
  | 'empty-response'
  | 'malformed-json'
  | 'network-error';

// 错误场景配置接口
export interface ErrorScenario {
  id: ErrorScenarioType;
  category: 'server' | 'client' | 'timeout' | 'network';
  name: string;
  description: string;
  statusCode: number;
  contentType: string;
  delayMs: number;
  responseBody: unknown;
  headers?: Record<string, string>;
}

// 错误响应模板
const ERROR_RESPONSES = {
  // 服务器错误
  'server-500': {
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: '服务器内部错误，请稍后重试',
      timestamp: new Date().toISOString(),
      requestId: 'req-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
    },
  },
  'server-502': {
    success: false,
    error: {
      code: 'BAD_GATEWAY',
      message: '网关错误，上游服务无响应',
      details: '尝试连接上游服务失败',
    },
  },
  'server-503': {
    success: false,
    error: {
      code: 'SERVICE_UNAVAILABLE',
      message: '服务暂时不可用',
      details: '服务正在进行维护，请稍后重试',
      retryAfter: 60,
    },
  },
  'server-504': {
    success: false,
    error: {
      code: 'GATEWAY_TIMEOUT',
      message: '网关超时',
      details: '上游服务响应超时',
    },
  },
  // 客户端错误
  'client-400': {
    success: false,
    error: {
      code: 'BAD_REQUEST',
      message: '请求参数错误',
      details: '请检查请求参数格式是否正确',
      fields: [
        {
          field: 'example',
          message: '参数格式不正确',
        },
      ],
    },
  },
  'client-401': {
    success: false,
    error: {
      code: 'UNAUTHORIZED',
      message: '未授权访问',
      details: '请先登录或提供有效的认证凭证',
    },
  },
  'client-403': {
    success: false,
    error: {
      code: 'FORBIDDEN',
      message: '访问被拒绝',
      details: '您没有权限访问该资源',
    },
  },
  'client-404': {
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: '资源不存在',
      details: '请求的资源未找到或已被删除',
    },
  },
  // 超时和网络错误
  'timeout': {
    success: false,
    error: {
      code: 'REQUEST_TIMEOUT',
      message: '请求超时',
      details: '服务器处理请求时间过长',
    },
  },
  'empty-response': '',
  'malformed-json': '{invalid json response}',
  'network-error': null,
};

// 错误场景预设配置
export const ERROR_SCENARIOS: Record<ErrorScenarioType, ErrorScenario> = {
  // 服务器错误
  'server-500': {
    id: 'server-500',
    category: 'server',
    name: '500 内部服务器错误',
    description: '模拟服务器内部错误，通常用于测试错误处理机制',
    statusCode: 500,
    contentType: 'application/json',
    delayMs: 0,
    responseBody: ERROR_RESPONSES['server-500'],
  },
  'server-502': {
    id: 'server-502',
    category: 'server',
    name: '502 网关错误',
    description: '模拟网关或代理服务器从上游服务器接收到无效响应',
    statusCode: 502,
    contentType: 'application/json',
    delayMs: 0,
    responseBody: ERROR_RESPONSES['server-502'],
  },
  'server-503': {
    id: 'server-503',
    category: 'server',
    name: '503 服务不可用',
    description: '模拟服务暂时不可用，通常用于维护期间',
    statusCode: 503,
    contentType: 'application/json',
    delayMs: 0,
    responseBody: ERROR_RESPONSES['server-503'],
    headers: {
      'Retry-After': '60',
    },
  },
  'server-504': {
    id: 'server-504',
    category: 'server',
    name: '504 网关超时',
    description: '模拟网关或代理服务器等待上游服务器响应超时',
    statusCode: 504,
    contentType: 'application/json',
    delayMs: 0,
    responseBody: ERROR_RESPONSES['server-504'],
  },

  // 客户端错误
  'client-400': {
    id: 'client-400',
    category: 'client',
    name: '400 错误请求',
    description: '模拟请求参数错误或格式不正确',
    statusCode: 400,
    contentType: 'application/json',
    delayMs: 0,
    responseBody: ERROR_RESPONSES['client-400'],
  },
  'client-401': {
    id: 'client-401',
    category: 'client',
    name: '401 未授权',
    description: '模拟未授权访问，需要身份验证',
    statusCode: 401,
    contentType: 'application/json',
    delayMs: 0,
    responseBody: ERROR_RESPONSES['client-401'],
    headers: {
      'WWW-Authenticate': 'Bearer',
    },
  },
  'client-403': {
    id: 'client-403',
    category: 'client',
    name: '403 禁止访问',
    description: '模拟权限不足，拒绝访问',
    statusCode: 403,
    contentType: 'application/json',
    delayMs: 0,
    responseBody: ERROR_RESPONSES['client-403'],
  },
  'client-404': {
    id: 'client-404',
    category: 'client',
    name: '404 未找到',
    description: '模拟资源不存在',
    statusCode: 404,
    contentType: 'application/json',
    delayMs: 0,
    responseBody: ERROR_RESPONSES['client-404'],
  },

  // 超时模拟
  'timeout': {
    id: 'timeout',
    category: 'timeout',
    name: '请求超时',
    description: '模拟长延迟，测试客户端超时处理',
    statusCode: 408,
    contentType: 'application/json',
    delayMs: 30000, // 30秒延迟
    responseBody: ERROR_RESPONSES['timeout'],
  },

  // 网络错误
  'empty-response': {
    id: 'empty-response',
    category: 'network',
    name: '空响应',
    description: '模拟返回空内容的响应',
    statusCode: 200,
    contentType: 'text/plain',
    delayMs: 0,
    responseBody: ERROR_RESPONSES['empty-response'],
  },
  'malformed-json': {
    id: 'malformed-json',
    category: 'network',
    name: '格式错误的 JSON',
    description: '模拟无效的 JSON 响应，测试解析错误处理',
    statusCode: 200,
    contentType: 'application/json',
    delayMs: 0,
    responseBody: ERROR_RESPONSES['malformed-json'],
  },
  'network-error': {
    id: 'network-error',
    category: 'network',
    name: '网络错误',
    description: '模拟网络连接问题导致的错误响应',
    statusCode: 503,
    contentType: 'application/json',
    delayMs: 0,
    responseBody: ERROR_RESPONSES['network-error'],
    headers: {
      'Connection': 'close',
    },
  },
};

// 错误场景分类
export const ERROR_SCENARIO_CATEGORIES = {
  server: {
    name: '服务器错误',
    description: '5xx 系列错误，模拟服务器端问题',
    iconName: 'alert',
  },
  client: {
    name: '客户端错误',
    description: '4xx 系列错误，模拟客户端请求问题',
    iconName: 'user-error',
  },
  timeout: {
    name: '超时模拟',
    description: '模拟请求超时场景',
    iconName: 'clock',
  },
  network: {
    name: '网络错误',
    description: '模拟网络层问题',
    iconName: 'network-off',
  },
} as const;

// 获取错误场景列表（按分类分组）
export function getErrorScenariosByCategory(): Record<string, ErrorScenario[]> {
  const grouped: Record<string, ErrorScenario[]> = {
    server: [],
    client: [],
    timeout: [],
    network: [],
  };

  Object.values(ERROR_SCENARIOS).forEach((scenario) => {
    grouped[scenario.category].push(scenario);
  });

  return grouped;
}

// 根据场景 ID 获取错误场景
export function getErrorScenario(id: ErrorScenarioType): ErrorScenario | undefined {
  return ERROR_SCENARIOS[id];
}

// 应用错误场景到表单
export interface ApplyScenarioResult {
  statusCode: number;
  contentType: string;
  delayMs: number;
  responseBody: string;
}

export function applyErrorScenario(scenario: ErrorScenario): ApplyScenarioResult {
  return {
    statusCode: scenario.statusCode,
    contentType: scenario.contentType,
    delayMs: scenario.delayMs,
    responseBody:
      typeof scenario.responseBody === 'string'
        ? scenario.responseBody
        : JSON.stringify(scenario.responseBody, null, 2),
  };
}
