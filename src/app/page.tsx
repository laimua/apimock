import type { ReactNode } from 'react';
import Link from 'next/link';
import { Bot, Zap, Wrench } from 'lucide-react';
import { DEMO_PROJECT_SLUG } from '@/lib/demo-seed';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-gray-800">
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
                href="/projects"
                className="w-full sm:w-auto px-6 sm:px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-base sm:text-lg min-h-12 flex items-center justify-center"
              >
                我的项目
              </Link>
              <Link
                href="/projects/new"
                className="w-full sm:w-auto px-6 sm:px-8 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 font-medium text-base sm:text-lg min-h-12 flex items-center justify-center"
              >
                快速开始
              </Link>
              <a
                href="https://github.com/laimua/apimock"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto px-6 sm:px-8 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 font-medium text-base sm:text-lg min-h-12 flex items-center justify-center"
              >
                GitHub
              </a>
            </div>
          </div>

          {/* Features — asymmetric layout */}
          <div className="mt-12 sm:mt-16 lg:mt-24 grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 lg:gap-8 px-4">
            <FeatureCard
              icon={<Bot className="w-8 h-8 text-blue-600" />}
              title="AI 生成"
              description="输入自然语言描述，AI 自动生成符合语义的 Mock 数据，包括路径、参数、响应体等。"
              featured
            />
            <div className="grid grid-cols-1 gap-4 sm:gap-6">
              <FeatureCard
                icon={<Zap className="w-8 h-8 text-amber-500" />}
                title="即时分享"
                description="创建的 Mock API 可立即分享给团队，无需登录。"
              />
              <FeatureCard
                icon={<Wrench className="w-8 h-8 text-emerald-600" />}
                title="开发者友好"
                description="支持 OpenAPI 导入、动态规则、延迟模拟等高级功能。"
              />
            </div>
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
$ curl http://localhost:3000/${DEMO_PROJECT_SLUG}/users

{
  "code": 0,
  "message": "success",
  "data": {
    "list": [
      { "id": 1, "name": "张伟", "email": "user1@example.com" },
      { "id": 2, "name": "李娜", "email": "user2@example.com" }
    ],
    "total": 2
  }
}`}</pre>
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

function FeatureCard({ icon, title, description, featured }: { icon: ReactNode; title: string; description: string; featured?: boolean }) {
  return (
    <div className={`bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md transition-shadow ${featured ? 'flex flex-col justify-center md:p-8' : ''}`}>
      <div className="mb-4">{icon}</div>
      <h3 className={`text-lg font-semibold text-gray-900 dark:text-white mb-2 ${featured ? 'md:text-xl' : ''}`}>{title}</h3>
      <p className="text-gray-600 dark:text-gray-400">{description}</p>
    </div>
  );
}
