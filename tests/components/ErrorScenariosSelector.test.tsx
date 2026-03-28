import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ErrorScenariosSelector } from '@/components/ErrorScenariosSelector';

describe('ErrorScenariosSelector', () => {
  it('should render selector component', () => {
    const onApply = vi.fn();

    render(<ErrorScenariosSelector onApply={onApply} />);

    expect(screen.getByText('错误场景模拟')).toBeInTheDocument();
    expect(screen.getByText('快速配置常见的错误响应场景')).toBeInTheDocument();
  });

  it('should render error type categories', () => {
    const onApply = vi.fn();

    render(<ErrorScenariosSelector onApply={onApply} />);

    expect(screen.getByText('服务器错误')).toBeInTheDocument();
    expect(screen.getByText('客户端错误')).toBeInTheDocument();
    expect(screen.getByText('超时模拟')).toBeInTheDocument();
    expect(screen.getByText('网络错误')).toBeInTheDocument();
  });

  it('should show scenarios when category is selected', () => {
    const onApply = vi.fn();

    render(<ErrorScenariosSelector onApply={onApply} />);

    const serverCategoryButton = screen.getByText('服务器错误').closest('button');
    fireEvent.click(serverCategoryButton!);

    expect(screen.getByText('500 内部服务器错误')).toBeInTheDocument();
  });

  it('should show preview dialog when scenario is clicked', () => {
    const onApply = vi.fn();

    render(<ErrorScenariosSelector onApply={onApply} />);

    const serverCategoryButton = screen.getByText('服务器错误').closest('button');
    fireEvent.click(serverCategoryButton!);

    const scenarioButton = screen.getByText('500 内部服务器错误').closest('button');
    fireEvent.click(scenarioButton!);

    expect(screen.getByText('500 内部服务器错误', { selector: 'h3' })).toBeInTheDocument();
  });

  it('should call onApply with scenario data when apply button is clicked', async () => {
    const onApply = vi.fn();

    render(<ErrorScenariosSelector onApply={onApply} />);

    const serverCategoryButton = screen.getByText('服务器错误').closest('button');
    fireEvent.click(serverCategoryButton!);

    const scenarioButton = screen.getByText('500 内部服务器错误').closest('button');
    fireEvent.click(scenarioButton!);

    const applyButton = screen.getByText('应用场景');
    fireEvent.click(applyButton);

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'server-500',
        name: '500 内部服务器错误',
        statusCode: 500,
      })
    );
  });

  it('should close preview dialog when cancel button is clicked', () => {
    const onApply = vi.fn();

    render(<ErrorScenariosSelector onApply={onApply} />);

    const serverCategoryButton = screen.getByText('服务器错误').closest('button');
    fireEvent.click(serverCategoryButton!);

    const scenarioButton = screen.getByText('500 内部服务器错误').closest('button');
    fireEvent.click(scenarioButton!);

    const cancelButton = screen.getByText('取消');
    fireEvent.click(cancelButton);

    expect(screen.queryByText('500 内部服务器错误', { selector: 'h3' })).not.toBeInTheDocument();
  });

  it('should reset selection when reset button is clicked', () => {
    const onApply = vi.fn();

    render(<ErrorScenariosSelector onApply={onApply} />);

    const serverCategoryButton = screen.getByText('服务器错误').closest('button');
    fireEvent.click(serverCategoryButton!);

    const resetButton = screen.getByText('重置选择');
    fireEvent.click(resetButton);

    expect(screen.queryByText('500 内部服务器错误')).not.toBeInTheDocument();
  });

  it('should be disabled when disabled prop is true', () => {
    const onApply = vi.fn();

    render(<ErrorScenariosSelector onApply={onApply} disabled />);

    const serverCategoryButton = screen.getByText('服务器错误').closest('button');
    expect(serverCategoryButton).toBeDisabled();
  });

  it('should display scenario details in preview dialog', () => {
    const onApply = vi.fn();

    render(<ErrorScenariosSelector onApply={onApply} />);

    const serverCategoryButton = screen.getByText('服务器错误').closest('button');
    fireEvent.click(serverCategoryButton!);

    const scenarioButton = screen.getByText('500 内部服务器错误').closest('button');
    fireEvent.click(scenarioButton!);

    expect(screen.getByText('500', { selector: 'div.font-mono' })).toBeInTheDocument();
    expect(screen.getByText('application/json')).toBeInTheDocument();
  });
});
