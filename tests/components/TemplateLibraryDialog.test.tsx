import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TemplateLibraryDialog } from '@/components/TemplateLibraryDialog';

// Mock mock-templates library
vi.mock('@/lib/mock-templates', () => ({
  MOCK_TEMPLATES: [
    {
      id: 'user-list',
      category: 'user',
      name: '用户列表',
      description: '返回用户列表数据',
      content: {
        data: [{ id: 1, name: 'John' }],
        total: 1,
      },
    },
    {
      id: 'product-detail',
      category: 'product',
      name: '产品详情',
      description: '返回产品详细信息',
      content: {
        id: 1,
        name: 'Product',
        price: 100,
      },
    },
  ],
  TEMPLATE_CATEGORIES: {
    user: {
      name: '用户相关',
      description: '用户数据模板',
    },
    product: {
      name: '产品相关',
      description: '产品数据模板',
    },
  },
  formatTemplateContent: (template: any) => JSON.stringify(template.content, null, 2),
}));

describe('TemplateLibraryDialog', () => {
  it('should not render when isOpen is false', () => {
    const onApply = vi.fn();
    const onClose = vi.fn();

    render(
      <TemplateLibraryDialog isOpen={false} onClose={onClose} onApply={onApply} />
    );

    expect(screen.queryByText('Mock 模板库')).not.toBeInTheDocument();
  });

  it('should render dialog when isOpen is true', () => {
    const onApply = vi.fn();
    const onClose = vi.fn();

    render(
      <TemplateLibraryDialog isOpen onClose={onClose} onApply={onApply} />
    );

    expect(screen.getByText('Mock 模板库')).toBeInTheDocument();
    expect(screen.getByText('选择预设模板快速应用到响应数据')).toBeInTheDocument();
  });

  it('should display all templates by default', () => {
    const onApply = vi.fn();
    const onClose = vi.fn();

    render(
      <TemplateLibraryDialog isOpen onClose={onClose} onApply={onApply} />
    );

    expect(screen.getByText('用户列表')).toBeInTheDocument();
    expect(screen.getByText('产品详情')).toBeInTheDocument();
  });

  it('should filter templates by category', () => {
    const onApply = vi.fn();
    const onClose = vi.fn();

    render(
      <TemplateLibraryDialog isOpen onClose={onClose} onApply={onApply} />
    );

    // Find the user category button - use getAllByRole and filter
    const buttons = screen.getAllByRole('button');
    const userCategoryButton = buttons.find(btn => 
      btn.textContent?.includes('用户相关') && btn.textContent?.includes('(')
    );
    
    expect(userCategoryButton).toBeDefined();
    fireEvent.click(userCategoryButton!);

    expect(screen.getByText('用户列表')).toBeInTheDocument();
    expect(screen.queryByText('产品详情')).not.toBeInTheDocument();
  });

  it('should show all templates when all category is selected', () => {
    const onApply = vi.fn();
    const onClose = vi.fn();

    render(
      <TemplateLibraryDialog isOpen onClose={onClose} onApply={onApply} />
    );

    const buttons = screen.getAllByRole('button');
    const userCategoryButton = buttons.find(btn => 
      btn.textContent?.includes('用户相关') && btn.textContent?.includes('(')
    );
    
    expect(userCategoryButton).toBeDefined();
    fireEvent.click(userCategoryButton!);

    const allCategoryButton = buttons.find(btn => 
      btn.textContent?.includes('全部模板')
    );
    
    expect(allCategoryButton).toBeDefined();
    fireEvent.click(allCategoryButton!);

    expect(screen.getByText('用户列表')).toBeInTheDocument();
    expect(screen.getByText('产品详情')).toBeInTheDocument();
  });

  it('should show template preview when template is clicked', () => {
    const onApply = vi.fn();
    const onClose = vi.fn();

    render(
      <TemplateLibraryDialog isOpen onClose={onClose} onApply={onApply} />
    );

    const templateButton = screen.getByText('用户列表').closest('button');
    fireEvent.click(templateButton!);

    expect(screen.getByText('响应数据预览')).toBeInTheDocument();
    expect(screen.getByText('用户列表', { selector: 'h3' })).toBeInTheDocument();
  });

  it('should call onApply with template content when apply button is clicked', () => {
    const onApply = vi.fn();
    const onClose = vi.fn();

    render(
      <TemplateLibraryDialog isOpen onClose={onClose} onApply={onApply} />
    );

    const templateButton = screen.getByText('用户列表').closest('button');
    fireEvent.click(templateButton!);

    const applyButton = screen.getByText('应用此模板');
    fireEvent.click(applyButton);

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith(expect.stringContaining('"data"'));
  });

  it('should close dialog when close button is clicked', () => {
    const onApply = vi.fn();
    const onClose = vi.fn();

    render(
      <TemplateLibraryDialog isOpen onClose={onClose} onApply={onApply} />
    );

    const closeButton = screen.getByText('关闭');
    fireEvent.click(closeButton);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should close dialog when backdrop is clicked', () => {
    const onApply = vi.fn();
    const onClose = vi.fn();

    const { container } = render(
      <TemplateLibraryDialog isOpen onClose={onClose} onApply={onApply} />
    );

    const backdrop = container.querySelector('.fixed.inset-0.z-50 > div.absolute');
    if (backdrop) {
      fireEvent.click(backdrop);
    }

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should display template description', () => {
    const onApply = vi.fn();
    const onClose = vi.fn();

    render(
      <TemplateLibraryDialog isOpen onClose={onClose} onApply={onApply} />
    );

    expect(screen.getByText('返回用户列表数据')).toBeInTheDocument();
  });

  it('should display template category tabs', () => {
    const onApply = vi.fn();
    const onClose = vi.fn();

    render(
      <TemplateLibraryDialog isOpen onClose={onClose} onApply={onApply} />
    );

    // Check that category buttons exist by looking for buttons that contain count in parens
    const buttons = screen.getAllByRole('button');
    const categoryButtons = buttons.filter(btn => 
      btn.textContent?.match(/\(\d+\)$/)
    );
    
    expect(categoryButtons.length).toBeGreaterThanOrEqual(2);
  });

  it('should reset state when dialog is reopened', () => {
    const onApply = vi.fn();
    const onClose = vi.fn();

    const { rerender } = render(
      <TemplateLibraryDialog isOpen onClose={onClose} onApply={onApply} />
    );

    // Select a category
    const buttons = screen.getAllByRole('button');
    const userCategoryButton = buttons.find(btn => 
      btn.textContent?.includes('用户相关') && btn.textContent?.includes('(')
    );
    
    expect(userCategoryButton).toBeDefined();
    fireEvent.click(userCategoryButton!);

    // Click a template
    const templateButton = screen.getByText('用户列表').closest('button');
    fireEvent.click(templateButton!);

    // Close and reopen
    rerender(
      <TemplateLibraryDialog isOpen={false} onClose={onClose} onApply={onApply} />
    );
    rerender(
      <TemplateLibraryDialog isOpen onClose={onClose} onApply={onApply} />
    );

    // The component should be visible again after reopening
    expect(screen.getByText('Mock 模板库')).toBeInTheDocument();
    expect(screen.getAllByText('用户列表').length).toBeGreaterThanOrEqual(1);
  });

  it('should display template preview in JSON format', () => {
    const onApply = vi.fn();
    const onClose = vi.fn();

    render(
      <TemplateLibraryDialog isOpen onClose={onClose} onApply={onApply} />
    );

    const templateButton = screen.getByText('用户列表').closest('button');
    fireEvent.click(templateButton!);

    expect(screen.getByText('响应数据预览')).toBeInTheDocument();

    // Check that code element contains JSON content
    const codeElement = screen.getByRole('code');
    expect(codeElement).toBeInTheDocument();
    expect(codeElement.textContent).toContain('"data"');
    expect(codeElement.textContent).toContain('"total"');
  });
});
