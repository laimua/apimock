'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { endpointsApi, projectsApi, ApiError, Endpoint, Project } from '@/lib/api-client';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/Toast';
import { JsonEditor } from '@/components/JsonEditor';

const METHODS: Endpoint['method'][] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];

// 常用路径模板
const PATH_TEMPLATES = [
  '/api/users',
  '/api/items',
  '/api/posts',
  '/api/comments',
  '/api/auth/login',
  '/api/auth/register',
  '/api/products',
  '/api/orders',
];

// 常用 HTTP 状态码（快速选择）
const COMMON_STATUS_CODES = [
  { value: 200, label: '200', description: 'OK' },
  { value: 201, label: '201', description: 'Created' },
  { value: 204, label: '204', description: 'No Content' },
  { value: 400, label: '400', description: 'Bad Request' },
  { value: 401, label: '401', description: 'Unauthorized' },
  { value: 403, label: '403', description: 'Forbidden' },
  { value: 404, label: '404', description: 'Not Found' },
  { value: 500, label: '500', description: 'Server Error' },
];

// 所有 HTTP 状态码（下拉框）
const STATUS_CODES = [
  { value: 100, label: '100 Continue' },
  { value: 101, label: '101 Switching Protocols' },
  { value: 102, label: '102 Processing' },
  { value: 200, label: '200 OK' },
  { value: 201, label: '201 Created' },
  { value: 202, label: '202 Accepted' },
  { value: 203, label: '203 Non-Authoritative Information' },
  { value: 204, label: '204 No Content' },
  { value: 205, label: '205 Reset Content' },
  { value: 206, label: '206 Partial Content' },
  { value: 207, label: '207 Multi-Status' },
  { value: 208, label: '208 Already Reported' },
  { value: 226, label: '226 IM Used' },
  { value: 300, label: '300 Multiple Choices' },
  { value: 301, label: '301 Moved Permanently' },
  { value: 302, label: '302 Found' },
  { value: 303, label: '303 See Other' },
  { value: 304, label: '304 Not Modified' },
  { value: 305, label: '305 Use Proxy' },
  { value: 306, label: '306 (Unused)' },
  { value: 307, label: '307 Temporary Redirect' },
  { value: 308, label: '308 Permanent Redirect' },
  { value: 400, label: '400 Bad Request' },
  { value: 401, label: '401 Unauthorized' },
  { value: 402, label: '402 Payment Required' },
  { value: 403, label: '403 Forbidden' },
  { value: 404, label: '404 Not Found' },
  { value: 405, label: '405 Method Not Allowed' },
  { value: 406, label: '406 Not Acceptable' },
  { value: 407, label: '407 Proxy Authentication Required' },
  { value: 408, label: '408 Request Timeout' },
  { value: 409, label: '409 Conflict' },
  { value: 410, label: '410 Gone' },
  { value: 411, label: '411 Length Required' },
  { value: 412, label: '412 Precondition Failed' },
  { value: 413, label: '413 Payload Too Large' },
  { value: 414, label: '414 URI Too Long' },
  { value: 415, label: '415 Unsupported Media Type' },
  { value: 416, label: '416 Range Not Satisfiable' },
  { value: 417, label: '417 Expectation Failed' },
  { value: 418, label: "418 I'm a teapot" },
  { value: 421, label: '421 Misdirected Request' },
  { value: 422, label: '422 Unprocessable Entity' },
  { value: 423, label: '423 Locked' },
  { value: 424, label: '424 Failed Dependency' },
  { value: 425, label: '425 Too Early' },
  { value: 426, label: '426 Upgrade Required' },
  { value: 428, label: '428 Precondition Required' },
  { value: 429, label: '429 Too Many Requests' },
  { value: 431, label: '431 Request Header Fields Too Large' },
  { value: 451, label: '451 Unavailable For Legal Reasons' },
  { value: 500, label: '500 Internal Server Error' },
  { value: 501, label: '501 Not Implemented' },
  { value: 502, label: '502 Bad Gateway' },
  { value: 503, label: '503 Service Unavailable' },
  { value: 504, label: '504 Gateway Timeout' },
  { value: 505, label: '505 HTTP Version Not Supported' },
  { value: 506, label: '506 Variant Also Negotiates' },
  { value: 507, label: '507 Insufficient Storage' },
  { value: 508, label: '508 Loop Detected' },
  { value: 509, label: '509 Bandwidth Limit Exceeded' },
  { value: 510, label: '510 Not Extended' },
  { value: 511, label: '511 Network Authentication Required' },
];

// 常用 Content-Type
const CONTENT_TYPES = [
  { value: 'application/json', label: 'application/json' },
  { value: 'text/plain', label: 'text/plain' },
  { value: 'text/html', label: 'text/html' },
  { value: 'application/xml', label: 'application/xml' },
];

// 默认响应数据模板
const DEFAULT_RESPONSES = {
  'application/json': JSON.stringify({ success: true, data: null }, null, 2),
  'text/plain': 'Success',
  'text/html': '<div>Success</div>',
  'application/xml': '<?xml version="1.0" encoding="UTF-8"?><response>Success</response>',
};

interface FormErrors {
  path?: string;
  responseBody?: string;
}

export default function NewEndpointPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;
  const { success, error: toastError } = useToast();

  const [project, setProject] = useState<Project | null>(null);
  const [loadingProject, setLoadingProject] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [form, setForm] = useState({
    path: '',
    method: 'GET' as Endpoint['method'],
    name: '',
    description: '',
    delayMs: 0,
    statusCode: 200,
    contentType: 'application/json',
    responseBody: DEFAULT_RESPONSES['application/json'],
  });

  useEffect(() => {
    loadProject();
  }, [projectId]);

  async function loadProject() {
    try {
      setLoadingProject(true);
      const projects = await projectsApi.list();
      setProject(projects.find((p) => p.id === projectId) || null);
    } catch {
      // Ignore error
    } finally {
      setLoadingProject(false);
    }
  }

  // 获取完整的 Mock URL
  function getMockUrl(): string {
    if (typeof window === 'undefined') return '';
    const origin = window.location.origin;
    const slug = project?.slug || 'project';
    const path = form.path.startsWith('/') ? form.path : `/${form.path}`;
    return `${origin}/${slug}${path}`;
  }

  function validatePath(path: string): string | undefined {
    const normalizedPath = path.trim() || '/';
    if (!normalizedPath) {
      return '路径不能为空';
    }
    return undefined;
  }

  function handlePathChange(value: string) {
    // 自动补全开头斜杠
    let normalizedPath = value.trim();
    if (normalizedPath && !normalizedPath.startsWith('/')) {
      normalizedPath = '/' + normalizedPath;
    }

    setForm((prev) => ({ ...prev, path: normalizedPath }));

    // 实时验证（如果已经触摸过该字段）
    if (touched.path) {
      setErrors((prev) => ({
        ...prev,
        path: validatePath(normalizedPath),
      }));
    }
  }

  function handleBlur(field: string) {
    setTouched((prev) => ({ ...prev, [field]: true }));

    if (field === 'path') {
      setErrors((prev) => ({
        ...prev,
        path: validatePath(form.path),
      }));
    }
  }

  function useTemplate(templatePath: string) {
    setForm((prev) => ({ ...prev, path: templatePath }));
    setErrors((prev) => ({ ...prev, path: undefined }));
    setTouched((prev) => ({ ...prev, path: true }));
  }

  // 处理内容类型变更
  function handleContentTypeChange(contentType: string) {
    setForm((prev) => ({
      ...prev,
      contentType,
      responseBody: DEFAULT_RESPONSES[contentType as keyof typeof DEFAULT_RESPONSES] || '',
    }));
  }

  // 验证 JSON
  function validateJson(json: string): boolean {
    if (form.contentType !== 'application/json') return true;
    try {
      JSON.parse(json);
      return true;
    } catch {
      return false;
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // 标记所有字段为已触摸
    setTouched({ path: true });

    // 验证所有字段
    const pathError = validatePath(form.path);
    const newErrors: FormErrors = {
      path: pathError,
    };

    // 验证 JSON（如果是 application/json）
    if (form.contentType === 'application/json' && !validateJson(form.responseBody)) {
      newErrors.responseBody = '无效的 JSON 格式';
    }

    setErrors(newErrors);

    if (pathError || newErrors.responseBody) {
      return;
    }

    try {
      setLoading(true);

      // 解析响应体
      let parsedBody: unknown = form.responseBody;
      if (form.contentType === 'application/json') {
        parsedBody = JSON.parse(form.responseBody);
      }

      await endpointsApi.create(projectId, {
        path: form.path,
        method: form.method,
        name: form.name.trim() || undefined,
        description: form.description.trim() || undefined,
        delayMs: form.delayMs || undefined,
        statusCode: form.statusCode,
        contentType: form.contentType,
        responseBody: parsedBody,
      });

      success('端点创建成功！');
      router.push(`/projects/${projectId}`);
    } catch (err) {
      if (err instanceof ApiError) {
        toastError(err.message);
      } else {
        toastError('创建失败，请稍后重试');
      }
    } finally {
      setLoading(false);
    }
  }

  // 创建并继续
  async function handleSubmitAndContinue(e: React.MouseEvent) {
    e.preventDefault();

    // 验证所有字段
    const pathError = validatePath(form.path);
    const newErrors: FormErrors = {
      path: pathError,
    };

    // 验证 JSON（如果是 application/json）
    if (form.contentType === 'application/json' && !validateJson(form.responseBody)) {
      newErrors.responseBody = '无效的 JSON 格式';
    }

    setErrors(newErrors);

    if (pathError || newErrors.responseBody) {
      return;
    }

    try {
      setLoading(true);

      // 解析响应体
      let parsedBody: unknown = form.responseBody;
      if (form.contentType === 'application/json') {
        parsedBody = JSON.parse(form.responseBody);
      }

      await endpointsApi.create(projectId, {
        path: form.path,
        method: form.method,
        name: form.name.trim() || undefined,
        description: form.description.trim() || undefined,
        delayMs: form.delayMs || undefined,
        statusCode: form.statusCode,
        contentType: form.contentType,
        responseBody: parsedBody,
      });

      success('端点创建成功！');

      // 清空表单，继续添加
      setForm({
        path: '',
        method: 'GET',
        name: '',
        description: '',
        delayMs: 0,
        statusCode: 200,
        contentType: 'application/json',
        responseBody: DEFAULT_RESPONSES['application/json'],
      });
      setErrors({});
      setTouched({});
    } catch (err) {
      if (err instanceof ApiError) {
        toastError(err.message);
      } else {
        toastError('创建失败，请稍后重试');
      }
    } finally {
      setLoading(false);
    }
  }

  if (loadingProject) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-gray-500 dark:text-gray-400">加载中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center">
            <Link href={`/projects/${projectId}`} className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 text-sm flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              返回项目
            </Link>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-4 sm:mb-6">添加端点</h1>

        <Card>
          <form id="endpoint-form" onSubmit={handleSubmit}>
            <CardBody className="space-y-4 sm:space-y-6">
              {/* 请求方法 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  请求方法
                </label>
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-1 sm:gap-2">
                  {METHODS.map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, method }))}
                      disabled={loading}
                      className={`p-1.5 sm:p-2 rounded-lg border-2 transition-colors disabled:opacity-50 text-xs sm:text-sm ${
                        form.method === method
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                          : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                      }`}
                    >
                      <Badge method={method} />
                    </button>
                  ))}
                </div>
              </div>

              {/* 路径 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  路径 <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={form.path}
                    onChange={(e) => handlePathChange(e.target.value)}
                    onBlur={() => handleBlur('path')}
                    className={`w-full px-4 py-2 pr-10 border rounded-lg font-mono transition-colors text-gray-900 dark:text-gray-100 ${
                      errors.path
                        ? 'border-red-300 focus:ring-2 focus:ring-red-500 focus:border-red-500'
                        : 'border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                    }`}
                    placeholder="/api/users"
                    disabled={loading}
                  />
                  {errors.path && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-red-500">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                  )}
                </div>
                {errors.path && (
                  <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                        clipRule="evenodd"
                      />
                    </svg>
                    {errors.path}
                  </p>
                )}

                {/* 路径模板快捷按钮 */}
                <div className="mt-2">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">常用路径：</p>
                  <div className="flex flex-wrap gap-1">
                    {PATH_TEMPLATES.map((template) => (
                      <button
                        key={template}
                        type="button"
                        onClick={() => useTemplate(template)}
                        disabled={loading}
                        className="px-2 py-1 text-xs font-mono bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded text-gray-700 dark:text-gray-300 disabled:opacity-50 transition-colors"
                      >
                        {template}
                      </button>
                    ))}
                  </div>
                </div>

                {/* URL 预览 */}
                {form.path && (
                  <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg">
                    <p className="text-xs text-blue-700 dark:text-blue-300 mb-1 font-medium">Mock URL 预览：</p>
                    <code className="text-sm text-blue-800 dark:text-blue-200 font-mono break-all">
                      {getMockUrl()}
                    </code>
                  </div>
                )}
              </div>

              {/* 名称 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  名称
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800"
                  placeholder="获取用户列表"
                  disabled={loading}
                />
              </div>

              {/* 描述 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  描述
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors resize-none text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800"
                  rows={3}
                  placeholder="端点描述（可选）"
                  disabled={loading}
                />
              </div>

              {/* 模拟延迟 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  模拟延迟 (ms)
                </label>
                <input
                  type="number"
                  value={form.delayMs}
                  onChange={(e) => setForm((prev) => ({ ...prev, delayMs: parseInt(e.target.value) || 0 }))}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800"
                  min={0}
                  placeholder="0"
                  disabled={loading}
                />
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  设置响应延迟，模拟网络延迟或慢速服务
                </p>
              </div>
            </CardBody>
          </form>
        </Card>

        {/* 响应配置 */}
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-gray-900 dark:text-white">响应配置</h2>
          </CardHeader>
          <CardBody className="space-y-6">
            {/* 状态码 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                响应状态码
              </label>
              <div className="space-y-3">
                {/* 常用状态码快速选择 */}
                <div className="grid grid-cols-4 gap-2">
                  {COMMON_STATUS_CODES.map((code) => (
                    <button
                      key={code.value}
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, statusCode: code.value }))}
                      disabled={loading}
                      className={`relative px-3 py-2 rounded-lg border-2 transition-all disabled:opacity-50 group ${
                        form.statusCode === code.value
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 shadow-sm'
                          : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-750'
                      }`}
                      title={code.description}
                    >
                      <div className="flex flex-col items-center gap-0.5">
                        <span className={`text-sm font-semibold ${
                          form.statusCode === code.value
                            ? 'text-blue-700 dark:text-blue-400'
                            : 'text-gray-700 dark:text-gray-300'
                        }`}>
                          {code.label}
                        </span>
                        <span className={`text-[10px] leading-tight ${
                          form.statusCode === code.value
                            ? 'text-blue-600 dark:text-blue-500'
                            : 'text-gray-500 dark:text-gray-400'
                        }`}>
                          {code.description}
                        </span>
                      </div>
                      {form.statusCode === code.value && (
                        <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-4 w-4 bg-blue-500 items-center justify-center">
                            <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          </span>
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                {/* 下拉框（选择其他状态码） */}
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                    或选择其他状态码
                  </label>
                  <select
                    value={form.statusCode}
                    onChange={(e) => setForm((prev) => ({ ...prev, statusCode: parseInt(e.target.value) }))}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                    disabled={loading}
                  >
                    {STATUS_CODES.map((code) => (
                      <option key={code.value} value={code.value}>
                        {code.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Content-Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Content-Type
              </label>
              <select
                value={form.contentType}
                onChange={(e) => handleContentTypeChange(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                disabled={loading}
              >
                {CONTENT_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            {/* 响应数据 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                响应数据
              </label>
              <div className="relative">
                {form.contentType === 'application/json' ? (
                  <JsonEditor
                    value={form.responseBody}
                    onChange={(value) => {
                      setForm((prev) => ({ ...prev, responseBody: value }));
                      setErrors((prev) => ({ ...prev, responseBody: undefined }));
                    }}
                    readOnly={loading}
                    height="300px"
                  />
                ) : (
                  <textarea
                    value={form.responseBody}
                    onChange={(e) => {
                      setForm((prev) => ({ ...prev, responseBody: e.target.value }));
                      setErrors((prev) => ({ ...prev, responseBody: undefined }));
                    }}
                    className="w-full px-4 py-2 font-mono text-sm border rounded-lg text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors resize-none border-gray-300 dark:border-gray-600"
                    rows={12}
                    disabled={loading}
                    placeholder={form.contentType === 'application/json' ? '{"success": true}' : 'Response body'}
                  />
                )}
                {errors.responseBody && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                        clipRule="evenodd"
                      />
                    </svg>
                    {errors.responseBody}
                  </p>
                )}
              </div>
              {form.contentType === 'application/json' && (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  输入有效的 JSON 格式数据，编辑器会自动检测语法错误
                </p>
              )}
            </div>
          </CardBody>
        </Card>

        {/* 操作按钮 */}
        <div className="flex flex-col sm:flex-row justify-end gap-3">
          <Link href={`/projects/${projectId}`} className="w-full sm:w-auto">
            <Button type="button" variant="secondary" disabled={loading} className="w-full sm:w-auto min-h-11">
              取消
            </Button>
          </Link>
          <Button
            type="button"
            variant="secondary"
            disabled={loading}
            onClick={handleSubmitAndContinue}
            className="w-full sm:w-auto min-h-11"
          >
            {loading ? '创建中...' : '创建并继续'}
          </Button>
          <Button type="submit" form="endpoint-form" disabled={loading} className="w-full sm:w-auto min-h-11">
            {loading ? '创建中...' : '创建'}
          </Button>
        </div>
      </main>
    </div>
  );
}
