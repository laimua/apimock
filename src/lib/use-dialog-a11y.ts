/**
 * 弹窗无障碍 hook(UX-8):document 级 Escape 关闭 + 初始聚焦首个可聚焦元素 + Tab 循环 trap。
 * Tab 时焦点不在弹窗内(如点了空白区,activeElement=body)会拦截并拉回首个可聚焦元素。
 *
 * 用法:const dialogRef = useDialogA11y<HTMLDivElement>(isOpen, onClose);
 * 把 dialogRef 挂到弹窗容器(含全部可聚焦元素的那层 div)上。
 * 不做焦点恢复(弹窗多为临时操作,打开按钮常在列表里,恢复意义有限)。
 */

import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useDialogA11y<T extends HTMLElement>(isOpen: boolean, onClose: () => void) {
  const dialogRef = useRef<T>(null);
  // 用 ref 持最新 onClose,effect 只依赖 isOpen,避免每次渲染重挂监听/重聚焦
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const dialog = dialogRef.current;
    dialog?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const focusables = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      // 焦点不在弹窗内(如点击空白区后 activeElement=body):拦截并拉回首元素,防止 Tab 逃逸到背景页
      if (!active || !dialogRef.current.contains(active)) {
        e.preventDefault();
        first.focus();
        return;
      }
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  return dialogRef;
}
