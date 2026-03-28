'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { endpointsApi, projectsApi, ApiError, Endpoint, Project } from '@/lib/api-client';
import { applyErrorScenario, type ErrorScenario } from '@/lib/error-scenarios';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { copyToClipboard, formatDate } from '@/lib/utils';
import { Skeleton } from '@/components/ui/Skeleton';
import { JsonEditor } from '@/components/JsonEditor';
import { AiGenerateDialog } from '@/components/AiGenerateDialog';
import { ResponseRuleEditor } from '@/components/ResponseRuleEditor';
import { RequestRecords } from '@/components/RequestRecords';
import { ErrorScenariosSelector } from '@/components/ErrorScenariosSelector';
import { TemplateLibraryDialog } from '@/components/TemplateLibraryDialog';

const METHODS: Endpoint['method'][] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];

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

// 快速错误场景（简化版）
const QUICK_ERROR_SCENARIOS = [
  {
    id: 'quick-500',
    name: '500 错误',
    description: '服务器内部错误',
    icon: 'server',
    statusCode: 500,
    contentType: 'application/json',
    delayMs: 0,
    responseBody: JSON.stringify({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: '服务器内部错误，请稍后重试',
        timestamp: new Date().toISOString(),
      },
    }, null, 2),
  },
  {
    id: 'quick-404',
    name: '404 未找到',
    description: '资源不存在',
    icon: 'search-off',
    statusCode: 404,
    contentType: 'application/json',
    delayMs: 0,
    responseBody: JSON.stringify({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: '资源不存在',
        details: '请求的资源未找到或已被删除',
      },
    }, null, 2),
  },
  {
    id: 'quick-401',
    name: '401 未授权',
    description: '需要身份验证',
    icon: 'lock',
    statusCode: 401,
    contentType: 'application/json',
    delayMs: 0,
    responseBody: JSON.stringify({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: '未授权访问',
        details: '请先登录或提供有效的认证凭证',
      },
    }, null, 2),
  },
  {
    id: 'quick-403',
    name: '403 禁止访问',
    description: '权限不足',
    icon: 'shield-off',
    statusCode: 403,
    contentType: 'application/json',
    delayMs: 0,
    responseBody: JSON.stringify({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: '访问被拒绝',
        details: '您没有权限访问该资源',
      },
    }, null, 2),
  },
  {
    id: 'quick-timeout',
    name: '超时 5s',
    description: '请求超时',
    icon: 'clock',
    statusCode: 200,
    contentType: 'application/json',
    delayMs: 5000,
    responseBody: JSON.stringify({
      success: false,
      error: {
        code: 'REQUEST_TIMEOUT',
        message: '请求超时',
        details: '服务器处理请求时间过长',
      },
    }, null, 2),
  },
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

// 初始表单状态类型
type InitialFormState = {
  path: string;
  method: Endpoint['method'];
  name: string;
  description: string;
  delayMs: number;
  statusCode: number;
  contentType: string;
  responseBody: string;
};

export default function EditEndpointPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;
  const endpointId = params.endpointId as string;
  const { success, error: toastError } = useToast();

  const [endpoint, setEndpoint] = useState<Endpoint | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showAiDialog, setShowAiDialog] = useState(false);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [initialForm, setInitialForm] = useState<InitialFormState>({
    path: '',
    method: 'GET' as Endpoint['method'],
    name: '',
    description: '',
    delayMs: 0,
    statusCode: 200,
    contentType: 'application/json',
    responseBody: DEFAULT_RESPONSES['application/json'],
  });
  const [form, setForm] = useState<InitialFormState>({
    path: '',
    method: 'GET' as Endpoint['method'],
    name: '',
    description: '',
    delayMs: 0,
    statusCode: 200,
    contentType: 'application/json',
    responseBody: DEFAULT_RESPONSES['application/json'],
  });

  // 检查表单是否有修改
  const isDirty = !deepEqual(form, initialForm);

  // 深度比较两个对象是否相等
  function deepEqual(obj1: InitialFormState, obj2: InitialFormState): boolean {
    return (
      obj1.path === obj2.path &&
      obj1.method === obj2.method &&
      obj1.name === obj2.name &&
      obj1.description === obj2.description &&
      obj1.delayMs === obj2.delayMs &&
      obj1.statusCode === obj2.statusCode &&
      obj1.contentType === obj2.contentType &&
      obj1.responseBody === obj2.responseBody
    );
  }

  // 浏览器关闭/刷新时的警告
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = ''; // Chrome 需要设置 returnValue
        return '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    loadData();
  }, [projectId, endpointId]);

  async function loadData() {
    try {
      setLoading(true);
      const [projects, endpointData] = await Promise.all([
        projectsApi.list(),
        endpointsApi.get(projectId, endpointId),
      ]);

      setProject(projects.find((p) => p.id === projectId) || null);
      setEndpoint(endpointData);

      // 设置表单数据
      const responseBodyStr =
        typeof endpointData.responseBody === 'string'
          ? endpointData.responseBody
          : JSON.stringify(endpointData.responseBody || {}, null, 2);

      const newForm = {
        path: endpointData.path,
        method: endpointData.method,
        name: endpointData.name || '',
        description: endpointData.description || '',
        delayMs: endpointData.delayMs || 0,
        statusCode: endpointData.statusCode || 200,
        contentType: endpointData.contentType || 'application/json',
        responseBody: responseBodyStr || DEFAULT_RESPONSES['application/json'],
      };

      setForm(newForm);
      setInitialForm(newForm); // 保存初始值用于比较
    } catch (err) {
      if (err instanceof ApiError) {
        toastError(err.message);
      } else {
        toastError('加载失败');
      }
    } finally {
      setLoading(false);
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

  // 复制 Mock URL
  async function handleCopyUrl() {
    const url = getMockUrl();
    const copySuccess = await copyToClipboard(url);
    if (copySuccess) {
      setCopied(true);
      success('Mock URL 已复制到剪贴板');
      setTimeout(() => setCopied(false), 2000);
    } else {
      toastError('复制失败，请手动复制');
    }
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

    // 验证路径
    if (!form.path.trim()) {
      setErrors({ path: '路径不能为空' });
      return;
    }

    // 验证 JSON
    if (form.contentType === 'application/json' && !validateJson(form.responseBody)) {
      setErrors({ responseBody: '无效的 JSON 格式' });
      return;
    }

    try {
      setSaving(true);
      setErrors({});

      let parsedBody: unknown = form.responseBody;
      if (form.contentType === 'application/json') {
        parsedBody = JSON.parse(form.responseBody);
      }

      // 调用 API 更新数据，获取服务器返回的最新数据
      const updated = await endpointsApi.update(projectId, endpointId, {
        path: form.path,
        method: form.method,
        name: form.name.trim() || undefined,
        description: form.description.trim() || undefined,
        delayMs: form.delayMs || 0,
        statusCode: form.statusCode,
        contentType: form.contentType,
        responseBody: parsedBody,
      });

      // 直接更新本地状态，无需重新加载
      setEndpoint(updated);
      // 更新初始表单状态，清除 isDirty 标记
      setInitialForm(form);

      success('保存成功！');
    } catch (err) {
      if (err instanceof ApiError) {
        toastError(err.message);
      } else {
        toastError('保存失败');
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    try {
      setDeleting(true);
      await endpointsApi.delete(projectId, endpointId);
      success('端点已删除');
      router.push(`/projects/${projectId}`);
    } catch (err) {
      if (err instanceof ApiError) {
        toastError(err.message);
      } else {
        toastError('删除失败');
      }
      setShowDeleteDialog(false);
    } finally {
      setDeleting(false);
    }
  }

  const handleAiGenerated = (data: unknown) => {
    const jsonString = JSON.stringify(data, null, 2);
    setForm((prev) => ({ ...prev, responseBody: jsonString }));
  };

  const handleTemplateApplied = (content: string) => {
    setForm((prev) => ({ ...prev, responseBody: content }));
    success('模板已应用');
  };

  // 处理错误场景应用
  const handleApplyErrorScenario = (scenario: ErrorScenario) => {
    const applied = applyErrorScenario(scenario);
    setForm((prev) => ({
      ...prev,
      statusCode: applied.statusCode,
      contentType: applied.contentType,
      delayMs: applied.delayMs,
      responseBody: applied.responseBody,
    }));
    success(`已应用错误场景: ${scenario.name}`);
  };

  // 处理快速错误场景应用
  const handleQuickErrorScenario = (scenario: typeof QUICK_ERROR_SCENARIOS[0]) => {
    setForm((prev) => ({
      ...prev,
      statusCode: scenario.statusCode,
      contentType: scenario.contentType,
      delayMs: scenario.delayMs,
      responseBody: scenario.responseBody,
    }));
    success(`已应用错误场景: ${scenario.name}`);
  };

  // 处理返回链接点击
  const handleBackClick = (e: React.MouseEvent) => {
    if (isDirty) {
      e.preventDefault();
      setPendingNavigation(`/projects/${projectId}`);
      setShowUnsavedDialog(true);
    }
    // 如果没有修改，则允许默认导航
  };

  // 处理取消按钮点击
  const handleCancelClick = () => {
    if (isDirty) {
      setPendingNavigation(`/projects/${projectId}`);
      setShowUnsavedDialog(true);
    } else {
      router.push(`/projects/${projectId}`);
    }
  };

  // 确认离开（放弃修改）
  const handleConfirmLeave = () => {
    setShowUnsavedDialog(false);
    if (pendingNavigation) {
      router.push(pendingNavigation);
      setPendingNavigation(null);
    }
  };

  // 取消离开（继续编辑）
  const handleCancelLeave = () => {
    setShowUnsavedDialog(false);
    setPendingNavigation(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
        <div className="max-w-4xl mx-auto">
          <Skeleton className="h-8 w-48 mb-6" />
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <Skeleton className="h-64 w-full" />
            </div>
            <div>
              <Skeleton className="h-32 w-full mb-6" />
              <Skeleton className="h-32 w-full" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!endpoint || !project) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-gray-500 dark:text-gray-400">端点不存在</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* AI 生成对话框 */}
      <AiGenerateDialog
        isOpen={showAiDialog}
        onClose={() => setShowAiDialog(false)}
        onGenerated={handleAiGenerated}
      />

      {/* 模板库对话框 */}
      <TemplateLibraryDialog
        isOpen={showTemplateDialog}
        onClose={() => setShowTemplateDialog(false)}
        onApply={handleTemplateApplied}
      />

      {/* 确认删除对话框 */}
      <ConfirmDialog
        isOpen={showDeleteDialog}
        title="删除端点"
        message="确定要删除此端点吗？此操作无法撤销。"
        confirmText="删除"
        cancelText="取消"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteDialog(false)}
      />

      {/* 未保存更改确认对话框 */}
      <ConfirmDialog
        isOpen={showUnsavedDialog}
        title="未保存的更改"
        message="您有未保存的更改，确定要离开吗？所有未保存的更改将会丢失。"
        confirmText="离开"
        cancelText="继续编辑"
        variant="warning"
        onConfirm={handleConfirmLeave}
        onCancel={handleCancelLeave}
      />

      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href={`/projects/${projectId}`}
                onClick={handleBackClick}
                className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              >
                ← 返回项目
              </Link>
              <span className="text-gray-300 dark:text-gray-600">|</span>
              <span className="text-gray-900 dark:text-white font-medium">
                {project.name} / 编辑端点
              </span>
              {isDirty && (
                <span className="text-orange-600 dark:text-orange-400 text-sm font-medium ml-2">
                  (未保存)
                </span>
              )}
            </div>
            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={() => setShowDeleteDialog(true)}
              disabled={saving}
            >
              删除端点
            </Button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">编辑端点</h1>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* 左侧：表单 */}
          <div className="lg:col-span-2 space-y-6">
            {/* 基本信息 */}
            <Card>
              <form onSubmit={handleSubmit}>
                <CardHeader>
                  <h2 className="font-semibold text-gray-900 dark:text-white">基本信息</h2>
                </CardHeader>
                <CardBody className="space-y-6">
                  {errors.path && (
                    <div className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 p-4 rounded-lg flex items-start gap-2">
                      <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                          clipRule="evenodd"
                        />
                      </svg>
                      {errors.path}
                    </div>
                  )}

                  {/* 请求方法 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      请求方法
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {METHODS.map((method) => (
                        <button
                          key={method}
                          type="button"
                          onClick={() => setForm((prev) => ({ ...prev, method }))}
                          disabled={saving}
                          className={`p-2 rounded-lg border-2 transition-colors disabled:opacity-50 ${
                            form.method === method
                              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                              : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 bg-white dark:bg-gray-800'
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
                    <input
                      type="text"
                      value={form.path}
                      onChange={(e) => {
                        setForm((prev) => ({ ...prev, path: e.target.value }));
                        setErrors((prev) => ({ ...prev, path: undefined }));
                      }}
                      className={`w-full px-4 py-2 border rounded-lg font-mono text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 transition-colors ${
                        errors.path
                          ? 'border-red-300 dark:border-red-700 focus:ring-2 focus:ring-red-500 focus:border-red-500'
                          : 'border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                      }`}
                      disabled={saving}
                    />
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
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                      disabled={saving}
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
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors resize-none"
                      rows={3}
                      disabled={saving}
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
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                      min={0}
                      disabled={saving}
                    />
                  </div>
                </CardBody>

                <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800 rounded-b-xl flex justify-end gap-3">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleCancelClick}
                    disabled={saving}
                  >
                    取消
                  </Button>
                  <Button type="submit" disabled={saving}>
                    {saving ? '保存中...' : '保存'}
                  </Button>
                </div>
              </form>
            </Card>

            {/* 响应配置 */}
            <Card>
              <CardHeader>
                <h2 className="font-semibold text-gray-900 dark:text-white">响应配置</h2>
              </CardHeader>
              <CardBody className="space-y-6">
                {/* 快速错误场景 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    快速错误场景
                  </label>
                  <div className="grid grid-cols-5 gap-2">
                    {QUICK_ERROR_SCENARIOS.map((scenario) => (
                      <button
                        key={scenario.id}
                        type="button"
                        onClick={() => handleQuickErrorScenario(scenario)}
                        disabled={saving}
                        className={`relative px-3 py-3 rounded-lg border-2 transition-all disabled:opacity-50 group ${
                          form.statusCode === scenario.statusCode &&
                          form.delayMs === scenario.delayMs
                            ? 'border-red-500 bg-red-50 dark:bg-red-900/30 shadow-sm'
                            : 'border-gray-200 dark:border-gray-600 hover:border-red-300 dark:hover:border-red-700 bg-white dark:bg-gray-800 hover:bg-red-50/50 dark:hover:bg-red-900/20'
                        }`}
                        title={scenario.description}
                      >
                        <div className="flex flex-col items-center gap-1.5">
                          {/* 图标 */}
                          <div className={`p-1.5 rounded-lg ${
                            form.statusCode === scenario.statusCode && form.delayMs === scenario.delayMs
                              ? 'bg-red-100 dark:bg-red-900/50'
                              : 'bg-gray-100 dark:bg-gray-700 group-hover:bg-red-100 dark:group-hover:bg-red-900/50'
                          }`}>
                            {scenario.icon === 'server' && (
                              <svg className={`w-4 h-4 ${
                                form.statusCode === scenario.statusCode && form.delayMs === scenario.delayMs
                                  ? 'text-red-600 dark:text-red-400'
                                  : 'text-gray-500 dark:text-gray-400 group-hover:text-red-600 dark:group-hover:text-red-400'
                              }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                              </svg>
                            )}
                            {scenario.icon === 'search-off' && (
                              <svg className={`w-4 h-4 ${
                                form.statusCode === scenario.statusCode && form.delayMs === scenario.delayMs
                                  ? 'text-red-600 dark:text-red-400'
                                  : 'text-gray-500 dark:text-gray-400 group-hover:text-red-600 dark:group-hover:text-red-400'
                              }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                              </svg>
                            )}
                            {scenario.icon === 'lock' && (
                              <svg className={`w-4 h-4 ${
                                form.statusCode === scenario.statusCode && form.delayMs === scenario.delayMs
                                  ? 'text-red-600 dark:text-red-400'
                                  : 'text-gray-500 dark:text-gray-400 group-hover:text-red-600 dark:group-hover:text-red-400'
                              }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                              </svg>
                            )}
                            {scenario.icon === 'shield-off' && (
                              <svg className={`w-4 h-4 ${
                                form.statusCode === scenario.statusCode && form.delayMs === scenario.delayMs
                                  ? 'text-red-600 dark:text-red-400'
                                  : 'text-gray-500 dark:text-gray-400 group-hover:text-red-600 dark:group-hover:text-red-400'
                              }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                              </svg>
                            )}
                            {scenario.icon === 'clock' && (
                              <svg className={`w-4 h-4 ${
                                form.statusCode === scenario.statusCode && form.delayMs === scenario.delayMs
                                  ? 'text-orange-600 dark:text-orange-400'
                                  : 'text-gray-500 dark:text-gray-400 group-hover:text-orange-600 dark:group-hover:text-orange-400'
                              }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            )}
                          </div>
                          {/* 名称 */}
                          <span className={`text-xs font-semibold text-center leading-tight ${
                            form.statusCode === scenario.statusCode && form.delayMs === scenario.delayMs
                              ? 'text-red-700 dark:text-red-400'
                              : 'text-gray-700 dark:text-gray-300'
                          }`}>
                            {scenario.name}
                          </span>
                        </div>
                        {scenario.delayMs > 0 && (
                          <div className="absolute -top-1 -right-1">
                            <span className="flex h-4 w-4">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-4 w-4 bg-orange-500 items-center justify-center">
                                <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                                </svg>
                              </span>
                            </span>
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    点击快速配置常见错误场景，自动填充状态码、响应体和延迟
                  </p>
                </div>

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
                          disabled={saving}
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
                        disabled={saving}
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
                    disabled={saving}
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
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      响应数据
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowTemplateDialog(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 rounded-lg transition-colors"
                        disabled={saving}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                        模板库
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowAiDialog(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30 hover:bg-purple-100 dark:hover:bg-purple-900/50 rounded-lg transition-colors"
                        disabled={saving}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                        AI 生成
                      </button>
                    </div>
                  </div>
                  <div className="relative">
                    {form.contentType === 'application/json' ? (
                      <JsonEditor
                        value={form.responseBody}
                        onChange={(value) => {
                          setForm((prev) => ({ ...prev, responseBody: value }));
                          setErrors((prev) => ({ ...prev, responseBody: undefined }));
                        }}
                        readOnly={saving}
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
                        disabled={saving}
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

            {/* 响应规则 */}
            <ResponseRuleEditor projectId={projectId} endpointId={endpointId} />

            {/* 请求记录 */}
            <RequestRecords projectId={projectId} endpointId={endpointId} />
          </div>

          {/* 右侧：信息面板 */}
          <div className="space-y-6">
            {/* Mock URL */}
            <Card>
              <CardHeader>
                <h3 className="font-semibold text-gray-900 dark:text-white">Mock URL</h3>
              </CardHeader>
              <CardBody>
                <div className="space-y-2">
                  <code className="block bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 p-3 rounded-lg text-sm font-mono break-all">
                    {getMockUrl()}
                  </code>
                  <button
                    type="button"
                    onClick={handleCopyUrl}
                    className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      copied
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    {copied ? (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        已复制
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        复制 URL
                      </>
                    )}
                  </button>
                </div>
              </CardBody>
            </Card>

            {/* 端点信息 */}
            <Card>
              <CardHeader>
                <h3 className="font-semibold text-gray-900 dark:text-white">端点信息</h3>
              </CardHeader>
              <CardBody className="space-y-4">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">端点 ID</p>
                  <code className="text-sm text-gray-700 dark:text-gray-300 font-mono break-all">{endpoint.id}</code>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">状态</p>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      endpoint.isActive ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300'
                    }`}
                  >
                    {endpoint.isActive ? '启用' : '禁用'}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">创建时间</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{formatDate(endpoint.createdAt)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">更新时间</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{formatDate(endpoint.updatedAt)}</p>
                </div>
              </CardBody>
            </Card>

            {/* 快速操作 */}
            <Card>
              <CardHeader>
                <h3 className="font-semibold text-gray-900 dark:text-white">快速操作</h3>
              </CardHeader>
              <CardBody className="space-y-2">
                <a
                  href={getMockUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full px-4 py-2 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-lg text-sm font-medium text-center hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                >
                  在新窗口中测试
                </a>
              </CardBody>
            </Card>

            {/* 错误场景模拟 */}
            <ErrorScenariosSelector
              onApply={handleApplyErrorScenario}
              disabled={saving}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
