'use client';

import { useState, useEffect, useMemo } from 'react';
import { requestsApi, ApiError, RequestRecord } from '@/lib/api-client';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { formatDate } from '@/lib/utils';
import { Skeleton } from '@/components/ui/Skeleton';

interface RequestRecordsProps {
  projectId: string;
  endpointId: string;
}

// Helper functions defined outside component to avoid type inference issues
function hasQuery(req: RequestRecord): boolean {
  return Boolean(req.query && Object.keys(req.query).length > 0);
}

function hasHeaders(req: RequestRecord): boolean {
  return Boolean(req.headers && Object.keys(req.headers).length > 0);
}

export function RequestRecords({ projectId, endpointId }: RequestRecordsProps) {
  const { success, error: toastError } = useToast();
  const [requests, setRequests] = useState<RequestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [expandedRequest, setExpandedRequest] = useState<string | null>(null);

  useEffect(() => {
    loadRequests();
  }, [projectId, endpointId]);

  async function loadRequests() {
    try {
      setLoading(true);
      const data = await requestsApi.list(projectId, endpointId, 50, 0);
      setRequests(data.requests as RequestRecord[]);
    } catch (err) {
      if (err instanceof ApiError) {
        toastError(err.message);
      } else {
        toastError('加载请求记录失败');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleClear() {
    try {
      setClearing(true);
      await requestsApi.clear(projectId, endpointId);
      success('请求记录已清空');
      setRequests([]);
      setShowClearDialog(false);
    } catch (err) {
      if (err instanceof ApiError) {
        toastError(err.message);
      } else {
        toastError('清空失败');
      }
    } finally {
      setClearing(false);
    }
  }

  function formatResponseTime(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  }

  function getStatusColor(status: number): string {
    if (status >= 200 && status < 300) return 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400';
    if (status >= 300 && status < 400) return 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400';
    if (status >= 400 && status < 500) return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400';
    if (status >= 500) return 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400';
    return 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300';
  }

  return (
    <>
      <ConfirmDialog
        isOpen={showClearDialog}
        title="清空请求记录"
        message="确定要清空所有请求记录吗？此操作无法撤销。"
        confirmText="清空"
        cancelText="取消"
        variant="danger"
        onConfirm={handleClear}
        onCancel={() => setShowClearDialog(false)}
      />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 dark:text-white">请求记录</h2>
            {requests.length > 0 && (
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={() => setShowClearDialog(true)}
                disabled={clearing}
              >
                清空记录
              </Button>
            )}
          </div>
        </CardHeader>
        <CardBody>
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : requests.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <svg className="w-12 h-12 mx-auto mb-3 text-gray-400 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p>暂无请求记录</p>
              <p className="text-sm mt-1">调用 Mock 接口后会自动记录</p>
            </div>
          ) : (
            <div className="space-y-2">
              {requests.map((req) => {
                if (!req?.id) return null;
                return (
                <div
                  key={req.id}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
                >
                  {/* 请求摘要 */}
                  <button
                    type="button"
                    onClick={() => setExpandedRequest(expandedRequest === req.id ? null : req.id)}
                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <Badge method={req.method as any} />
                      <span className="font-mono text-sm text-gray-700 dark:text-gray-300 truncate">{req.path}</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(req.responseStatus)}`}>
                        {req.responseStatus}
                      </span>
                      <span className="text-sm text-gray-500 dark:text-gray-400">{formatResponseTime(req.responseTime)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {formatDate(new Date(req.createdAt).toISOString())}
                      </span>
                      <svg
                        className={`w-4 h-4 text-gray-400 transition-transform ${
                          expandedRequest === req.id ? 'rotate-180' : ''
                        }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>

                  {/* 详细信息 */}
                  {expandedRequest === req.id && (
                    <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 space-y-3">
                      {/* 基本信息 */}
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-gray-500 dark:text-gray-400">IP:</span>
                          <span className="ml-2 text-gray-700 dark:text-gray-300">{req.ip || '-'}</span>
                        </div>
                        <div>
                          <span className="text-gray-500 dark:text-gray-400">User-Agent:</span>
                          <span className="ml-2 text-gray-700 dark:text-gray-300 truncate block" title={req.userAgent || ''}>
                            {req.userAgent || '-'}
                          </span>
                        </div>
                      </div>

                      {/* Query Parameters */}
                      {(hasQuery(req) as any) ? (
                        <div>
                          <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Query Parameters:</h4>
                          <pre className="bg-gray-100 dark:bg-gray-700 p-2 rounded text-xs overflow-x-auto">
                            {JSON.stringify(req.query, null, 2)}
                          </pre>
                        </div>
                      ) : undefined}

                      {/* Headers */}
                      {(hasHeaders(req) as any) ? (
                        <div>
                          <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Headers:</h4>
                          <pre className="bg-gray-100 dark:bg-gray-700 p-2 rounded text-xs overflow-x-auto">
                            {JSON.stringify(req.headers, null, 2)}
                          </pre>
                        </div>
                      ) : undefined}

                      {/* Body */}
                      {(req.body as any) && (
                        <div>
                          <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Request Body:</h4>
                          <pre className="bg-gray-100 dark:bg-gray-700 p-2 rounded text-xs overflow-x-auto">
                            {typeof req.body === 'string' ? req.body : JSON.stringify(req.body, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          )}
        </CardBody>
      </Card>
    </>
  );
}
