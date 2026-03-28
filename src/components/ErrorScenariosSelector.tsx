'use client';

import { useState } from 'react';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
  ERROR_SCENARIOS,
  ERROR_SCENARIO_CATEGORIES,
  getErrorScenariosByCategory,
  applyErrorScenario,
  type ErrorScenario,
  type ErrorScenarioType,
} from '@/lib/error-scenarios';

// 错误场景图标组件
const ErrorCategoryIcons = {
  server: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  ),
  client: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M12 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  timeout: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  network: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
    </svg>
  ),
};

interface ErrorScenariosSelectorProps {
  onApply: (scenario: ErrorScenario) => void;
  disabled?: boolean;
}

export function ErrorScenariosSelector({ onApply, disabled = false }: ErrorScenariosSelectorProps) {
  const [selectedCategory, setSelectedCategory] = useState<keyof typeof ERROR_SCENARIO_CATEGORIES | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<ErrorScenarioType | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const scenariosByCategory = getErrorScenariosByCategory();
  const selectedScenarioData = selectedScenario ? ERROR_SCENARIOS[selectedScenario] : null;

  const handleScenarioClick = (scenarioId: ErrorScenarioType) => {
    setSelectedScenario(scenarioId);
    setShowPreview(true);
  };

  const handleApply = () => {
    if (selectedScenarioData) {
      onApply(selectedScenarioData);
      setShowPreview(false);
      setSelectedScenario(null);
    }
  };

  const handleCancel = () => {
    setShowPreview(false);
    setSelectedScenario(null);
  };

  return (
    <>
      {/* 错误场景选择器 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                错误场景模拟
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                快速配置常见的错误响应场景
              </p>
            </div>
          </div>
        </CardHeader>
        <CardBody>
          {/* 分类选择 */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              选择错误类型
            </label>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(ERROR_SCENARIO_CATEGORIES).map(([key, category]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedCategory(key as keyof typeof ERROR_SCENARIO_CATEGORIES)}
                  disabled={disabled}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 transition-all disabled:opacity-50 ${
                    selectedCategory === key
                      ? 'border-red-500 bg-red-50 dark:bg-red-900/30'
                      : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 bg-white dark:bg-gray-800'
                  }`}
                >
                  <span className={selectedCategory === key ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}>
                    {ErrorCategoryIcons[key as keyof typeof ErrorCategoryIcons]}
                  </span>
                  <div className="text-left">
                    <div className={`text-sm font-medium ${
                      selectedCategory === key
                        ? 'text-red-700 dark:text-red-400'
                        : 'text-gray-700 dark:text-gray-300'
                    }`}>
                      {category.name}
                    </div>
                    <div className="text-[10px] text-gray-500 dark:text-gray-400">
                      {category.description}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* 场景列表 */}
          {selectedCategory && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                选择具体场景
              </label>
              <div className="space-y-2">
                {scenariosByCategory[selectedCategory]?.map((scenario) => (
                  <button
                    key={scenario.id}
                    type="button"
                    onClick={() => handleScenarioClick(scenario.id)}
                    disabled={disabled}
                    className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-all disabled:opacity-50 ${
                      selectedScenario === scenario.id
                        ? 'border-red-500 bg-red-50 dark:bg-red-900/30'
                        : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-750'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                            scenario.statusCode >= 500
                              ? 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400'
                              : scenario.statusCode >= 400
                              ? 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-400'
                              : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                          }`}>
                            {scenario.statusCode}
                          </span>
                          <span className={`text-sm font-semibold ${
                            selectedScenario === scenario.id
                              ? 'text-red-700 dark:text-red-400'
                              : 'text-gray-700 dark:text-gray-300'
                          }`}>
                            {scenario.name}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                          {scenario.description}
                        </p>
                      </div>
                      <svg className={`w-5 h-5 flex-shrink-0 ${
                        selectedScenario === scenario.id
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-gray-400 dark:text-gray-500'
                      }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                    {scenario.delayMs > 0 && (
                      <div className="mt-2 flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        延迟: {(scenario.delayMs / 1000).toFixed(1)}秒
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 重置按钮 */}
          {selectedCategory && (
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={() => {
                  setSelectedCategory(null);
                  setSelectedScenario(null);
                }}
                disabled={disabled}
                className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                重置选择
              </button>
            </div>
          )}
        </CardBody>
      </Card>

      {/* 预览对话框 */}
      {showPreview && selectedScenarioData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
            {/* 头部 */}
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${
                  selectedScenarioData.statusCode >= 500
                    ? 'bg-red-100 dark:bg-red-900/30'
                    : selectedScenarioData.statusCode >= 400
                    ? 'bg-yellow-100 dark:bg-yellow-900/30'
                    : 'bg-gray-100 dark:bg-gray-700'
                }`}>
                  <svg className={`w-5 h-5 ${
                    selectedScenarioData.statusCode >= 500
                      ? 'text-red-600 dark:text-red-400'
                      : selectedScenarioData.statusCode >= 400
                      ? 'text-yellow-600 dark:text-yellow-400'
                      : 'text-gray-600 dark:text-gray-400'
                  }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900 dark:text-white">
                    {selectedScenarioData.name}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {selectedScenarioData.description}
                  </p>
                </div>
              </div>
            </div>

            {/* 配置预览 */}
            <div className="px-6 py-4 space-y-4 overflow-y-auto max-h-[60vh]">
              {/* 状态码和内容类型 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                    响应状态码
                  </label>
                  <div className={`px-3 py-2 rounded-lg font-mono text-sm ${
                    selectedScenarioData.statusCode >= 500
                      ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                      : selectedScenarioData.statusCode >= 400
                      ? 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400'
                      : 'bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                  }`}>
                    {selectedScenarioData.statusCode}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                    Content-Type
                  </label>
                  <div className="px-3 py-2 rounded-lg font-mono text-sm bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                    {selectedScenarioData.contentType}
                  </div>
                </div>
              </div>

              {/* 延迟 */}
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  模拟延迟
                </label>
                <div className="px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                  {selectedScenarioData.delayMs > 0
                    ? `${selectedScenarioData.delayMs} ms (${(selectedScenarioData.delayMs / 1000).toFixed(1)} 秒)`
                    : '无延迟'}
                </div>
              </div>

              {/* 响应头 */}
              {selectedScenarioData.headers && Object.keys(selectedScenarioData.headers).length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                    响应头
                  </label>
                  <div className="px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700">
                    <pre className="text-xs text-gray-700 dark:text-gray-300 overflow-x-auto">
                      {JSON.stringify(selectedScenarioData.headers, null, 2)}
                    </pre>
                  </div>
                </div>
              )}

              {/* 响应体 */}
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  响应体
                </label>
                <div className="px-3 py-2 rounded-lg bg-gray-900 dark:bg-gray-950 max-h-60 overflow-auto">
                  <pre className="text-xs text-gray-100 dark:text-gray-100 font-mono whitespace-pre-wrap break-words">
                    {typeof selectedScenarioData.responseBody === 'string'
                      ? selectedScenarioData.responseBody || '(空响应)'
                      : JSON.stringify(selectedScenarioData.responseBody, null, 2)}
                  </pre>
                </div>
              </div>

              {/* 提示信息 */}
              <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <svg className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                <p className="text-xs text-blue-700 dark:text-blue-400">
                  应用此场景将更新端点的状态码、响应体和延迟配置。原有的响应数据将被覆盖。
                </p>
              </div>
            </div>

            {/* 底部按钮 */}
            <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={handleCancel}
                disabled={disabled}
              >
                取消
              </Button>
              <Button
                type="button"
                onClick={handleApply}
                disabled={disabled}
              >
                应用场景
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
