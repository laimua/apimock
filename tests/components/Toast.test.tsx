/**
 * Toast 全局提示层单测(P2-49 回归)。
 *
 * 历史缺陷:连续复制时第二条 toast 覆盖/顶掉第一条。这里用时间线断言:
 * 两条 toast 各自独立计时,共存期间互不覆盖,先后各自到期消失。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { ToastProvider, useToast } from '@/components/ui/Toast';

function Harness() {
  const { success } = useToast();
  return (
    <>
      <button type="button" onClick={() => success('第一条')}>
        t1
      </button>
      <button type="button" onClick={() => success('第二条')}>
        t2
      </button>
    </>
  );
}

describe('Toast 连续提示 (P2-49)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('两条连续 toast 各自计时,不互相覆盖,先到的先消失', () => {
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>
    );

    // t=0 发出第一条
    act(() => {
      fireEvent.click(screen.getByText('t1'));
    });
    expect(screen.getByText('第一条')).toBeInTheDocument();

    // t=1s 发出第二条,第一条不能被覆盖
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    act(() => {
      fireEvent.click(screen.getByText('t2'));
    });
    expect(screen.getByText('第一条')).toBeInTheDocument();
    expect(screen.getByText('第二条')).toBeInTheDocument();

    // t=3s 第一条到期消失,第二条(还剩 2s)仍在
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.queryByText('第一条')).not.toBeInTheDocument();
    expect(screen.getByText('第二条')).toBeInTheDocument();

    // t=4s 第二条也到期消失
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByText('第二条')).not.toBeInTheDocument();
  });
});
