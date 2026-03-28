import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ResponseRuleEditor } from '@/components/ResponseRuleEditor';
import * as apiClient from '@/lib/api-client';

// Mock the api-client
vi.mock('@/lib/api-client', () => ({
  responsesApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  ApiError: class extends Error {
    constructor(public status: number, public code: string, message: string) {
      super(message);
      this.name = 'ApiError';
    }
  },
}));

// Mock Toast
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock JsonEditor
vi.mock('@/components/JsonEditor', () => ({
  JsonEditor: ({ value, onChange, readOnly }: any) => (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      readOnly={readOnly}
      data-testid="json-editor"
    />
  ),
}));

const mockResponses = [
  {
    id: '1',
    endpointId: 'endpoint-1',
    name: '默认响应',
    statusCode: 200,
    contentType: 'application/json',
    headers: {},
    body: { success: true },
    matchRules: {},
    isDefault: true,
    priority: 0,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
];

describe('ResponseRuleEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (apiClient.responsesApi.list as any).mockResolvedValue(mockResponses);
  });

  it('should render loading state initially', () => {
    render(<ResponseRuleEditor projectId="project-1" endpointId="endpoint-1" />);

    expect(screen.getByText('响应规则')).toBeInTheDocument();
  });

  it('should render responses after loading', async () => {
    render(<ResponseRuleEditor projectId="project-1" endpointId="endpoint-1" />);

    await waitFor(() => {
      expect(screen.getByText('默认响应')).toBeInTheDocument();
    });
  });

  it('should render empty state when no responses', async () => {
    (apiClient.responsesApi.list as any).mockResolvedValue([]);

    render(<ResponseRuleEditor projectId="project-1" endpointId="endpoint-1" />);

    await waitFor(() => {
      expect(screen.getByText('暂无响应规则')).toBeInTheDocument();
    });
  });

  it('should show create dialog when add button is clicked', async () => {
    render(<ResponseRuleEditor projectId="project-1" endpointId="endpoint-1" />);

    await waitFor(() => {
      expect(apiClient.responsesApi.list).toHaveBeenCalled();
    });

    const addButton = screen.getByText('+ 添加响应');
    fireEvent.click(addButton);

    expect(screen.getByText('添加响应规则')).toBeInTheDocument();
  });

  it('should expand response detail when response item is clicked', async () => {
    render(<ResponseRuleEditor projectId="project-1" endpointId="endpoint-1" />);

    await waitFor(() => {
      expect(screen.getByText('默认响应')).toBeInTheDocument();
    });

    const responseItem = screen.getByText('默认响应').closest('button');
    fireEvent.click(responseItem!);

    expect(screen.getByText('响应预览')).toBeInTheDocument();
  });

  it('should show edit dialog when edit button is clicked', async () => {
    render(<ResponseRuleEditor projectId="project-1" endpointId="endpoint-1" />);

    await waitFor(() => {
      expect(screen.getByText('默认响应')).toBeInTheDocument();
    });

    // Click to expand
    const responseItem = screen.getByText('默认响应').closest('button');
    fireEvent.click(responseItem!);

    // Click edit button
    const editButton = screen.getByText('编辑');
    fireEvent.click(editButton);

    expect(screen.getByText('编辑响应规则')).toBeInTheDocument();
  });

  it('should show delete confirmation when delete button is clicked', async () => {
    render(<ResponseRuleEditor projectId="project-1" endpointId="endpoint-1" />);

    await waitFor(() => {
      expect(screen.getByText('默认响应')).toBeInTheDocument();
    });

    // Click to expand
    const responseItem = screen.getByText('默认响应').closest('button');
    fireEvent.click(responseItem!);

    // Click delete button
    const deleteButton = screen.getByText('删除');
    fireEvent.click(deleteButton);

    expect(screen.getByText('删除响应规则')).toBeInTheDocument();
  });

  it('should call delete API when confirmed', async () => {
    (apiClient.responsesApi.delete as any).mockResolvedValue(undefined);

    render(<ResponseRuleEditor projectId="project-1" endpointId="endpoint-1" />);

    await waitFor(() => {
      expect(screen.getByText('默认响应')).toBeInTheDocument();
    });

    // Expand
    const responseItem = screen.getByText('默认响应').closest('button');
    fireEvent.click(responseItem!);

    // Click delete
    const deleteButton = screen.getByText('删除');
    fireEvent.click(deleteButton!);

    // Confirm delete - find the delete button in the confirmation dialog
    const allDeleteButtons = screen.getAllByText('删除');
    const confirmDeleteButton = allDeleteButtons.find(btn => 
      btn.className?.includes('flex-1') && btn.className?.includes('bg-red-600')
    );
    expect(confirmDeleteButton).toBeDefined();
    fireEvent.click(confirmDeleteButton!);

    expect(apiClient.responsesApi.delete).toHaveBeenCalledWith('project-1', 'endpoint-1', '1');
  });

  it('should close dialog when cancel button is clicked', async () => {
    render(<ResponseRuleEditor projectId="project-1" endpointId="endpoint-1" />);

    await waitFor(() => {
      expect(apiClient.responsesApi.list).toHaveBeenCalled();
    });

    const addButton = screen.getByText('+ 添加响应');
    fireEvent.click(addButton);

    const cancelButton = screen.getByText('取消');
    fireEvent.click(cancelButton);

    expect(screen.queryByText('添加响应规则')).not.toBeInTheDocument();
  });

  it('should close dialog when close icon is clicked', async () => {
    render(<ResponseRuleEditor projectId="project-1" endpointId="endpoint-1" />);

    await waitFor(() => {
      expect(apiClient.responsesApi.list).toHaveBeenCalled();
    });

    const addButton = screen.getByText('+ 添加响应');
    fireEvent.click(addButton);

    // Close dialog by clicking the X icon (which is a button without text label)
    const dialog = screen.getByText('添加响应规则').closest('.fixed');
    const closeButton = dialog?.querySelector('button[type="button"]:has(svg)');
    expect(closeButton).toBeInTheDocument();
    fireEvent.click(closeButton!);

    expect(screen.queryByText('添加响应规则')).not.toBeInTheDocument();
  });

  it('should display warning when no default response exists', async () => {
    (apiClient.responsesApi.list as any).mockResolvedValue([
      {
        ...mockResponses[0],
        isDefault: false,
      },
    ]);

    render(<ResponseRuleEditor projectId="project-1" endpointId="endpoint-1" />);

    await waitFor(() => {
      // The warning text contains an emoji at the beginning
      const warningText = screen.getAllByText(/请确保至少有一个响应设置为默认响应/).find(el => 
        el.textContent?.includes('⚠️')
      );
      expect(warningText).toBeDefined();
    });
  });

  it('should render response status code badge', async () => {
    render(<ResponseRuleEditor projectId="project-1" endpointId="endpoint-1" />);

    await waitFor(() => {
      expect(screen.getByText('200')).toBeInTheDocument();
    });
  });
});
