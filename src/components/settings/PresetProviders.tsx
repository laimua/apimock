/**
 * 预设 Provider 快速添加组件
 */

'use client';

import { Button } from '@/components/ui/Button';
import { PRESET_PROVIDERS, PresetProvider } from '@/lib/ai-presets';

interface PresetProvidersProps {
  onPresetSelected: (preset: PresetProvider) => void;
}

export default function PresetProviders({ onPresetSelected }: PresetProvidersProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {PRESET_PROVIDERS.map((preset) => (
        <button
          key={preset.name}
          onClick={() => onPresetSelected(preset)}
          className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all text-left"
        >
          <div className="font-medium text-sm text-gray-900 dark:text-gray-100 mb-1">
            {preset.name}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {preset.description}
          </div>
        </button>
      ))}
    </div>
  );
}
