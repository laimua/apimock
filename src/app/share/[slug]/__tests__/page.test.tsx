/**
 * P2-49 回归测试:share 页 toast setTimeout 清理。
 *
 * 原实现 showToast 的 setTimeout 无清理,连续复制时第一个 toast 的 timer
 * 会提前清掉第二个新 toast(两个 timer 各 2000ms,但第二个显示时间被第一个
 * 截断)。修复:用 toastTimerRef 在每次新 toast 前清掉旧 timer。
 *
 * 用 fake timer 精确控制时间线:
 *   t=0   第一次复制 → toast A
 *   t=500 第二次复制 → toast B(修复后 A 的 timer 被清,只有 B 的 timer 在跑)
 *   t=2000(从 B 起算 1500ms,从 A 起算 2000ms)
 *         修复前:A 的 timer 触发 → toast 被清(B 消失,bug)
 *         修复后:A 的 timer 已清,只有 B 的 timer 在等 → B 仍在
 *   t=2500(B 起算 2000ms) → B 才消失
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import 'react';

// 本测试 import 了 share/[slug]/page.tsx,该文件用了 styled-jsx 的 `<style jsx>`。
// 测试 tsconfig 没有 @types/styled-jsx(app tsconfig 由 Next 插件处理)。这里通过
// 模块增强 react 给 StyleHTMLAttributes 补 jsx/global 属性,使被传递检查的 page.tsx
// 不报 TS2322(直接重新声明 IntrinsicElements.style 会因类型不一致触发 TS2717)。
declare module 'react' {
  // T 必须与 React 原声明的类型参数一致(否则 TS2428),本身在本增强里不用。
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface StyleHTMLAttributes<T> {
    jsx?: boolean;
    global?: boolean;
  }
}

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

describe('SharePage — P2-49 toast setTimeout 清理', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => shareData,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('连续复制时第二个 toast 不被第一个的 timer 提前清掉', async () => {
    // 全程用 fake timer;fetch/clipboard 的微任务通过 advanceTimersByTimeAsync(0) 推进
    vi.useFakeTimers();

    const { default: SharePage } = await import('../page');
    render(<SharePage />);

    // 推进让初始 fetch resolve + 组件渲染列表(fake timer 下不能依赖 waitFor)
    for (let i = 0; i < 10 && !screen.queryByText('hello'); i++) {
      await vi.advanceTimersByTimeAsync(0);
    }
    expect(screen.getByText('hello')).toBeTruthy();

    const copyButtons = screen.getAllByRole('button', { name: '复制' });
    const copyBtn = copyButtons[0];

    // t=0:第一次复制
    await act(async () => {
      fireEvent.click(copyBtn);
      await vi.advanceTimersByTimeAsync(0); // 让 writeText + showToast 跑完
    });
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(screen.getByText('已复制: /hello')).toBeTruthy();

    // t=500:第二次复制(A 的 2000ms timer 此刻还剩 1500ms)
    await vi.advanceTimersByTimeAsync(500);
    await act(async () => {
      fireEvent.click(copyBtn);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(writeText).toHaveBeenCalledTimes(2);
    expect(screen.getByText('已复制: /hello')).toBeTruthy();

    // t=2000(自 A 起):
    //   修复前:A 的 timer 触发 → toast 被提前清掉(bug)
    //   修复后:A 的 timer 在第二次 showToast 时已被清 → toast 仍在
    await vi.advanceTimersByTimeAsync(1500);
    expect(screen.queryByText('已复制: /hello')).toBeTruthy();

    // t=2500(自 B 起 2000ms)→ B 的 timer 触发,toast 才消失
    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(0); // 刷新 React commit
    expect(screen.queryByText('已复制: /hello')).toBeNull();
  });
});
