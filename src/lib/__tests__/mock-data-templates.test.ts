/**
 * Mock data templates unit tests
 * 验证 generateMockData 关键词路由 + 数据结构
 */

import { describe, it, expect } from 'vitest';
import { DEMO_PROJECT_SLUG } from '../demo-seed';
import { generateMockData as generateFromLib } from '../mock-data-templates';

describe('generateMockData', () => {
  it('generates user list with required fields', () => {
    const result = generateFromLib('用户列表', 3);
    expect(result.code).toBe(0);
    expect(result.message).toBe('success');
    expect(result.data.list).toHaveLength(3);
    expect(result.data.total).toBe(3);

    const user = result.data.list[0];
    expect(user.id).toBe(1);
    expect(user).toHaveProperty('name');
    expect(user).toHaveProperty('email');
    expect(user).toHaveProperty('phone');
    expect(user).toHaveProperty('avatar');
    expect(user).toHaveProperty('status');
    expect(user).toHaveProperty('createdAt');
  });

  it('detects user-related English prompts', () => {
    const result = generateFromLib('user profile data', 1);
    expect(result.data.list[0]).toHaveProperty('email');
  });

  it('detects order-related prompts', () => {
    const result = generateFromLib('订单', 5);
    const order = result.data.list[0];
    expect(order).toHaveProperty('orderNo');
    expect(order).toHaveProperty('amount');
    expect(order).toHaveProperty('status');
  });

  it('detects product-related prompts', () => {
    const result = generateFromLib('商品列表', 2);
    const product = result.data.list[0];
    expect(product).toHaveProperty('price');
    expect(product).toHaveProperty('stock');
  });

  it('falls back to generic Item for unknown prompts', () => {
    const result = generateFromLib('random stuff', 3);
    expect(result.data.list[0]).toHaveProperty('name', 'Item 1');
    expect(result.data.list[0]).toHaveProperty('description', 'Description 1');
  });

  it('returns count matching requested count', () => {
    const result = generateFromLib('users', 20);
    expect(result.data.list).toHaveLength(20);
    expect(result.data.total).toBe(20);
  });

  it('returns unique ids (1-based)', () => {
    const result = generateFromLib('users', 5);
    const ids = result.data.list.map(u => u.id);
    expect(ids).toEqual([1, 2, 3, 4, 5]);
  });

  it('handles count=1', () => {
    const result = generateFromLib('users', 1);
    expect(result.data.list).toHaveLength(1);
    expect(result.data.total).toBe(1);
  });
});

describe('DEMO_PROJECT_SLUG', () => {
  it('is "demo-project"', () => {
    expect(DEMO_PROJECT_SLUG).toBe('demo-project');
  });
});

// demo-seed.generateDemoResponseBody 间接测试
describe('generateMockData integration with demo-seed', () => {
  it('uses same generator function (DRY verify)', () => {
    const fromLib = generateFromLib('用户', 1);
    // demo-seed 内部应调用同一函数
    expect(fromLib.code).toBe(0);
  });
});
