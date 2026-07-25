/**
 * 登录表单(G1 鉴权)
 * 提交 MANAGE_TOKEN 到 /api/auth/login,成功后跳回来源页或 /projects
 */

'use client';

import { useState, FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardBody } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

interface LoginFormProps {
  error?: string;
  from?: string;
}

export default function LoginForm({ error, from }: LoginFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || loading) return;

    setLoading(true);
    setFormError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const json = await res.json();

      if (res.ok && json.success) {
        // 开放重定向防护:from 必须是同站 path(/ 开头且非 //host)
        const fromParam = searchParams.get('from') ?? from;
        const target =
          fromParam && fromParam.startsWith('/') && !fromParam.startsWith('//')
            ? fromParam
            : '/projects';
        router.push(target);
        return;
      }

      if (res.status === 401) {
        setFormError('令牌无效');
      } else if (res.status === 429) {
        setFormError('尝试过多,请稍后');
      } else {
        setFormError(json.error?.message || json.error || '登录失败,请重试');
      }
    } catch {
      setFormError('网络错误,请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardBody>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-1">
            登录 ApiMock
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            请输入管理令牌以访问管理页面
          </p>

          {error === 'no_token' && (
            <div className="mb-4 rounded-lg border border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20 dark:border-yellow-700 px-4 py-3 text-sm text-yellow-800 dark:text-yellow-300">
              未配置 MANAGE_TOKEN,请设置环境变量
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="管理令牌"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="MANAGE_TOKEN"
              autoFocus
              required
              error={formError ?? undefined}
            />
            <Button type="submit" className="w-full" disabled={loading || !token}>
              {loading ? '登录中' : '登录'}
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
