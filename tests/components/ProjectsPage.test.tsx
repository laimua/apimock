/**
 * F3 项目列表删除后 page 夹紧 — 针对性验证
 *
 * codex 验收指出:F3 的夹紧条件 (page-1)*pageSize >= length-1 是易回归逻辑。
 * 验证核心:删除当前页最后一项后,page 应回退一页,不停在空白页。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

// 构造 13 个项目(pageSize=12 → 第 1 页 12 个,第 2 页 1 个)
function makeProjects(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `proj-${i}`,
    name: `Project ${i}`,
    slug: `project-${i}`,
    description: null,
    basePath: null,
    isActive: true,
    settings: {},
    createdAt: String(i),
    updatedAt: String(i),
  }));
}

const listMock = vi.fn();
const deleteMock = vi.fn();

vi.mock('@/lib/api-client', () => ({
  projectsApi: {
    list: (...args: unknown[]) => listMock(...args),
    delete: (...args: unknown[]) => deleteMock(...args),
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

import ProjectsPage from '@/app/projects/page';

describe('F3: 项目列表删除后 page 夹紧', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listMock.mockResolvedValue(makeProjects(13));
    deleteMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
  });

  it('删除第 2 页唯一项目后,page 回退到第 1 页', async () => {
    render(<ProjectsPage />);

    // 等列表加载
    await waitFor(() => {
      expect(screen.getByText('Project 0')).toBeInTheDocument();
    });

    // 翻到第 2 页
    const nextBtn = screen.getByText('下一页');
    fireEvent.click(nextBtn);

    // 第 2 页应显示 Project 12(唯一一项)
    await waitFor(() => {
      expect(screen.getByText('Project 12')).toBeInTheDocument();
    });

    // 触发删除:找到 Project 12 的删除按钮(图标按钮,用 title/aria 或按索引)
    // 项目卡片的删除按钮 —— 用 getAllByLabelText 或定位删除图标
    const deleteButtons = screen.getAllByRole('button', { name: /删除|delete|trash/i });
    // 第 2 页只有 1 个项目,取它的删除按钮
    expect(deleteButtons.length).toBeGreaterThan(0);

    // 点击删除触发确认对话框
    fireEvent.click(deleteButtons[deleteButtons.length - 1]);

    // 确认删除
    await waitFor(() => {
      const confirmBtn = screen.getByText('删除');
      fireEvent.click(confirmBtn);
    });

    // 删除后 page 应回退到 1(不再显示 Project 12,而显示 Project 0)
    await waitFor(() => {
      expect(deleteMock).toHaveBeenCalled();
    });

    // 关键断言:回到第 1 页(显示 Project 0,不卡在空白第 2 页)
    await waitFor(() => {
      expect(screen.getByText('Project 0')).toBeInTheDocument();
    });
  });
});
