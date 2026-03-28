'use client';

import React from 'react';
import Link from 'next/link';
import { useEffect } from 'react';

export default function HomePage() {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  // 设置页面标题
  useEffect(() => {
    document.title = 'ApiMock - AI 智能 Mock 平台';
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-gray-800">
      {/* Header */}
      <header className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">M</span>
              </div>
              <span className="font-bold text-xl text-gray-900 dark:text-white">ApiMock</span>
            </div>

            {/* Desktop Navigation */}
            <div className="hidden sm:flex items-center gap-4">
              <Link
                href="/projects"
                className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 font-medium"
              >
                项目列表
              </Link>
              <Link
                href="/projects/new"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm"
              >
                快速开始
              </Link>
            </div>

            {/* Mobile menu button */}
            <button
              type="button"
              className="sm:hidden p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                {mobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                )}
              </svg>
            </button>
          </div>

          {/* Mobile menu */}
          {mobileMenuOpen && (
            <div className="sm:hidden pb-4 flex flex-col gap-3">
              <Link
                href="/projects"
                className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 font-medium"
                onClick={() => setMobileMenuOpen(false)}
              >
                项目列表
              </Link>
              <Link
                href="/projects/new"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm text-center"
                onClick={() => setMobileMenuOpen(false)}
              >
                快速开始
              </Link>
            </div>
          )}
        </div>
      </header>

      {/* Hero Section */}
      <main>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-24">
          <div className="text-center">
            <h1 className="text-2xl sm:text-4xl lg:text-5xl font-bold text-gray-900 dark:text-white mb-4 sm:mb-6">
              AI 智能 Mock 平台
            </h1>
            <p className="text-base sm:text-lg lg:text-xl text-gray-600 dark:text-gray-400 mb-6 sm:mb-8 max-w-2xl mx-auto px-4">
              通过自然语言生成真实语义的 Mock 数据，3 分钟完成配置，即刻分享协作
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 px-4">
              <Link
                href="/projects/new"
                className="w-full sm:w-auto px-6 sm:px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-base sm:text-lg min-h-12 flex items-center justify-center"
              >
                立即开始
              </Link>
              <a
                href="https://github.com"
                target="_blank"
                className="w-full sm:w-auto px-6 sm:px-8 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 font-medium text-base sm:text-lg min-h-12 flex items-center justify-center"
              >
                GitHub
              </a>
            </div>
          </div>

          {/* Features */}
          <div className="mt-12 sm:mt-16 lg:mt-24 grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 lg:gap-8 px-4">
            <FeatureCard
              icon="🤖"
              title="AI 生成"
              description="输入自然语言描述，AI 自动生成符合语义的 Mock 数据"
            />
            <FeatureCard
              icon="⚡"
              title="即时分享"
              description="创建的 Mock API 可立即分享给团队，无需登录"
            />
            <FeatureCard
              icon="🛠️"
              title="开发者友好"
              description="支持 OpenAPI 导入、动态规则、延迟模拟等高级功能"
            />
          </div>

          {/* Demo */}
          <div className="mt-12 sm:mt-16 lg:mt-24 bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl shadow-xl overflow-hidden mx-4 sm:mx-0">
            <div className="bg-gray-100 dark:bg-gray-700 px-4 sm:px-6 py-3 border-b border-gray-200 dark:border-gray-600 flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-400"></div>
              <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
              <div className="w-3 h-3 rounded-full bg-green-400"></div>
              <span className="ml-2 sm:ml-4 text-xs sm:text-sm text-gray-600 dark:text-gray-400">Mock API 演示</span>
            </div>
            <div className="p-4 sm:p-6 bg-gray-900 text-green-400 font-mono text-xs sm:text-sm overflow-x-auto">
              <pre>{`# 获取用户列表
$ curl https://mock.apimock.io/demo-project/users

[
  {"id": 1, "name": "张三", "email": "zhangsan@example.com"},
  {"id": 2, "name": "李四", "email": "lisi@example.com"},
  {"id": 3, "name": "王五", "email": "wangwu@example.com"}
]`}</pre>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-blue-600 rounded flex items-center justify-center">
                <span className="text-white font-bold text-xs">M</span>
              </div>
              <span className="font-semibold text-gray-700 dark:text-gray-300">ApiMock</span>
            </div>
            <p className="text-gray-500 dark:text-gray-400 text-sm text-center sm:text-left">
              © 2026 ApiMock. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md transition-shadow">
      <div className="text-4xl mb-4">{icon}</div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{title}</h3>
      <p className="text-gray-600 dark:text-gray-400">{description}</p>
    </div>
  );
}
