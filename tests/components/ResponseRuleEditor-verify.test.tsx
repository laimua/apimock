/**
 * P0-3 ResponseRuleEditor 键冲突丢数据 — 针对性验证
 *
 * 验证修复核心:连点两次"添加 query 匹配"会得到两行(而非旧行为下
 * 因空键合并只剩一行)。这是原 bug 的精确复现路径。
 *
 * 修复前:queryMatches 是 Record<string,string>,addQueryMatch 插 {'':''},
 * 两次插入因键名 '' 唯一性合并为一行 → 第二次添加静默丢失。
 * 修复后:改为数组,每次 push {key:'',value:''},两行独立存在。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ResponseRuleEditor } from '@/components/ResponseRuleEditor';
import * as apiClient from '@/lib/api-client';

const listMock = apiClient.responsesApi.list as unknown as ReturnType<typeof vi.fn>;

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

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

vi.mock('@/components/JsonEditor', () => ({
  JsonEditor: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea value={value} onChange={(e) => onChange(e.target.value)} data-testid="json-editor" />
  ),
}));

describe('P0-3: ResponseRuleEditor matchRule 不丢数据', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listMock.mockResolvedValue([]);
  });

  it('连点两次"添加 query 匹配"应得到两行(旧行为会合并成一行)', async () => {
    render(<ResponseRuleEditor projectId="p1" endpointId="e1" />);

    await waitFor(() => expect(listMock).toHaveBeenCalled());

    // 打开创建对话框
    fireEvent.click(screen.getByText('+ 添加响应'));

    // 等对话框渲染出"+ 添加"按钮(query 区和 header 区各一个)
    const addButtons = await waitFor(() => screen.getAllByText('+ 添加'));
    expect(addButtons.length).toBeGreaterThanOrEqual(2);

    // 点第一次:query 区添加
    fireEvent.click(addButtons[0]);
    expect(screen.getAllByPlaceholderText('参数名').length).toBe(1);

    // 点第二次:query 区再添加 —— 关键断言
    fireEvent.click(addButtons[0]);
    expect(screen.getAllByPlaceholderText('参数名').length).toBe(2); // 旧行为这里会是 1
  });

  it('连点两次"添加 header 匹配"也应得到两行', async () => {
    render(<ResponseRuleEditor projectId="p1" endpointId="e1" />);

    await waitFor(() => expect(listMock).toHaveBeenCalled());
    fireEvent.click(screen.getByText('+ 添加响应'));

    const addButtons = screen.getAllByText('+ 添加');
    // header 区是第二个 + 添加
    fireEvent.click(addButtons[1]);
    fireEvent.click(addButtons[1]);

    expect(screen.getAllByPlaceholderText('Header 名').length).toBe(2);
  });

  it('重命名某行 key 后,该行 value 输入仍写入正确位置', async () => {
    render(<ResponseRuleEditor projectId="p1" endpointId="e1" />);

    await waitFor(() => expect(listMock).toHaveBeenCalled());
    fireEvent.click(screen.getByText('+ 添加响应'));

    const addButtons = screen.getAllByText('+ 添加');
    fireEvent.click(addButtons[0]); // 添加一行 query

    const nameInputs = screen.getAllByPlaceholderText('参数名');
    const valueInputs = screen.getAllByPlaceholderText('期望值');

    // 重命名 key:空 → 'userId'
    fireEvent.change(nameInputs[0], { target: { value: 'userId' } });
    expect(nameInputs[0]).toHaveValue('userId');

    // 输入 value,应写入同一行而非丢失
    fireEvent.change(valueInputs[0], { target: { value: '123' } });
    expect(valueInputs[0]).toHaveValue('123');
  });
});
