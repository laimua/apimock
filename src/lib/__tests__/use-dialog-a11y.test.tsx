/**
 * useDialogA11y hook 单测(UX-8)。
 *
 * 验证:document 级 Escape 触发 onClose;打开时初始聚焦弹窗内首个可聚焦元素;
 * Tab/Shift+Tab 在首尾之间循环(focus trap);关闭时不挂监听。
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useDialogA11y } from '../use-dialog-a11y';

function Harness({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const dialogRef = useDialogA11y<HTMLDivElement>(isOpen, onClose);
  if (!isOpen) return null;
  return (
    <div ref={dialogRef} role="dialog" aria-modal="true">
      <button type="button">first</button>
      <input aria-label="middle" />
      <button type="button">last</button>
    </div>
  );
}

describe('useDialogA11y (UX-8)', () => {
  it('打开时初始聚焦首个可聚焦元素', () => {
    render(<Harness isOpen onClose={() => {}} />);
    expect(document.activeElement).toBe(screen.getByText('first'));
  });

  it('document 级 Escape 触发关闭', () => {
    const onClose = vi.fn();
    render(<Harness isOpen onClose={onClose} />);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('关闭时不挂监听,Escape 不触发', () => {
    const onClose = vi.fn();
    render(<Harness isOpen={false} onClose={onClose} />);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('焦点在末元素时 Tab 循环回首元素', () => {
    render(<Harness isOpen onClose={() => {}} />);
    const first = screen.getByText('first');
    const last = screen.getByText('last');

    last.focus();
    expect(document.activeElement).toBe(last);

    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
  });

  it('焦点在首元素时 Shift+Tab 循环回末元素', () => {
    render(<Harness isOpen onClose={() => {}} />);
    const first = screen.getByText('first');
    const last = screen.getByText('last');

    first.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('焦点在中间元素时 Tab 不拦截(交给浏览器默认行为)', () => {
    render(<Harness isOpen onClose={() => {}} />);
    const middle = screen.getByLabelText('middle');

    middle.focus();
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    const preventSpy = vi.spyOn(event, 'preventDefault');
    fireEvent(document, event);

    expect(preventSpy).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(middle);
  });

  it('焦点在 body(弹窗外)时 Tab 拦截并聚焦首元素,不逃逸到背景页', () => {
    render(<Harness isOpen onClose={() => {}} />);
    // 模拟点击弹窗空白区:activeElement 落回 body
    (document.activeElement as HTMLElement | null)?.blur?.();
    expect(document.activeElement).toBe(document.body);

    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    const preventSpy = vi.spyOn(event, 'preventDefault');
    fireEvent(document, event);

    expect(preventSpy).toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByText('first'));
  });

  it('onClose 变化不重复挂监听,Escape 只触发一次且用最新回调', () => {
    const onClose1 = vi.fn();
    const onClose2 = vi.fn();
    const { rerender } = render(<Harness isOpen onClose={onClose1} />);
    rerender(<Harness isOpen onClose={onClose2} />);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose1).not.toHaveBeenCalled();
    expect(onClose2).toHaveBeenCalledTimes(1);
  });
});
