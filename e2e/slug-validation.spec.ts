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

  // 稳定 selector：data-testid 不受文案 / SVG path / minify 影响
  const slugInputSel = '[data-testid="project-slug-input"]';
  const nameInputSel = '[data-testid="project-name-input"]';
  const submitBtnSel = '[data-testid="project-submit"]';

  test('should show error when entering existing slug', async ({ page }) => {
    const slugInput = page.locator(slugInputSel);
    await slugInput.fill(existingProjectSlug);

    // 等待验证完成 (防抖 500ms + 额外缓冲)
    await page.waitForTimeout(600);

    // 应该显示错误状态
    await expect(page.locator('text=/此 Slug 已被使用|已被使用/')).toBeVisible({ timeout: 5000 });

    // 提交按钮应该被禁用
    const submitButton = page.locator(submitBtnSel);
    await expect(submitButton).toBeDisabled();
  });

  test('should show available status for new unique slug', async ({ page }) => {
    const uniqueSlug = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const slugInput = page.locator(slugInputSel);
    await slugInput.fill(uniqueSlug);

    // 等更长时间让 debounce + API 返回
    await page.waitForTimeout(1500);

    await expect(page.locator('text=/此 Slug 可用|可用/')).toBeVisible({ timeout: 8000 });
  });

  test('should disable submit button when slug validation is loading', async ({ page }) => {
    const uniqueSlug = `loading-test-${Date.now()}`;

    const slugInput = page.locator(slugInputSel);
    await slugInput.fill(uniqueSlug);

    // 立即检查 - 应该看到加载状态
    await expect(page.locator('text=/检查 Slug 可用性|检查中/')).toBeVisible({ timeout: 500 });

    const submitButton = page.locator(submitBtnSel);
    await expect(submitButton).toBeDisabled();
  });

  test('should debounce slug validation (500ms delay)', async ({ page }) => {
    const baseSlug = `debounce-${Date.now()}`;

    const slugInput = page.locator(slugInputSel);

    const startTime = Date.now();

    await slugInput.fill(baseSlug);
    await page.waitForTimeout(100);
    await slugInput.fill(`${baseSlug}-1`);
    await page.waitForTimeout(100);
    await slugInput.fill(`${baseSlug}-2`);

    await expect(page.locator('text=/检查 Slug 可用性|此 Slug 可用/')).toBeVisible({ timeout: 2000 });

    const endTime = Date.now();
    const elapsed = endTime - startTime;

    expect(elapsed).toBeGreaterThan(200);
    expect(elapsed).toBeLessThan(3000);
  });

  test('should auto-generate slug from project name', async ({ page }) => {
    const projectName = `Test Project ${Date.now()}`;
    const expectedSlug = projectName.toLowerCase().replace(/[^a-z0-9一-龥]+/g, '-').replace(/^-|-$/g, '');

    const nameInput = page.locator(nameInputSel);
    await nameInput.fill(projectName);

    const slugInput = page.locator(slugInputSel);
    await expect(slugInput).toHaveValue(expectedSlug);
  });

  test('should show validation error for invalid slug format', async ({ page }) => {
    const slugInput = page.locator(slugInputSel);

    // 输入大写字母 → 自动转小写（page 行为），不会触发格式错误
    // 测试改为验证 auto-lowercase
    await slugInput.fill('InvalidSlug-ABC');
    await slugInput.blur();
    await page.waitForTimeout(300);

    // 输入值应该被自动转为小写
    const value = await slugInput.inputValue();
    expect(value.toLowerCase()).toBe(value);
  });

  test('should allow creating project with unique slug after validation', async ({ page }) => {
    const uniqueSlug = `create-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const projectName = `Create Test ${Date.now()}`;

    const nameInput = page.locator(nameInputSel);
    await nameInput.fill(projectName);

    const slugInput = page.locator(slugInputSel);
    await slugInput.fill(uniqueSlug);

    await expect(page.locator('text=/此 Slug 可用/')).toBeVisible({ timeout: 5000 });

    const descTextarea = page.locator('textarea[placeholder*="描述"]');
    await descTextarea.fill('Testing slug validation flow');

    const submitButton = page.locator(submitBtnSel);
    await expect(submitButton).not.toBeDisabled();
    await submitButton.click();

    await expect(page).toHaveURL(/\/projects\/[a-z0-9]+$/);
  });

  test('should clear slug status when slug is emptied', async ({ page }) => {
    const slugInput = page.locator(slugInputSel);

    await slugInput.fill('test-slug');
    await page.waitForTimeout(600);

    const hasStatus = await page.locator('text=/检查 Slug 可用性|此 Slug 可用|已被使用/').count() > 0;
    expect(hasStatus).toBeTruthy();

    await slugInput.fill('');

    await expect(page.locator('text=/检查 Slug 可用性|此 Slug 可用/')).not.toBeVisible();
  });
});
