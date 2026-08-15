/**
 * 添加/编辑 Provider 对话框
 */

'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PRESET_PROVIDERS, PresetProvider } from '@/lib/ai-presets';
import { useDialogA11y } from '@/lib/use-dialog-a11y';
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

export type ProviderFormData = Omit<Provider, 'id' | 'createdAt' | 'updatedAt'> & { apiKey: string };

interface AddProviderDialogProps {
  isOpen: boolean;
  onClose: () => void;
  provider?: Provider | null;
  preset?: PresetProvider | null;
  onSave: (data: ProviderFormData) => Promise<void>;
}

// 解析模型列表 textarea 输入为 string[]。校验:必须是 JSON 数组且元素全为字符串。
// 返回 { ok, models, error }:ok=false 时 error 给行内提示。
// 导出供单测使用(P1-14)。
export function parseModelsInput(input: string): { ok: true; models: string[] } | { ok: false; error: string } {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, error: '模型列表不能为空' };
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) {
      return { ok: false, error: '必须是 JSON 数组,如 ["gpt-4", "gpt-3.5"]' };
    }
    if (parsed.length === 0) return { ok: false, error: '模型列表不能为空' };
    if (!parsed.every((m) => typeof m === 'string')) {
      return { ok: false, error: '数组元素必须都是字符串' };
    }
    return { ok: true, models: parsed as string[] };
  } catch {
    return { ok: false, error: '无效的 JSON,如 ["gpt-4", "gpt-3.5"]' };
  }
}

export default function AddProviderDialog({
  isOpen,
  onClose,
  provider,
  preset,
  onSave,
}: AddProviderDialogProps) {
  const [formData, setFormData] = useState<Omit<ProviderFormData, 'isActive'>>({
    name: '',
    provider: 'openai',
    baseUrl: '',
    apiKey: '',
    models: [],
    defaultModel: '',
    systemPrompt: '',
    isDefault: false,
  } satisfies Omit<ProviderFormData, 'isActive'>);

  const [loading, setLoading] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<PresetProvider | null>(null);
  // 模型列表 textarea 的临时字符串 state。
  // 受控值若直接用 JSON.stringify(formData.models),编辑中间态恒非法 JSON,onChange
  // 内 try/catch 会吞掉输入。改为:输入期保留原串,blur/submit 才 parse 校验。
  const [modelsInput, setModelsInput] = useState('');
  const [modelsError, setModelsError] = useState<string | null>(null);

  // formData.models 变化时(初始/预设/编辑回填)同步刷新 textarea 字符串
  useEffect(() => {
    setModelsInput(JSON.stringify(formData.models, null, 2));
    setModelsError(null);
  }, [formData.models]);

  // 选中状态优先用内部 state，回退到外部 preset prop（避免 useEffect 延迟导致首帧不高亮）
  const effectiveSelectedPreset = selectedPreset || preset;

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
      if (preset) {
        // 从预设初始化
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
      } else {
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
    }
  }, [provider, preset, isOpen]);

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

    // 提交前再 parse/校验一次模型列表,避免用户改完未 blur 直接提交把脏数据/旧数组落库
    const modelsResult = parseModelsInput(modelsInput);
    if (!modelsResult.ok) {
      setModelsError(modelsResult.error);
      return;
    }
    const submittedFormData = { ...formData, models: modelsResult.models };

    setLoading(true);

    try {
      await onSave({ ...submittedFormData, isActive: true });
    } finally {
      setLoading(false);
    }
  };

  // 统一弹窗无障碍:Escape 关闭 + 初始聚焦 + Tab 循环(document 级,替代原 onKeyDown)
  const dialogRef = useDialogA11y<HTMLDivElement>(isOpen, onClose);

  if (!isOpen) return null;

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
    >
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
                      effectiveSelectedPreset?.name === preset.name
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
            <label htmlFor="provider-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              名称 <span className="text-red-500">*</span>
            </label>
            <input
              id="provider-name"
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          {/* Provider 类型 */}
          <div>
            <label htmlFor="provider-type" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Provider 类型
            </label>
            <select
              id="provider-type"
              value={formData.provider}
              onChange={(e) => setFormData({ ...formData, provider: e.target.value as Provider['provider'] })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="openai-compatible">OpenAI Compatible</option>
            </select>
          </div>

          {/* Base URL */}
          <div>
            <label htmlFor="provider-base-url" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              API 地址
            </label>
            <input
              id="provider-base-url"
              type="url"
              value={formData.baseUrl}
              onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="https://api.example.com/v1"
            />
          </div>

          {/* API Key */}
          <div>
            <label htmlFor="provider-api-key" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              API Key <span className="text-red-500">*</span>
            </label>
            <input
              id="provider-api-key"
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
            <label htmlFor="provider-models" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              模型列表（JSON 数组） <span className="text-red-500">*</span>
            </label>
            <textarea
              id="provider-models"
              value={modelsInput}
              onChange={(e) => {
                setModelsInput(e.target.value);
                if (modelsError) setModelsError(null);
              }}
              onBlur={() => {
                const result = parseModelsInput(modelsInput);
                if (result.ok) {
                  setFormData((prev) => ({ ...prev, models: result.models }));
                  setModelsError(null);
                } else {
                  setModelsError(result.error);
                }
              }}
              rows={3}
              className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:border-transparent font-mono text-sm ${
                modelsError
                  ? 'border-red-500 focus:ring-red-500'
                  : 'border-gray-300 dark:border-gray-600 focus:ring-blue-500'
              }`}
              required
            />
            {modelsError && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{modelsError}</p>
            )}
          </div>

          {/* Default Model */}
          <div>
            <label htmlFor="provider-default-model" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              默认模型 <span className="text-red-500">*</span>
            </label>
            <input
              id="provider-default-model"
              type="text"
              value={formData.defaultModel}
              onChange={(e) => setFormData({ ...formData, defaultModel: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          {/* System Prompt */}
          <div>
            <label htmlFor="provider-system-prompt" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              System Prompt（可选）
            </label>
            <textarea
              id="provider-system-prompt"
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
                id="provider-is-default"
                checked={formData.isDefault}
                onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <label htmlFor="provider-is-default" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
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
