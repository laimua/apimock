/**
 * 已配置 Provider 列表组件
 */

'use client';

import { Settings, Trash2, Check } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import TestConnectionButton from './TestConnectionButton';

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

interface ProviderListProps {
  providers: Provider[];
  onEdit: (provider: Provider) => void;
  onDelete: (id: string) => void;
  onSetDefault: (id: string) => void;
}

export default function ProviderList({
  providers,
  onEdit,
  onDelete,
  onSetDefault,
}: ProviderListProps) {
  return (
    <div className="space-y-3">
      {providers.map((provider) => (
        <Card key={provider.id}>
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                    {provider.name}
                  </h3>
                  {provider.isDefault && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300">
                      <Check className="w-3 h-3 mr-1" />
                      默认
                    </span>
                  )}
                  {provider.isActive ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300">
                      启用
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300 opacity-50">
                      禁用
                    </span>
                  )}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  <span className="font-medium">{provider.defaultModel}</span>
                  <span className="mx-2">•</span>
                  <span>{provider.models.length} 个模型</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <TestConnectionButton providerId={provider.id} />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onEdit(provider)}
                >
                  <Settings className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (confirm(`确定要删除 "${provider.name}" 吗？此操作不可撤销。`)) {
                      onDelete(provider.id);
                    }
                  }}
                >
                  <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400" />
                </Button>
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
