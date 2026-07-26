/**
 * GlobalHeader 未保存修改导航拦截测试(P1-16)。
 *
 * 验证:有未保存修改时,点击顶栏内部 Link 会因 confirmLeaveIfDirty 返回 true
 * 而调用 preventDefault(阻止 Next 客户端路由);无修改时正常放行。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import GlobalHeader from '../GlobalHeader';
import { setDirty, __resetUnsavedChangesForTest } from '@/lib/unsaved-changes';

// next/navigation 默认 mock
vi.mock('next/navigation', () => ({
  usePathname: () => '/projects',
  useRouter: () => ({ push: vi.fn() }),
}));

// analytics 在测试里无副作用即可
vi.mock('@/lib/analytics', () => ({
  trackEvent: vi.fn(),
  ANALYTICS_EVENTS: { GITHUB_STAR_CLICK: 'github_star_click' },
}));

describe('GlobalHeader 未保存修改拦截 (P1-16)', () => {
  beforeEach(() => {
    __resetUnsavedChangesForTest();
    // happy-dom 默认无 window.confirm,提供占位实现,各用例再 spy 覆盖返回值
    window.confirm = () => true;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('无未保存修改:点击 Projects 链接不调 preventDefault', () => {
    render(<GlobalHeader />);
    const link = screen.getByText('Projects');
    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    const preventDefaultSpy = vi.spyOn(clickEvent, 'preventDefault');
    fireEvent(link, clickEvent);
    expect(preventDefaultSpy).not.toHaveBeenCalled();
  });

  it('有未保存修改且用户取消(confirm=false):阻止导航', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    setDirty('endpoint-edit-x');
    render(<GlobalHeader />);
    const link = screen.getByText('Projects');
    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    const preventDefaultSpy = vi.spyOn(clickEvent, 'preventDefault');
    fireEvent(link, clickEvent);
    expect(window.confirm).toHaveBeenCalled();
    expect(preventDefaultSpy).toHaveBeenCalled();
  });

  it('有未保存修改但用户确认(confirm=true):放行导航', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    setDirty('endpoint-edit-x');
    render(<GlobalHeader />);
    const link = screen.getByText('Projects');
    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    const preventDefaultSpy = vi.spyOn(clickEvent, 'preventDefault');
    fireEvent(link, clickEvent);
    expect(window.confirm).toHaveBeenCalled();
    expect(preventDefaultSpy).not.toHaveBeenCalled();
  });
});
