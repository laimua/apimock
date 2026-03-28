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
      // 点击 500 错误按钮
      const error500Button = page.locator('button:has-text("500 错误"), button:has-text("500")').filter({
        has: page.locator('text=/500|Server Error/'),
      }).first();

      await error500Button.click();

      // 验证状态码更新为 500
      const statusCodeSelect = page.locator('select[value="500"], option[value="500"]:checked');
      await expect(statusCodeSelect).isVisible();

      // 验证响应体包含错误信息
      const responseBodyEditor = page.locator('textarea').filter({ hasText: 'INTERNAL_SERVER_ERROR' }).or(
        page.locator('pre, code').filter({ hasText: 'INTERNAL_SERVER_ERROR' })
      );

      await expect(responseBodyEditor).toBeVisible({ timeout: 3000 });

      // 验证 JSON 包含错误结构
      const hasErrorStructure = await page.locator('pre, code, textarea').filter({
        hasText: /"success":\s*false/,
      }).count() > 0;
      expect(hasErrorStructure).toBeTruthy();

      // 保存更改
      await page.locator('button[type="submit"]').click();

      // 等待保存成功提示
      await expect(page.locator('text=/保存成功/')).toBeVisible({ timeout: 5000 });

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
      // 点击 404 错误按钮
      const error404Button = page.locator('button:has-text("404")').filter({
        has: page.locator('text=/404|Not Found|未找到/'),
      }).first();

      await error404Button.click();

      // 验证状态码更新为 404
      const hasStatusCode404 = await page.locator('option[value="404"]:checked, select[value="404"]').count() > 0;
      expect(hasStatusCode404).toBeTruthy();

      // 验证响应体包含 NOT_FOUND 错误
      const hasNotFoundError = await page.locator('pre, code, textarea').filter({
        hasText: 'NOT_FOUND',
      }).count() > 0;
      expect(hasNotFoundError).toBeTruthy();

      // 保存并验证
      await page.locator('button[type="submit"]').click();
      await expect(page.locator('text=/保存成功/')).toBeVisible({ timeout: 5000 });

      const getResponse = await page.request.get(`/api/projects/${projectId}/endpoints/${endpointId}`);
      const getResult = await getResponse.json();
      expect(getResult.data.statusCode).toBe(404);
    });

    test('should apply 401 Unauthorized scenario', async ({ page }) => {
      // 点击 401 错误按钮
      const error401Button = page.locator('button:has-text("401")').filter({
        has: page.locator('text=/401|Unauthorized|未授权/'),
      }).first();

      await error401Button.click();

      // 验证状态码更新
      const hasStatusCode401 = await page.locator('option[value="401"]:checked, select[value="401"]').count() > 0;
      expect(hasStatusCode401).toBeTruthy();

      // 验证响应体包含 UNAUTHORIZED 错误
      const hasUnauthorizedError = await page.locator('pre, code, textarea').filter({
        hasText: 'UNAUTHORIZED',
      }).count() > 0;
      expect(hasUnauthorizedError).toBeTruthy();

      // 保存并验证
      await page.locator('button[type="submit"]').click();
      await expect(page.locator('text=/保存成功/')).toBeVisible({ timeout: 5000 });

      const getResponse = await page.request.get(`/api/projects/${projectId}/endpoints/${endpointId}`);
      const getResult = await getResponse.json();
      expect(getResult.data.statusCode).toBe(401);
    });

    test('should apply 403 Forbidden scenario', async ({ page }) => {
      // 点击 403 错误按钮
      const error403Button = page.locator('button:has-text("403")').filter({
        has: page.locator('text=/403|Forbidden|禁止/'),
      }).first();

      await error403Button.click();

      // 验证状态码更新
      const hasStatusCode403 = await page.locator('option[value="403"]:checked, select[value="403"]').count() > 0;
      expect(hasStatusCode403).toBeTruthy();

      // 验证响应体包含 FORBIDDEN 错误
      const hasForbiddenError = await page.locator('pre, code, textarea').filter({
        hasText: 'FORBIDDEN',
      }).count() > 0;
      expect(hasForbiddenError).toBeTruthy();

      // 保存并验证
      await page.locator('button[type="submit"]').click();
      await expect(page.locator('text=/保存成功/')).toBeVisible({ timeout: 5000 });

      const getResponse = await page.request.get(`/api/projects/${projectId}/endpoints/${endpointId}`);
      const getResult = await getResponse.json();
      expect(getResult.data.statusCode).toBe(403);
    });

    test('should apply timeout scenario with delay', async ({ page }) => {
      // 点击超时按钮
      const timeoutButton = page.locator('button:has-text("超时"), button:has-text("5s")').filter({
        has: page.locator('text=/timeout|超时/'),
      }).first();

      await timeoutButton.click();

      // 验证延迟设置
      const delayInput = page.locator('input[type="number"][value*="5000"], input[placeholder*="延迟"]').or(
        page.locator('input').filter({ hasAttribute: 'type', value: 'number' })
      );

      // 验证延迟值为 5000ms
      const hasDelay5000 = await page.locator('input[type="number"]').filter({
        hasValue: '5000',
      }).count() > 0;
      expect(hasDelay5000).toBeTruthy();

      // 验证响应体包含超时错误
      const hasTimeoutError = await page.locator('pre, code, textarea').filter({
        hasText: 'REQUEST_TIMEOUT',
      }).count() > 0;
      expect(hasTimeoutError).toBeTruthy();

      // 保存并验证
      await page.locator('button[type="submit"]').click();
      await expect(page.locator('text=/保存成功/')).toBeVisible({ timeout: 5000 });

      const getResponse = await page.request.get(`/api/projects/${projectId}/endpoints/${endpointId}`);
      const getResult = await getResponse.json();
      expect(getResult.data.delayMs).toBe(5000);
    });

    test('should show active state for selected error scenario', async ({ page }) => {
      // 点击 500 错误按钮
      const error500Button = page.locator('button:has-text("500 错误"), button:has-text("500")').first();
      await error500Button.click();

      // 验证按钮显示选中状态（红色边框/背景）
      await expect(error500Button).toHaveClass(/border-red-500|bg-red-50/);

      // 验证未选中的按钮没有选中样式
      const error404Button = page.locator('button:has-text("404")').first();
      await expect(error404Button).not.toHaveClass(/border-red-500|bg-red-50/);
    });
  });

  test.describe('ErrorScenariosSelector Component', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`/projects/${projectId}/endpoints/${endpointId}`);
      await page.waitForLoadState('networkidle');
    });

    test('should display error scenario categories', async ({ page }) => {
      // 滚动到错误场景选择器
      const selectorSection = page.locator('text=/错误场景模拟/').or(
        page.locator('h3:has-text("错误")')
      );
      await selectorSection.scrollIntoViewIfNeeded();
      await expect(selectorSection).toBeVisible();

      // 验证分类按钮存在
      await expect(page.locator('text=/服务器错误|server/i')).toBeVisible();
      await expect(page.locator('text=/客户端错误|client/i')).toBeVisible();
      await expect(page.locator('text=/超时|timeout/i')).toBeVisible();
    });

    test('should show scenarios after selecting category', async ({ page }) => {
      // 点击服务器错误分类
      const serverCategoryButton = page.locator('button:has-text("服务器错误")').or(
        page.locator('button:has-text("server")')
      ).first();

      await serverCategoryButton.click();

      // 等待场景列表显示
      await page.waitForTimeout(300);

      // 验证显示具体场景
      await expect(page.locator('text=/500 Internal Server Error/')).toBeVisible({ timeout: 3000 });
      await expect(page.locator('text=/502 Bad Gateway/')).toBeVisible();
    });

    test('should show preview dialog when clicking scenario', async ({ page }) => {
      // 点击服务器错误分类
      const serverCategoryButton = page.locator('button:has-text("服务器错误")').first();
      await serverCategoryButton.click();
      await page.waitForTimeout(300);

      // 点击具体场景
      const scenario500Button = page.locator('button:has-text("500 Internal Server Error")').or(
        page.locator('button:has-text("500")').filter({ hasText: 'Internal' })
      ).first();

      await scenario500Button.click();

      // 验证预览对话框显示
      await expect(page.locator('div.fixed.inset-0.z-50').or(page.locator('[role="dialog"]'))).toBeVisible({ timeout: 3000 });

      // 验证预览内容
      await expect(page.locator('text=/500/')).toBeVisible();
      await expect(page.locator('text=/application\\/json/')).toBeVisible();
      await expect(page.locator('text=/响应体|Response/')).toBeVisible();
    });

    test('should apply scenario from preview dialog', async ({ page }) => {
      // 点击服务器错误分类
      const serverCategoryButton = page.locator('button:has-text("服务器错误")').first();
      await serverCategoryButton.click();
      await page.waitForTimeout(300);

      // 点击具体场景打开预览
      const scenario503Button = page.locator('button:has-text("503 Service Unavailable")').or(
        page.locator('button:has-text("503")').filter({ hasText: 'Service' })
      ).first();

      await scenario503Button.click();

      // 等待预览对话框
      await expect(page.locator('div.fixed.inset-0.z-50').or(page.locator('[role="dialog"]'))).toBeVisible({ timeout: 3000 });

      // 点击应用按钮
      const applyButton = page.locator('button:has-text("应用场景")').or(
        page.locator('button:has-text("应用")')
      ).last();

      await applyButton.click();

      // 等待对话框关闭
      await expect(page.locator('div.fixed.inset-0.z-50').or(page.locator('[role="dialog"]'))).not.toBeVisible({ timeout: 3000 });

      // 验证表单更新
      const hasStatusCode503 = await page.locator('option[value="503"]:checked, select[value="503"]').count() > 0;
      expect(hasStatusCode503).toBeTruthy();

      // 验证成功提示
      await expect(page.locator('text=/已应用错误场景|应用成功/')).toBeVisible({ timeout: 3000 });
    });

    test('should cancel scenario from preview dialog', async ({ page }) => {
      // 记录当前状态码
      const initialStatusCode = await page.locator('select').or(page.locator('option:checked')).first().inputValue();

      // 点击服务器错误分类
      const serverCategoryButton = page.locator('button:has-text("服务器错误")').first();
      await serverCategoryButton.click();
      await page.waitForTimeout(300);

      // 点击具体场景打开预览
      const scenario500Button = page.locator('button:has-text("500")').first();
      await scenario500Button.click();

      // 等待预览对话框
      await expect(page.locator('div.fixed.inset-0.z-50').or(page.locator('[role="dialog"]'))).toBeVisible({ timeout: 3000 });

      // 点击取消按钮
      const cancelButton = page.locator('button:has-text("取消")').last();
      await cancelButton.click();

      // 等待对话框关闭
      await expect(page.locator('div.fixed.inset-0.z-50').or(page.locator('[role="dialog"]'))).not.toBeVisible({ timeout: 3000 });

      // 验证表单没有更改
      const currentStatusCode = await page.locator('select').or(page.locator('option:checked')).first().inputValue();
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
      // 点击服务器错误分类
      const serverCategoryButton = page.locator('button:has-text("服务器错误")').first();
      await serverCategoryButton.click();
      await page.waitForTimeout(300);

      // 点击包含延迟的场景（如超时）
      const timeoutScenarioButton = page.locator('button:has-text("timeout"), button:has-text("超时")').first();
      await timeoutScenarioButton.click();

      // 等待预览对话框
      await expect(page.locator('div.fixed.inset-0.z-50').or(page.locator('[role="dialog"]'))).toBeVisible({ timeout: 3000 });

      // 验证显示延迟信息
      await expect(page.locator('text=/延迟|delay/')).toBeVisible();
      await expect(page.locator('text=/ms|秒/')).toBeVisible();

      // 验证显示状态码和内容类型
      await expect(page.locator('text=/响应状态码|Status/')).toBeVisible();
      await expect(page.locator('text=/Content-Type/')).toBeVisible();
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
