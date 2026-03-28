/**
 * AI 模型配置页面
 */

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ArrowLeft, Plus, Sparkles } from 'lucide-react';
import ProviderList from '@/components/settings/ProviderList';
import PresetProviders from '@/components/settings/PresetProviders';
import AddProviderDialog from '@/components/settings/AddProviderDialog';

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
  const handleAddProvider = async (providerData: any) => {
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
  const handleUpdateProvider = async (id: string, data: any) => {
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
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            返回首页
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                AI 模型配置
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                管理用于生成 Mock 数据的 AI 模型
              </p>
            </div>
          </div>
        </div>

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
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                加载中...
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
        }}
        provider={editingProvider}
        onSave={editingProvider
          ? (data) => handleUpdateProvider(editingProvider.id, data)
          : handleAddProvider
        }
      />
    </div>
  );
}
