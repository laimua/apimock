/**
 * F1 新建项目页 slug 覆盖防护 — 针对性验证
 *
 * codex 验收指出:F1 的 slugManuallyEdited 状态机是易回归逻辑,无单测覆盖。
 * 验证核心:用户手动编辑 slug 后,再改 name 不应覆盖自定义 slug。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

// Mock api-client(projectsApi.checkSlug 异步触发,需 mock)
vi.mock('@/lib/api-client', () => ({
  projectsApi: {
    checkSlug: vi.fn().mockResolvedValue({ slug: '', available: true }),
    create: vi.fn(),
  },
}));

// Mock next/navigation(useRouter 需要 app router 上下文)
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

// Mock Toast
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

import NewProjectPage from '@/app/projects/new/page';
import * as apiClient from '@/lib/api-client';

const checkSlugMock = apiClient.projectsApi.checkSlug as unknown as ReturnType<typeof vi.fn>;

describe('F1: 新建项目 slug 不被 name 覆盖', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkSlugMock.mockResolvedValue({ slug: 'test', available: true });
  });

  afterEach(() => {
    cleanup();
  });

  it('未手动编辑 slug 时,改 name 会自动生成 slug', async () => {
    render(<NewProjectPage />);

    const nameInput = screen.getByPlaceholderText('我的 API 项目');
    fireEvent.change(nameInput, { target: { value: 'My Project' } });

    const slugInput = screen.getByPlaceholderText('my-api-project') as HTMLInputElement;
    // name 变化应自动生成 slug(由 generateSlug 处理)
    await waitFor(() => {
      expect(slugInput.value).not.toBe('');
    });
  });

  it('手动编辑 slug 后,改 name 不再覆盖自定义 slug', async () => {
    render(<NewProjectPage />);

    const nameInput = screen.getByPlaceholderText('我的 API 项目');
    const slugInput = screen.getByPlaceholderText('my-api-project') as HTMLInputElement;

    // 先输入 name,slug 自动生成
    fireEvent.change(nameInput, { target: { value: 'My Project' } });
    await waitFor(() => {
      expect(slugInput.value).not.toBe('');
    });

    // 手动改 slug 为自定义值
    fireEvent.change(slugInput, { target: { value: 'custom-slug-xyz' } });
    expect(slugInput.value).toBe('custom-slug-xyz');

    // 再改 name —— slug 不应被覆盖
    fireEvent.change(nameInput, { target: { value: 'My Project Renamed' } });
    expect(slugInput.value).toBe('custom-slug-xyz');
  });

  it('清空 slug 后恢复自动生成', async () => {
    render(<NewProjectPage />);

    const nameInput = screen.getByPlaceholderText('我的 API 项目');
    const slugInput = screen.getByPlaceholderText('my-api-project') as HTMLInputElement;

    // 手动设 slug
    fireEvent.change(slugInput, { target: { value: 'custom-slug' } });
    // 清空 slug
    fireEvent.change(slugInput, { target: { value: '' } });

    // 改 name 应重新自动生成(因为清空后 slugManuallyEdited 复位)
    fireEvent.change(nameInput, { target: { value: 'Another Name' } });
    await waitFor(() => {
      expect(slugInput.value).not.toBe('custom-slug');
    });
  });
});
