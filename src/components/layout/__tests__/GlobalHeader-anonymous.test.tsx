/**
 * GlobalHeader 匿名页精简测试(UX-3)。
 *
 * 验证:匿名可访问路径(/login、/share/*)下隐藏导航链接/New Project/退出按钮,
 * 只保留 logo + GitHub 链接 + ThemeToggle;普通管理页不受影响。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import GlobalHeader from '../GlobalHeader';
import { __resetUnsavedChangesForTest } from '@/lib/unsaved-changes';

// next/navigation mock:pathname 可按用例切换
const { mockPathname } = vi.hoisted(() => ({
  mockPathname: { current: '/projects' },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname.current,
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/lib/analytics', () => ({
  trackEvent: vi.fn(),
  ANALYTICS_EVENTS: { GITHUB_STAR_CLICK: 'github_star_click' },
}));

describe('GlobalHeader 匿名页精简 (UX-3)', () => {
  beforeEach(() => {
    __resetUnsavedChangesForTest();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(['/login', '/share/demo-slug'])('%s:隐藏导航/New Project/退出,保留 logo+GitHub+ThemeToggle', (path) => {
    mockPathname.current = path;
    const { unmount } = render(<GlobalHeader />);

    expect(screen.getByText('Mock')).toBeInTheDocument(); // logo(Api**Mock**)
    expect(screen.getAllByLabelText('GitHub repository').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('切换到暗色模式')).toBeInTheDocument(); // ThemeToggle
    expect(screen.queryByText('Projects')).not.toBeInTheDocument();
    expect(screen.queryByText('AI Settings')).not.toBeInTheDocument();
    expect(screen.queryByText('New Project')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('退出登录')).not.toBeInTheDocument();
    // 匿名页连移动端汉堡菜单也不该有(没有可展开的导航项)
    expect(screen.queryByLabelText('Open menu')).not.toBeInTheDocument();

    unmount();
  });

  it('/projects:导航/New Project/退出照常显示', () => {
    mockPathname.current = '/projects';
    render(<GlobalHeader />);

    expect(screen.getByText('Projects')).toBeInTheDocument();
    expect(screen.getByText('New Project')).toBeInTheDocument();
    expect(screen.getByLabelText('退出登录')).toBeInTheDocument();
  });
});
