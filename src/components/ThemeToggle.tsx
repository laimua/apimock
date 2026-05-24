'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

export default function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const { setTheme, resolvedTheme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="w-9 h-9" />;
  }

  return (
    <button
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      className="p-2 rounded-full cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 active:scale-90 transition-all duration-150"
      aria-label={resolvedTheme === 'dark' ? '切换到浅色模式' : '切换到暗色模式'}
    >
      {resolvedTheme === 'dark'
        ? <Sun className="h-5 w-5 text-yellow-500" />
        : <Moon className="h-5 w-5 text-gray-700" />
      }
    </button>
  );
}
