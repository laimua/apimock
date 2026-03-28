/**
 * 测试连接按钮组件
 */

'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { CheckCircle2, XCircle, Loader2, Plug } from 'lucide-react';

interface TestConnectionButtonProps {
  providerId: string;
}

export default function TestConnectionButton({ providerId }: TestConnectionButtonProps) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const handleTest = async () => {
    setTesting(true);
    setResult(null);

    try {
      const res = await fetch(`/api/ai/providers/${providerId}/test`, {
        method: 'POST',
      });
      const json = await res.json();

      if (json.success && json.data.success) {
        setResult({
          success: true,
          message: `连接成功 (${json.data.model})`,
        });
      } else {
        setResult({
          success: false,
          message: json.data?.error || '连接失败',
        });
      }
    } catch (err) {
      setResult({
        success: false,
        message: '请求失败',
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button variant="secondary" size="sm" onClick={handleTest} disabled={testing}>
        {testing ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : result?.success ? (
          <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
        ) : result ? (
          <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
        ) : (
          <Plug className="w-4 h-4" />
        )}
        <span className="ml-1">
          {testing ? '测试中' : result ? '重新测试' : '测试'}
        </span>
      </Button>

      {result && (
        <span
          className={`text-xs ${
            result.success
              ? 'text-green-600 dark:text-green-400'
              : 'text-red-600 dark:text-red-400'
          }`}
        >
          {result.message}
        </span>
      )}
    </div>
  );
}
