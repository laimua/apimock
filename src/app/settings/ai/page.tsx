/**
 * AI 模型配置页面
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Plus } from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import ProviderList from '@/components/settings/ProviderList';
import { PresetProvider } from '@/lib/ai-presets';
import PresetProviders from '@/components/settings/PresetProviders';
import AddProviderDialog, { type ProviderFormData } from '@/components/settings/AddProviderDialog';
import { useToast } from '@/components/ui/Toast';

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

interface BudgetStatus {
  requests: number;
  tokens: number;
  limits: { tokens: number; requests: number };
}

export default function AiSettingsPage() {
  const { success: toastSuccess, error: toastError } = useToast();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [presetToApply, setPresetToApply] = useState<PresetProvider | null>(null);
  const [budget, setBudget] = useState<BudgetStatus | null>(null);

  // 加载 providers
  const loadProviders = useCallback(async () => {
    try {
      setLoadError(null);
      setLoading(true);
      const res = await fetch('/api/ai/providers');
      // 401 未登录:跳登录页并带上 from 回跳参数(与全局 request 一致行为)
      if (res.status === 401) {
        window.location.href = `/login?from=${encodeURIComponent('/settings/ai')}`;
        return;
      }
      const json = await res.json();
      if (json.success) {
        setProviders(json.data);
      } else {
        // 错误对象形状:{ error: { code, message } };统一读 .message
        const message = json.error?.message ?? '加载失败';
        setLoadError(message);
        toastError(message);
      }
    } catch (err) {
      console.error('Failed to load providers:', err);
      setLoadError('加载失败，请重试');
      toastError('加载模型配置失败');
    } finally {
      setLoading(false);
    }
  }, [toastError]);

  // 加载今日 AI 预算用量
  const loadBudget = useCallback(async () => {
    try {
      const res = await fetch('/api/ai/budget');
      if (res.status === 401) {
        // 预算加载 401 静默忽略,主流程由 loadProviders 负责跳登录
        return;
      }
      const json = await res.json();
      if (json.success) {
        setBudget(json.data);
      }
    } catch {
      // 预算加载失败不影响主流程
    }
  }, []);

  useEffect(() => {
    loadProviders();
    loadBudget();
  }, [loadProviders, loadBudget]);

  // 添加 provider
  const handleAddProvider = async (providerData: ProviderFormData) => {
    try {
      const res = await fetch('/api/ai/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(providerData),
      });
      const json = await res.json();
      if (json.success) {
        await loadProviders();
        setShowAddDialog(false);
        toastSuccess('模型已添加');
      } else {
        toastError(json.error?.message ?? '添加失败');
      }
    } catch (err) {
      console.error('Failed to add provider:', err);
      toastError(err instanceof Error ? err.message : '添加模型失败');
    }
  };

  // 更新 provider
  const handleUpdateProvider = async (id: string, data: ProviderFormData) => {
    try {
      const res = await fetch(`/api/ai/providers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (json.success) {
        await loadProviders();
        setEditingProvider(null);
        toastSuccess('模型已更新');
      } else {
        toastError(json.error?.message ?? '更新失败');
      }
    } catch (err) {
      console.error('Failed to update provider:', err);
      toastError(err instanceof Error ? err.message : '更新模型失败');
    }
  };

  // 删除 provider
  const handleDeleteProvider = async (id: string) => {
    try {
      const res = await fetch(`/api/ai/providers/${id}?confirmed=true`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (json.success) {
        await loadProviders();
        toastSuccess('模型已删除');
      } else {
        toastError(json.error?.message ?? '删除失败');
      }
    } catch (err) {
      console.error('Failed to delete provider:', err);
      toastError(err instanceof Error ? err.message : '删除模型失败');
    }
  };

  // 设置为默认
  const handleSetDefault = async (id: string) => {
    try {
      const res = await fetch(`/api/ai/providers/${id}/default`, {
        method: 'POST',
      });
      const json = await res.json();
      if (json.success) {
        await loadProviders();
        toastSuccess('已设为默认模型');
      } else {
        toastError(json.error?.message ?? '设置失败');
      }
    } catch (err) {
      console.error('Failed to set default provider:', err);
      toastError(err instanceof Error ? err.message : '设置默认失败');
    }
  };

  const defaultProvider = providers.find((p) => p.isDefault);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumb */}
        <Breadcrumb items={[{ label: '首页', href: '/' }, { label: 'AI 模型配置' }]} />

        {/* 今日 AI 用量 */}
        {budget && (
          <Card className="mb-6">
            <CardBody>
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">今日 AI 用量</div>
              <div className="flex flex-wrap gap-6 text-sm">
                <div>
                  <span className="text-gray-500 dark:text-gray-400">请求 </span>
                  <span className="font-semibold text-gray-900 dark:text-gray-100">
                    {budget.requests}
                  </span>
                  <span className="text-gray-400 dark:text-gray-500"> / {budget.limits.requests}</span>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Token </span>
                  <span className="font-semibold text-gray-900 dark:text-gray-100">
                    {budget.tokens}
                  </span>
                  <span className="text-gray-400 dark:text-gray-500"> / {budget.limits.tokens}</span>
                </div>
              </div>
            </CardBody>
          </Card>
        )}

        {/* Current Default Provider */}
        {defaultProvider && (
          <Card className="mb-6">
            <CardBody>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                    当前默认模型
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {defaultProvider.name}
                    </span>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      ({defaultProvider.defaultModel})
                    </span>
                  </div>
                </div>
                <Button
                  variant="secondary"
                  onClick={() => setEditingProvider(defaultProvider)}
                >
                  更改
                </Button>
              </div>
            </CardBody>
          </Card>
        )}

        {/* Preset Providers */}
        <Card className="mb-6">
          <CardBody>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              快速添加预设模型
            </h2>
            <PresetProviders onPresetSelected={(preset) => {
              setEditingProvider(null);
              setPresetToApply(preset);
              setShowAddDialog(true);
            }} />
          </CardBody>
        </Card>

        {/* Provider List */}
        <Card>
          <CardBody>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                已配置模型
              </h2>
              <Button onClick={() => {
                setEditingProvider(null);
                setShowAddDialog(true);
              }}>
                <Plus className="w-4 h-4 mr-2" />
                添加自定义模型
              </Button>
            </div>
            {loading ? (
              <div className="space-y-4">
                <Skeleton className="h-16 w-full rounded-lg" />
                <Skeleton className="h-16 w-full rounded-lg" />
                <Skeleton className="h-16 w-3/4 rounded-lg" />
              </div>
            ) : loadError ? (
              <div className="text-center py-8">
                <p className="text-red-600 dark:text-red-400 mb-3">{loadError}</p>
                <Button variant="secondary" onClick={loadProviders}>重试</Button>
              </div>
            ) : providers.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                还没有配置任何模型，请添加一个
              </div>
            ) : (
              <ProviderList
                providers={providers}
                onEdit={setEditingProvider}
                onDelete={handleDeleteProvider}
                onSetDefault={handleSetDefault}
              />
            )}
          </CardBody>
        </Card>
      </div>

      {/* Add/Edit Dialog */}
      <AddProviderDialog
        isOpen={showAddDialog || editingProvider !== null}
        onClose={() => {
          setShowAddDialog(false);
          setEditingProvider(null);
          setPresetToApply(null);
        }}
        provider={editingProvider}
        preset={presetToApply}
        onSave={editingProvider
          ? (data) => handleUpdateProvider(editingProvider.id, data)
          : handleAddProvider
        }
      />
    </div>
  );
}
