/**
 * P2-46 回归测试:删除响应规则无防重复提交。
 *
 * 原实现 ConfirmDialog 的确认按钮无 disabled 状态、confirmDelete 无 in-flight
 * 标记,双击确认按钮会发出两个 DELETE,第二个 404 触发"规则不存在"错误 toast。
 *
 * 修复:加 isDeleting 状态,删除进行中禁用确认按钮(confirmDisabled)并在
 * confirmDelete 入口早退。本测试断言 delete 仅被调用一次。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { ResponseRuleEditor } from '../ResponseRuleEditor';
import type { ResponseRule } from '@/lib/api-client';

// ConfirmDialog 与行内"删除"按钮文案相同,通过对话框内的确认消息文本来定位
// 对话框根节点,再在其内部找确认按钮。
const CONFIRM_MSG = '确定要删除此响应规则吗？此操作无法撤销。';
function getDialogConfirmButton(): HTMLButtonElement {
  const dialog = screen.getByText(CONFIRM_MSG).closest('[role="dialog"]') as HTMLElement;
  const btns = within(dialog).getAllByRole('button', { name: /删除/ });
  // 对话框内有两个按钮:取消 / 删除(或"删除中...")
  const confirm = btns.find((b) => /删除/.test(b.textContent ?? '') && b.textContent !== '取消');
  return (confirm ?? btns[btns.length - 1]) as HTMLButtonElement;
}

// vi.mock 工厂会被提升到文件顶部,因此被引用的常量必须用 vi.hoisted 声明,
// 否则报 "Cannot access 'X' before initialization"。
const { mockResponsesApi, toast } = vi.hoisted(() => ({
  mockResponsesApi: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  toast: { success: vi.fn(), error: vi.fn() },
}));

// 控制 delete 的 resolve 时机,模拟"用户在请求未返回前再次点击确认"
let resolveDelete: (() => void) | null = null;

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>(
    '@/lib/api-client',
  );
  return {
    ...actual,
    responsesApi: mockResponsesApi,
  };
});

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => toast,
}));

// JsonEditor 依赖较重,直接桩掉
vi.mock('@/components/JsonEditor', () => ({
  JsonEditor: () => null,
}));

const sampleResponse: ResponseRule = {
  id: 'resp-1',
  endpointId: 'ep-1',
  name: 'rule-a',
  description: undefined,
  statusCode: 200,
  contentType: 'application/json',
  headers: {},
  body: '{}',
  matchRules: {},
  isDefault: true,
  priority: 0,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('ResponseRuleEditor — P2-46 删除防重复提交', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveDelete = null;
    mockResponsesApi.list.mockResolvedValue([sampleResponse]);
    mockResponsesApi.delete.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveDelete = resolve;
        }),
    );
  });

  it('双击确认按钮只发一个 DELETE', async () => {
    render(<ResponseRuleEditor projectId="p1" endpointId="ep-1" />);

    // 列表加载完成后,展开该响应规则以露出"删除"按钮
    await waitFor(() => expect(screen.getByText('rule-a')).toBeTruthy());
    fireEvent.click(screen.getByText('rule-a'));

    // 行内触发按钮(在 Card 内,非对话框)
    const deleteTriggers = await screen.findAllByRole('button', { name: '删除' });
    expect(deleteTriggers.length).toBe(1);
    fireEvent.click(deleteTriggers[0]);

    // ConfirmDialog 出现,其确认按钮文案也是"删除"
    await waitFor(() => expect(screen.getByText(CONFIRM_MSG)).toBeTruthy());
    const confirmBtn = getDialogConfirmButton();
    expect(confirmBtn).toBeTruthy();

    // 在 delete resolve 之前连点三次确认 —— 应只触发一次 delete
    fireEvent.click(confirmBtn);
    fireEvent.click(confirmBtn);
    fireEvent.click(confirmBtn);

    await waitFor(() => expect(mockResponsesApi.delete).toHaveBeenCalledTimes(1));

    // resolve 让流程走完
    await waitFor(() => {
      if (resolveDelete) resolveDelete();
    });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('响应规则已删除'));

    // 仍然只有一次
    expect(mockResponsesApi.delete).toHaveBeenCalledTimes(1);
  });

  it('删除进行中确认按钮被禁用(disabled)', async () => {
    render(<ResponseRuleEditor projectId="p1" endpointId="ep-1" />);

    await waitFor(() => expect(screen.getByText('rule-a')).toBeTruthy());
    fireEvent.click(screen.getByText('rule-a'));

    const deleteTriggers = await screen.findAllByRole('button', { name: '删除' });
    fireEvent.click(deleteTriggers[0]);

    await waitFor(() => expect(screen.getByText(CONFIRM_MSG)).toBeTruthy());
    const confirmBtn = getDialogConfirmButton();
    fireEvent.click(confirmBtn);

    // 删除 in-flight 后,按钮文案变为"删除中..."且 disabled
    await waitFor(() => {
      const inFlightBtn = screen.getByRole('button', { name: '删除中...' });
      expect((inFlightBtn as HTMLButtonElement).disabled).toBe(true);
    });

    // 释放,避免悬挂 promise 影响后续测试
    if (resolveDelete) resolveDelete();
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });
});
