/**
 * AI 模型配置页面
 */

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Plus } from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import ProviderList from '@/components/settings/ProviderList';
import { PresetProvider } from '@/lib/ai-presets';
import PresetProviders from '@/components/settings/PresetProviders';
import AddProviderDialog, { type ProviderFormData } from '@/components/settings/AddProviderDialog';

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

export default function AiSettingsPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [presetToApply, setPresetToApply] = useState<PresetProvider | null>(null);

  // 加载 providers
  const loadProviders = async () => {
    try {
      const res = await fetch('/api/ai/providers');
      const json = await res.json();
      if (json.success) {
        setProviders(json.data);
      }
    } catch (err) {
      console.error('Failed to load providers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProviders();
  }, []);

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
      }
    } catch (err) {
      console.error('Failed to add provider:', err);
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
      }
    } catch (err) {
      console.error('Failed to update provider:', err);
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
      }
    } catch (err) {
      console.error('Failed to delete provider:', err);
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
      }
    } catch (err) {
      console.error('Failed to set default provider:', err);
    }
  };

  const defaultProvider = providers.find((p) => p.isDefault);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumb */}
        <Breadcrumb items={[{ label: '首页', href: '/' }, { label: 'AI 模型配置' }]} />

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
