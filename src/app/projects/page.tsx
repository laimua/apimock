'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { projectsApi, Project } from '@/lib/api-client';
import { Card, CardBody } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { useDebounce } from '@/lib/hooks';
import { Skeleton } from '@/components/ui/Skeleton';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Search, X, FolderOpen, Edit2, Trash2, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { DEMO_PROJECT_SLUG } from '@/lib/demo-seed';

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean;
    project: Project | null;
  }>({ isOpen: false, project: null });
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 300);
  const [page, setPage] = useState(1);
  const pageSize = 12;
  const { success } = useToast();

  useEffect(() => {
    loadProjects();
  }, []);

  // 页面从隐藏切回可见(如从其它页面返回/切回标签)时刷新列表，避免读到旧数据
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        loadProjects();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
    // loadProjects 闭包读取最新 state，无需加入依赖
  }, []);

  async function loadProjects() {
    try {
      setLoading(true);
      const data = await projectsApi.list();
      setProjects(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!deleteDialog.project) return;

    try {
      setDeletingId(deleteDialog.project.id);
      await projectsApi.delete(deleteDialog.project.id);
      success('项目已删除');
      setProjects(projects.filter(p => p.id !== deleteDialog.project!.id));
      setDeleteDialog({ isOpen: false, project: null });
      // 删完当前页最后一项且不在第一页时，回退一页，避免停留在空白页
      if (page > 1 && (page - 1) * pageSize >= filteredProjects.length - 1) {
        setPage(page - 1);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '删除失败');
    } finally {
      setDeletingId(null);
    }
  }

  const filteredProjects = projects.filter(project => {
    if (!debouncedSearch.trim()) return true;
    const query = debouncedSearch.toLowerCase();
    return (
      project.name.toLowerCase().includes(query) ||
      project.slug.toLowerCase().includes(query)
    );
  });

  const totalPages = Math.ceil(filteredProjects.length / pageSize);
  const pagedProjects = filteredProjects.slice((page - 1) * pageSize, page * pageSize);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
        <div className="max-w-6xl mx-auto">
          <div className="mb-4 text-sm text-gray-500">
            <Link href="/" className="hover:text-gray-700">首页</Link>
            <span className="mx-1">/</span>
            <span className="text-gray-900">项目列表</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-6">我的项目</h1>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="border rounded-lg p-6">
                <Skeleton className="h-6 w-3/4 mb-4" />
                <Skeleton className="h-4 w-1/2 mb-2" />
                <Skeleton className="h-4 w-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <ConfirmDialog
        isOpen={deleteDialog.isOpen}
        title="删除项目"
        message={`确定要删除项目「${deleteDialog.project?.name || ''}」吗？此操作无法撤销，相关的端点和响应数据也会被删除。`}
        confirmText="删除"
        cancelText="取消"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteDialog({ isOpen: false, project: null })}
      />

      {/* Main */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <Breadcrumb items={[{ label: '首页', href: '/' }, { label: '项目列表' }]} />

        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-4 sm:mb-6">我的项目</h1>

        {/* 搜索框 */}
        <div className="mb-6">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
              placeholder="搜索项目名称或标识符..."
              className="block w-full pl-10 pr-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg leading-5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                aria-label="Clear search"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
          {debouncedSearch && (
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              找到 {filteredProjects.length} 个项目
            </p>
          )}
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 p-4 rounded-lg mb-6">
            {error}
          </div>
        )}

        {/* 无匹配结果 */}
        {searchQuery && filteredProjects.length === 0 ? (
          <Card className="text-center py-8 sm:py-12">
            <CardBody>
              <div className="text-gray-500 dark:text-gray-400 mb-4">
                <Search className="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">未找到匹配的项目</h3>
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                没有找到与 &ldquo;{searchQuery}&rdquo; 匹配的项目
              </p>
              <button
                onClick={() => setSearchQuery('')}
                className="inline-flex items-center px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 font-medium text-sm"
              >
                清除搜索
              </button>
            </CardBody>
          </Card>
        ) : projects.length === 0 ? (
          <Card className="text-center py-8 sm:py-12">
            <CardBody>
              <div className="text-gray-500 dark:text-gray-400 mb-4">
                <FolderOpen className="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">暂无项目</h3>
              <p className="text-gray-500 dark:text-gray-400 mb-4">创建你的第一个 Mock 项目</p>
              <Link
                href="/projects/new"
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm"
              >
                创建项目
              </Link>
            </CardBody>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {pagedProjects.map((project) => {
              const isDemo = project.slug === DEMO_PROJECT_SLUG;
              return (
              <div key={project.id} className="relative group">
                <Link href={`/projects/${project.id}`}>
                  <Card className="hover:shadow-md transition-shadow h-full">
                    <CardBody>
                      <div className="flex items-center gap-2 mb-2 pr-8">
                        <h3 className="font-semibold text-gray-900 dark:text-white text-base sm:text-lg">
                          {project.name}
                        </h3>
                        {isDemo && (
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300"
                            title="此项目为自动创建的示例，不可删除"
                          >
                            示例
                          </span>
                        )}
                      </div>
                      <p className="text-gray-500 dark:text-gray-400 text-sm mb-4 line-clamp-2">
                        {project.description || '暂无描述'}
                      </p>
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2 text-xs sm:text-sm text-gray-400 dark:text-gray-500">
                        <span className="font-mono">{project.slug}</span>
                        <span>{new Date(project.createdAt).toLocaleDateString()}</span>
                      </div>
                    </CardBody>
                  </Card>
                </Link>
                {/* 操作按钮 — visible on mobile, hover-reveal on desktop */}
                <div className="absolute top-3 right-3 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex items-center gap-1">
                  <Link
                    href={`/projects/${project.id}?edit=true`}
                    onClick={(e) => e.stopPropagation()}
                    aria-label="编辑项目"
                    className="p-1.5 sm:p-2 rounded-md bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-600
                      text-blue-500 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20
                      min-h-9 min-w-9 flex items-center justify-center"
                  >
                    <Edit2 className="w-4 h-4" />
                  </Link>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (isDemo) return;
                      setDeleteDialog({ isOpen: true, project });
                    }}
                    disabled={deletingId === project.id || isDemo}
                    aria-label={isDemo ? '示例项目不可删除' : '删除项目'}
                    title={isDemo ? '示例项目不可删除' : '删除项目'}
                    className="p-1.5 sm:p-2 rounded-md bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-600
                      text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20
                      disabled:opacity-30 disabled:cursor-not-allowed min-h-9 min-w-9 flex items-center justify-center"
                  >
                    {deletingId === project.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
              );
            })}
          </div>
        )}

        {/* 分页 */}
        {totalPages > 1 && (
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              共 {filteredProjects.length} 个项目，第 {page}/{totalPages} 页
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page <= 1}
                className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                上一页
              </button>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page >= totalPages}
                className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                下一页
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
