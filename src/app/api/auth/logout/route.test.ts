/**
 * 登出路由测试 POST /api/auth/logout
 *
 * 验证：删除 cookie + 返 200。mock next/headers.cookies 断言 delete 调用。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { cookieStore } = vi.hoisted(() => ({
  cookieStore: {
    set: vi.fn(),
    delete: vi.fn(),
    get: vi.fn(),
  },
}));
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => cookieStore),
}));

import { POST } from './route';
import { COOKIE_NAME } from '@/lib/auth';

beforeEach(() => {
  cookieStore.set.mockClear();
  cookieStore.delete.mockClear();
});

describe('logout', () => {
  it('返 200 success', async () => {
    const res = await POST();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.ok).toBe(true);
  });
  it('删除 apimock_auth cookie', async () => {
    await POST();
    expect(cookieStore.delete).toHaveBeenCalledTimes(1);
    expect(cookieStore.delete).toHaveBeenCalledWith(COOKIE_NAME);
  });
});
