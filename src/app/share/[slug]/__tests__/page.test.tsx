/**
 * SharePage 全局 toast 测试(UX-6)。
 *
 * share 页复制提示从自实现 toast(本地 state + setTimeout)换成全局
 * ToastProvider/useToast。本测试验证复制按钮经全局 ToastProvider 出 toast;
 * 同时覆盖内联「添加一行」表单(UX-7)的空 key/重复 key 行内报错。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ToastProvider } from '@/components/ui/Toast';
import SharePage from '../page';

// useParams mock —— vi.hoisted 保证在 vi.mock 提升后仍可用
const { mockUseParams } = vi.hoisted(() => ({
  mockUseParams: vi.fn(() => ({ slug: 'demo' })),
}));

vi.mock('next/navigation', () => ({
  useParams: () => mockUseParams(),
}));

// fetch mock:返回合法 ShareData
const shareData = {
  project: { name: 'Demo', slug: 'demo', description: null },
  endpoints: [
    {
      id: 'ep-1',
      method: 'GET',
      path: '/hello',
      name: 'hello',
      description: null,
      statusCode: 200,
      contentType: 'application/json',
      delayMs: null,
      tags: null,
      responseBody: '{"ok":true}',
    },
  ],
  baseUrl: 'http://localhost:3000/m/demo',
};

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

// clipboard mock —— 代码访问 navigator.clipboard,需 stub 到 navigator 上
const writeText = vi.fn(async () => undefined);
Object.defineProperty(globalThis.navigator, 'clipboard', {
  value: { writeText },
  configurable: true,
  writable: true,
});

async function renderSharePage() {
  render(
    <ToastProvider>
      <SharePage />
    </ToastProvider>
  );
  await waitFor(() => {
    expect(screen.getByText('hello')).toBeInTheDocument();
  });
}

describe('SharePage — 全局 toast (UX-6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => shareData,
    });
  });

  it('复制端点 URL 后经全局 ToastProvider 显示成功 toast', async () => {
    await renderSharePage();

    const copyButtons = screen.getAllByRole('button', { name: '复制' });
    fireEvent.click(copyButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('已复制: /hello')).toBeInTheDocument();
    });
    expect(writeText).toHaveBeenCalledWith('http://localhost:3000/m/demo/hello');
  });

  it('clipboard 失败时显示错误 toast', async () => {
    writeText.mockRejectedValueOnce(new Error('denied'));
    await renderSharePage();

    const copyButtons = screen.getAllByRole('button', { name: '复制' });
    fireEvent.click(copyButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('复制失败，请手动复制')).toBeInTheDocument();
    });
  });
});

describe('SharePage — 内联「添加一行」表单 (UX-7)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => shareData,
    });
  });

  async function expandTestPanel() {
    await renderSharePage();
    fireEvent.click(screen.getByRole('button', { name: '测试' }));
    await waitFor(() => {
      expect(screen.getByText('查询参数')).toBeInTheDocument();
    });
  }

  it('输入参数名后添加一行,参数出现在列表中', async () => {
    await expandTestPanel();

    const input = screen.getByPlaceholderText('参数名');
    fireEvent.change(input, { target: { value: 'page' } });
    fireEvent.click(screen.getAllByRole('button', { name: '添加一行' })[0]);

    // 新增行:key 只读展示 + value 可编辑
    expect(screen.getByDisplayValue('page')).toBeInTheDocument();
    // URL 实时带上新参数(值为空串时 buildFullUrl 不带,这里验证 key 出现即可)
  });

  it('key 为空时行内报错,不添加', async () => {
    await expandTestPanel();

    fireEvent.click(screen.getAllByRole('button', { name: '添加一行' })[0]);

    expect(screen.getByText('名称不能为空')).toBeInTheDocument();
    expect(screen.getByText('无查询参数')).toBeInTheDocument();
  });

  it('key 重复时行内报错,不产生第二行', async () => {
    await expandTestPanel();

    const input = screen.getByPlaceholderText('参数名');
    fireEvent.change(input, { target: { value: 'page' } });
    fireEvent.click(screen.getAllByRole('button', { name: '添加一行' })[0]);
    expect(screen.getByDisplayValue('page')).toBeInTheDocument();

    // 再添加同名 key
    fireEvent.change(input, { target: { value: 'page' } });
    fireEvent.click(screen.getAllByRole('button', { name: '添加一行' })[0]);

    expect(screen.getByText('名称已存在')).toBeInTheDocument();
    // 已添加行里同名 key 仍只有一行(表单输入框里的 'page' 不算,只数只读 key 列)
    const keyCells = screen
      .getAllByDisplayValue('page')
      .filter((el) => el.hasAttribute('readonly'));
    expect(keyCells.length).toBe(1);
  });
});
