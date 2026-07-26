/**
 * 404 兜底页(P2-53)。
 *
 * Next.js 在没有任何路由匹配时渲染本文件。给用户一个明确的"页面不存在"
 * 出口,而不是默认的硬 404。与 error.tsx 同级,位于 RootLayout 内,可使用主题/链接。
 */

import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 sm:p-8 text-center">
        <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
          <svg
            className="w-6 h-6 text-gray-500 dark:text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">404</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          找不到该页面,它可能已被移动或从未存在。
        </p>
        <Link
          href="/"
          className="inline-flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm transition-colors"
        >
          返回首页
        </Link>
      </div>
    </div>
  );
}
