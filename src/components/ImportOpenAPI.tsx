'use client';

import { useState, useCallback } from 'react';
import { Badge } from '@/components/ui/Badge';
import {
  importApi,
  ApiError,
  type ImportParseEndpoint,
  type ImportResultPayload,
} from '@/lib/api-client';

interface ImportOpenAPIProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function ImportOpenAPI({
  projectId,
  isOpen,
  onClose,
  onSuccess,
}: ImportOpenAPIProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [endpoints, setEndpoints] = useState<ImportParseEndpoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  // 207 部分成功时不关窗,进部分完成面板展示逐项失败
  const [partialResult, setPartialResult] = useState<ImportResultPayload | null>(null);

  const isValidFileType = (file: File) => {
    const validTypes = [
      'application/json',
      'application/x-yaml',
      'application/yaml',
      'text/yaml',
      'text/plain',
    ];
    const validExtensions = ['.json', '.yaml', '.yml'];
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    return validTypes.includes(file.type) || validExtensions.includes(ext);
  };

  const handleFileSelect = useCallback((selectedFile: File) => {
    setError(null);
    if (!isValidFileType(selectedFile)) {
      setError('仅支持 .json、.yaml、.yml 格式的文件');
      return;
    }
    setFile(selectedFile);
    setEndpoints([]);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) {
        handleFileSelect(droppedFile);
      }
    },
    [handleFileSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      handleFileSelect(selectedFile);
    }
  };

  const parseFile = async () => {
    if (!file) return;

    setIsParsing(true);
    setError(null);

    try {
      // C2: multipart 走 api-client(request 的 FormData 分支不强设 Content-Type,
      // 浏览器自动带 boundary);401 跳登录/非 JSON 兜底/错误形状解析随之统一
      const data = await importApi.parse(projectId, file);
      setEndpoints(data.endpoints || []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '解析失败，请重试');
    } finally {
      setIsParsing(false);
    }
  };

  const handleImport = async () => {
    if (!file || endpoints.length === 0) return;

    setIsImporting(true);
    setError(null);

    try {
      const result = await importApi.import(projectId, file);

      if (result.errors.length > 0) {
        // 207 部分成功:不关窗,进部分完成面板(摘要 + 逐项错误 + parseErrors 折叠);
        // 已创建的端点已落库,先触发 onSuccess 刷新背后的列表
        onSuccess();
        setPartialResult(result);
      } else {
        // 201 全部成功:保持原行为,刷新并关窗
        onSuccess();
        handleClose();
      }
    } catch (err) {
      // 4xx/5xx(含 500 全部失败):红条展示,不关窗
      setError(err instanceof ApiError ? err.message : '导入失败，请重试');
    } finally {
      setIsImporting(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setEndpoints([]);
    setError(null);
    setIsDragging(false);
    setPartialResult(null);
    onClose();
  };

  if (!isOpen) return null;

  const getDefaultStatusCode = (responses: Record<string, unknown> | undefined) => {
    if (!responses) return '200';
    if (responses['200']) return '200';
    if (responses['201']) return '201';
    if (responses['204']) return '204';
    const firstKey = Object.keys(responses)[0];
    return firstKey || '200';
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      onKeyDown={(e) => {
        if (e.key === 'Escape') handleClose();
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />

      {/* Dialog */}
      <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-6 overflow-y-auto flex-1">
          {/* Icon */}
          <div className="flex justify-center mb-4">
            <svg
              className="w-10 h-10 text-blue-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
          </div>

          {/* Title */}
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 text-center mb-2">
            导入 OpenAPI 规范
          </h3>

          {/* Description */}
          <p className="text-gray-600 dark:text-gray-400 text-center mb-6 text-sm">
            上传 OpenAPI (Swagger) 文档，自动创建 Mock 端点
          </p>

          {/* 207 部分成功面板:摘要 + 逐项错误 + parseErrors 折叠 + 完成按钮 */}
          {partialResult ? (
            <div data-testid="import-partial-panel" className="mb-6">
              <div className="mb-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300 mb-1">
                  部分端点导入成功
                </p>
                <p className="text-sm text-yellow-700 dark:text-yellow-400">
                  共 {partialResult.total} 个端点：成功 {partialResult.created} 个，
                  跳过 {partialResult.skipped} 个，失败 {partialResult.errors.length} 个
                </p>
              </div>

              {/* 逐项错误 */}
              <div className="mb-4">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  失败明细
                </h4>
                <ul className="border border-red-200 dark:border-red-800 rounded-lg divide-y divide-red-100 dark:divide-red-900/40 max-h-40 overflow-y-auto">
                  {partialResult.errors.map((item, index) => (
                    <li
                      key={index}
                      className="px-3 py-2 text-sm text-red-600 dark:text-red-400 break-all"
                    >
                      {item.error}
                    </li>
                  ))}
                </ul>
              </div>

              {/* 解析警告(折叠) */}
              {partialResult.parseErrors.length > 0 && (
                <details className="mb-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                  <summary className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer select-none">
                    解析警告（{partialResult.parseErrors.length} 条）
                  </summary>
                  <ul className="px-3 pb-3 pt-1 space-y-1">
                    {partialResult.parseErrors.map((msg, index) => (
                      <li key={index} className="text-xs text-gray-500 dark:text-gray-400 break-all">
                        {msg}
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              <button
                type="button"
                onClick={handleClose}
                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                完成
              </button>
            </div>
          ) : endpoints.length === 0 ? (
            <div
              className={`mb-6 border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                isDragging
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
              }`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              <input
                id="file-upload"
                type="file"
                accept=".json,.yaml,.yml"
                onChange={handleInputChange}
                className="hidden"
              />
              <label
                htmlFor="file-upload"
                className="cursor-pointer flex flex-col items-center"
              >
                <svg
                  className="w-12 h-12 text-gray-400 mb-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <p className="text-gray-700 dark:text-gray-300 font-medium mb-1">
                  {isDragging ? '释放文件以上传' : '点击或拖拽文件到此处'}
                </p>
                <p className="text-gray-500 dark:text-gray-400 text-sm">
                  支持 .json、.yaml、.yml 格式
                </p>
              </label>

              {file && (
                <div className="mt-4 flex items-center justify-center gap-2">
                  <svg
                    className="w-5 h-5 text-green-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <span className="text-gray-700 dark:text-gray-300 font-medium">
                    {file.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => setFile(null)}
                    className="ml-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Preview Table */}
              <div className="mb-4 flex items-center justify-between">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  预览端点
                </h4>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  共 {endpoints.length} 个端点
                </span>
              </div>

              <div className="mb-6 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden max-h-80 overflow-y-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        方法
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        路径
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        名称
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        状态码
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {endpoints.map((endpoint, index) => (
                      <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td className="px-4 py-2 whitespace-nowrap">
                          <Badge method={endpoint.method.toUpperCase()} />
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap">
                          <code className="text-sm font-mono text-gray-700 dark:text-gray-300">
                            {endpoint.path}
                          </code>
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">
                          {endpoint.summary || endpoint.operationId || '-'}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                          {getDefaultStatusCode(endpoint.responses as Record<string, unknown> | undefined)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Change File */}
              <button
                type="button"
                onClick={() => {
                  setEndpoints([]);
                  setFile(null);
                }}
                className="mb-6 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
              >
                重新选择文件
              </button>
            </>
          )}

          {/* Error Message(部分完成面板态不展示,面板内有失败明细) */}
          {!partialResult && error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Buttons(部分完成面板态由面板内"完成"按钮收尾) */}
          {!partialResult && (
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={isParsing || isImporting}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              取消
            </button>
            {endpoints.length === 0 ? (
              <button
                type="button"
                onClick={parseFile}
                disabled={!file || isParsing || isImporting}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isParsing ? (
                  <>
                    <svg
                      className="animate-spin h-4 w-4"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    解析中...
                  </>
                ) : (
                  <>
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                    解析文件
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleImport}
                disabled={isImporting}
                className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors font-medium focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isImporting ? (
                  <>
                    <svg
                      className="animate-spin h-4 w-4"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    导入中...
                  </>
                ) : (
                  <>
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                      />
                    </svg>
                    导入 {endpoints.length} 个端点
                  </>
                )}
              </button>
            )}
          </div>
          )}
        </div>
      </div>
    </div>
  );
}
