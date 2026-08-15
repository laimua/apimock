'use client';

/**
 * EndpointForm — 新建/编辑端点两页共享的表单组件(C1c)
 *
 * 合并自 endpoints/new/page.tsx 与 endpoints/[endpointId]/page.tsx 的两张表单卡片
 * (基本信息 + 响应配置),受控组件:form/tagsInput/errors 等 state 仍由页面持有
 * (dirty 追踪、beforeunload、提交逻辑都在页面),本组件只承载 JSX 与纯交互 handler。
 *
 * 两页行为差异通过 mode 显式分支保留(不改行为):
 * - create: 路径自动补头斜杠 + blur 实时校验 + 路径模板 + Mock URL 预览 +
 *   placeholder 文案 + form id="endpoint-form"(提交按钮在页面,form 属性关联) +
 *   响应配置卡片底部 ErrorScenariosSelector(responseExtrasSlot)
 * - edit: 路径错误顶部 banner + CardHeader "基本信息" + 卡片底部按钮(footerSlot) +
 *   响应配置卡片顶部快速错误场景(quickScenariosSlot,QUICK_ERROR_SCENARIOS 留在编辑页) +
 *   data-testid="status-code-select" / "open-template-library"(E2E 锚点,一律不动)
 *
 * E2E 锚点(placeholder / data-testid / id)逐字保留,见 e2e/endpoint.spec.ts、
 * e2e/error-scenarios.spec.ts、e2e/template-library.spec.ts。
 */

import { useState } from 'react';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/Toast';
import { JsonEditor } from '@/components/JsonEditor';
import { AiGenerateDialog } from '@/components/AiGenerateDialog';
import { TemplateLibraryDialog } from '@/components/TemplateLibraryDialog';
import {
  copyToClipboard,
  splitTags as normalizeTags,
  resolveBodyOnContentTypeChange,
} from '@/lib/utils';
import { METHODS, STATUS_CODES, COMMON_STATUS_CODES } from '@/lib/constants';
import {
  PATH_TEMPLATES,
  CONTENT_TYPES,
  DEFAULT_RESPONSES,
  validatePath,
  buildMockUrl,
  type EndpointFormState,
} from '@/lib/endpoint-form-utils';

export interface EndpointFormErrors {
  path?: string;
  responseBody?: string;
}

interface EndpointFormProps {
  mode: 'create' | 'edit';
  form: EndpointFormState;
  setForm: React.Dispatch<React.SetStateAction<EndpointFormState>>;
  tagsInput: string;
  setTagsInput: (value: string) => void;
  errors: EndpointFormErrors;
  setErrors: React.Dispatch<React.SetStateAction<EndpointFormErrors>>;
  /** 提交中(新建 loading / 编辑 saving),统一禁用所有控件 */
  disabled: boolean;
  onSubmit: (e: React.FormEvent) => void;
  /** create: Mock URL 预览拼接用 */
  projectSlug?: string;
  /** create: 路径字段触摸跟踪(blur 后才实时校验) */
  touched?: Record<string, boolean>;
  setTouched?: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  /** edit-only: 快速错误场景区块(QUICK_ERROR_SCENARIOS,留在编辑页渲染传入) */
  quickScenariosSlot?: React.ReactNode;
  /** create-only: 响应配置卡片底部 extras(ErrorScenariosSelector) */
  responseExtrasSlot?: React.ReactNode;
  /** edit-only: 基本信息卡片底部按钮区(取消/保存) */
  footerSlot?: React.ReactNode;
}

export function EndpointForm({
  mode,
  form,
  setForm,
  tagsInput,
  setTagsInput,
  errors,
  setErrors,
  disabled,
  onSubmit,
  projectSlug,
  touched,
  setTouched,
  quickScenariosSlot,
  responseExtrasSlot,
  footerSlot,
}: EndpointFormProps) {
  const isCreate = mode === 'create';
  const { success, error: toastError } = useToast();
  const [showAiDialog, setShowAiDialog] = useState(false);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);

  // 获取完整的 Mock URL(create: 路径下方预览)
  function getMockUrl(): string {
    if (typeof window === 'undefined') return '';
    return buildMockUrl(window.location.origin, projectSlug, form.path);
  }

  // create: 路径输入自动补头斜杠 + 已触摸时实时校验
  function handlePathChange(value: string) {
    let normalizedPath = value.trim();
    if (normalizedPath && !normalizedPath.startsWith('/')) {
      normalizedPath = '/' + normalizedPath;
    }

    setForm((prev) => ({ ...prev, path: normalizedPath }));

    // 实时验证（如果已经触摸过该字段）
    if (touched?.path) {
      setErrors((prev) => ({
        ...prev,
        path: validatePath(normalizedPath),
      }));
    }
  }

  // create: blur 标记触摸并校验
  function handleBlur(field: string) {
    setTouched?.((prev) => ({ ...prev, [field]: true }));

    if (field === 'path') {
      setErrors((prev) => ({
        ...prev,
        path: validatePath(form.path),
      }));
    }
  }

  // create: 路径模板快捷填充
  function applyPathTemplate(templatePath: string) {
    setForm((prev) => ({ ...prev, path: templatePath }));
    setErrors((prev) => ({ ...prev, path: undefined }));
    setTouched?.((prev) => ({ ...prev, path: true }));
  }

  // 处理内容类型变更
  function handleContentTypeChange(contentType: string) {
    setForm((prev) => ({
      ...prev,
      contentType,
      // P1-17:仅当当前 body 为空或等于当前类型默认模板时才替换,否则保留用户已写内容
      responseBody: resolveBodyOnContentTypeChange(
        prev.responseBody,
        prev.contentType,
        contentType,
        DEFAULT_RESPONSES,
      ),
    }));
  }

  // AI 生成响应数据
  const handleAiGenerated = (data: unknown) => {
    // FE23:防 undefined(AI 可能返空),JSON.stringify(undefined) 返 undefined 非字符串致 JsonEditor 崩
    const jsonString = JSON.stringify(data ?? {}, null, 2);
    setForm((prev) => ({ ...prev, responseBody: jsonString }));
  };

  // 应用模板
  const handleTemplateApplied = (content: string) => {
    setForm((prev) => ({ ...prev, responseBody: content }));
    success('模板已应用');
  };

  // 标签失焦归一化(trim/去空/去重)落回 form.tags
  function handleTagsBlur() {
    const tags = normalizeTags(tagsInput);
    setForm((prev) => ({ ...prev, tags }));
    setTagsInput(tags.join(', '));
  }

  return (
    <>
      {/* 基本信息 */}
      <Card>
        <form id={isCreate ? 'endpoint-form' : undefined} onSubmit={onSubmit}>
          {!isCreate && (
            <CardHeader>
              <h2 className="font-semibold text-gray-900 dark:text-white">基本信息</h2>
            </CardHeader>
          )}
          <CardBody className={isCreate ? 'space-y-4 sm:space-y-6' : 'space-y-6'}>
            {/* edit: 路径错误顶部 banner(create 在输入框下方内联展示) */}
            {!isCreate && errors.path && (
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
                    disabled={disabled}
                    className={`${isCreate ? 'px-3 py-1.5' : 'p-2'} rounded-lg border-2 transition-colors disabled:opacity-50 ${
                      form.method === method
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                        : `border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500${isCreate ? '' : ' bg-white dark:bg-gray-800'}`
                    }`}
                  >
                    <Badge method={method} />
                  </button>
                ))}
              </div>
            </div>

            {/* 路径 */}
            <div>
              <label htmlFor="endpoint-path" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                路径 <span className="text-red-500">*</span>
              </label>
              {isCreate ? (
                <div className="relative">
                  <input
                    id="endpoint-path"
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
                    disabled={disabled}
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
              ) : (
                <input
                  id="endpoint-path"
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
                  disabled={disabled}
                />
              )}
              {isCreate && errors.path && (
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

              {/* create: 路径模板快捷按钮 */}
              {isCreate && (
                <div className="mt-2">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">常用路径：</p>
                  <div className="flex flex-wrap gap-1">
                    {PATH_TEMPLATES.map((template) => (
                      <button
                        key={template}
                        type="button"
                        onClick={() => applyPathTemplate(template)}
                        disabled={disabled}
                        className="px-2 py-1 text-xs font-mono bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded text-gray-700 dark:text-gray-300 disabled:opacity-50 transition-colors"
                      >
                        {template}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* create: URL 预览 */}
              {isCreate && form.path && (
                <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs text-blue-700 dark:text-blue-300 font-medium">Mock URL 预览：</p>
                    <button
                      type="button"
                      onClick={async () => {
                        const ok = await copyToClipboard(getMockUrl());
                        if (ok) success('已复制 Mock URL');
                        else toastError('复制失败，请手动复制');
                      }}
                      disabled={disabled || !form.path}
                      className="text-xs text-blue-700 dark:text-blue-300 hover:underline disabled:opacity-50"
                    >
                      复制
                    </button>
                  </div>
                  <code className="text-sm text-blue-800 dark:text-blue-200 font-mono break-all block">
                    {getMockUrl()}
                  </code>
                </div>
              )}
            </div>

            {/* 名称 */}
            <div>
              <label htmlFor="endpoint-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                名称
              </label>
              <input
                id="endpoint-name"
                type="text"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                className={`w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors${isCreate ? ' text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800' : ''}`}
                placeholder={isCreate ? '获取用户列表' : undefined}
                disabled={disabled}
              />
            </div>

            {/* 描述 */}
            <div>
              <label htmlFor="endpoint-description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                描述
              </label>
              <textarea
                id="endpoint-description"
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                className={`w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors resize-none${isCreate ? ' text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800' : ''}`}
                rows={3}
                placeholder={isCreate ? '端点描述（可选）' : undefined}
                disabled={disabled}
              />
            </div>

            {/* 标签 */}
            <div>
              <label htmlFor="endpoint-tags" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                标签
              </label>
              <input
                id="endpoint-tags"
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                onBlur={handleTagsBlur}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800"
                placeholder="用逗号分隔，如: 用户, 列表, 分页"
                disabled={disabled}
              />
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                用于项目详情页的标签筛选
              </p>
            </div>

            {/* 分享可见性 */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={form.isShareable}
                  onChange={(e) => setForm((prev) => ({ ...prev, isShareable: e.target.checked }))}
                  disabled={disabled}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                在分享页显示此端点
              </label>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                关闭后，访问分享页的协作者看不到此端点
              </p>
            </div>

            {/* 模拟延迟 */}
            <div>
              <label htmlFor="endpoint-delay" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                模拟延迟 (ms)
              </label>
              <input
                id="endpoint-delay"
                type="number"
                value={form.delayMs}
                onChange={(e) => setForm((prev) => ({ ...prev, delayMs: Math.max(0, parseInt(e.target.value) || 0) }))}
                className={`w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors${isCreate ? ' text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800' : ''}`}
                min={0}
                placeholder={isCreate ? '0' : undefined}
                disabled={disabled}
              />
              {isCreate && (
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  设置响应延迟，模拟网络延迟或慢速服务
                </p>
              )}
            </div>
          </CardBody>

          {/* edit: 卡片底部按钮(取消/保存) */}
          {!isCreate && footerSlot}
        </form>
      </Card>

      {/* 响应配置 */}
      <Card>
        <CardHeader>
          <h2 className="font-semibold text-gray-900 dark:text-white">响应配置</h2>
        </CardHeader>
        <CardBody className="space-y-6">
          {/* edit-only: 快速错误场景(QUICK_ERROR_SCENARIOS) */}
          {!isCreate && quickScenariosSlot}

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
                    disabled={disabled}
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
                <label htmlFor="endpoint-status-code" className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                  或选择其他状态码
                </label>
                <select
                  id="endpoint-status-code"
                  data-testid={isCreate ? undefined : 'status-code-select'}
                  value={form.statusCode}
                  onChange={(e) => setForm((prev) => ({ ...prev, statusCode: parseInt(e.target.value) || 200 }))}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                  disabled={disabled}
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
            <label htmlFor="endpoint-content-type" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Content-Type
            </label>
            <select
              id="endpoint-content-type"
              value={form.contentType}
              onChange={(e) => handleContentTypeChange(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
              disabled={disabled}
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
              <label htmlFor="endpoint-response-body" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                响应数据
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-testid={isCreate ? undefined : 'open-template-library'}
                  onClick={() => setShowTemplateDialog(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 rounded-lg transition-colors"
                  disabled={disabled}
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
                  disabled={disabled}
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
                  readOnly={disabled}
                  height="300px"
                />
              ) : (
                <textarea
                  id="endpoint-response-body"
                  value={form.responseBody}
                  onChange={(e) => {
                    setForm((prev) => ({ ...prev, responseBody: e.target.value }));
                    setErrors((prev) => ({ ...prev, responseBody: undefined }));
                  }}
                  className="w-full px-4 py-2 font-mono text-sm border rounded-lg text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors resize-none border-gray-300 dark:border-gray-600"
                  rows={12}
                  disabled={disabled}
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

          {/* create-only: 错误场景选择器(编辑页的在右侧栏,由页面自持) */}
          {isCreate && responseExtrasSlot}
        </CardBody>
      </Card>

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
    </>
  );
}
