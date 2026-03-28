import { test, expect } from '@playwright/test';

test.describe('Slug Validation', () => {
  let existingProjectSlug: string;
  let existingProjectId: string;

  test.beforeAll(async ({ request }) => {
    // 创建一个测试项目用于验证重复 slug 检测
    const timestamp = Date.now();
    const response = await request.post('/api/projects', {
      data: {
        name: `Existing Slug Test ${timestamp}`,
        description: 'Used for slug validation testing',
      },
    });
    const result = await response.json();
    expect(result.success).toBe(true);
    existingProjectId = result.data.id;
    existingProjectSlug = result.data.slug;
  });

  test.afterAll(async ({ request }) => {
    // 清理测试数据
    try {
      await request.delete(`/api/projects/${existingProjectId}`);
    } catch {
      // 忽略删除错误
    }
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/projects/new');
  });

  test('should show error when entering existing slug', async ({ page }) => {
    // 输入已存在的 slug
    const slugInput = page.locator('input[placeholder*="my-api-project"]').or(
      page.locator('div:has-text("/project/") input').filter({ hasText: '' })
    );
    await slugInput.fill(existingProjectSlug);

    // 等待验证完成 (防抖 500ms + 额外缓冲)
    await page.waitForTimeout(600);

    // 应该显示错误状态
    await expect(page.locator('text=/此 Slug 已被使用|已被使用/')).toBeVisible({ timeout: 5000 });

    // 应该显示红色错误图标
    const errorIcon = page.locator('svg:has(path[d*="M8.707 7.293"])').first();
    await expect(errorIcon).toBeVisible();

    // 提交按钮应该被禁用
    const submitButton = page.locator('button[type="submit"]');
    await expect(submitButton).toBeDisabled();
  });

  test('should show available status for new unique slug', async ({ page }) => {
    // 生成唯一的 slug
    const uniqueSlug = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // 输入新的 slug
    const slugInput = page.locator('input[placeholder*="my-api-project"]').or(
      page.locator('div:has-text("/project/") input').filter({ hasText: '' })
    );
    await slugInput.fill(uniqueSlug);

    // 等待验证完成
    await page.waitForTimeout(600);

    // 应该显示可用状态
    await expect(page.locator('text=/此 Slug 可用|可用/')).toBeVisible({ timeout: 5000 });

    // 应该显示绿色成功图标
    const successIcon = page.locator('svg:has(path[d*="M3.707-9.293"])').first();
    await expect(successIcon).toBeVisible();

    // 提交按钮应该可用
    const submitButton = page.locator('button[type="submit"]');
    await expect(submitButton).not.toBeDisabled();
  });

  test('should disable submit button when slug validation is loading', async ({ page }) => {
    const uniqueSlug = `loading-test-${Date.now()}`;

    // 输入 slug 并立即检查（在验证完成前）
    const slugInput = page.locator('input[placeholder*="my-api-project"]').or(
      page.locator('div:has-text("/project/") input').filter({ hasText: '' })
    );
    await slugInput.fill(uniqueSlug);

    // 立即检查 - 应该看到加载状态
    await expect(page.locator('text=/检查 Slug 可用性|检查中/')).toBeVisible({ timeout: 500 });

    // 加载时提交按钮应该被禁用
    const submitButton = page.locator('button[type="submit"]');
    await expect(submitButton).toBeDisabled();
  });

  test('should debounce slug validation (500ms delay)', async ({ page }) => {
    const baseSlug = `debounce-${Date.now()}`;

    const slugInput = page.locator('input[placeholder*="my-api-project"]').or(
      page.locator('div:has-text("/project/") input').filter({ hasText: '' })
    );

    // 记录开始时间
    const startTime = Date.now();

    // 快速输入多个值
    await slugInput.fill(baseSlug);
    await page.waitForTimeout(100);
    await slugInput.fill(`${baseSlug}-1`);
    await page.waitForTimeout(100);
    await slugInput.fill(`${baseSlug}-2`);

    // 等待最终验证完成
    await expect(page.locator('text=/检查 Slug 可用性|此 Slug 可用/')).toBeVisible({ timeout: 2000 });

    const endTime = Date.now();
    const elapsed = endTime - startTime;

    // 验证时间应该接近 500ms（防抖延迟）加上最后一次输入后的等待
    // 总时间应该在 500ms - 1500ms 之间
    expect(elapsed).toBeGreaterThan(400);
    expect(elapsed).toBeLessThan(2000);
  });

  test('should auto-generate slug from project name', async ({ page }) => {
    const projectName = `Test Project ${Date.now()}`;
    const expectedSlug = projectName.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-').replace(/^-|-$/g, '');

    const nameInput = page.locator('input[placeholder*="项目"]').or(
      page.locator('input[placeholder*="我的 API 项目"]')
    );

    await nameInput.fill(projectName);

    // 检查 slug 是否自动生成
    const slugInput = page.locator('input[placeholder*="my-api-project"]').or(
      page.locator('div:has-text("/project/") input').filter({ hasText: '' })
    );

    await expect(slugInput).toHaveValue(expectedSlug);
  });

  test('should show validation error for invalid slug format', async ({ page }) => {
    const slugInput = page.locator('input[placeholder*="my-api-project"]').or(
      page.locator('div:has-text("/project/") input').filter({ hasText: '' })
    );

    // 输入包含大写字母的 slug
    await slugInput.fill('InvalidSlug-ABC');

    // 失去焦点触发验证
    await slugInput.blur();

    // 应该显示格式错误
    await expect(page.locator('text=/只能包含小写字母、数字和连字符/')).toBeVisible();
  });

  test('should allow creating project with unique slug after validation', async ({ page }) => {
    const uniqueSlug = `create-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const projectName = `Create Test ${Date.now()}`;

    // 填写项目信息
    const nameInput = page.locator('input[placeholder*="项目"]').or(
      page.locator('input[placeholder*="我的 API 项目"]')
    );
    await nameInput.fill(projectName);

    const slugInput = page.locator('input[placeholder*="my-api-project"]').or(
      page.locator('div:has-text("/project/") input').filter({ hasText: '' })
    );
    await slugInput.fill(uniqueSlug);

    // 等待验证通过
    await expect(page.locator('text=/此 Slug 可用/')).toBeVisible({ timeout: 5000 });

    // 填写描述
    const descTextarea = page.locator('textarea[placeholder*="描述"]');
    await descTextarea.fill('Testing slug validation flow');

    // 提交表单
    const submitButton = page.locator('button[type="submit"]');
    await expect(submitButton).not.toBeDisabled();
    await submitButton.click();

    // 应该成功创建项目
    await expect(page).toHaveURL(/\/projects\/[a-z0-9]+$/);
  });

  test('should clear slug status when slug is emptied', async ({ page }) => {
    const slugInput = page.locator('input[placeholder*="my-api-project"]').or(
      page.locator('div:has-text("/project/") input').filter({ hasText: '' })
    );

    // 输入有效 slug
    await slugInput.fill('test-slug');
    await page.waitForTimeout(600);

    // 应该显示验证中或可用状态
    const hasStatus = await page.locator('text=/检查 Slug 可用性|此 Slug 可用|已被使用/').count() > 0;
    expect(hasStatus).toBeTruthy();

    // 清空 slug
    await slugInput.fill('');

    // 状态应该被清除
    await expect(page.locator('text=/检查 Slug 可用性|此 Slug 可用/')).not.toBeVisible();
  });
});
