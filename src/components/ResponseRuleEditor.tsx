'use client';

import { useState, useEffect } from 'react';
import { responsesApi, ResponseRule, CreateResponseRuleDto, ApiError } from '@/lib/api-client';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { JsonEditor } from '@/components/JsonEditor';

// 常用 HTTP 状态码
const STATUS_CODES = [
  { value: 200, label: '200 OK' },
  { value: 201, label: '201 Created' },
  { value: 204, label: '204 No Content' },
  { value: 400, label: '400 Bad Request' },
  { value: 401, label: '401 Unauthorized' },
  { value: 403, label: '403 Forbidden' },
  { value: 404, label: '404 Not Found' },
  { value: 500, label: '500 Internal Server Error' },
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

interface ResponseRuleEditorProps {
  projectId: string;
  endpointId: string;
}

export function ResponseRuleEditor({ projectId, endpointId }: ResponseRuleEditorProps) {
  const { success, error: toastError } = useToast();
  const [responses, setResponses] = useState<ResponseRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingResponse, setEditingResponse] = useState<ResponseRule | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // 表单状态
  const [form, setForm] = useState<CreateResponseRuleDto>({
    name: '',
    description: '',
    statusCode: 200,
    contentType: 'application/json',
    headers: {},
    body: DEFAULT_RESPONSES['application/json'],
    matchRules: {},
    isDefault: false,
    priority: 0,
  });

  // 匹配规则简化表单
  const [queryMatches, setQueryMatches] = useState<Record<string, string>>({});
  const [headerMatches, setHeaderMatches] = useState<Record<string, string>>({});

  useEffect(() => {
    loadResponses();
  }, [projectId, endpointId]);

  async function loadResponses() {
    try {
      setLoading(true);
      const data = await responsesApi.list(projectId, endpointId);
      setResponses(data);
    } catch (err) {
      if (err instanceof ApiError) {
        toastError(err.message);
      } else {
        toastError('加载响应规则失败');
      }
    } finally {
      setLoading(false);
    }
  }

  function openCreateDialog() {
    setEditingResponse(null);
    setForm({
      name: '',
      description: '',
      statusCode: 200,
      contentType: 'application/json',
      headers: {},
      body: DEFAULT_RESPONSES['application/json'],
      matchRules: {},
      isDefault: responses.length === 0, // 如果没有响应，默认设为默认响应
      priority: responses.length,
    });
    setQueryMatches({});
    setHeaderMatches({});
    setShowDialog(true);
  }

  function openEditDialog(response: ResponseRule) {
    setEditingResponse(response);
    const bodyStr =
      typeof response.body === 'string'
        ? response.body
        : JSON.stringify(response.body || {}, null, 2);

    setForm({
      name: response.name,
      description: response.description || '',
      statusCode: response.statusCode,
      contentType: response.contentType,
      headers: response.headers || {},
      body: bodyStr || DEFAULT_RESPONSES[response.contentType as keyof typeof DEFAULT_RESPONSES] || '',
      matchRules: response.matchRules || {},
      isDefault: response.isDefault,
      priority: response.priority,
    });

    // 设置匹配规则简化表单
    setQueryMatches(response.matchRules?.query || {});
    setHeaderMatches(response.matchRules?.header || {});

    setShowDialog(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // 验证
    if (!form.name.trim()) {
      toastError('请输入响应名称');
      return;
    }

    // 构建 matchRules
    const matchRules: { query?: Record<string, string>; header?: Record<string, string> } = {};
    if (Object.keys(queryMatches).length > 0) {
      matchRules.query = queryMatches;
    }
    if (Object.keys(headerMatches).length > 0) {
      matchRules.header = headerMatches;
    }

    try {
      setSaving(true);

      const submitData: CreateResponseRuleDto = {
        name: form.name.trim(),
        description: form.description?.trim() || undefined,
        statusCode: form.statusCode,
        contentType: form.contentType,
        headers: form.headers,
        matchRules,
        isDefault: form.isDefault,
        priority: form.priority,
      };

      // 处理 body
      if (form.contentType === 'application/json') {
        try {
          submitData.body = JSON.parse(form.body as string);
        } catch {
          toastError('无效的 JSON 格式');
          return;
        }
      } else {
        submitData.body = form.body;
      }

      if (editingResponse) {
        await responsesApi.update(projectId, endpointId, editingResponse.id, submitData);
        success('响应规则已更新');
      } else {
        await responsesApi.create(projectId, endpointId, submitData);
        success('响应规则已创建');
      }

      setShowDialog(false);
      await loadResponses();
    } catch (err) {
      if (err instanceof ApiError) {
        toastError(err.message);
      } else {
        toastError(editingResponse ? '更新失败' : '创建失败');
      }
    } finally {
      setSaving(false);
    }
  }

  function handleDelete(response: ResponseRule) {
    setDeletingId(response.id);
    setShowDeleteDialog(true);
  }

  async function confirmDelete() {
    if (!deletingId) return;

    try {
      await responsesApi.delete(projectId, endpointId, deletingId);
      success('响应规则已删除');
      setShowDeleteDialog(false);
      setDeletingId(null);
      await loadResponses();
    } catch (err) {
      if (err instanceof ApiError) {
        toastError(err.message);
      } else {
        toastError('删除失败');
      }
    }
  }

  function handleContentTypeChange(contentType: string) {
    setForm((prev) => ({
      ...prev,
      contentType,
      body: DEFAULT_RESPONSES[contentType as keyof typeof DEFAULT_RESPONSES] || '',
    }));
  }

  // 添加 query 匹配规则
  function addQueryMatch() {
    setQueryMatches((prev) => ({ ...prev, '': '' }));
  }

  function updateQueryMatch(key: string, value: string) {
    setQueryMatches((prev) => {
      const updated = { ...prev };
      if (key in updated) {
        if (value === '') {
          delete updated[key];
        } else {
          updated[key] = value;
        }
      }
      return updated;
    });
  }

  function removeQueryMatch(key: string) {
    setQueryMatches((prev) => {
      const updated = { ...prev };
      delete updated[key];
      return updated;
    });
  }

  // 添加 header 匹配规则
  function addHeaderMatch() {
    setHeaderMatches((prev) => ({ ...prev, '': '' }));
  }

  function updateHeaderMatch(key: string, value: string) {
    setHeaderMatches((prev) => {
      const updated = { ...prev };
      if (key in updated) {
        if (value === '') {
          delete updated[key];
        } else {
          updated[key] = value;
        }
      }
      return updated;
    });
  }

  function removeHeaderMatch(key: string) {
    setHeaderMatches((prev) => {
      const updated = { ...prev };
      delete updated[key];
      return updated;
    });
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <h2 className="font-semibold text-gray-900 dark:text-white">响应规则</h2>
        </CardHeader>
        <CardBody>
          <div className="animate-pulse space-y-3">
            <div className="h-16 bg-gray-200 dark:bg-gray-700 rounded-lg" />
            <div className="h-16 bg-gray-200 dark:bg-gray-700 rounded-lg" />
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <h2 className="font-semibold text-gray-900 dark:text-white">响应规则</h2>
          <Button type="button" size="sm" onClick={openCreateDialog}>
            + 添加响应
          </Button>
        </CardHeader>
        <CardBody>
          {responses.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <p>暂无响应规则</p>
              <p className="text-sm mt-1">点击上方按钮添加第一个响应规则</p>
            </div>
          ) : (
            <div className="space-y-3">
              {responses.map((response) => (
                <div
                  key={response.id}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
                >
                  {/* 响应摘要 - 点击展开/折叠 */}
                  <button
                    type="button"
                    onClick={() => setExpandedId(expandedId === response.id ? null : response.id)}
                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${
                          response.statusCode >= 200 && response.statusCode < 300
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                            : response.statusCode >= 400
                            ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                            : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                        }`}
                      >
                        {response.statusCode}
                      </span>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {response.name}
                      </span>
                      {response.isDefault && (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                          默认
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <svg
                        className={`w-5 h-5 text-gray-400 transition-transform ${
                          expandedId === response.id ? 'rotate-180' : ''
                        }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>

                  {/* 展开的详细信息 */}
                  {expandedId === response.id && (
                    <div className="px-4 pb-4 border-t border-gray-200 dark:border-gray-700 pt-4">
                      {/* 匹配规则 */}
                      {(response.matchRules?.query || response.matchRules?.header) && (
                        <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                          <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
                            匹配规则
                          </p>
                          {response.matchRules.query && Object.keys(response.matchRules.query).length > 0 && (
                            <div className="text-sm mb-1">
                              <span className="text-gray-500 dark:text-gray-400">Query:</span>{' '}
                              <code className="text-gray-700 dark:text-gray-300">
                                {JSON.stringify(response.matchRules.query)}
                              </code>
                            </div>
                          )}
                          {response.matchRules.header && Object.keys(response.matchRules.header).length > 0 && (
                            <div className="text-sm">
                              <span className="text-gray-500 dark:text-gray-400">Header:</span>{' '}
                              <code className="text-gray-700 dark:text-gray-300">
                                {JSON.stringify(response.matchRules.header)}
                              </code>
                            </div>
                          )}
                        </div>
                      )}

                      {/* 描述 */}
                      {response.description && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                          {response.description}
                        </p>
                      )}

                      {/* 响应预览 */}
                      <div className="mb-4">
                        <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
                          响应预览
                        </p>
                        <pre className="bg-gray-900 text-gray-100 p-3 rounded-lg text-xs overflow-x-auto max-h-40">
                          {typeof response.body === 'string'
                            ? response.body
                            : JSON.stringify(response.body, null, 2)}
                        </pre>
                      </div>

                      {/* 操作按钮 */}
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => openEditDialog(response)}
                        >
                          编辑
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="danger"
                          onClick={() => handleDelete(response)}
                        >
                          删除
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 提示信息 */}
          {responses.length > 0 && !responses.some((r) => r.isDefault) && (
            <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 rounded-lg text-sm">
              ⚠️ 请确保至少有一个响应设置为默认响应，否则匹配失败时无法返回响应。
            </div>
          )}
        </CardBody>
      </Card>

      {/* 添加/编辑对话框 */}
      {showDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-gray-800 px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editingResponse ? '编辑响应规则' : '添加响应规则'}
              </h3>
              <button
                type="button"
                onClick={() => setShowDialog(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {/* 基本信息 */}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    响应名称 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={saving}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    描述
                  </label>
                  <input
                    type="text"
                    value={form.description}
                    onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={saving}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    优先级
                  </label>
                  <input
                    type="number"
                    value={form.priority}
                    onChange={(e) => setForm((prev) => ({ ...prev, priority: parseInt(e.target.value) || 0 }))}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    min={0}
                    max={1000}
                    disabled={saving}
                  />
                </div>
              </div>

              {/* 响应配置 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    状态码
                  </label>
                  <select
                    value={form.statusCode}
                    onChange={(e) => setForm((prev) => ({ ...prev, statusCode: parseInt(e.target.value) }))}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={saving}
                  >
                    {STATUS_CODES.map((code) => (
                      <option key={code.value} value={code.value}>
                        {code.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Content-Type
                  </label>
                  <select
                    value={form.contentType}
                    onChange={(e) => handleContentTypeChange(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={saving}
                  >
                    {CONTENT_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 匹配规则 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  匹配规则（可选）
                </label>

                {/* Query 参数匹配 */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Query 参数匹配</span>
                    <button
                      type="button"
                      onClick={addQueryMatch}
                      className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      + 添加
                    </button>
                  </div>
                  {Object.keys(queryMatches).length === 0 ? (
                    <p className="text-sm text-gray-400 dark:text-gray-500 italic">无匹配规则</p>
                  ) : (
                    <div className="space-y-2">
                      {Object.entries(queryMatches).map(([key, value], index) => (
                        <div key={index} className="flex gap-2">
                          <input
                            type="text"
                            placeholder="参数名"
                            value={key}
                            onChange={(e) => {
                              const newEntries = Object.entries(queryMatches);
                              newEntries[index] = [e.target.value, value];
                              setQueryMatches(Object.fromEntries(newEntries));
                            }}
                            className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800"
                            disabled={saving}
                          />
                          <input
                            type="text"
                            placeholder="期望值"
                            value={value}
                            onChange={(e) => updateQueryMatch(key, e.target.value)}
                            className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800"
                            disabled={saving}
                          />
                          <button
                            type="button"
                            onClick={() => removeQueryMatch(key)}
                            className="p-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Header 匹配 */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Header 匹配</span>
                    <button
                      type="button"
                      onClick={addHeaderMatch}
                      className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      + 添加
                    </button>
                  </div>
                  {Object.keys(headerMatches).length === 0 ? (
                    <p className="text-sm text-gray-400 dark:text-gray-500 italic">无匹配规则</p>
                  ) : (
                    <div className="space-y-2">
                      {Object.entries(headerMatches).map(([key, value], index) => (
                        <div key={index} className="flex gap-2">
                          <input
                            type="text"
                            placeholder="Header 名"
                            value={key}
                            onChange={(e) => {
                              const newEntries = Object.entries(headerMatches);
                              newEntries[index] = [e.target.value, value];
                              setHeaderMatches(Object.fromEntries(newEntries));
                            }}
                            className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800"
                            disabled={saving}
                          />
                          <input
                            type="text"
                            placeholder="期望值"
                            value={value}
                            onChange={(e) => updateHeaderMatch(key, e.target.value)}
                            className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800"
                            disabled={saving}
                          />
                          <button
                            type="button"
                            onClick={() => removeHeaderMatch(key)}
                            className="p-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* 响应数据 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  响应数据
                </label>
                {form.contentType === 'application/json' ? (
                  <JsonEditor
                    value={typeof form.body === 'string' ? form.body : JSON.stringify(form.body, null, 2)}
                    onChange={(value) => setForm((prev) => ({ ...prev, body: value }))}
                    readOnly={saving}
                    height="200px"
                  />
                ) : (
                  <textarea
                    value={typeof form.body === 'string' ? form.body : JSON.stringify(form.body)}
                    onChange={(e) => setForm((prev) => ({ ...prev, body: e.target.value }))}
                    className="w-full px-4 py-2 font-mono text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 resize-none"
                    rows={8}
                    disabled={saving}
                  />
                )}
              </div>

              {/* 设为默认响应 */}
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="isDefault"
                  checked={form.isDefault}
                  onChange={(e) => setForm((prev) => ({ ...prev, isDefault: e.target.checked }))}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  disabled={saving}
                />
                <label htmlFor="isDefault" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                  设为默认响应（当其他规则都不匹配时返回此响应）
                </label>
              </div>

              {/* 按钮 */}
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowDialog(false)}
                  disabled={saving}
                >
                  取消
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? '保存中...' : editingResponse ? '更新' : '创建'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 删除确认对话框 */}
      <ConfirmDialog
        isOpen={showDeleteDialog}
        title="删除响应规则"
        message="确定要删除此响应规则吗？此操作无法撤销。"
        confirmText="删除"
        cancelText="取消"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => {
          setShowDeleteDialog(false);
          setDeletingId(null);
        }}
      />
    </>
  );
}
