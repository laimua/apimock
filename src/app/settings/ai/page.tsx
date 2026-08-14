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
import { aiApi, ApiError, type AiProvider, type AiBudget } from '@/lib/api-client';

export default function AiSettingsPage() {
  const { success: toastSuccess, error: toastError } = useToast();
  const [providers, setProviders] = useState<AiProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingProvider, setEditingProvider] = useState<AiProvider | null>(null);
  const [presetToApply, setPresetToApply] = useState<PresetProvider | null>(null);
  const [budget, setBudget] = useState<AiBudget | null>(null);

  // 加载 providers
  // C2: 收进 api-client —— 401 跳登录(带 from)、非 JSON 兜底、
  // 错误形状 {error:{code,message}} 解析统一由 request() 处理
  const loadProviders = useCallback(async () => {
    try {
      setLoadError(null);
      setLoading(true);
      const data = await aiApi.listProviders();
      setProviders(data);
    } catch (err) {
      if (err instanceof ApiError) {
        setLoadError(err.message);
        toastError(err.message);
      } else {
        setLoadError('加载失败，请重试');
        toastError('加载模型配置失败');
      }
    } finally {
      setLoading(false);
    }
  }, [toastError]);

  // 加载今日 AI 预算用量(失败不影响主流程;401 时 request() 已统一跳登录)
  const loadBudget = useCallback(async () => {
    try {
      setBudget(await aiApi.getBudget());
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
      await aiApi.createProvider(providerData);
      await loadProviders();
      setShowAddDialog(false);
      toastSuccess('模型已添加');
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : '添加模型失败');
    }
  };

  // 更新 provider
  const handleUpdateProvider = async (id: string, data: ProviderFormData) => {
    try {
      await aiApi.updateProvider(id, data);
      await loadProviders();
      setEditingProvider(null);
      toastSuccess('模型已更新');
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : '更新模型失败');
    }
  };

  // 删除 provider
  const handleDeleteProvider = async (id: string) => {
    try {
      await aiApi.deleteProvider(id);
      await loadProviders();
      toastSuccess('模型已删除');
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : '删除模型失败');
    }
  };

  // 设置为默认
  const handleSetDefault = async (id: string) => {
    try {
      await aiApi.setDefaultProvider(id);
      await loadProviders();
      toastSuccess('已设为默认模型');
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : '设置默认失败');
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
