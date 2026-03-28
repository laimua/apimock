import { test, expect } from '@playwright/test';

test.describe('Project Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display the home page', async ({ page }) => {
    await expect(page).toHaveTitle(/ApiMock/);
    await expect(page.locator('h1')).toContainText('AI 智能 Mock 平台');
  });

  test('should create a new project', async ({ page }) => {
    // 使用唯一的项目名避免 slug 冲突
    const uniqueName = `E2E Test ${Date.now()}`;
    
    // Click "快速开始" button
    await page.click('a:has-text("快速开始")');

    // Navigate to new project page
    await expect(page).toHaveURL(/\/projects\/new/);

    // Fill in project details (使用 placeholder 定位)
    const nameInput = page.locator('input[placeholder*="项目"]');
    await nameInput.fill(uniqueName);
    
    const descTextarea = page.locator('textarea[placeholder*="描述"]');
    await descTextarea.fill('This is a test project for E2E testing');

    // Submit form
    await page.click('button[type="submit"]');

    // Should be redirected to project page
    await expect(page).toHaveURL(/\/projects\/[a-z0-9]+$/);

    // Should see project name
    await expect(page.locator('h1')).toContainText(uniqueName);
  });

  test('should show validation errors for invalid project data', async ({ page }) => {
    await page.click('a:has-text("快速开始")');

    // Wait for page to load
    await expect(page).toHaveURL(/\/projects\/new/);

    // Try to submit without name
    await page.click('button[type="submit"]');

    // Should show validation error (中文)
    await expect(page.locator('text=/项目名称不能为空|名称.*必/i')).toBeVisible();
  });

  test('should display project list', async ({ page }) => {
    // Navigate to projects page
    await page.goto('/projects');

    // Should see projects heading (Chinese)
    await expect(page.locator('h1')).toContainText('我的项目');
  });

  test('should navigate to project details', async ({ page }) => {
    // 使用唯一的项目名避免 slug 冲突
    const uniqueName = `Nav Test ${Date.now()}`;
    
    // First create a project via API
    const response = await page.request.post('/api/projects', {
      data: {
        name: uniqueName,
        description: 'Testing navigation',
      },
    });
    
    const result = await response.json();
    
    // Check if API succeeded
    if (!result.success) {
      throw new Error(`Project creation failed: ${result.error?.message}`);
    }
    
    await page.goto('/projects');

    // Click on the project card
    await page.click(`text=${uniqueName}`);

    // Should be on project page
    await expect(page.locator('h1')).toContainText(uniqueName);
  });

  test('should update a project via API', async ({ page }) => {
    // 创建测试项目
    const uniqueName = `Update Test ${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const createResponse = await page.request.post('/api/projects', {
      data: {
        name: uniqueName,
        description: 'Original description',
      },
    });
    
    const createResult = await createResponse.json();
    expect(createResult.success).toBe(true);
    const projectId = createResult.data.id;

    // 更新项目
    const updatedName = `Updated ${Date.now()}`;
    const updateResponse = await page.request.put(`/api/projects/${projectId}`, {
      data: {
        name: updatedName,
        description: 'Updated description',
      },
    });

    const updateResult = await updateResponse.json();
    expect(updateResult.success).toBe(true);
    expect(updateResult.data.name).toBe(updatedName);
    expect(updateResult.data.description).toBe('Updated description');

    // 验证更新成功
    const getResponse = await page.request.get(`/api/projects/${projectId}`);
    const getResult = await getResponse.json();
    expect(getResult.success).toBe(true);
    expect(getResult.data.name).toBe(updatedName);
  });

  test('should delete a project via API', async ({ page }) => {
    // 创建测试项目
    const uniqueName = `Delete Test ${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const createResponse = await page.request.post('/api/projects', {
      data: {
        name: uniqueName,
        description: 'To be deleted',
      },
    });

    const createResult = await createResponse.json();
    expect(createResult.success).toBe(true);
    const projectId = createResult.data.id;

    // 删除项目
    const deleteResponse = await page.request.delete(`/api/projects/${projectId}`);
    const deleteResult = await deleteResponse.json();
    expect(deleteResult.success).toBe(true);
    expect(deleteResult.data.deleted).toBe(true);

    // 验证删除成功 - 再次获取应返回 404
    const getResponse = await page.request.get(`/api/projects/${projectId}`);
    const getResult = await getResponse.json();
    expect(getResult.success).toBe(false);
    expect(getResult.error?.code).toBe('NOT_FOUND');
  });

  test('should delete a project from UI', async ({ page }) => {
    // 创建测试项目
    const uniqueName = `UI Delete Test ${Date.now()}`;

    // 通过 API 创建测试项目
    const createResponse = await page.request.post('/api/projects', {
      data: {
        name: uniqueName,
        description: 'Will be deleted via UI',
      },
    });

    const createResult = await createResponse.json();
    expect(createResult.success).toBe(true);

    // 导航到项目列表页
    await page.goto('/projects');

    // 验证项目存在
    await expect(page.locator(`text=${uniqueName}`)).toBeVisible();

    // 找到包含项目名称的卡片容器（使用 XPath）
    const projectContainer = page.locator(`xpath=//h3[contains(text(), "${uniqueName}")]/ancestor::div[contains(@class, "group")]`);
    await projectContainer.hover();

    // 在该容器内找到删除按钮
    const deleteButton = projectContainer.locator('button[title="删除项目"]');
    await expect(deleteButton).toBeVisible();

    // 设置对话框处理程序（在点击之前）
    page.on('dialog', async dialog => {
      expect(dialog.message()).toContain(uniqueName);
      await dialog.accept();
    });

    // 点击删除按钮
    await deleteButton.click();

    // 等待删除完成 - 项目名称应该消失
    await page.waitForTimeout(1000);

    // 刷新以确保列表更新
    await page.reload();

    // 验证项目已从列表中消失
    await expect(page.locator(`text=${uniqueName}`)).not.toBeVisible();
  });
});
