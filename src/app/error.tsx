/**
 * 路由级错误边界(P2-53)。
 *
 * 捕获下级渲染期异常,避免单点崩溃炸成全站白屏。是 P1-11/P1-12 等
 * "防御性 parse 失败仍可能崩"场景的兜底。需是 Client Component。
 *
 * 注意:本组件不捕获 RootLayout 自身的异常(那是 global-error.tsx 的职责)。
 */

'use client';

import { useEffect } from 'react';
import Link from 'next/link';

interface ErrorBoundaryProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorBoundary({ error, reset }: ErrorBoundaryProps) {
  // 把错误上报到控制台(生产可在此接 Sentry/Plausible 等监控)
  useEffect(() => {
    console.error('[route error boundary]', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 sm:p-8 text-center">
        <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
          <svg
            className="w-6 h-6 text-red-600 dark:text-red-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white mb-2">
          页面出错了
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
          渲染过程发生异常,请尝试重试或返回首页。
        </p>
        {error?.message && (
          <p className="text-xs text-gray-500 dark:text-gray-500 mb-6 font-mono break-all">
            {error.message}
          </p>
        )}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm transition-colors"
          >
            重试
          </button>
          <Link
            href="/"
            className="inline-flex items-center justify-center px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 font-medium text-sm transition-colors"
          >
            返回首页
          </Link>
        </div>
      </div>
    </div>
  );
}
