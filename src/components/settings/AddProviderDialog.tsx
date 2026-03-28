/**
 * 添加/编辑 Provider 对话框
 */

'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PRESET_PROVIDERS, PresetProvider } from '@/lib/ai-presets';
import { X, Loader2 } from 'lucide-react';

interface Provider {
  id: string;
  name: string;
  provider: 'openai' | 'anthropic' | 'openai-compatible';
  baseUrl?: string;
  models: string[];
  defaultModel: string;
  systemPrompt?: string;
  isActive: boolean;
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
}

interface AddProviderDialogProps {
  isOpen: boolean;
  onClose: () => void;
  provider?: Provider | null;
  onSave: (data: any) => Promise<void>;
}

export default function AddProviderDialog({
  isOpen,
  onClose,
  provider,
  onSave,
}: AddProviderDialogProps) {
  const [formData, setFormData] = useState({
    name: '',
    provider: 'openai' as 'openai' | 'anthropic' | 'openai-compatible',
    baseUrl: '',
    apiKey: '',
    models: [] as string[],
    defaultModel: '',
    systemPrompt: '',
    isDefault: false,
  });

  const [loading, setLoading] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<PresetProvider | null>(null);

  // 初始化表单
  useEffect(() => {
    if (provider) {
      setFormData({
        name: provider.name,
        provider: provider.provider,
        baseUrl: provider.baseUrl || '',
        apiKey: '', // 编辑时不回填 API Key
        models: provider.models,
        defaultModel: provider.defaultModel,
        systemPrompt: provider.systemPrompt || '',
        isDefault: provider.isDefault,
      });
    } else if (isOpen) {
      // 清空表单
      setFormData({
        name: '',
        provider: 'openai',
        baseUrl: '',
        apiKey: '',
        models: [],
        defaultModel: '',
        systemPrompt: '',
        isDefault: false,
      });
      setSelectedPreset(null);
    }
  }, [provider, isOpen]);

  // 选择预设
  const handleSelectPreset = (preset: PresetProvider) => {
    setSelectedPreset(preset);
    setFormData({
      name: preset.name,
      provider: preset.provider,
      baseUrl: preset.baseUrl || '',
      apiKey: '',
      models: preset.models,
      defaultModel: preset.defaultModel,
      systemPrompt: '',
      isDefault: false,
    });
  };

  // 提交
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await onSave(formData);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-auto">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {provider ? '编辑 AI 模型' : '添加 AI 模型'}
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* 预设选择（仅新增时） */}
          {!provider && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                选择预设（可选）
              </label>
              <div className="grid grid-cols-3 gap-2">
                {PRESET_PROVIDERS.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => handleSelectPreset(preset)}
                    className={`p-2 text-xs rounded border text-left transition-all ${
                      selectedPreset?.name === preset.name
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    <div className="font-medium text-gray-900 dark:text-gray-100">
                      {preset.name}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 名称 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              名称 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          {/* Provider 类型 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Provider 类型
            </label>
            <select
              value={formData.provider}
              onChange={(e) => setFormData({ ...formData, provider: e.target.value as any })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="openai-compatible">OpenAI Compatible</option>
            </select>
          </div>

          {/* Base URL（仅兼容模式） */}
          {formData.provider === 'openai-compatible' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                API 地址
              </label>
              <input
                type="url"
                value={formData.baseUrl}
                onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="https://api.example.com/v1"
              />
            </div>
          )}

          {/* API Key */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              API Key <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              value={formData.apiKey}
              onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
              placeholder={provider ? '留空则不修改' : 'sk-...'}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required={!provider}
            />
          </div>

          {/* Models */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              模型列表（JSON 数组） <span className="text-red-500">*</span>
            </label>
            <textarea
              value={JSON.stringify(formData.models, null, 2)}
              onChange={(e) => {
                try {
                  const models = JSON.parse(e.target.value);
                  setFormData({ ...formData, models });
                } catch {
                  // 忽略解析错误
                }
              }}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
              required
            />
          </div>

          {/* Default Model */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              默认模型 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.defaultModel}
              onChange={(e) => setFormData({ ...formData, defaultModel: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          {/* System Prompt */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              System Prompt（可选）
            </label>
            <textarea
              value={formData.systemPrompt}
              onChange={(e) => setFormData({ ...formData, systemPrompt: e.target.value })}
              rows={4}
              placeholder="自定义 AI 的系统提示词..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            />
          </div>

          {/* Set as Default */}
          {!provider && (
            <div className="flex items-center">
              <input
                type="checkbox"
                id="isDefault"
                checked={formData.isDefault}
                onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <label htmlFor="isDefault" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                设为默认模型
              </label>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-700">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={loading}
            >
              取消
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  保存中...
                </>
              ) : (
                '保存'
              )}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
