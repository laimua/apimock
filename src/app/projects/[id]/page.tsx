'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { projectsApi, endpointsApi, projectRequestsApi, Project, Endpoint, ApiError, ListEndpointsResponse, RequestRecord, ListProjectRequestsResponse } from '@/lib/api-client';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ImportOpenAPI } from '@/components/ImportOpenAPI';
import { useToast } from '@/components/ui/Toast';
import { OnboardingModal } from '@/components/ui/OnboardingModal';

// 可用的 HTTP 方法
const METHODS: Endpoint['method'][] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];

// 分页组件
interface PaginationProps {
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

function Pagination({ total, page, pageSize, onPageChange }: PaginationProps) {
  const totalPages = Math.ceil(total / pageSize);
  const startItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-0">
      <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
        显示 {startItem} - {endItem} 条，共 {total} 条
      </div>
      <div className="flex items-center gap-1 sm:gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="min-h-9 px-3"
        >
          上一页
        </Button>
        <div className="flex items-center gap-1">
          {/* 显示页码 */}
          {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
            let pageNum;
            if (totalPages <= 5) {
              pageNum = i + 1;
            } else if (page <= 3) {
              pageNum = i + 1;
            } else if (page >= totalPages - 2) {
              pageNum = totalPages - 4 + i;
            } else {
              pageNum = page - 2 + i;
            }

            return (
              <button
                key={pageNum}
                onClick={() => onPageChange(pageNum)}
                className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                  page === pageNum
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {pageNum}
              </button>
            );
          })}
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="min-h-9 px-3"
        >
          下一页
        </Button>
      </div>
    </div>
  );
}

// 编辑项目对话框
interface EditProjectDialogProps {
  project: Project;
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: { name: string; description: string }) => Promise<void>;
}

function EditProjectDialog({ project, isOpen, onClose, onSave }: EditProjectDialogProps) {
  const { success, error: toastError } = useToast();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description || '');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});

  useEffect(() => {
    if (isOpen) {
      setName(project.name);
      setDescription(project.description || '');
      setErrors({});
    }
  }, [isOpen, project]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // 验证
    const newErrors: Record<string, string> = {};
    if (!name.trim()) {
      newErrors.name = '项目名称不能为空';
    }
    if (newErrors.name) {
      setErrors(newErrors);
      return;
    }

    try {
      setSaving(true);
      await onSave({ name: name.trim(), description: description.trim() });
      success('项目已更新');
      onClose();
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full mx-4">
        <form onSubmit={handleSubmit}>
          <div className="p-6">
            {/* Title */}
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              编辑项目
            </h3>

            {/* Name */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                项目名称 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setErrors((prev) => ({ ...prev, name: undefined }));
                }}
                className={`w-full px-4 py-2 border rounded-lg text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors ${
                  errors.name ? 'border-red-300 dark:border-red-700' : 'border-gray-300 dark:border-gray-600'
                }`}
                disabled={saving}
                autoFocus
              />
              {errors.name && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.name}</p>
              )}
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                描述
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors resize-none"
                rows={3}
                disabled={saving}
              />
            </div>
          </div>

          {/* Buttons */}
          <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900 rounded-b-xl flex justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={saving}
            >
              取消
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// 请求详情对话框
interface RequestDetailDialogProps {
  request: RequestRecord | null;
  isOpen: boolean;
  onClose: () => void;
}

function RequestDetailDialog({ request, isOpen, onClose }: RequestDetailDialogProps) {
  if (!isOpen || !request) return null;

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('zh-CN');
  };

  const formatJson = (data: unknown) => {
    return JSON.stringify(data, null, 2);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            请求详情
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* 基本信息 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">请求时间</p>
              <p className="text-gray-900 dark:text-white">{formatTime(request.createdAt)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">响应状态</p>
              <span className={`inline-flex items-center px-2 py-1 rounded text-sm font-medium ${
                request.responseStatus >= 200 && request.responseStatus < 300
                  ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                  : request.responseStatus >= 400
                    ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                    : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
              }`}>
                {request.responseStatus}
              </span>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">响应时间</p>
              <p className="text-gray-900 dark:text-white">{request.responseTime} ms</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">请求来源 IP</p>
              <p className="text-gray-900 dark:text-white font-mono text-sm">{request.ip || '-'}</p>
            </div>
          </div>

          {/* 端点信息 */}
          {request.endpoint ? (
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">端点信息</p>
              <div className="flex items-center gap-3 bg-gray-50 dark:bg-gray-900 p-3 rounded-lg">
                <Badge method={request.endpoint.method as any} />
                <code className="font-mono text-sm text-gray-700 dark:text-gray-300">
                  {request.endpoint.path}
                </code>
                {request.endpoint.name && (
                  <span className="text-gray-500 dark:text-gray-400 text-sm">
                    {request.endpoint.name}
                  </span>
                )}
              </div>
            </div>
          ) : null}

          {/* 路径 */}
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">请求路径</p>
            <code className="block bg-gray-100 dark:bg-gray-900 p-3 rounded-lg text-sm text-gray-700 dark:text-gray-300 break-all">
              {request.path}
            </code>
          </div>

          {/* Query 参数 */}
          {request.query !== null && Object.keys(request.query).length > 0 ? (
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Query 参数</p>
              <pre className="bg-gray-100 dark:bg-gray-900 p-3 rounded-lg text-sm overflow-x-auto">
                {formatJson(request.query)}
              </pre>
            </div>
          ) : null}

          {/* Headers */}
          {request.headers !== null && Object.keys(request.headers).length > 0 ? (
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">请求头</p>
              <pre className="bg-gray-100 dark:bg-gray-900 p-3 rounded-lg text-sm overflow-x-auto">
                {formatJson(request.headers)}
              </pre>
            </div>
          ) : null}

          {/* Body */}
          {request.body ? (
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">请求体</p>
              <pre className="bg-gray-100 dark:bg-gray-900 p-3 rounded-lg text-sm overflow-x-auto max-h-60 overflow-y-auto">
                {typeof request.body === 'string' ? request.body : formatJson(request.body)}
              </pre>
            </div>
          ) : null}

          {/* User Agent */}
          {request.userAgent ? (
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">User-Agent</p>
              <p className="text-gray-700 dark:text-gray-300 text-sm break-all">{request.userAgent}</p>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900 rounded-b-xl flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            关闭
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function ProjectPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const { success, error: toastError } = useToast();

  const [project, setProject] = useState<Project | null>(null);
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Tab 状态
  const [activeTab, setActiveTab] = useState<'endpoints' | 'requests'>('endpoints');

  // 分页和筛选状态
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState<'' | Endpoint['method']>('');
  const [tagFilter, setTagFilter] = useState('');

  // 请求记录状态
  const [requests, setRequests] = useState<RequestRecord[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requestsPage, setRequestsPage] = useState(1);
  const [requestsPageSize] = useState(20);
  const [requestsTotal, setRequestsTotal] = useState(0);
  const [requestsEndpointFilter, setRequestsEndpointFilter] = useState('');
  const [selectedRequest, setSelectedRequest] = useState<RequestRecord | null>(null);
  const [isRequestDetailOpen, setIsRequestDetailOpen] = useState(false);

  // 引导弹窗状态
  const [showEmptyProjectGuide, setShowEmptyProjectGuide] = useState(false);

  async function copyToClipboard(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      success(`已复制: ${label}`);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      success(`已复制: ${label}`);
    }
  }

  useEffect(() => {
    loadData();
  }, [projectId, page, search, methodFilter, tagFilter]);

  useEffect(() => {
    if (activeTab === 'requests') {
      loadRequests();
    }
  }, [projectId, requestsPage, requestsEndpointFilter]);

  // 在空项目首次加载时显示引导
  useEffect(() => {
    if (!loading && project && endpoints.length === 0 && !search && !methodFilter && !tagFilter) {
      // 延迟显示引导，避免与页面加载冲突
      const timer = setTimeout(() => {
        setShowEmptyProjectGuide(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [loading, project, endpoints.length, search, methodFilter, tagFilter]);

  async function loadData() {
    try {
      setLoading(true);
      // 并行加载项目和端点
      const [projectData, endpointsData] = await Promise.all([
        projectsApi.list().then(projects =>
          projects.find(p => p.id === projectId) || null
        ),
        endpointsApi.list(projectId, {
          page,
          pageSize,
          search: search.trim(),
          method: methodFilter,
          tag: tagFilter.trim(),
        }),
      ]);

      setProject(projectData);

      // 判断返回的是分页数据还是数组（向后兼容）
      if (endpointsData && typeof endpointsData === 'object' && 'items' in endpointsData) {
        const paginatedData = endpointsData as ListEndpointsResponse;
        setEndpoints(paginatedData.items);
        setTotal(paginatedData.total);
      } else {
        // 向后兼容：直接是数组的情况
        const endpointArray = endpointsData as Endpoint[];
        setEndpoints(endpointArray);
        setTotal(endpointArray.length);
      }
    } catch (err: any) {
      setError(err.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }

  // 加载请求记录
  async function loadRequests() {
    try {
      setRequestsLoading(true);
      const data = await projectRequestsApi.list(projectId, {
        page: requestsPage,
        pageSize: requestsPageSize,
        endpointId: requestsEndpointFilter || undefined,
      });
      setRequests(data.items);
      setRequestsTotal(data.total);
    } catch (err: any) {
      toastError(err.message || '加载请求记录失败');
    } finally {
      setRequestsLoading(false);
    }
  }

  // 清空请求记录
  async function handleClearRequests() {
    if (!confirm('确定要清空请求记录吗？')) return;
    try {
      await projectRequestsApi.clear(projectId, requestsEndpointFilter || undefined);
      success('请求记录已清空');
      loadRequests();
    } catch (err: any) {
      if (err instanceof ApiError) {
        toastError(err.message);
      } else {
        toastError('清空失败');
      }
    }
  }

  // 处理搜索输入（防抖）
  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setPage(1); // 重置到第一页
  }, []);

  // 处理方法筛选变化
  const handleMethodChange = useCallback((value: string) => {
    setMethodFilter(value as '' | Endpoint['method']);
    setPage(1); // 重置到第一页
  }, []);

  // 处理标签筛选变化
  const handleTagChange = useCallback((value: string) => {
    setTagFilter(value);
    setPage(1); // 重置到第一页
  }, []);

  // 处理页码变化
  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // 清空筛选
  const handleClearFilters = useCallback(() => {
    setSearch('');
    setMethodFilter('');
    setTagFilter('');
    setPage(1);
  }, []);

  async function handleSaveProject(data: { name: string; description: string }) {
    const updated = await projectsApi.update(projectId, data);
    setProject(updated);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">加载中...</div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">项目不存在</div>
      </div>
    );
  }

  const mockBaseUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/${project.slug}`;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-4 min-w-0">
              <Link href="/projects" className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 text-sm flex items-center gap-1 flex-shrink-0">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <span className="hidden sm:inline">项目列表</span>
              </Link>
              <span className="text-gray-300 dark:text-gray-600 hidden sm:inline">|</span>
              <h1 className="font-semibold text-gray-900 dark:text-white truncate text-sm sm:text-base">{project.name}</h1>
            </div>

            {/* Desktop Actions */}
            <div className="hidden sm:flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsImportOpen(true)}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 font-medium text-sm flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                导入
              </button>
              <Link
                href={`/projects/${projectId}/endpoints/new`}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm"
              >
                添加端点
              </Link>
            </div>

            {/* Mobile menu button */}
            <button
              type="button"
              className="sm:hidden p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                {mobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                )}
              </svg>
            </button>
          </div>

          {/* Mobile menu */}
          {mobileMenuOpen && (
            <div className="sm:hidden pb-4 flex flex-col gap-3">
              <button
                type="button"
                onClick={() => {
                  setIsImportOpen(true);
                  setMobileMenuOpen(false);
                }}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 font-medium text-sm flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                导入 OpenAPI
              </button>
              <Link
                href={`/projects/${projectId}/endpoints/new`}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm text-center"
                onClick={() => setMobileMenuOpen(false)}
              >
                添加端点
              </Link>
            </div>
          )}
        </div>
      </header>

      {/* Main */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {error && (
          <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 p-4 rounded-lg mb-6">
            {error}
          </div>
        )}

        {/* Project Info */}
        <Card className="mb-4 sm:mb-6">
          <CardBody>
            <div className="flex flex-col gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-gray-500 dark:text-gray-400 text-xs sm:text-sm mb-2">Mock 基础 URL</p>
                <code className="bg-gray-100 dark:bg-gray-700 px-2 sm:px-3 py-1.5 sm:py-1 rounded text-xs sm:text-sm font-mono block break-all">
                  {mockBaseUrl}
                </code>
                {project.description && (
                  <p className="text-gray-600 dark:text-gray-400 text-sm mt-2">{project.description}</p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(mockBaseUrl, '基础 URL')}
                  className="flex-1 sm:flex-none min-h-9"
                >
                  复制
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditDialogOpen(true)}
                  className="flex-1 sm:flex-none min-h-9"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  编辑
                </Button>
                <Link
                  href={`/share/${project.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 sm:flex-none"
                >
                  <Button variant="secondary" size="sm" className="w-full min-h-9">
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                    </svg>
                    分享
                  </Button>
                </Link>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Tab Navigation */}
        <div className="mb-4 sm:mb-6">
          <div className="border-b border-gray-200 dark:border-gray-700">
            <nav className="flex gap-4 sm:gap-8">
              <button
                type="button"
                onClick={() => setActiveTab('endpoints')}
                className={`py-3 px-1 sm:px-2 border-b-2 font-medium text-sm transition-colors flex-1 sm:flex-none ${
                  activeTab === 'endpoints'
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                端点列表
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('requests')}
                className={`py-3 px-1 sm:px-2 border-b-2 font-medium text-sm transition-colors flex-1 sm:flex-none ${
                  activeTab === 'requests'
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                请求记录
              </button>
            </nav>
          </div>
        </div>

        {/* Endpoints Tab Content */}
        {activeTab === 'endpoints' && (
          <>
        <div className="mb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">端点列表</h2>
            <span className="text-gray-500 dark:text-gray-400 text-sm">
              {total} 个端点
              {search || methodFilter || tagFilter ? ' (已筛选)' : ''}
            </span>
          </div>

          {/* 搜索和筛选栏 */}
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-4">
            {/* 搜索框 */}
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="搜索路径..."
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors text-sm"
              />
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>

            {/* 方法筛选 */}
            <select
              value={methodFilter}
              onChange={(e) => handleMethodChange(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors text-sm"
            >
              <option value="">全部方法</option>
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>

            {/* 标签筛选 */}
            <input
              type="text"
              placeholder="标签..."
              value={tagFilter}
              onChange={(e) => handleTagChange(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors text-sm flex-1 sm:flex-none sm:w-auto"
            />

            {/* 清空筛选按钮 */}
            {(search || methodFilter || tagFilter) && (
              <button
                type="button"
                onClick={handleClearFilters}
                className="px-3 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 text-sm font-medium whitespace-nowrap"
              >
                清空筛选
              </button>
            )}
          </div>
        </div>

        {/* 分页控制 */}
        {total > pageSize && (
          <div className="mb-4">
            <Pagination
              total={total}
              page={page}
              pageSize={pageSize}
              onPageChange={handlePageChange}
            />
          </div>
        )}

        {endpoints.length === 0 ? (
          <Card className="text-center py-8 sm:py-12">
            <CardBody>
              <div className="text-gray-400 dark:text-gray-500 mb-4">
                <svg className="w-12 h-12 sm:w-16 sm:h-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              {search || methodFilter || tagFilter ? (
                <>
                  <h3 className="text-base sm:text-lg font-medium text-gray-900 dark:text-white mb-2">未找到匹配的端点</h3>
                  <p className="text-gray-500 dark:text-gray-400 mb-4 sm:mb-6 text-sm">尝试调整搜索条件或清空筛选</p>
                  <button
                    type="button"
                    onClick={handleClearFilters}
                    className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 font-medium text-sm min-h-11"
                  >
                    清空筛选
                  </button>
                </>
              ) : (
                <>
                  <h3 className="text-base sm:text-lg font-medium text-gray-900 dark:text-white mb-2">暂无端点</h3>
                  <p className="text-gray-500 dark:text-gray-400 mb-4 sm:mb-6 text-sm">添加你的第一个 Mock 端点，或从 OpenAPI 文档导入</p>
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-3 px-4">
                    <button
                      type="button"
                      onClick={() => setIsImportOpen(true)}
                      className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 font-medium text-sm min-h-11"
                    >
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      导入 OpenAPI
                    </button>
                    <Link
                      href={`/projects/${projectId}/endpoints/new`}
                      className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm min-h-11"
                    >
                      添加端点
                    </Link>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!confirm('确定要删除此项目吗？此操作不可恢复。')) return;
                        try {
                          await projectsApi.delete(projectId);
                          success('项目已删除');
                          router.push('/projects');
                        } catch (err) {
                          if (err instanceof ApiError) {
                            toastError(err.message);
                          } else {
                            toastError('删除失败');
                          }
                        }
                      }}
                      className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2 text-red-600 dark:text-red-400 border border-red-300 dark:border-red-700 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 font-medium text-sm min-h-11"
                    >
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      删除项目
                    </button>
                  </div>
                </>
              )}
            </CardBody>
          </Card>
        ) : (
          <div className="space-y-2">
            {endpoints.map((endpoint) => (
              <Link key={endpoint.id} href={`/projects/${projectId}/endpoints/${endpoint.id}`}>
                <Card className="hover:shadow-md transition-shadow">
                  <CardBody className="py-3">
                    <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
                      <Badge method={endpoint.method} />
                      <code className="font-mono text-xs sm:text-sm text-gray-700 dark:text-gray-300 min-w-0 flex-1 truncate">
                        {endpoint.path}
                      </code>
                      {endpoint.name && (
                        <span className="text-gray-500 dark:text-gray-400 text-xs sm:text-sm truncate">
                          {endpoint.name}
                        </span>
                      )}
                      {endpoint.delayMs > 0 && (
                        <span className="text-xs text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/30 px-2 py-0.5 rounded whitespace-nowrap">
                          延迟 {endpoint.delayMs}ms
                        </span>
                      )}
                    </div>
                  </CardBody>
                </Card>
              </Link>
            ))}
          </div>
        )}

        {/* 底部分页 */}
        {total > pageSize && endpoints.length > 0 && (
          <div className="mt-4">
            <Pagination
              total={total}
              page={page}
              pageSize={pageSize}
              onPageChange={handlePageChange}
            />
          </div>
        )}
          </>
        )}

        {/* Requests Tab Content */}
        {activeTab === 'requests' && (
          <>
            <div className="mb-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">请求记录</h2>
                <div className="flex items-center gap-3">
                  <span className="text-gray-500 dark:text-gray-400 text-sm">
                    {requestsTotal} 条记录
                  </span>
                  <button
                    type="button"
                    onClick={handleClearRequests}
                    className="px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg font-medium transition-colors"
                  >
                    清空记录
                  </button>
                </div>
              </div>

              {/* 端点筛选 */}
              <div className="flex gap-3 mb-4">
                <select
                  value={requestsEndpointFilter}
                  onChange={(e) => {
                    setRequestsEndpointFilter(e.target.value);
                    setRequestsPage(1);
                  }}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                >
                  <option value="">全部端点</option>
                  {endpoints.map((ep) => (
                    <option key={ep.id} value={ep.id}>
                      {ep.method} {ep.path} {ep.name ? `- ${ep.name}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* 分页控制 */}
            {requestsTotal > requestsPageSize && (
              <div className="mb-4">
                <Pagination
                  total={requestsTotal}
                  page={requestsPage}
                  pageSize={requestsPageSize}
                  onPageChange={(newPage) => {
                    setRequestsPage(newPage);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                />
              </div>
            )}

            {requestsLoading ? (
              <Card>
                <CardBody className="text-center py-12 text-gray-500 dark:text-gray-400">
                  加载中...
                </CardBody>
              </Card>
            ) : requests.length === 0 ? (
              <Card>
                <CardBody className="text-center py-12">
                  <div className="text-gray-400 dark:text-gray-500 mb-4">
                    <svg className="w-16 h-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">暂无请求记录</h3>
                  <p className="text-gray-500 dark:text-gray-400 text-sm">访问 Mock 端点后，请求记录会显示在这里</p>
                </CardBody>
              </Card>
            ) : (
              <div className="space-y-2">
                {requests.map((req) => (
                  <Card
                    key={req.id}
                    className="hover:shadow-md transition-shadow cursor-pointer"
                    onClick={() => {
                      setSelectedRequest(req);
                      setIsRequestDetailOpen(true);
                    }}
                  >
                    <CardBody className="py-3">
                      <div className="flex items-center gap-4 flex-wrap">
                        <Badge method={req.method as any} />
                        <code className="font-mono text-sm text-gray-700 dark:text-gray-300">
                          {req.path}
                        </code>
                        {req.endpoint && (
                          <span className="text-gray-500 dark:text-gray-400 text-sm">
                            → {req.endpoint.path}
                          </span>
                        )}
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          req.responseStatus >= 200 && req.responseStatus < 300
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                            : req.responseStatus >= 400
                              ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                              : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                        }`}>
                          {req.responseStatus}
                        </span>
                        <span className="text-gray-500 dark:text-gray-400 text-sm">
                          {req.responseTime}ms
                        </span>
                        <span className="text-gray-400 dark:text-gray-500 text-sm ml-auto">
                          {new Date(req.createdAt).toLocaleString('zh-CN')}
                        </span>
                      </div>
                    </CardBody>
                  </Card>
                ))}
              </div>
            )}

            {/* 底部分页 */}
            {requestsTotal > requestsPageSize && requests.length > 0 && (
              <div className="mt-4">
                <Pagination
                  total={requestsTotal}
                  page={requestsPage}
                  pageSize={requestsPageSize}
                  onPageChange={(newPage) => {
                    setRequestsPage(newPage);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                />
              </div>
            )}
          </>
        )}
      </main>

      {/* Import OpenAPI Dialog */}
      <ImportOpenAPI
        projectId={projectId}
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onSuccess={loadData}
      />

      {/* Edit Project Dialog */}
      {project && (
        <EditProjectDialog
          project={project}
          isOpen={isEditDialogOpen}
          onClose={() => setIsEditDialogOpen(false)}
          onSave={handleSaveProject}
        />
      )}

      {/* Request Detail Dialog */}
      <RequestDetailDialog
        request={selectedRequest}
        isOpen={isRequestDetailOpen}
        onClose={() => {
          setIsRequestDetailOpen(false);
          setSelectedRequest(null);
        }}
      />

      {/* Empty Project Guide Modal */}
      <OnboardingModal
        isOpen={showEmptyProjectGuide}
        title="开始使用 Mock 服务"
        description="添加你的第一个 Mock 端点，或导入 OpenAPI 文档快速配置项目。"
        primaryAction={{
          label: '添加端点',
          onClick: () => {
            setShowEmptyProjectGuide(false);
          },
        }}
        secondaryAction={{
          label: '导入 OpenAPI',
          onClick: () => {
            setShowEmptyProjectGuide(false);
            setIsImportOpen(true);
          },
        }}
        icon={
          <svg className="w-12 h-12 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        }
        onClose={() => setShowEmptyProjectGuide(false)}
      />
    </div>
  );
}
