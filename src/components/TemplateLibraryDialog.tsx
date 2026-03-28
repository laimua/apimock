'use client';

import React, { useState } from 'react';
import {
  MOCK_TEMPLATES,
  TEMPLATE_CATEGORIES,
  type TemplateCategory,
  type MockTemplate,
  formatTemplateContent,
} from '@/lib/mock-templates';

interface TemplateLibraryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (content: string) => void;
}

// 分类图标组件
const CategoryIcons: Record<TemplateCategory, () => React.ReactElement> = {
  user: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  ),
  product: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  ),
  pagination: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
    </svg>
  ),
  error: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  success: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  list: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
    </svg>
  ),
};

// 分类颜色配置
const CategoryColors: Record<TemplateCategory, { bg: string; text: string; border: string }> = {
  user: {
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    text: 'text-blue-600 dark:text-blue-400',
    border: 'border-blue-200 dark:border-blue-800',
  },
  product: {
    bg: 'bg-green-50 dark:bg-green-900/20',
    text: 'text-green-600 dark:text-green-400',
    border: 'border-green-200 dark:border-green-800',
  },
  pagination: {
    bg: 'bg-purple-50 dark:bg-purple-900/20',
    text: 'text-purple-600 dark:text-purple-400',
    border: 'border-purple-200 dark:border-purple-800',
  },
  error: {
    bg: 'bg-red-50 dark:bg-red-900/20',
    text: 'text-red-600 dark:text-red-400',
    border: 'border-red-200 dark:border-red-800',
  },
  success: {
    bg: 'bg-emerald-50 dark:bg-emerald-900/20',
    text: 'text-emerald-600 dark:text-emerald-400',
    border: 'border-emerald-200 dark:border-emerald-800',
  },
  list: {
    bg: 'bg-orange-50 dark:bg-orange-900/20',
    text: 'text-orange-600 dark:text-orange-400',
    border: 'border-orange-200 dark:border-orange-800',
  },
};

export function TemplateLibraryDialog({
  isOpen,
  onClose,
  onApply,
}: TemplateLibraryDialogProps) {
  const [selectedCategory, setSelectedCategory] = useState<TemplateCategory | 'all'>('all');
  const [selectedTemplate, setSelectedTemplate] = useState<MockTemplate | null>(null);
  const [previewContent, setPreviewContent] = useState<string>('');

  if (!isOpen) return null;

  const categories: (TemplateCategory | 'all')[] = ['all', ...Object.keys(TEMPLATE_CATEGORIES) as TemplateCategory[]];

  const filteredTemplates = selectedCategory === 'all'
    ? MOCK_TEMPLATES
    : MOCK_TEMPLATES.filter((t) => t.category === selectedCategory);

  const handleTemplateClick = (template: MockTemplate) => {
    setSelectedTemplate(template);
    setPreviewContent(formatTemplateContent(template));
  };

  const handleApply = () => {
    if (selectedTemplate) {
      onApply(previewContent);
      handleClose();
    }
  };

  const handleClose = () => {
    setSelectedCategory('all');
    setSelectedTemplate(null);
    setPreviewContent('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />

      {/* Dialog */}
      <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-5xl w-full mx-4 max-h-[90vh] flex flex-col animate-scale-in">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
              <svg className="w-6 h-6 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                Mock 模板库
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                选择预设模板快速应用到响应数据
              </p>
            </div>
          </div>

          {/* Category Tabs */}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSelectedCategory('all')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedCategory === 'all'
                  ? 'bg-gray-900 dark:bg-gray-700 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              全部模板 ({MOCK_TEMPLATES.length})
            </button>
            {Object.entries(TEMPLATE_CATEGORIES).map(([key, { name }]) => {
              const category = key as TemplateCategory;
              const count = MOCK_TEMPLATES.filter((t) => t.category === category).length;
              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => setSelectedCategory(category)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                    selectedCategory === category
                      ? CategoryColors[category].bg + ' ' + CategoryColors[category].text + ' border-2 ' + CategoryColors[category].border
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  {CategoryIcons[category]()}
                  {name} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex">
          {/* Template List */}
          <div className="w-1/2 overflow-y-auto border-r border-gray-200 dark:border-gray-700 p-4">
            <div className="grid gap-2">
              {filteredTemplates.map((template) => {
                const isSelected = selectedTemplate?.id === template.id;
                const colors = CategoryColors[template.category];
                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => handleTemplateClick(template)}
                    className={`text-left p-4 rounded-lg border-2 transition-all hover:shadow-md ${
                      isSelected
                        ? colors.bg + ' ' + colors.border + ' ' + colors.text + ' shadow-md'
                        : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${isSelected ? colors.bg + ' ' + colors.text : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
                        {CategoryIcons[template.category]()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className={`font-medium mb-1 ${isSelected ? colors.text : 'text-gray-900 dark:text-gray-100'}`}>
                          {template.name}
                        </h4>
                        <p className={`text-sm ${isSelected ? colors.text + ' opacity-80' : 'text-gray-600 dark:text-gray-400'}`}>
                          {template.description}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Preview Panel */}
          <div className="w-1/2 overflow-y-auto p-4 bg-gray-50 dark:bg-gray-900">
            {selectedTemplate ? (
              <div className="space-y-4">
                {/* Template Info */}
                <div className={`p-4 rounded-lg border-2 ${CategoryColors[selectedTemplate.category].bg} ${CategoryColors[selectedTemplate.category].border}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`p-1.5 rounded ${CategoryColors[selectedTemplate.category].bg} ${CategoryColors[selectedTemplate.category].text}`}>
                      {CategoryIcons[selectedTemplate.category]()}
                    </div>
                    <h3 className={`font-semibold ${CategoryColors[selectedTemplate.category].text}`}>
                      {selectedTemplate.name}
                    </h3>
                  </div>
                  <p className={`text-sm ${CategoryColors[selectedTemplate.category].text} opacity-80`}>
                    {selectedTemplate.description}
                  </p>
                  <div className="mt-2 text-xs font-mono text-gray-500 dark:text-gray-400">
                    模板 ID: {selectedTemplate.id}
                  </div>
                </div>

                {/* JSON Preview */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">响应数据预览</h4>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(previewContent);
                      }}
                      className="text-xs px-2 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                    >
                      复制
                    </button>
                  </div>
                  <pre className="bg-gray-900 dark:bg-gray-950 text-gray-100 dark:text-gray-100 p-4 rounded-lg text-sm overflow-x-auto max-h-96 overflow-y-auto">
                    <code>{previewContent}</code>
                  </pre>
                </div>

                {/* Apply Button */}
                <button
                  type="button"
                  onClick={handleApply}
                  className="w-full px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors font-medium flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  应用此模板
                </button>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center">
                <div className="text-center text-gray-500 dark:text-gray-400">
                  <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  <p className="text-lg font-medium">选择一个模板</p>
                  <p className="text-sm mt-1">点击左侧模板查看详情</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
