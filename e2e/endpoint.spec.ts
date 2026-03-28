import { test, expect } from '@playwright/test';

test.describe('Endpoint Management', () => {
  let projectId: string;
  let projectName: string;

  test.beforeEach(async ({ page }) => {
    // 使用唯一的项目名避免 slug 冲突
    projectName = `Endpoint Test ${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    
    // Create a test project
    const response = await page.request.post('/api/projects', {
      data: {
        name: projectName,
        description: 'Testing endpoints',
      },
    });
    const result = await response.json();
    expect(result.success).toBe(true);
    projectId = result.data.id;

    await page.goto(`/projects/${projectId}`);
  });

  test('should display endpoints list for a project', async ({ page }) => {
    await expect(page.locator('h1')).toContainText(projectName);
    // 检查端点列表标题（更精确的选择器）
    await expect(page.locator('h2:has-text("端点列表")')).toBeVisible();
  });

  test('should create a new endpoint', async ({ page }) => {
    // Click "添加端点" button (实际按钮文本)
    await page.click('a:has-text("添加端点")');

    // Should navigate to new endpoint page
    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/endpoints/new`));

    // 等待页面加载
    await page.waitForLoadState('networkidle');

    // 选择方法（使用按钮，不是 select）
    await page.click('button:has-text("GET")');

    // Fill in endpoint path
    const pathInput = page.locator('input[placeholder*="/api"]').first();
    await pathInput.fill('/users');
    
    // Fill in name
    const nameInput = page.locator('input[placeholder*="获取"], input[placeholder*="名称"]').first();
    await nameInput.fill('List Users');

    // Submit form
    await page.click('button[type="submit"]');

    // Should be redirected back to project page
    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}$`), { timeout: 10000 });
  });

  test('should edit an existing endpoint', async ({ page }) => {
    // Create an endpoint first
    const createResponse = await page.request.post(`/api/projects/${projectId}/endpoints`, {
      data: {
        path: '/products',
        method: 'GET',
        name: 'List Products',
      },
    });
    const createResult = await createResponse.json();
    expect(createResult.success).toBe(true);
    const endpointId = createResult.data.id;

    // 更新端点 via API
    const updateResponse = await page.request.put(`/api/projects/${projectId}/endpoints/${endpointId}`, {
      data: {
        name: 'Updated Product List',
        description: 'Updated description',
        delayMs: 500,
      },
    });
    const updateResult = await updateResponse.json();
    expect(updateResult.success).toBe(true);
    expect(updateResult.data.name).toBe('Updated Product List');
    expect(updateResult.data.delayMs).toBe(500);

    // 验证更新成功
    const getResponse = await page.request.get(`/api/projects/${projectId}/endpoints/${endpointId}`);
    const getResult = await getResponse.json();
    expect(getResult.success).toBe(true);
    expect(getResult.data.name).toBe('Updated Product List');
    expect(getResult.data.description).toBe('Updated description');
  });

  test('should delete an endpoint', async ({ page }) => {
    // Create an endpoint
    const createResponse = await page.request.post(`/api/projects/${projectId}/endpoints`, {
      data: {
        path: '/to-delete',
        method: 'DELETE',
        name: 'To Be Deleted',
      },
    });
    const endpointResult = await createResponse.json();
    expect(endpointResult.success).toBe(true);
    const endpointId = endpointResult.data.id;

    await page.goto(`/projects/${projectId}/endpoints/${endpointId}`);

    // Click delete button
    await page.click('button:has-text("删除"), button:has-text("Delete")');

    // Confirm deletion if there's a confirmation dialog
    const confirmBtn = page.locator('button:has-text("确认"), button:has-text("Confirm")');
    if (await confirmBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await confirmBtn.click();
    }

    // Wait for navigation or state change
    await page.waitForTimeout(1000);
  });

  test('should set endpoint delay', async ({ page }) => {
    // Create endpoint with delay
    await page.request.post(`/api/projects/${projectId}/endpoints`, {
      data: {
        path: '/slow',
        method: 'GET',
        delayMs: 2000,
      },
    });

    await page.goto(`/projects/${projectId}`);

    // Should see delay indicator (2s or 2000ms)
    await expect(page.locator('text=/2s|2000ms|延迟/')).toBeVisible({ timeout: 5000 });
  });

  test('should update endpoint basic fields', async ({ page }) => {
    // 创建端点
    const createResponse = await page.request.post(`/api/projects/${projectId}/endpoints`, {
      data: {
        path: '/api/test',
        method: 'GET',
        name: 'Test Endpoint',
        description: 'Original description',
        delayMs: 0,
      },
    });
    const createResult = await createResponse.json();
    expect(createResult.success).toBe(true);
    const endpointId = createResult.data.id;

    // 更新端点基本信息
    const updateResponse = await page.request.put(`/api/projects/${projectId}/endpoints/${endpointId}`, {
      data: {
        name: 'Updated Test Endpoint',
        description: 'Updated description',
        delayMs: 1000,
        isActive: true,
      },
    });

    const updateResult = await updateResponse.json();
    expect(updateResult.success).toBe(true);
    expect(updateResult.data.name).toBe('Updated Test Endpoint');
    expect(updateResult.data.description).toBe('Updated description');
    expect(updateResult.data.delayMs).toBe(1000);

    // 验证更新成功
    const getResponse = await page.request.get(`/api/projects/${projectId}/endpoints/${endpointId}`);
    const getResult = await getResponse.json();
    expect(getResult.success).toBe(true);
    expect(getResult.data.name).toBe('Updated Test Endpoint');
    expect(getResult.data.delayMs).toBe(1000);
  });

  test('should update endpoint response configuration', async ({ page }) => {
    // 创建端点
    const createResponse = await page.request.post(`/api/projects/${projectId}/endpoints`, {
      data: {
        path: '/api/config-test',
        method: 'GET',
        name: 'Config Test Endpoint',
        statusCode: 200,
        contentType: 'application/json',
        responseBody: { initial: true },
      },
    });
    const createResult = await createResponse.json();
    expect(createResult.success).toBe(true);
    const endpointId = createResult.data.id;

    // 验证创建时的默认值
    expect(createResult.data.statusCode).toBe(200);
    expect(createResult.data.contentType).toBe('application/json');
    expect(createResult.data.responseBody).toEqual({ initial: true });

    // 更新端点响应配置
    const updateResponse = await page.request.put(`/api/projects/${projectId}/endpoints/${endpointId}`, {
      data: {
        name: 'Updated Config Endpoint',
        statusCode: 201,
        contentType: 'application/json',
        responseBody: { test: true, message: 'Success' },
      },
    });

    const updateResult = await updateResponse.json();
    expect(updateResult.success).toBe(true);
    expect(updateResult.data.statusCode).toBe(201);
    expect(updateResult.data.contentType).toBe('application/json');
    expect(updateResult.data.responseBody).toEqual({ test: true, message: 'Success' });

    // 验证更新成功
    const getResponse = await page.request.get(`/api/projects/${projectId}/endpoints/${endpointId}`);
    const getResult = await getResponse.json();
    expect(getResult.success).toBe(true);
    expect(getResult.data.statusCode).toBe(201);
    expect(getResult.data.contentType).toBe('application/json');
    expect(getResult.data.responseBody).toEqual({ test: true, message: 'Success' });
  });

  test('should use endpoint response config in mock service', async ({ page }) => {
    // 创建项目并获取 slug
    const projectResponse = await page.request.get(`/api/projects/${projectId}`);
    const projectResult = await projectResponse.json();
    const projectSlug = projectResult.data.slug;

    // 创建端点并配置响应
    const createResponse = await page.request.post(`/api/projects/${projectId}/endpoints`, {
      data: {
        path: '/api/mock-test',
        method: 'GET',
        name: 'Mock Test Endpoint',
        statusCode: 201,
        contentType: 'application/json',
        responseBody: { mock: 'data', status: 'created' },
      },
    });
    const createResult = await createResponse.json();
    expect(createResult.success).toBe(true);

    // 调用 Mock 服务验证响应
    const mockResponse = await page.request.get(`/${projectSlug}/api/mock-test`);
    expect(mockResponse.status()).toBe(201);

    const mockData = await mockResponse.json();
    expect(mockData).toEqual({ mock: 'data', status: 'created' });
  });

  test('should handle text content type in endpoint response', async ({ page }) => {
    // 创建项目并获取 slug
    const projectResponse = await page.request.get(`/api/projects/${projectId}`);
    const projectResult = await projectResponse.json();
    const projectSlug = projectResult.data.slug;

    // 创建端点配置文本响应
    const createResponse = await page.request.post(`/api/projects/${projectId}/endpoints`, {
      data: {
        path: '/api/text',
        method: 'GET',
        name: 'Text Response Endpoint',
        statusCode: 200,
        contentType: 'text/plain',
        responseBody: 'Plain text response',
      },
    });
    const createResult = await createResponse.json();
    expect(createResult.success).toBe(true);

    // 调用 Mock 服务验证文本响应
    const mockResponse = await page.request.get(`/${projectSlug}/api/text`);
    expect(mockResponse.status()).toBe(200);
    expect(mockResponse.headers()['content-type']).toContain('text/plain');

    const mockText = await mockResponse.text();
    expect(mockText).toBe('Plain text response');
  });
});
