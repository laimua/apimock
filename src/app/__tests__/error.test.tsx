/**
 * error.tsx 错误信息展示测试(UX-2)。
 *
 * 验证:生产环境只显示 error.digest(不泄漏内部 message);
 * 非生产环境显示完整 error.message 方便调试。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import ErrorBoundary from '../error';

function makeError(): Error & { digest?: string } {
  const err = new Error('boom: db connection failed at 10.0.0.1') as Error & { digest?: string };
  err.digest = 'DIGEST-abc123';
  return err;
}

describe('error.tsx 生产/非生产错误展示 (UX-2)', () => {
  beforeEach(() => {
    // 组件 useEffect 里会 console.error 上报,测试里静音
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('生产环境:显示 digest,不显示 message', () => {
    vi.stubEnv('NODE_ENV', 'production');
    render(<ErrorBoundary error={makeError()} reset={() => {}} />);

    expect(screen.getByText(/DIGEST-abc123/)).toBeInTheDocument();
    expect(screen.queryByText(/boom: db connection failed/)).not.toBeInTheDocument();
  });

  it('非生产环境:显示完整 message', () => {
    vi.stubEnv('NODE_ENV', 'development');
    render(<ErrorBoundary error={makeError()} reset={() => {}} />);

    expect(screen.getByText(/boom: db connection failed/)).toBeInTheDocument();
    expect(screen.queryByText(/DIGEST-abc123/)).not.toBeInTheDocument();
  });

  it('生产环境且无 digest:不渲染错误细节段落', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const err = new Error('boom') as Error & { digest?: string };
    render(<ErrorBoundary error={err} reset={() => {}} />);

    expect(screen.queryByText(/boom/)).not.toBeInTheDocument();
    expect(screen.getByText('页面出错了')).toBeInTheDocument();
  });
});
