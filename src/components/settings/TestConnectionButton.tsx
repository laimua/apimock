/**
 * 测试连接按钮组件
 */

'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { CheckCircle2, XCircle, Loader2, Plug } from 'lucide-react';
import { aiApi, ApiError } from '@/lib/api-client';

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

    // C8: 收编 api-client——401 统一跳登录、非 JSON 响应兜底、错误形状解析
    // ({success:false, error:{code,message}})不再各自为政
    try {
      const data = await aiApi.testProvider(providerId);
      if (data.success) {
        setResult({
          success: true,
          message: `连接成功 (${data.model})`,
        });
      } else {
        setResult({
          success: false,
          message: '连接失败',
        });
      }
    } catch (error) {
      // ApiError.message 是后端标准错误文案;其余(网络中断等)给通用提示
      setResult({
        success: false,
        message: error instanceof ApiError ? error.message : '请求失败',
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
