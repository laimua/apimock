'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

interface ShareEndpoint {
  id: string;
  method: string;
  path: string;
  name: string | null;
  description: string | null;
  statusCode: number | null;
  contentType: string | null;
  delayMs: number | null;
  tags: string | null;
  responseBody: string | null;
}

interface ShareData {
  project: {
    name: string;
    slug: string;
    description: string | null;
  };
  endpoints: ShareEndpoint[];
  baseUrl: string;
}

// ============================================
// 端点详情面板组件
// ============================================
function EndpointDetailPanel({
  endpoint,
}: {
  endpoint: ShareEndpoint;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  // 解析标签
  const tags = endpoint.tags ? JSON.parse(endpoint.tags) : [];

  // 格式化响应体
  function formatResponseBody(body: string | null): string {
    if (!body) return '';
    try {
      const parsed = JSON.parse(body);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return body;
    }
  }

  // 获取截断的响应体（最多显示1000字符）
  function getTruncatedBody(body: string | null): string {
    const formatted = formatResponseBody(body);
    if (formatted.length > 1000) {
      return formatted.substring(0, 1000) + '\n... (内容已截断)';
    }
    return formatted;
  }

  return (
    <div className="border-t border-gray-200 dark:border-gray-700">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-2 flex items-center justify-between text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
      >
        <span className="flex items-center gap-2">
          <svg
            className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          端点详情
        </span>
        <svg
          className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isExpanded && (
        <div className="p-4 space-y-4 bg-gray-50 dark:bg-gray-800/50">
          {/* 基本信息 */}
          <div className="grid grid-cols-2 gap-4">
            {endpoint.name && (
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">端点名称</p>
                <p className="text-sm text-gray-900 dark:text-white">{endpoint.name}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">响应状态码</p>
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                endpoint.statusCode && endpoint.statusCode >= 200 && endpoint.statusCode < 300
                  ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                  : endpoint.statusCode && endpoint.statusCode >= 400
                    ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                    : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
              }`}>
                {endpoint.statusCode || 200}
              </span>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Content-Type</p>
              <p className="text-sm text-gray-900 dark:text-white font-mono">{endpoint.contentType || 'application/json'}</p>
            </div>
            {endpoint.delayMs !== null && endpoint.delayMs > 0 && (
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">延迟时间</p>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium text-yellow-700 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/30">
                  {endpoint.delayMs}ms
                </span>
              </div>
            )}
          </div>

          {/* 描述 */}
          {endpoint.description && (
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">描述</p>
              <p className="text-sm text-gray-700 dark:text-gray-300">{endpoint.description}</p>
            </div>
          )}

          {/* 标签 */}
          {tags.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">标签</p>
              <div className="flex flex-wrap gap-2">
                {tags.map((tag: string, index: number) => (
                  <span
                    key={index}
                    className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 响应体预览 */}
          {endpoint.responseBody && (
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">响应体预览</p>
              <pre className="p-3 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg overflow-x-auto overflow-y-auto max-h-60 text-xs">
                <code className="text-gray-700 dark:text-gray-300">
                  {getTruncatedBody(endpoint.responseBody)}
                </code>
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================
// 测试响应类型
// ============================================
interface TestResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  responseTime: number;
}

// ============================================
// 端点测试面板组件
// ============================================
function EndpointTestPanel({
  endpoint,
  baseUrl,
}: {
  endpoint: ShareEndpoint;
  baseUrl: string;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [queryParams, setQueryParams] = useState<Record<string, string>>({});
  const [headers, setHeaders] = useState<Record<string, string>>({});
  const [body, setBody] = useState('');
  const [response, setResponse] = useState<TestResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsBody = ['POST', 'PUT', 'PATCH'].includes(endpoint.method);

  const url = `${baseUrl}${endpoint.path}`;
  const fullUrl = queryParams
    ? `${url}?${new URLSearchParams(queryParams).toString()}`
    : url;

  async function sendRequest() {
    setLoading(true);
    setError(null);
    setResponse(null);

    const startTime = Date.now();

    try {
      const res = await fetch(fullUrl, {
        method: endpoint.method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: needsBody ? body : undefined,
      });

      const responseTime = Date.now() - startTime;
      const responseHeaders: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      const responseBody = await res.text();

      setResponse({
        status: res.status,
        statusText: res.statusText,
        headers: responseHeaders,
        body: responseBody,
        responseTime,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '请求失败');
    } finally {
      setLoading(false);
    }
  }

  function formatJsonBody(body: string): string {
    try {
      const parsed = JSON.parse(body);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return body;
    }
  }

  function addQueryParam() {
    const key = prompt('输入参数名:');
    if (key) {
      setQueryParams({ ...queryParams, [key]: '' });
    }
  }

  function addHeader() {
    const key = prompt('输入请求头名称:');
    if (key) {
      setHeaders({ ...headers, [key]: '' });
    }
  }

  return (
    <div className="border-t border-gray-200 dark:border-gray-700">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-2 flex items-center justify-between text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
      >
        <span className="flex items-center gap-2">
          <svg
            className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          在线测试
        </span>
        <svg
          className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isExpanded && (
        <div className="p-4 space-y-4 bg-gray-50 dark:bg-gray-800/50">
          {/* 请求配置 */}
          <div className="space-y-3">
            {/* URL */}
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                请求 URL
              </label>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-1 text-xs font-medium rounded ${
                  endpoint.method === 'GET' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' :
                  endpoint.method === 'POST' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300' :
                  endpoint.method === 'PUT' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300' :
                  endpoint.method === 'DELETE' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300' :
                  'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                }`}>
                  {endpoint.method}
                </span>
                <code className="flex-1 px-3 py-1.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300">
                  {fullUrl}
                </code>
              </div>
            </div>

            {/* Query Params */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">
                  查询参数
                </label>
                <button
                  type="button"
                  onClick={addQueryParam}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  + 添加参数
                </button>
              </div>
              {Object.keys(queryParams).length === 0 ? (
                <p className="text-xs text-gray-400 dark:text-gray-500">无查询参数</p>
              ) : (
                <div className="space-y-2">
                  {Object.entries(queryParams).map(([key, value]) => (
                    <div key={key} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={key}
                        readOnly
                        className="w-1/3 px-2 py-1 text-sm bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded"
                      />
                      <input
                        type="text"
                        value={value}
                        onChange={(e) => setQueryParams({ ...queryParams, [key]: e.target.value })}
                        placeholder="参数值"
                        className="flex-1 px-2 py-1 text-sm bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const newParams = { ...queryParams };
                          delete newParams[key];
                          setQueryParams(newParams);
                        }}
                        className="p-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Headers */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">
                  请求头
                </label>
                <button
                  type="button"
                  onClick={addHeader}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  + 添加请求头
                </button>
              </div>
              {Object.keys(headers).length === 0 ? (
                <p className="text-xs text-gray-400 dark:text-gray-500">无自定义请求头</p>
              ) : (
                <div className="space-y-2">
                  {Object.entries(headers).map(([key, value]) => (
                    <div key={key} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={key}
                        readOnly
                        className="w-1/3 px-2 py-1 text-sm bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded"
                      />
                      <input
                        type="text"
                        value={value}
                        onChange={(e) => setHeaders({ ...headers, [key]: e.target.value })}
                        placeholder="请求头值"
                        className="flex-1 px-2 py-1 text-sm bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const newHeaders = { ...headers };
                          delete newHeaders[key];
                          setHeaders(newHeaders);
                        }}
                        className="p-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Request Body */}
            {needsBody && (
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  请求体 (JSON)
                </label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder='{"key": "value"}'
                  rows={4}
                  className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 placeholder-gray-400"
                />
              </div>
            )}
          </div>

          {/* 发送按钮 */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={sendRequest}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 dark:bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  发送中...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                  发送请求
                </>
              )}
            </button>
            {response && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {response.responseTime}ms
              </span>
            )}
          </div>

          {/* 错误显示 */}
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* 响应显示 */}
          {response && (
            <div className="space-y-3">
              {/* 状态码 */}
              <div className="flex items-center gap-3">
                <span className={`px-2 py-1 text-sm font-medium rounded ${
                  response.status >= 200 && response.status < 300
                    ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
                    : response.status >= 400
                    ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
                    : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300'
                }`}>
                  {response.status} {response.statusText}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {response.responseTime}ms
                </span>
              </div>

              {/* 响应头 */}
              <details className="group">
                <summary className="cursor-pointer text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
                  响应头 ({Object.keys(response.headers).length})
                </summary>
                <div className="mt-2 p-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono">
                  {Object.entries(response.headers).map(([key, value]) => (
                    <div key={key} className="text-gray-700 dark:text-gray-300">
                      <span className="text-gray-500 dark:text-gray-400">{key}:</span> {value}
                    </div>
                  ))}
                </div>
              </details>

              {/* 响应体 */}
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  响应体
                </label>
                <pre className="p-3 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg overflow-x-auto text-xs">
                  <code className="text-gray-700 dark:text-gray-300">
                    {formatJsonBody(response.body)}
                  </code>
                </pre>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SharePage() {
  const params = useParams();
  const slug = params.slug as string;

  const [data, setData] = useState<ShareData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; visible: boolean } | null>(null);

  // 添加 noindex meta 标签，防止搜索引擎索引分享页面
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);

    return () => {
      document.head.removeChild(meta);
    };
  }, []);

  useEffect(() => {
    loadShareData();
  }, [slug]);

  async function loadShareData() {
    try {
      setLoading(true);
      const response = await fetch(`/api/share/${slug}`);

      if (!response.ok) {
        if (response.status === 404) {
          setError('项目不存在');
        } else {
          setError('加载失败');
        }
        return;
      }

      const shareData = await response.json();
      setData(shareData);
    } catch (err) {
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  }

  function showToast(message: string) {
    setToast({ message, visible: true });
    setTimeout(() => {
      setToast(null);
    }, 2000);
  }

  async function copyToClipboard(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      showToast(`已复制: ${label}`);
    } catch (err) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      showToast(`已复制: ${label}`);
    }
  }

  function getEndpointUrl(endpoint: ShareEndpoint): string {
    if (!data) return '';
    return `${data.baseUrl}${endpoint.path}`;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 dark:border-blue-400 mb-4"></div>
          <p className="text-gray-500 dark:text-gray-400">加载中...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <Card className="max-w-md">
          <CardBody className="text-center py-8">
            <div className="text-gray-400 dark:text-gray-500 mb-4">
              <svg className="w-16 h-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              {error || '项目不存在'}
            </h2>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              请检查分享链接是否正确
            </p>
            <Link
              href="/projects"
              className="inline-flex items-center px-4 py-2 bg-blue-600 dark:bg-blue-500 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 font-medium text-sm"
            >
              返回项目列表
            </Link>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 animate-slide-in max-w-[calc(100vw-2rem)]">
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-700 text-green-800 dark:text-green-300">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <p className="text-sm font-medium">{toast.message}</p>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <svg className="w-6 h-6 sm:w-8 sm:h-8 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="font-semibold text-gray-900 dark:text-white text-sm sm:text-base">ApiMock</span>
            </Link>
            <Link
              href="/projects"
              className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white text-sm"
            >
              前往控制台
            </Link>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Project Info Card */}
        <Card className="mb-4 sm:mb-6">
          <CardBody>
            <div className="space-y-4">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-1">
                  {data.project.name}
                </h1>
                {data.project.description && (
                  <p className="text-gray-600 dark:text-gray-400 text-sm sm:text-base">{data.project.description}</p>
                )}
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 sm:p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <div className="flex-1 min-w-0">
                  <p className="text-gray-500 dark:text-gray-400 text-xs mb-1">Mock 基础 URL</p>
                  <code className="text-xs sm:text-sm font-mono text-gray-900 dark:text-white break-all block">
                    {data.baseUrl}
                  </code>
                </div>
                <button
                  type="button"
                  onClick={() => copyToClipboard(data.baseUrl, '基础 URL')}
                  className="sm:ml-4 flex-shrink-0 px-3 py-2 sm:py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-500 transition-colors min-h-9 w-full sm:w-auto"
                >
                  复制 URL
                </button>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Endpoints Section */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">
            端点列表
          </h2>
          <span className="text-gray-500 dark:text-gray-400 text-sm">
            {data.endpoints.length} 个端点
          </span>
        </div>

        {data.endpoints.length === 0 ? (
          <Card>
            <CardBody className="text-center py-8">
              <div className="text-gray-400 dark:text-gray-500 mb-4">
                <svg className="w-12 h-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-gray-500 dark:text-gray-400">暂无端点</p>
            </CardBody>
          </Card>
        ) : (
          <div className="space-y-2">
            {data.endpoints.map((endpoint) => (
              <Card key={endpoint.id}>
                <CardBody className="p-0">
                  {/* 端点信息行 */}
                  <div className="px-3 sm:px-4 py-3 flex items-center gap-2 sm:gap-4 flex-wrap">
                    <Badge method={endpoint.method} />
                    <code className="font-mono text-xs sm:text-sm text-gray-700 dark:text-gray-300 min-w-0 flex-1 truncate">
                      {endpoint.path}
                    </code>
                    {endpoint.name && (
                      <span className="text-gray-500 dark:text-gray-400 text-xs sm:text-sm hidden sm:inline truncate">
                        {endpoint.name}
                      </span>
                    )}
                    <div className="flex items-center gap-1 sm:gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          // 切换详情面板展开状态
                          const detailButtons = document.querySelectorAll('[data-detail-toggle]');
                          detailButtons.forEach((btn) => {
                            const endpointId = btn.getAttribute('data-endpoint-id');
                            if (endpointId === endpoint.id) {
                              (btn as HTMLButtonElement).click();
                            }
                          });
                        }}
                        data-detail-toggle
                        data-endpoint-id={endpoint.id}
                        className="flex-shrink-0 px-2 sm:px-3 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors min-h-8"
                      >
                        详情
                      </button>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(getEndpointUrl(endpoint), endpoint.path)}
                        className="flex-shrink-0 px-2 sm:px-3 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors min-h-8"
                      >
                        复制
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          // 找到对应的测试面板并切换展开状态
                          const testButtons = document.querySelectorAll('[data-test-toggle]');
                          testButtons.forEach((btn) => {
                            const endpointId = btn.getAttribute('data-endpoint-id');
                            if (endpointId === endpoint.id) {
                              (btn as HTMLButtonElement).click();
                            }
                          });
                        }}
                        data-test-toggle
                        data-endpoint-id={endpoint.id}
                        className="flex-shrink-0 px-2 sm:px-3 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors min-h-8"
                      >
                        测试
                      </button>
                    </div>
                  </div>
                  {/* 端点详情面板 */}
                  <EndpointDetailPanel endpoint={endpoint} />
                  {/* 测试面板 */}
                  <EndpointTestPanel endpoint={endpoint} baseUrl={data.baseUrl} />
                </CardBody>
              </Card>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 text-center text-gray-400 dark:text-gray-500 text-sm">
          <p>由 <Link href="/" className="text-blue-600 dark:text-blue-400 hover:underline">ApiMock</Link> 提供支持</p>
        </div>
      </main>

      <style jsx>{`
        @keyframes slide-in {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        .animate-slide-in {
          animation: slide-in 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
