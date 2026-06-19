import { test, expect } from '@playwright/test';

test.describe('AI Providers API', () => {
  let createdProviderId: string | undefined;

  test.afterEach(async ({ page }) => {
    // 清理：删除测试创建的 provider
    if (createdProviderId) {
      await page.request.delete(`/api/ai/providers/${createdProviderId}?confirmed=true`);
      createdProviderId = undefined;
    }
  });

  // ============================================
  // POST /api/ai/providers - 创建 Provider
  // ============================================
  test('should create a new provider', async ({ page }) => {
    const response = await page.request.post('/api/ai/providers', {
      data: {
        name: 'Test Provider',
        provider: 'openai-compatible',
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'sk-test-key-123',
        models: ['model-a', 'model-b'],
        defaultModel: 'model-a',
      },
    });

    expect(response.status()).toBe(201);
    const result = await response.json();
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data.name).toBe('Test Provider');
    expect(result.data.provider).toBe('openai-compatible');
    expect(result.data.baseUrl).toBe('https://api.example.com/v1');
    expect(result.data.models).toEqual(['model-a', 'model-b']);
    expect(result.data.defaultModel).toBe('model-a');
    expect(result.data.isActive).toBe(true);
    // 不应返回 apiKey
    expect(result.data.apiKey).toBeUndefined();

    createdProviderId = result.data.id;
  });

  test('should auto-assign isDefault when creating provider via POST', async ({ page }) => {
    // 测试 isDefault 字段：指定 isDefault=true 时应正确设置
    const response = await page.request.post('/api/ai/providers', {
      data: {
        name: 'Default Candidate',
        provider: 'openai',
        apiKey: 'sk-default-test',
        models: ['gpt-4o-mini'],
        defaultModel: 'gpt-4o-mini',
        isDefault: true,
      },
    });

    expect(response.status()).toBe(201);
    const result = await response.json();
    // 无论是否为第一个，isDefault=true 应被尊重
    expect(result.data.isDefault).toBe(true);

    createdProviderId = result.data.id;
  });

  test('should reject creation with invalid data', async ({ page }) => {
    // 缺少必填字段
    const response = await page.request.post('/api/ai/providers', {
      data: {
        name: '',
        provider: 'invalid-type',
        apiKey: '',
        models: [],
        defaultModel: '',
      },
    });

    expect(response.status()).toBe(400);
    const result = await response.json();
    expect(result.success).toBe(false);
  });

  test('should reject defaultModel not in models list', async ({ page }) => {
    const response = await page.request.post('/api/ai/providers', {
      data: {
        name: 'Bad Model Config',
        provider: 'openai',
        apiKey: 'sk-test',
        models: ['gpt-4o-mini'],
        defaultModel: 'gpt-4o', // 不在 models 列表中
      },
    });

    expect(response.status()).toBe(400);
    const result = await response.json();
    expect(result.success).toBe(false);
  });

  // ============================================
  // GET /api/ai/providers - 列表查询
  // ============================================
  test('should list providers without apiKey', async ({ page }) => {
    // 先创建一个
    const createRes = await page.request.post('/api/ai/providers', {
      data: {
        name: 'List Test Provider',
        provider: 'openai-compatible',
        apiKey: 'sk-secret-key-999',
        models: ['test-model'],
        defaultModel: 'test-model',
      },
    });
    const created = await createRes.json();
    createdProviderId = created.data.id;

    // 获取列表
    const response = await page.request.get('/api/ai/providers');
    expect(response.status()).toBe(200);

    const result = await response.json();
    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeGreaterThanOrEqual(1);

    // 确认列表中不包含 apiKey
    for (const p of result.data) {
      expect(p.apiKey).toBeUndefined();
    }

    // 找到我们创建的
    const found = (result.data as Array<{ id: string; name: string }>).find((p) => p.id === createdProviderId);
    expect(found).toBeDefined();
    expect(found?.name).toBe('List Test Provider');
  });

  // ============================================
  // PATCH /api/ai/providers/[id] - 更新 Provider
  // ============================================
  test('should update provider name and models', async ({ page }) => {
    // 创建
    const createRes = await page.request.post('/api/ai/providers', {
      data: {
        name: 'Before Update',
        provider: 'openai',
        apiKey: 'sk-test',
        models: ['gpt-4o-mini'],
        defaultModel: 'gpt-4o-mini',
      },
    });
    const created = await createRes.json();
    createdProviderId = created.data.id;

    // 更新
    const response = await page.request.patch(`/api/ai/providers/${createdProviderId}`, {
      data: {
        name: 'After Update',
        models: ['gpt-4o-mini', 'gpt-4o'],
        defaultModel: 'gpt-4o',
      },
    });

    expect(response.status()).toBe(200);
    const result = await response.json();
    expect(result.success).toBe(true);
    expect(result.data.name).toBe('After Update');
    expect(result.data.models).toEqual(['gpt-4o-mini', 'gpt-4o']);
    expect(result.data.defaultModel).toBe('gpt-4o');
  });

  test('should update provider isActive status', async ({ page }) => {
    const createRes = await page.request.post('/api/ai/providers', {
      data: {
        name: 'Toggle Active',
        provider: 'openai',
        apiKey: 'sk-test',
        models: ['gpt-4o-mini'],
        defaultModel: 'gpt-4o-mini',
      },
    });
    const created = await createRes.json();
    createdProviderId = created.data.id;

    // 禁用
    const response = await page.request.patch(`/api/ai/providers/${createdProviderId}`, {
      data: { isActive: false },
    });

    expect(response.status()).toBe(200);
    const result = await response.json();
    expect(result.data.isActive).toBe(false);
  });

  test('should return 404 for updating non-existent provider', async ({ page }) => {
    const response = await page.request.patch('/api/ai/providers/non-existent-id', {
      data: { name: 'New Name' },
    });

    expect(response.status()).toBe(404);
  });

  // ============================================
  // DELETE /api/ai/providers/[id] - 删除 Provider
  // ============================================
  test('should delete provider with confirmation', async ({ page }) => {
    const createRes = await page.request.post('/api/ai/providers', {
      data: {
        name: 'To Delete',
        provider: 'openai',
        apiKey: 'sk-test',
        models: ['gpt-4o-mini'],
        defaultModel: 'gpt-4o-mini',
      },
    });
    const created = await createRes.json();
    const providerId = created.data.id;

    // 未确认删除 - 应返回需要确认
    const noConfirmRes = await page.request.delete(`/api/ai/providers/${providerId}`);
    expect(noConfirmRes.status()).toBe(200);
    const noConfirmResult = await noConfirmRes.json();
    // API 可能直接删除或要求确认，兼容两种情况
    if (noConfirmResult.data?.requiresConfirmation) {
      // 确认删除
      const response = await page.request.delete(`/api/ai/providers/${providerId}?confirmed=true`);
      expect(response.status()).toBe(200);
      const result = await response.json();
      expect(result.success).toBe(true);
      expect(result.data.deleted).toBe(true);
    } else {
      // 已直接删除
      expect(noConfirmResult.success).toBe(true);
    }

    // 验证已删除
    const listRes = await page.request.get('/api/ai/providers');
    const list = await listRes.json();
    const found = (list.data as Array<{ id: string }>).find((p) => p.id === providerId);
    expect(found).toBeUndefined();

    // 标记为已清理，afterEach 不再重复删除
    createdProviderId = undefined;
  });

  test('should return 404 for deleting non-existent provider', async ({ page }) => {
    const response = await page.request.delete('/api/ai/providers/non-existent-id?confirmed=true');
    expect(response.status()).toBe(404);
  });

  // ============================================
  // POST /api/ai/providers/[id]/default - 设为默认
  // ============================================
  test('should set provider as default', async ({ page }) => {
    // 创建两个 provider
    const res1 = await page.request.post('/api/ai/providers', {
      data: {
        name: 'Provider A',
        provider: 'openai',
        apiKey: 'sk-test-a',
        models: ['gpt-4o-mini'],
        defaultModel: 'gpt-4o-mini',
        isDefault: true,
      },
    });
    const p1 = await res1.json();
    const providerAId = p1.data.id;

    const res2 = await page.request.post('/api/ai/providers', {
      data: {
        name: 'Provider B',
        provider: 'openai-compatible',
        apiKey: 'sk-test-b',
        models: ['custom-model'],
        defaultModel: 'custom-model',
      },
    });
    const p2 = await res2.json();
    createdProviderId = p2.data.id;

    // 设置 Provider B 为默认
    const response = await page.request.post(`/api/ai/providers/${createdProviderId}/default`);
    expect(response.status()).toBe(200);
    const result = await response.json();
    expect(result.success).toBe(true);
    expect(result.data.isDefault).toBe(true);

    // 验证列表中只有一个默认
    const listRes = await page.request.get('/api/ai/providers');
    const list = await listRes.json();
    const defaults = (list.data as Array<{ isDefault: number; id: string }>).filter((p) => p.isDefault);
    expect(defaults.length).toBe(1);
    expect(defaults[0].id).toBe(createdProviderId);

    // 清理 Provider A
    await page.request.delete(`/api/ai/providers/${providerAId}?confirmed=true`);
  });

  test('should return 404 for setting non-existent provider as default', async ({ page }) => {
    const response = await page.request.post('/api/ai/providers/non-existent-id/default');
    expect(response.status()).toBe(404);
  });
});

test.describe('AI Settings Page UI', () => {
  test('should render settings page with provider list', async ({ page }) => {
    await page.goto('/settings/ai');

    // 页面标题
    await expect(page.locator('h1')).toContainText('模型配置');

    // 添加按钮
    await expect(page.getByRole('button', { name: /添加|新增|Add/i })).toBeVisible();
  });

  test('should navigate to settings from homepage', async ({ page }) => {
    await page.goto('/');
    await page.click('a[href="/settings/ai"]');
    await expect(page).toHaveURL(/\/settings\/ai/);
    await expect(page.locator('h1')).toContainText('模型配置');
  });

  test('should show add provider dialog', async ({ page }) => {
    await page.goto('/settings/ai');

    // 等待页面加载完成
    await page.locator('h1').waitFor();

    // 点击添加按钮（兼容不同文案）
    const addBtn = page.getByRole('button', { name: /添加|新增|Add/i });
    await addBtn.click();

    // 弹窗出现 - 检查表单出现
    await expect(page.locator('input').first()).toBeVisible({ timeout: 10000 });
  });
});
