'use client';

import { useState, useEffect } from 'react';
import { Cpu } from 'lucide-react';

interface AiGenerateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerated: (data: unknown) => void;
}

interface Provider {
  id: string;
  name: string;
  provider: 'openai' | 'anthropic' | 'openai-compatible';
  models: string[];
  defaultModel: string;
  isDefault: boolean;
  isActive: boolean;
}

const EXAMPLES = [
  {
    label: '用户列表',
    prompt: '用户列表，包含 id、姓名、邮箱、头像、注册时间',
  },
  {
    label: '订单数据',
    prompt: '订单列表，包含订单号、金额、状态、创建时间',
  },
  {
    label: '商品信息',
    prompt: '商品列表，包含名称、价格、库存、状态',
  },
];

export function AiGenerateDialog({
  isOpen,
  onClose,
  onGenerated,
}: AiGenerateDialogProps) {
  const [prompt, setPrompt] = useState('');
  const [count, setCount] = useState(10);
  const [selectedProviderId, setSelectedProviderId] = useState<string>('');
  const [providers, setProviders] = useState<Provider[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 加载 providers
  useEffect(() => {
    if (isOpen) {
      loadProviders();
    }
  }, [isOpen]);

  const loadProviders = async () => {
    setLoadingProviders(true);
    try {
      const res = await fetch('/api/ai/providers');
      const json = await res.json();
      if (json.success) {
        const activeProviders = json.data.filter((p: Provider) => p.isActive);
        setProviders(activeProviders);
        // 默认选择 default provider
        const defaultProvider = activeProviders.find((p: Provider) => p.isDefault);
        if (defaultProvider) {
          setSelectedProviderId(defaultProvider.id);
        } else if (activeProviders.length > 0) {
          setSelectedProviderId(activeProviders[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to load providers:', err);
    } finally {
      setLoadingProviders(false);
    }
  };

  if (!isOpen) return null;

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError('请输入描述内容');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          prompt, 
          count,
          providerId: selectedProviderId || undefined 
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || '生成失败，请重试');
      }

      const { data } = await res.json();
      onGenerated(data);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败，请重试');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setPrompt('');
    setCount(10);
    setError(null);
    onClose();
  };

  const handleExampleClick = (examplePrompt: string) => {
    setPrompt(examplePrompt);
    setError(null);
  };

  const selectedProvider = providers.find(p => p.id === selectedProviderId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />

      {/* Dialog */}
      <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-lg w-full mx-4 animate-scale-in">
        <div className="p-6">
          {/* Icon */}
          <div className="flex justify-center mb-4">
            <svg
              className="w-10 h-10 text-purple-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
              />
            </svg>
          </div>

          {/* Title */}
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 text-center mb-2">
            AI 生成 Mock 数据
          </h3>

          {/* Description */}
          <p className="text-gray-600 dark:text-gray-400 text-center mb-4 text-sm">
            描述你需要的 Mock 数据，AI 将自动为你生成
          </p>

          {/* Model Selection */}
          {providers.length > 0 && (
            <div className="mb-4">
              <label
                htmlFor="provider"
                className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                <Cpu className="w-4 h-4 mr-1" />
                AI 模型
              </label>
              <select
                id="provider"
                value={selectedProviderId}
                onChange={(e) => setSelectedProviderId(e.target.value)}
                disabled={loadingProviders}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loadingProviders ? (
                  <option>加载中...</option>
                ) : (
                  providers.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.name} ({provider.defaultModel})
                      {provider.isDefault && ' (默认)'}
                    </option>
                  ))
                )}
              </select>
              {selectedProvider && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  共 {selectedProvider.models.length} 个模型可用
                </p>
              )}
            </div>
          )}

          {/* Quick Examples */}
          <div className="flex flex-wrap justify-center gap-2 mb-4">
            {EXAMPLES.map((example) => (
              <button
                key={example.label}
                type="button"
                onClick={() => handleExampleClick(example.prompt)}
                className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                {example.label}
              </button>
            ))}
          </div>

          {/* Prompt Input */}
          <div className="mb-4">
            <label
              htmlFor="prompt"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              数据描述
            </label>
            <textarea
              id="prompt"
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value);
                setError(null);
              }}
              placeholder="例如：用户列表，包含 id、姓名、邮箱、注册时间..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent dark:bg-gray-700 dark:text-white resize-none"
            />
          </div>

          {/* Count Input */}
          <div className="mb-4">
            <label
              htmlFor="count"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              生成数量: {count}
            </label>
            <input
              id="count"
              type="range"
              min="1"
              max="100"
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer accent-purple-600"
            />
            <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
              <span>1</span>
              <span>100</span>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={isLoading}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={isLoading || !prompt.trim()}
              className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors font-medium focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <svg
                    className="animate-spin h-4 w-4"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  生成中...
                </>
              ) : (
                <>
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                  生成数据
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
