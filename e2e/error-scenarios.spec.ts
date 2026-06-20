import { test, expect } from '@playwright/test';

test.describe('Error Scenarios', () => {
  let projectId: string;
  let endpointId: string;

  test.beforeAll(async ({ request }) => {
    // 创建测试项目和端点
    const projectResponse = await request.post('/api/projects', {
      data: {
        name: `Error Scenarios Test ${Date.now()}`,
        description: 'Testing error scenario configurations',
      },
    });
    const projectResult = await projectResponse.json();
    expect(projectResult.success).toBe(true);
    projectId = projectResult.data.id;

    const endpointResponse = await request.post(`/api/projects/${projectId}/endpoints`, {
      data: {
        path: '/api/test',
        method: 'GET',
        name: 'Test Endpoint',
        statusCode: 200,
        contentType: 'application/json',
        responseBody: { success: true, data: 'test' },
      },
    });
    const endpointResult = await endpointResponse.json();
    expect(endpointResult.success).toBe(true);
    endpointId = endpointResult.data.id;
  });

  test.afterAll(async ({ request }) => {
    try {
      await request.delete(`/api/projects/${projectId}`);
    } catch {
      // 忽略删除错误
    }
  });

  test.describe('Quick Error Scenarios Buttons', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`/projects/${projectId}/endpoints/${endpointId}`);
      await page.waitForLoadState('networkidle');
    });

    test('should apply 500 Internal Server Error scenario', async ({ page }) => {
      await page.locator('[data-testid=quick-scenario-quick-500]').click();

      // 验证状态码 select 值为 500
      await expect(page.locator('[data-testid=status-code-select]')).toHaveValue('500');

      // 保存更改
      await page.locator('button[type="submit"]').click();

      // 等待保存成功提示
      await expect(page.getByText(/保存成功/).first()).toBeVisible({ timeout: 5000 });

      // 验证保存的数据
      const getResponse = await page.request.get(`/api/projects/${projectId}/endpoints/${endpointId}`);
      const getResult = await getResponse.json();
      expect(getResult.data.statusCode).toBe(500);
      expect(getResult.data.responseBody).toMatchObject({
        success: false,
        error: expect.objectContaining({
          code: 'INTERNAL_SERVER_ERROR',
        }),
      });
    });

    test('should apply 404 Not Found scenario', async ({ page }) => {
      await page.locator('[data-testid=quick-scenario-quick-404]').click();
      await expect(page.locator('[data-testid=status-code-select]')).toHaveValue('404');
      await page.locator('button[type="submit"]').click();
      await expect(page.getByText(/保存成功/).first()).toBeVisible({ timeout: 5000 });
      const getResponse = await page.request.get(`/api/projects/${projectId}/endpoints/${endpointId}`);
      const getResult = await getResponse.json();
      expect(getResult.data.statusCode).toBe(404);
    });

    test('should apply 401 Unauthorized scenario', async ({ page }) => {
      await page.locator('[data-testid=quick-scenario-quick-401]').click();
      await expect(page.locator('[data-testid=status-code-select]')).toHaveValue('401');
      await page.locator('button[type="submit"]').click();
      await expect(page.getByText(/保存成功/).first()).toBeVisible({ timeout: 5000 });
      const getResponse = await page.request.get(`/api/projects/${projectId}/endpoints/${endpointId}`);
      const getResult = await getResponse.json();
      expect(getResult.data.statusCode).toBe(401);
    });

    test('should apply 403 Forbidden scenario', async ({ page }) => {
      await page.locator('[data-testid=quick-scenario-quick-403]').click();
      await expect(page.locator('[data-testid=status-code-select]')).toHaveValue('403');
      await page.locator('button[type="submit"]').click();
      await expect(page.getByText(/保存成功/).first()).toBeVisible({ timeout: 5000 });
      const getResponse = await page.request.get(`/api/projects/${projectId}/endpoints/${endpointId}`);
      const getResult = await getResponse.json();
      expect(getResult.data.statusCode).toBe(403);
    });

    test('should apply timeout scenario with delay', async ({ page }) => {
      await page.locator('[data-testid=quick-scenario-quick-timeout]').click();
      // 验证延迟值（input number，需等表单更新）
      await page.waitForTimeout(300);
      const delayInput = page.locator('input[type="number"]').first();
      await expect(delayInput).toHaveValue(/5000|5/);

      // 验证延迟值已设置（timeout 场景主要改 delay，不强制 responseBody 内容）
      await expect(delayInput).toHaveValue(/5000|5/);

      // 保存并验证
      await page.locator('button[type="submit"]').click();
      await expect(page.getByText(/保存成功/).first()).toBeVisible({ timeout: 5000 });

      const getResponse = await page.request.get(`/api/projects/${projectId}/endpoints/${endpointId}`);
      const getResult = await getResponse.json();
      expect(getResult.data.delayMs).toBe(5000);
    });

    test('should show active state for selected error scenario', async ({ page }) => {
      const btn500 = page.locator('[data-testid=quick-scenario-quick-500]');
      const btn404 = page.locator('[data-testid=quick-scenario-quick-404]');

      await btn500.click();
      // 选中态：border-red-500（非 hover 变体）
      await expect(btn500).toHaveClass(/(^|\s)border-red-500(\s|$)/);
      await expect(btn404).not.toHaveClass(/(^|\s)border-red-500(\s|$)/);
    });
  });

  test.describe('ErrorScenariosSelector Component', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`/projects/${projectId}/endpoints/${endpointId}`);
      await page.waitForLoadState('networkidle');
    });

    test('should display error scenario categories', async ({ page }) => {
      // 用 data-testid 验证分类按钮存在
      await expect(page.locator('[data-testid^=scenario-category-]')).toHaveCount(4);
    });

    test('should show scenarios after selecting category', async ({ page }) => {
      // 点击服务器错误分类
      await page.locator('[data-testid=scenario-category-server]').click();
      await page.waitForTimeout(300);

      // 验证显示具体场景按钮（至少一个）
      await expect(page.locator('[data-testid^=scenario-button-]').first()).toBeVisible({ timeout: 3000 });
    });

    test('should show preview dialog when clicking scenario', async ({ page }) => {
      await page.locator('[data-testid=scenario-category-server]').click();
      await page.waitForTimeout(300);

      // 点击第一个场景按钮（打开预览）
      await page.locator('[data-testid^=scenario-button-]').first().click();

      // 验证预览对话框显示
      await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 3000 });
    });

    test('should apply scenario from preview dialog', async ({ page }) => {
      await page.locator('[data-testid=scenario-category-server]').click();
      await page.waitForTimeout(300);

      // 点击 server-503 场景按钮打开预览
      await page.locator('[data-testid^=scenario-button-]').nth(2).click();
      await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 3000 });

      // 点击应用按钮
      await page.getByRole('button', { name: /应用场景|应用/ }).click();

      // 等待对话框关闭
      await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 3000 });

      // 验证表单更新（status code select）
      const statusCode = await page.locator('[data-testid=status-code-select]').inputValue();
      expect(Number(statusCode)).toBeGreaterThanOrEqual(500);

      // 验证成功提示
      await expect(page.getByText(/已应用错误场景|应用成功/).first()).toBeVisible({ timeout: 3000 });
    });

    test('should cancel scenario from preview dialog', async ({ page }) => {
      const initialStatusCode = await page.locator('[data-testid=status-code-select]').inputValue();

      await page.locator('[data-testid=scenario-category-server]').click();
      await page.waitForTimeout(300);

      // 点击第一个场景按钮打开预览
      await page.locator('[data-testid^=scenario-button-]').first().click();
      await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 3000 });

      // 点击取消按钮（对话框内的）
      await page.locator('[data-testid=error-scenario-preview-dialog]').getByRole('button', { name: '取消' }).click();

      // 等待对话框关闭
      await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 3000 });

      // 验证表单没有更改
      const currentStatusCode = await page.locator('[data-testid=status-code-select]').inputValue();
      expect(currentStatusCode).toBe(initialStatusCode);
    });

    test('should reset scenario selection', async ({ page }) => {
      // 点击服务器错误分类
      const serverCategoryButton = page.locator('button:has-text("服务器错误")').first();
      await serverCategoryButton.click();

      // 验证重置按钮显示
      await expect(page.locator('button:has-text("重置选择")')).toBeVisible();

      // 点击重置
      const resetButton = page.locator('button:has-text("重置选择")');
      await resetButton.click();

      // 验证场景列表隐藏
      await expect(page.locator('button:has-text("500 Internal Server Error")')).not.toBeVisible();

      // 验证重置按钮隐藏
      await expect(page.locator('button:has-text("重置选择")')).not.toBeVisible();
    });

    test('should display scenario details in preview', async ({ page }) => {
      // 点击超时分类
      await page.locator('[data-testid=scenario-category-timeout]').click();
      await page.waitForTimeout(300);

      // 点击超时场景按钮
      await page.locator('[data-testid^=scenario-button-]').first().click();

      // 等待预览对话框
      await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 3000 });

      // 验证显示延迟信息
      await expect(page.getByText(/延迟|delay/).first()).toBeVisible();
      await expect(page.getByText(/ms|秒/).first()).toBeVisible();

      // 验证显示状态码和内容类型（用 preview dialog 内精确 label）
      const dialog = page.locator('[role="dialog"]');
      await expect(dialog.getByText('响应状态码')).toBeVisible();
      await expect(dialog.getByText(/Content-Type/i)).toBeVisible();
    });
  });

  test.describe('Error Scenario Response Validation', () => {
    test('should save error scenario correctly', async ({ page }) => {
      await page.goto(`/projects/${projectId}/endpoints/${endpointId}`);

      // 应用 500 错误
      const error500Button = page.locator('button:has-text("500")').first();
      await error500Button.click();
      await page.waitForTimeout(300);

      // 保存
      await page.locator('button[type="submit"]').click();
      await expect(page.locator('text=/保存成功/')).toBeVisible({ timeout: 5000 });

      // 刷新页面验证数据持久化
      await page.reload();
      await page.waitForLoadState('networkidle');

      // 验证状态码保持为 500
      const hasStatusCode500 = await page.locator('option[value="500"]:checked, select[value="500"]').count() > 0;
      expect(hasStatusCode500).toBeTruthy();
    });

    test('should test mock service with error scenario', async ({ page, request }) => {
      await page.goto(`/projects/${projectId}/endpoints/${endpointId}`);

      // 应用 404 错误
      const error404Button = page.locator('button:has-text("404")').first();
      await error404Button.click();
      await page.waitForTimeout(300);

      // 保存
      await page.locator('button[type="submit"]').click();
      await expect(page.locator('text=/保存成功/')).toBeVisible({ timeout: 5000 });

      // 获取项目 slug
      const projectResponse = await request.get(`/api/projects/${projectId}`);
      const projectResult = await projectResponse.json();
      const projectSlug = projectResult.data.slug;

      // 调用 mock 服务
      const mockResponse = await request.get(`/${projectSlug}/api/test`);

      // 验证响应
      expect(mockResponse.status()).toBe(404);
      const mockData = await mockResponse.json();
      expect(mockData).toMatchObject({
        success: false,
        error: expect.objectContaining({
          code: 'NOT_FOUND',
        }),
      });
    });
  });
});
