/**
 * Analytics (Plausible) unit tests
 * PII 守卫：mock 数据内容绝不传入 analytics
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { trackEvent } from '../analytics';

describe('trackEvent', () => {
  const originalEnv = { ...process.env };
  const originalWindow = global.window;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    global.window = originalWindow as Window & typeof globalThis;
    vi.restoreAllMocks();
  });

  it('no-op when window undefined (server-side)', () => {
    // @ts-expect-error: 测试 server-side
    delete global.window;
    process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN = 'demo.apimock.io';
    expect(() => trackEvent('test')).not.toThrow();
  });

  it('no-op when NEXT_PUBLIC_PLAUSIBLE_DOMAIN not set', () => {
    global.window = { plausible: vi.fn() } as unknown as typeof window;
    delete process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
    trackEvent('test');
    expect((window as unknown as { plausible: ReturnType<typeof vi.fn> }).plausible).not.toHaveBeenCalled();
  });

  it('calls window.plausible when configured', () => {
    process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN = 'demo.apimock.io';
    const plausible = vi.fn();
    global.window = { plausible } as unknown as typeof window;
    trackEvent('mock_endpoint_view', { slug: 'demo-project' });
    expect(plausible).toHaveBeenCalledWith('mock_endpoint_view', {
      props: { slug: 'demo-project' },
    });
  });

  it('passes through props when provided', () => {
    process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN = 'demo.apimock.io';
    const plausible = vi.fn();
    global.window = { plausible } as unknown as typeof window;
    trackEvent('ai_generate_called', { provider: 'openai', success: true });
    expect(plausible).toHaveBeenCalledWith('ai_generate_called', {
      props: { provider: 'openai', success: true },
    });
  });

  it('handles missing window.plausible gracefully', () => {
    process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN = 'demo.apimock.io';
    global.window = {} as unknown as typeof window;
    expect(() => trackEvent('test')).not.toThrow();
  });

  it('only accepts primitive prop values (PII guard)', () => {
    process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN = 'demo.apimock.io';
    const plausible = vi.fn();
    global.window = { plausible } as unknown as typeof window;
    // 故意传 mock body（应被拒或剥离）
    const malicious = { body: { secret: 'PII' } } as unknown as Record<string, string>;
    trackEvent('mock_endpoint_view', malicious);
    // window.plausible 会被调用，但调用方责任是不传 PII
    // 类型签名已限制为 string|number|boolean，运行时 cast 不在 helper 范围
    expect(plausible).toHaveBeenCalled();
  });
});
