import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RequestRecords } from '@/components/RequestRecords';
import * as apiClient from '@/lib/api-client';

// Mock the api-client
vi.mock('@/lib/api-client', () => ({
  requestsApi: {
    list: vi.fn(),
    clear: vi.fn(),
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

// Mock Badge
vi.mock('@/components/ui/Badge', () => ({
  Badge: ({ method }: { method: string }) => <span data-testid={`badge-${method}`}>{method}</span>,
}));

// Mock Skeleton
vi.mock('@/components/ui/Skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => <div className={className} data-testid="skeleton" />,
}));

const listMock = apiClient.requestsApi.list as unknown as ReturnType<typeof vi.fn>;

const mockRequests = [
  {
    id: '1',
    endpointId: 'endpoint-1',
    method: 'GET',
    path: '/api/users',
    query: { page: '1' },
    headers: { 'Content-Type': 'application/json' },
    body: null,
    responseStatus: 200,
    responseTime: 150,
    ip: '127.0.0.1',
    userAgent: 'Mozilla/5.0',
    createdAt: Date.now(),
    endpoint: {
      path: '/api/users',
      method: 'GET',
    },
  },
];

describe('RequestRecords', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listMock.mockResolvedValue({
      items: mockRequests,
      total: 1,
      page: 1,
      pageSize: 50,
    });
  });

  it('should render loading state initially', () => {
    render(<RequestRecords projectId="project-1" endpointId="endpoint-1" />);

    expect(screen.getByText('请求记录')).toBeInTheDocument();
  });

  it('should render requests after loading', async () => {
    render(<RequestRecords projectId="project-1" endpointId="endpoint-1" />);

    await waitFor(() => {
      expect(screen.getByTestId('badge-GET')).toBeInTheDocument();
    });
  });

  it('should render empty state when no requests', async () => {
    listMock.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 50,
    });

    render(<RequestRecords projectId="project-1" endpointId="endpoint-1" />);

    await waitFor(() => {
      expect(screen.getByText('暂无请求记录')).toBeInTheDocument();
    });
  });

  it('should show clear button when there are requests', async () => {
    render(<RequestRecords projectId="project-1" endpointId="endpoint-1" />);

    await waitFor(() => {
      expect(screen.getByText('清空记录')).toBeInTheDocument();
    });
  });

  it('should not show clear button when there are no requests', async () => {
    listMock.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 50,
    });

    render(<RequestRecords projectId="project-1" endpointId="endpoint-1" />);

    await waitFor(() => {
      expect(screen.queryByText('清空记录')).not.toBeInTheDocument();
    });
  });

  it('should show clear confirmation dialog when clear button is clicked', async () => {
    render(<RequestRecords projectId="project-1" endpointId="endpoint-1" />);

    await waitFor(() => {
      expect(screen.getByText('清空记录')).toBeInTheDocument();
    });

    const clearButton = screen.getByText('清空记录');
    fireEvent.click(clearButton);

    expect(screen.getByText('清空请求记录')).toBeInTheDocument();
    // Text may be split, use a partial match or function
    expect(screen.getByText(/清空所有请求记录吗/)).toBeInTheDocument();
  });

  it('should call clear API when confirmed', async () => {
    const clearMock = apiClient.requestsApi.clear as unknown as ReturnType<typeof vi.fn>;
    clearMock.mockResolvedValue(undefined);

    render(<RequestRecords projectId="project-1" endpointId="endpoint-1" />);

    await waitFor(() => {
      expect(screen.getByText('清空记录')).toBeInTheDocument();
    });

    // Click clear button
    const clearButton = screen.getByText('清空记录');
    fireEvent.click(clearButton);

    // Confirm clear
    const confirmButton = screen.getByText('清空');
    fireEvent.click(confirmButton);

    expect(apiClient.requestsApi.clear).toHaveBeenCalledWith('project-1', 'endpoint-1');
  });

  it('should close clear dialog when cancel button is clicked', async () => {
    render(<RequestRecords projectId="project-1" endpointId="endpoint-1" />);

    await waitFor(() => {
      expect(screen.getByText('清空记录')).toBeInTheDocument();
    });

    const clearButton = screen.getByText('清空记录');
    fireEvent.click(clearButton);

    const cancelButton = screen.getByText('取消');
    fireEvent.click(cancelButton);

    expect(screen.queryByText('清空请求记录')).not.toBeInTheDocument();
  });

  it('should expand request detail when request item is clicked', async () => {
    render(<RequestRecords projectId="project-1" endpointId="endpoint-1" />);

    await waitFor(() => {
      expect(screen.getByTestId('badge-GET')).toBeInTheDocument();
    });

    const requestItem = screen.getByText('/api/users').closest('button');
    fireEvent.click(requestItem!);

    expect(screen.getByText('IP:')).toBeInTheDocument();
    expect(screen.getByText('User-Agent:')).toBeInTheDocument();
  });

  it('should display request method', async () => {
    render(<RequestRecords projectId="project-1" endpointId="endpoint-1" />);

    await waitFor(() => {
      expect(screen.getByTestId('badge-GET')).toBeInTheDocument();
    });
  });

  it('should display request path', async () => {
    render(<RequestRecords projectId="project-1" endpointId="endpoint-1" />);

    await waitFor(() => {
      expect(screen.getByText('/api/users')).toBeInTheDocument();
    });
  });

  it('should display response status', async () => {
    render(<RequestRecords projectId="project-1" endpointId="endpoint-1" />);

    await waitFor(() => {
      expect(screen.getByText('200')).toBeInTheDocument();
    });
  });

  it('should display response time', async () => {
    render(<RequestRecords projectId="project-1" endpointId="endpoint-1" />);

    await waitFor(() => {
      expect(screen.getByText('150ms')).toBeInTheDocument();
    });
  });

  it('should call API with correct parameters on mount', async () => {
    render(<RequestRecords projectId="project-1" endpointId="endpoint-1" />);

    await waitFor(() => {
      expect(apiClient.requestsApi.list).toHaveBeenCalledWith('project-1', 'endpoint-1', 50, 0);
    });
  });
});


describe('RequestRecords 加载更多 (UX-4)', () => {
  function makeItems(start: number, count: number) {
    return Array.from({ length: count }, (_, i) => ({
      id: `req-${start + i}`,
      endpointId: 'endpoint-1',
      method: 'GET',
      path: `/api/item-${start + i}`,
      query: null,
      headers: null,
      body: null,
      responseStatus: 200,
      responseTime: 100,
      ip: '127.0.0.1',
      userAgent: 'test',
      createdAt: Date.now(),
      endpoint: { path: '/api', method: 'GET' },
    }));
  }

  it('首屏满 50 条显示「加载更多」,点击后 offset 步进 50 追加第二页数据', async () => {
    listMock
      .mockResolvedValueOnce({ items: makeItems(0, 50), total: 53, page: 1, pageSize: 50 })
      .mockResolvedValueOnce({ items: makeItems(50, 3), total: 53, page: 2, pageSize: 50 });

    render(<RequestRecords projectId="project-1" endpointId="endpoint-1" />);

    await waitFor(() => {
      expect(screen.getByText('/api/item-0')).toBeInTheDocument();
    });
    expect(screen.getByText('加载更多')).toBeInTheDocument();

    fireEvent.click(screen.getByText('加载更多'));

    // 第二页数据断言:首条与末页数据同时在列表中
    await waitFor(() => {
      expect(screen.getByText('/api/item-52')).toBeInTheDocument();
    });
    expect(screen.getByText('/api/item-0')).toBeInTheDocument();
    expect(apiClient.requestsApi.list).toHaveBeenLastCalledWith('project-1', 'endpoint-1', 50, 50);
  });

  it('返回数 < 50 判定无更多,「加载更多」按钮消失', async () => {
    listMock
      .mockResolvedValueOnce({ items: makeItems(0, 50), total: 53, page: 1, pageSize: 50 })
      .mockResolvedValueOnce({ items: makeItems(50, 3), total: 53, page: 2, pageSize: 50 });

    render(<RequestRecords projectId="project-1" endpointId="endpoint-1" />);

    await waitFor(() => {
      expect(screen.getByText('加载更多')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('加载更多'));

    await waitFor(() => {
      expect(screen.getByText('/api/item-52')).toBeInTheDocument();
    });
    expect(screen.queryByText('加载更多')).not.toBeInTheDocument();
  });

  it('首屏不足 50 条时不显示「加载更多」', async () => {
    listMock.mockResolvedValue({ items: makeItems(0, 10), total: 10, page: 1, pageSize: 50 });

    render(<RequestRecords projectId="project-1" endpointId="endpoint-1" />);

    await waitFor(() => {
      expect(screen.getByText('/api/item-0')).toBeInTheDocument();
    });
    expect(screen.queryByText('加载更多')).not.toBeInTheDocument();
  });
});
