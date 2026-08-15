/**
 * ImportOpenAPI 组件测试(C2 + 207 部分失败展示)
 *
 * mock fetch 三态:
 * - 201 全部成功 → onSuccess + 关窗
 * - 207 部分成功 → 不关窗,进部分完成面板(摘要/逐项错误/parseErrors 折叠/完成按钮)
 * - 500 全部失败 → 红条展示错误,不关窗
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ImportOpenAPI } from '@/components/ImportOpenAPI';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const PARSE_OK = () =>
  jsonResponse(200, {
    success: true,
    data: {
      endpoints: [{ path: '/users', method: 'get', summary: 'List users' }],
      total: 1,
      parseErrors: [],
    },
  });

/** import 响应由用例注入;parse 固定成功 */
function stubFetch(importResponder: () => Response) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/import/parse')) return PARSE_OK();
    if (url.endsWith('/import')) return importResponder();
    throw new Error(`unexpected fetch: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

/** 选文件 → 解析 → 点导入,进入导入响应分支 */
async function goToImport(onClose = vi.fn(), onSuccess = vi.fn()) {
  const utils = render(
    <ImportOpenAPI projectId="p1" isOpen onClose={onClose} onSuccess={onSuccess} />
  );

  const input = utils.container.querySelector<HTMLInputElement>('#file-upload');
  expect(input).not.toBeNull();
  fireEvent.change(input!, {
    target: { files: [new File(['{"openapi":"3.0.0"}'], 'spec.json', { type: 'application/json' })] },
  });

  fireEvent.click(screen.getByText('解析文件'));
  await screen.findByText('共 1 个端点');

  fireEvent.click(screen.getByText('导入 1 个端点'));
  return { onClose, onSuccess };
}

describe('ImportOpenAPI — 导入结果三态', () => {
  it('201 全部成功:onSuccess + 关窗,不展示部分完成面板', async () => {
    stubFetch(() =>
      jsonResponse(201, {
        success: true,
        data: { total: 1, created: 1, skipped: 0, errors: [], parseErrors: [] },
      })
    );

    const { onClose, onSuccess } = await goToImport();

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('import-partial-panel')).not.toBeInTheDocument();
  });

  it('207 部分成功:不关窗,展示摘要 + 逐项错误 + parseErrors 折叠,点完成才关窗', async () => {
    stubFetch(() =>
      jsonResponse(207, {
        success: false,
        data: {
          total: 5,
          created: 3,
          skipped: 1,
          errors: [{ error: 'Batch insert failed (endpoints 0–4): too many SQL variables' }],
          parseErrors: ['warning: missing info block'],
        },
        error: { code: 'PARTIAL_FAILURE', message: 'Partial success: some items failed' },
      })
    );

    const { onClose, onSuccess } = await goToImport();

    // 已落库的部分要刷新列表,但不关窗
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(onClose).not.toHaveBeenCalled();

    // 面板:摘要
    const panel = await screen.findByTestId('import-partial-panel');
    expect(panel).toHaveTextContent('共 5 个端点');
    expect(panel).toHaveTextContent('成功 3 个');
    expect(panel).toHaveTextContent('失败 1 个');
    // 逐项错误
    expect(panel).toHaveTextContent('too many SQL variables');
    // parseErrors 折叠
    expect(panel).toHaveTextContent('解析警告（1 条）');

    // 点完成 → 关窗
    fireEvent.click(screen.getByText('完成'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('500 全部失败:红条展示错误,不关窗,不进面板', async () => {
    stubFetch(() =>
      jsonResponse(500, {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Import failed: no endpoints created' },
      })
    );

    const { onClose, onSuccess } = await goToImport();

    await screen.findByText('Import failed: no endpoints created');
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByTestId('import-partial-panel')).not.toBeInTheDocument();
  });
});
