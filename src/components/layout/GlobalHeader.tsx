'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, X, Plus, Github, LogOut } from 'lucide-react';
import ThemeToggle from '../ThemeToggle';
import { trackEvent, ANALYTICS_EVENTS } from '@/lib/analytics';
import { confirmLeaveIfDirty } from '@/lib/unsaved-changes';

const navLinks = [
  { href: '/projects', label: 'Projects' },
  { href: '/settings/ai', label: 'AI Settings' },
];

const GITHUB_REPO_URL = 'https://github.com/laimua/apimock';

export default function GlobalHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  const isActive = (href: string) => pathname.startsWith(href);
  // 登录页不显示退出按钮
  const showLogout = pathname !== '/login';

  // 内部导航点击拦截:有未保存修改时弹原生确认,用户取消则阻止 Link 跳转。
  // (P1-16:此前 GlobalHeader 的 Link 走客户端路由,绕过各页 beforeunload/guard)
  const handleInternalNavClick = (e: React.MouseEvent) => {
    if (confirmLeaveIfDirty()) {
      e.preventDefault();
    }
  };

  const handleGithubClick = () => {
    trackEvent(ANALYTICS_EVENTS.GITHUB_STAR_CLICK, { source: 'header' });
  };

  const handleLogout = async () => {
    // 有未保存修改时同样询问,避免退出丢数据
    if (confirmLeaveIfDirty()) return;
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST' });
      if (res.ok) {
        setMobileOpen(false);
        router.push('/');
      }
    } catch {
      // 网络异常时保留登录态,不跳转
    }
  };

  return (
    <header className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          <Link href="/" onClick={handleInternalNavClick} className="flex items-center gap-2 font-bold text-lg text-gray-900 dark:text-white">
            <div className="w-7 h-7 bg-blue-600 rounded flex items-center justify-center">
              <span className="text-white font-bold text-sm">M</span>
            </div>
            <span>Api<span className="text-blue-600">Mock</span></span>
          </Link>

          <nav className="hidden sm:flex items-center gap-6">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={handleInternalNavClick}
                className={`text-sm font-medium transition-colors ${
                  isActive(link.href)
                    ? 'text-blue-600 border-b-2 border-blue-600 pb-0.5'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
              >
                {link.label}
              </Link>
            ))}
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleGithubClick}
              aria-label="GitHub repository"
              className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
            >
              <Github className="w-5 h-5" />
            </a>
            <ThemeToggle />
            <Link
              href="/projects/new"
              onClick={handleInternalNavClick}
              className="inline-flex items-center gap-1.5 bg-blue-600 text-white text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Project
            </Link>
            {showLogout && (
              <button
                onClick={handleLogout}
                aria-label="退出登录"
                className="inline-flex items-center gap-1 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                退出
              </button>
            )}
          </nav>

          <div className="flex items-center gap-2 sm:hidden">
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleGithubClick}
              aria-label="GitHub repository"
              className="p-2 text-gray-600 dark:text-gray-400"
            >
              <Github className="w-5 h-5" />
            </a>
            <ThemeToggle />
            <button
              className="p-2 text-gray-600 dark:text-gray-400"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {mobileOpen && (
        <div className="sm:hidden border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <nav className="flex flex-col px-4 py-3 gap-3">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={(e) => {
                  if (confirmLeaveIfDirty()) {
                    e.preventDefault();
                    return;
                  }
                  setMobileOpen(false);
                }}
                className={`text-sm font-medium ${
                  isActive(link.href) ? 'text-blue-600' : 'text-gray-600 dark:text-gray-400'
                }`}
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/projects/new"
              onClick={(e) => {
                if (confirmLeaveIfDirty()) {
                  e.preventDefault();
                  return;
                }
                setMobileOpen(false);
              }}
              className="inline-flex items-center gap-1.5 bg-blue-600 text-white text-sm font-medium px-3 py-2 rounded-lg justify-center"
            >
              <Plus className="w-4 h-4" />
              New Project
            </Link>
            {showLogout && (
              <button
                onClick={handleLogout}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 dark:text-gray-400 justify-center"
              >
                <LogOut className="w-4 h-4" />
                退出
              </button>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
