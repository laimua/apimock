'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X, Plus, Github } from 'lucide-react';
import ThemeToggle from '../ThemeToggle';
import { trackEvent, ANALYTICS_EVENTS } from '@/lib/analytics';

const navLinks = [
  { href: '/projects', label: 'Projects' },
  { href: '/settings/ai', label: 'AI Settings' },
];

const GITHUB_REPO_URL = 'https://github.com/laimua/apimock';

export default function GlobalHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  const isActive = (href: string) => pathname.startsWith(href);

  const handleGithubClick = () => {
    trackEvent(ANALYTICS_EVENTS.GITHUB_STAR_CLICK, { source: 'header' });
  };

  return (
    <header className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          <Link href="/" className="flex items-center gap-2 font-bold text-lg text-gray-900 dark:text-white">
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
              className="inline-flex items-center gap-1.5 bg-blue-600 text-white text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Project
            </Link>
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
                onClick={() => setMobileOpen(false)}
                className={`text-sm font-medium ${
                  isActive(link.href) ? 'text-blue-600' : 'text-gray-600 dark:text-gray-400'
                }`}
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/projects/new"
              onClick={() => setMobileOpen(false)}
              className="inline-flex items-center gap-1.5 bg-blue-600 text-white text-sm font-medium px-3 py-2 rounded-lg justify-center"
            >
              <Plus className="w-4 h-4" />
              New Project
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
