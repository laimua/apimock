/**
 * Endpoint 表单共享纯工具
 *
 * C1a: 从 endpoints/new 与 endpoints/[endpointId] 两页原样抽出(纯移动,零行为变更)。
 * 此前 CONTENT_TYPES / DEFAULT_RESPONSES / validatePath / getMockUrl 在两页各复制一份,
 * 改一处漏一处。组件状态/副作用留在页面,这里只放纯数据与纯函数。
 */

// 常用路径模板
export const PATH_TEMPLATES = [
  '/api/users',
  '/api/items',
  '/api/posts',
  '/api/comments',
  '/api/auth/login',
  '/api/auth/register',
  '/api/products',
  '/api/orders',
];

// 常用 Content-Type
export const CONTENT_TYPES = [
  { value: 'application/json', label: 'application/json' },
  { value: 'text/plain', label: 'text/plain' },
  { value: 'text/html', label: 'text/html' },
  { value: 'application/xml', label: 'application/xml' },
];

// 默认响应数据模板
export const DEFAULT_RESPONSES = {
  'application/json': JSON.stringify({ success: true, data: null }, null, 2),
  'text/plain': 'Success',
  'text/html': '<div>Success</div>',
  'application/xml': '<?xml version="1.0" encoding="UTF-8"?><response>Success</response>',
};

/**
 * 校验端点路径格式(与两页原实现逐字一致):
 * 非空、以 / 开头、参数段 :id 形如 :字母开头(字母/数字/下划线)。
 * 返回错误文案;合法返回 undefined。
 */
export function validatePath(path: string): string | undefined {
  const normalizedPath = path.trim();
  if (!normalizedPath) {
    return '路径不能为空';
  }
  if (!normalizedPath.startsWith('/')) {
    return '路径必须以 / 开头';
  }
  const segments = normalizedPath.split('/').slice(1);
  for (const seg of segments) {
    if (seg === '') continue;
    if (seg.startsWith(':')) {
      if (!/^:[a-zA-Z_][a-zA-Z0-9_]*$/.test(seg)) {
        return `路径参数 "${seg}" 格式非法，应为 :字母开头（如 :id）`;
      }
    }
  }
  return undefined;
}

/**
 * 拼接完整 Mock URL:<origin>/<slug><path>(path 缺头斜杠自动补,slug 缺省 'project')。
 * 调用方负责 SSR 守卫(typeof window === 'undefined' 时不该调)。
 */
export function buildMockUrl(origin: string, slug: string | undefined, path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${origin}/${slug || 'project'}${normalizedPath}`;
}
