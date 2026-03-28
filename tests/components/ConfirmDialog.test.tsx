import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

describe('ConfirmDialog', () => {
  it('should not render when isOpen is false', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <ConfirmDialog
        isOpen={false}
        title="确认删除"
        message="确定要删除吗？"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    expect(screen.queryByText('确认删除')).not.toBeInTheDocument();
  });

  it('should render dialog when isOpen is true', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <ConfirmDialog
        isOpen
        title="确认删除"
        message="确定要删除吗？"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    expect(screen.getByText('确认删除')).toBeInTheDocument();
    expect(screen.getByText('确定要删除吗？')).toBeInTheDocument();
  });

  it('should call onConfirm when confirm button is clicked', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <ConfirmDialog
        isOpen
        title="确认删除"
        message="确定要删除吗？"
        confirmText="删除"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    const confirmButton = screen.getByText('删除');
    fireEvent.click(confirmButton);

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('should call onCancel when cancel button is clicked', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <ConfirmDialog
        isOpen
        title="确认删除"
        message="确定要删除吗？"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    const cancelButton = screen.getByText('取消');
    fireEvent.click(cancelButton);

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('should call onCancel when backdrop is clicked', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    const { container } = render(
      <ConfirmDialog
        isOpen
        title="确认删除"
        message="确定要删除吗？"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    const backdrop = container.querySelector('.fixed.inset-0.z-50 > div.absolute');
    if (backdrop) {
      fireEvent.click(backdrop);
    }

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('should render danger variant with red icon', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <ConfirmDialog
        isOpen
        title="确认删除"
        message="确定要删除吗？"
        variant="danger"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    const confirmButton = screen.getByText('确认');
    expect(confirmButton).toHaveClass('bg-red-600');
  });

  it('should render warning variant with yellow icon', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <ConfirmDialog
        isOpen
        title="警告"
        message="这是一个警告"
        variant="warning"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    const confirmButton = screen.getByText('确认');
    expect(confirmButton).toHaveClass('bg-yellow-600');
  });
});
