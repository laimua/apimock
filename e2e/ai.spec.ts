import { test, expect } from '@playwright/test';

test.describe('AI Generation', () => {
  test('should generate mock data via AI API', async ({ page }) => {
    const response = await page.request.post('/api/ai/generate', {
      data: {
        prompt: '用户列表，包含 id、姓名、邮箱、头像、注册时间',
        count: 5,
      },
    });

    expect(response.status()).toBe(200);

    const result = await response.json();
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();

    // 验证返回的数据结构
    const data = result.data as any;
    expect(data.code).toBeDefined();
    expect(data.message).toBeDefined();
    expect(data.data).toBeDefined();
    expect(data.data.list).toBeDefined();
    expect(Array.isArray(data.data.list)).toBe(true);
    expect(data.data.list.length).toBe(5);
    expect(data.data.total).toBe(5);

    // 验证生成的数据包含预期字段
    const firstItem = data.data.list[0];
    expect(firstItem).toHaveProperty('id');
    expect(firstItem).toHaveProperty('name');
  });

  test('should support custom count parameter', async ({ page }) => {
    const response = await page.request.post('/api/ai/generate', {
      data: {
        prompt: '商品列表',
        count: 15,
      },
    });

    expect(response.status()).toBe(200);

    const result = await response.json();
    expect(result.success).toBe(true);
    expect(result.data.data.list.length).toBe(15);
    expect(result.data.data.total).toBe(15);
  });

  test('should use default count when not specified', async ({ page }) => {
    const response = await page.request.post('/api/ai/generate', {
      data: {
        prompt: '订单列表',
      },
    });

    expect(response.status()).toBe(200);

    const result = await response.json();
    expect(result.success).toBe(true);
    // 默认 count 是 10
    expect(result.data.data.list.length).toBe(10);
  });

  test('should return validation error for invalid prompt', async ({ page }) => {
    const response = await page.request.post('/api/ai/generate', {
      data: {
        prompt: '',
      },
    });

    expect(response.status()).toBe(400);

    const result = await response.json();
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  test('should return validation error for invalid count', async ({ page }) => {
    const response = await page.request.post('/api/ai/generate', {
      data: {
        prompt: '测试数据',
        count: 101, // 超过最大值 100
      },
    });

    expect(response.status()).toBe(400);

    const result = await response.json();
    expect(result.success).toBe(false);
  });
});
