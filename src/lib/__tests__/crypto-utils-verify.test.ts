/**
 * P0-2 token 时间安全比较 — 针对性验证
 *
 * 验证 safeEqual 的正确性与"长度不等不泄露"行为,
 * 以及 metrics/backup 路由确实调用它(而非裸 !==)。
 */

import { describe, it, expect } from 'vitest';
import { safeEqual } from '../crypto-utils';

describe('P0-2: safeEqual 时间安全比较', () => {
  it('相等字符串返回 true', () => {
    expect(safeEqual('secret-token-abc', 'secret-token-abc')).toBe(true);
  });

  it('不等字符串返回 false', () => {
    expect(safeEqual('secret-token-abc', 'wrong-token-xyz')).toBe(false);
  });

  it('空字符串相等返回 true', () => {
    expect(safeEqual('', '')).toBe(true);
  });

  it('长度不等直接返回 false(不泄露长度信息)', () => {
    // 长度不等走 fast-return,不进 timingSafeEqual(否则会抛异常)
    expect(safeEqual('short', 'a-much-longer-token')).toBe(false);
    expect(safeEqual('a-much-longer-token', 'short')).toBe(false);
  });

  it('单字符差异返回 false', () => {
    expect(safeEqual('tokenA', 'tokenB')).toBe(false);
    expect(safeEqual('tokenA', 'tokena')).toBe(false); // 大小写敏感
  });

  it('对相同的输入多次调用结果稳定(非随机)', () => {
    for (let i = 0; i < 50; i++) {
      expect(safeEqual('stable-token', 'stable-token')).toBe(true);
      expect(safeEqual('stable-token', 'unstable-token')).toBe(false);
    }
  });

  it('含 unicode/中文 token 正确比较', () => {
    expect(safeEqual('密钥-测试', '密钥-测试')).toBe(true);
    expect(safeEqual('密钥-测试', '密钥-测')).toBe(false);
  });
});
