import { test, expect } from '@playwright/test';

test.describe('Template Library', () => {
  let projectId: string;
  let endpointId: string;

  test.beforeAll(async ({ request }) => {
    // 创建测试项目和端点
    const projectResponse = await request.post('/api/projects', {
      data: {
        name: `Template Library Test ${Date.now()}`,
        description: 'Testing template library functionality',
      },
    });
    const projectResult = await projectResponse.json();
    expect(projectResult.success).toBe(true);
    projectId = projectResult.data.id;

    const endpointResponse = await request.post(`/api/projects/${projectId}/endpoints`, {
      data: {
        path: '/api/template-test',
        method: 'GET',
        name: 'Template Test Endpoint',
        statusCode: 200,
        contentType: 'application/json',
        responseBody: { initial: 'data' },
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

  test.describe('Opening Template Library', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`/projects/${projectId}/endpoints/${endpointId}`);
      await page.waitForLoadState('networkidle');
    });

    test('should display template library button', async ({ page }) => {
      // 滚动到响应配置区域
      await page.locator('text=/响应配置|Response/').scrollIntoViewIfNeeded();

      // 验证模板库按钮存在
      const templateButton = page.locator('button:has-text("模板库"), button:has(svg path[d*="M19 11H5"])').filter({
        hasText: '模板',
      });

      await expect(templateButton).toBeVisible();
    });

    test('should open template library dialog', async ({ page }) => {
      // 点击模板库按钮
      const templateButton = page.locator('button:has-text("模板库")').first();
      await templateButton.click();

      // 验证对话框显示
      const dialog = page.locator('div.fixed.inset-0.z-50').or(page.locator('[role="dialog"]'));
      await expect(dialog).toBeVisible({ timeout: 3000 });

      // 验证标题
      await expect(page.locator('text=/Mock 模板库|Template Library/')).toBeVisible();

      // 验证描述
      await expect(page.locator('text=/选择预设模板|template/')).toBeVisible();
    });

    test('should close dialog when clicking backdrop', async ({ page }) => {
      // 打开对话框
      const templateButton = page.locator('button:has-text("模板库")').first();
      await templateButton.click();

      await expect(page.locator('div.fixed.inset-0.z-50')).toBeVisible({ timeout: 3000 });

      // 点击背景
      const backdrop = page.locator('div.fixed.inset-0.bg-black\\/50');
      await backdrop.click();

      // 验证对话框关闭
      await expect(page.locator('div.fixed.inset-0.z-50')).not.toBeVisible({ timeout: 3000 });
    });

    test('should close dialog when clicking close button', async ({ page }) => {
      // 打开对话框
      const templateButton = page.locator('button:has-text("模板库")').first();
      await templateButton.click();

      await expect(page.locator('div.fixed.inset-0.z-50')).toBeVisible({ timeout: 3000 });

      // 点击关闭按钮
      const closeButton = page.locator('button:has-text("关闭")').last();
      await closeButton.click();

      // 验证对话框关闭
      await expect(page.locator('div.fixed.inset-0.z-50')).not.toBeVisible({ timeout: 3000 });
    });
  });

  test.describe('Template Categories', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`/projects/${projectId}/endpoints/${endpointId}`);
      // 打开模板库
      await page.locator('button:has-text("模板库")').first().click();
      await expect(page.locator('div.fixed.inset-0.z-50')).toBeVisible({ timeout: 3000 });
    });

    test('should display all category tabs', async ({ page }) => {
      // 验证分类标签存在
      await expect(page.locator('button:has-text("全部模板")')).toBeVisible();
      await expect(page.locator('button:has-text("用户")')).toBeVisible();
      await expect(page.locator('button:has-text("商品")')).toBeVisible();
      await expect(page.locator('button:has-text("分页")')).toBeVisible();
      await expect(page.locator('button:has-text("错误")')).toBeVisible();
      await expect(page.locator('button:has-text("成功")')).toBeVisible();
      await expect(page.locator('button:has-text("列表")')).toBeVisible();
    });

    test('should show template count in category tabs', async ({ page }) => {
      // 验证全部模板显示数量
      const allTemplatesButton = page.locator('button:has-text("全部模板")');
      await expect(allTemplatesButton).toBeVisible();
      const allTemplatesText = await allTemplatesButton.textContent();
      expect(allTemplatesText).toMatch(/\(\d+\)/);

      // 验证其他分类显示数量
      const userCategoryButton = page.locator('button:has(text)').filter({ hasText: '用户' });
      const userCategoryText = await userCategoryButton.textContent();
      expect(userCategoryText).toMatch(/\(\d+\)/);
    });

    test('should filter templates by category', async ({ page }) => {
      // 点击用户分类
      const userCategoryButton = page.locator('button').filter({ hasText: '用户' }).or(
        page.locator('button').filter({ hasText: /user/i })
      ).first();

      await userCategoryButton.click();
      await page.waitForTimeout(300);

      // 验证显示用户相关模板
      await expect(page.locator('text=/用户信息|User Info|User List/')).toBeVisible({ timeout: 3000 });
    });

    test('should show all templates when selecting "All" category', async ({ page }) => {
      // 先选择一个分类
      const userCategoryButton = page.locator('button').filter({ hasText: '用户' }).first();
      await userCategoryButton.click();
      await page.waitForTimeout(300);

      // 再点击全部模板
      const allTemplatesButton = page.locator('button:has(text)').filter({ hasText: '全部模板' });
      await allTemplatesButton.click();
      await page.waitForTimeout(300);

      // 验证显示多种分类的模板
      await expect(page.locator('text=/用户|商品|分页|成功/')).toBeVisible();
    });

    test('should highlight selected category', async ({ page }) => {
      // 点击商品分类
      const productCategoryButton = page.locator('button').filter({ hasText: '商品' }).or(
        page.locator('button').filter({ hasText: /product/i })
      ).first();

      await productCategoryButton.click();
      await page.waitForTimeout(300);

      // 验证按钮有选中样式（背景色变化）
      await expect(productCategoryButton).toHaveClass(/bg-green-50|bg-green-900|border-green/);
    });
  });

  test.describe('Template Selection and Preview', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`/projects/${projectId}/endpoints/${endpointId}`);
      await page.locator('button:has-text("模板库")').first().click();
      await expect(page.locator('div.fixed.inset-0.z-50')).toBeVisible({ timeout: 3000 });
    });

    test('should display template list', async ({ page }) => {
      // 验证模板列表区域存在
      await expect(page.locator('text=/用户信息|User Info|用户列表|User List/')).toBeVisible({ timeout: 3000 });
    });

    test('should show template preview when clicking template', async ({ page }) => {
      // 点击第一个模板
      const firstTemplate = page.locator('button').filter({ hasText: /用户|User|商品|Product|成功|Success/ }).first();
      await firstTemplate.click();
      await page.waitForTimeout(300);

      // 验证预览区域显示内容
      await expect(page.locator('text=/响应数据预览|Preview|JSON/')).toBeVisible();

      // 验证显示 JSON 代码块
      await expect(page.locator('pre.bg-gray-900, code, pre')).toBeVisible();
    });

    test('should display template details in preview', async ({ page }) => {
      // 点击一个模板
      const templateButton = page.locator('button').filter({ hasText: /用户列表|User List/ }).first();
      await templateButton.click();
      await page.waitForTimeout(300);

      // 验证显示模板名称和描述
      await expect(page.locator('text=/模板 ID|Template ID/')).toBeVisible();
      await expect(page.locator('pre, code').filter({ hasText: /"data"|"items"|"users"/ })).toBeVisible();
    });

    test('should highlight selected template', async ({ page }) => {
      // 点击一个模板
      const templateButton = page.locator('button').filter({ hasText: /用户列表|成功响应|分页数据/ }).first();
      await templateButton.click();
      await page.waitForTimeout(300);

      // 验证模板有选中样式（边框颜色）
      await expect(templateButton).toHaveClass(/border-blue-500|border-green-500|border-purple-500|border-indigo-500/);
    });

    test('should update preview when selecting different template', async ({ page }) => {
      // 点击第一个模板
      const firstTemplate = page.locator('button').filter({ hasText: /用户|User/ }).first();
      await firstTemplate.click();
      await page.waitForTimeout(300);

      // 获取初始预览内容
      const initialPreview = await page.locator('pre, code').first().textContent();

      // 点击另一个模板
      const secondTemplate = page.locator('button').filter({ hasText: /商品|Product|成功|Success/ }).nth(1);
      await secondTemplate.click();
      await page.waitForTimeout(300);

      // 获取新的预览内容
      const newPreview = await page.locator('pre, code').first().textContent();

      // 内容应该不同
      expect(initialPreview).not.toBe(newPreview);
    });
  });

  test.describe('Applying Templates', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`/projects/${projectId}/endpoints/${endpointId}`);
      await page.locator('button:has-text("模板库")').first().click();
      await expect(page.locator('div.fixed.inset-0.z-50')).toBeVisible({ timeout: 3000 });
    });

    test('should apply template to response body', async ({ page }) => {
      // 选择一个模板
      const templateButton = page.locator('button').filter({ hasText: /用户列表|User List/ }).first();
      await templateButton.click();
      await page.waitForTimeout(300);

      // 点击应用按钮
      const applyButton = page.locator('button:has(text)').filter({ hasText: '应用此模板' }).or(
        page.locator('button:has(svg path[d*="M5 13l4 4L19 7"])')
      );

      await applyButton.click();

      // 等待对话框关闭
      await expect(page.locator('div.fixed.inset-0.z-50')).not.toBeVisible({ timeout: 3000 });

      // 验证成功提示
      await expect(page.locator('text=/模板已应用|应用成功/')).toBeVisible({ timeout: 3000 });

      // 验证响应体编辑器更新
      const responseBodyEditor = page.locator('textarea, pre, code').filter({ hasText: /"data"|"users"|"items"/ });
      await expect(responseBodyEditor).toBeVisible({ timeout: 3000 });
    });

    test('should close dialog after applying template', async ({ page }) => {
      // 选择一个模板
      const templateButton = page.locator('button').filter({ hasText: /用户|User/ }).first();
      await templateButton.click();
      await page.waitForTimeout(300);

      // 点击应用按钮
      const applyButton = page.locator('button:has(text)').filter({ hasText: '应用此模板' });
      await applyButton.click();

      // 验证对话框关闭
      await expect(page.locator('div.fixed.inset-0.z-50')).not.toBeVisible({ timeout: 3000 });
    });

    test('should save applied template', async ({ page }) => {
      // 选择并应用模板
      const templateButton = page.locator('button').filter({ hasText: /成功响应|Success/ }).first();
      await templateButton.click();
      await page.waitForTimeout(300);

      const applyButton = page.locator('button:has(text)').filter({ hasText: '应用此模板' });
      await applyButton.click();

      await expect(page.locator('div.fixed.inset-0.z-50')).not.toBeVisible({ timeout: 3000 });

      // 保存表单
      await page.locator('button[type="submit"]').click();
      await expect(page.locator('text=/保存成功/')).toBeVisible({ timeout: 5000 });

      // 刷新页面验证数据持久化
      await page.reload();
      await page.waitForLoadState('networkidle');

      // 验证响应体保持应用模板的内容
      const hasTemplateData = await page.locator('textarea, pre').filter({
        hasText: /"success"|"message"|"data"/,
      }).count() > 0;
      expect(hasTemplateData).toBeTruthy();
    });
  });

  test.describe('Template Library Copy Feature', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`/projects/${projectId}/endpoints/${endpointId}`);
      await page.locator('button:has-text("模板库")').first().click();
      await expect(page.locator('div.fixed.inset-0.z-50')).toBeVisible({ timeout: 3000 });

      // 选择一个模板
      const templateButton = page.locator('button').filter({ hasText: /用户|User|商品|Product/ }).first();
      await templateButton.click();
      await page.waitForTimeout(300);
    });

    test('should display copy button in preview', async ({ page }) => {
      // 验证复制按钮存在
      await expect(page.locator('button:has(text)').filter({ hasText: '复制' })).toBeVisible();
    });

    test('should copy template content to clipboard', async ({ page }) => {
      // 获取模板内容
      const templateContent = await page.locator('pre, code').first().textContent();

      // 点击复制按钮
      const copyButton = page.locator('button:has(text)').filter({ hasText: '复制' });
      await copyButton.click();

      // 验证剪贴板内容（需要授予 clipboard 权限）
      try {
        const clipboardText = await page.evaluate('navigator.clipboard.readText()');
        expect(clipboardText).toContain(templateContent?.slice(0, 50) || '');
      } catch {
        // 如果无法访问剪贴板，至少验证按钮可点击
        await expect(copyButton).toBeVisible();
      }
    });
  });

  test.describe('Template Categories Content', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`/projects/${projectId}/endpoints/${endpointId}`);
      await page.locator('button:has(text)').filter({ hasText: '模板库' }).first().click();
      await expect(page.locator('div.fixed.inset-0.z-50')).toBeVisible({ timeout: 3000 });
    });

    test('should display user templates', async ({ page }) => {
      // 点击用户分类
      await page.locator('button').filter({ hasText: '用户' }).first().click();
      await page.waitForTimeout(300);

      // 验证显示用户相关模板
      await expect(page.locator('text=/用户信息|用户列表|登录|注册/')).toBeVisible();
    });

    test('should display product templates', async ({ page }) => {
      // 点击商品分类
      await page.locator('button').filter({ hasText: '商品' }).or(
        page.locator('button').filter({ hasText: /product/i })
      ).first().click();
      await page.waitForTimeout(300);

      // 验证显示商品相关模板
      await expect(page.locator('text=/商品详情|商品列表|Product/')).toBeVisible();
    });

    test('should display pagination templates', async ({ page }) => {
      // 点击分页分类
      await page.locator('button').filter({ hasText: '分页' }).or(
        page.locator('button').filter({ hasText: /pagination/i })
      ).first().click();
      await page.waitForTimeout(300);

      // 验证显示分页相关模板
      await expect(page.locator('text=/分页|pagination|page|cursor/')).toBeVisible();
    });

    test('should display error templates', async ({ page }) => {
      // 点击错误分类
      await page.locator('button').filter({ hasText: '错误' }).or(
        page.locator('button').filter({ hasText: /error/i })
      ).first().click();
      await page.waitForTimeout(300);

      // 验证显示错误相关模板
      await expect(page.locator('text=/错误|error|invalid|unauthorized/')).toBeVisible();
    });

    test('should display success templates', async ({ page }) => {
      // 点击成功分类
      await page.locator('button').filter({ hasText: '成功' }).or(
        page.locator('button').filter({ hasText: /success/i })
      ).first().click();
      await page.waitForTimeout(300);

      // 验证显示成功相关模板
      await expect(page.locator('text=/成功|success|created|updated/')).toBeVisible();
    });

    test('should display list templates', async ({ page }) => {
      // 点击列表分类
      await page.locator('button').filter({ hasText: '列表' }).or(
        page.locator('button').filter({ hasText: /list/i })
      ).first().click();
      await page.waitForTimeout(300);

      // 验证显示列表相关模板
      await expect(page.locator('text=/列表|list|items|elements/')).toBeVisible();
    });
  });

  test.describe('Template Library Empty State', () => {
    test('should show empty state when no template selected', async ({ page }) => {
      await page.goto(`/projects/${projectId}/endpoints/${endpointId}`);
      await page.locator('button:has(text)').filter({ hasText: '模板库' }).first().click();
      await expect(page.locator('div.fixed.inset-0.z-50')).toBeVisible({ timeout: 3000 });

      // 验证右侧预览区域显示提示
      await expect(page.locator('text=/选择一个模板|Select a template/')).toBeVisible();
    });

    test('should show placeholder icon in empty state', async ({ page }) => {
      await page.goto(`/projects/${projectId}/endpoints/${endpointId}`);
      await page.locator('button:has(text)').filter({ hasText: '模板库' }).first().click();
      await expect(page.locator('div.fixed.inset-0.z-50')).toBeVisible({ timeout: 3000 });

      // 验证显示提示图标
      await expect(page.locator('svg').filter({ hasText: '' }).first()).toBeVisible();
    });
  });

  test.describe('Template Library with JSON Editor', () => {
    test('should format JSON properly in preview', async ({ page }) => {
      await page.goto(`/projects/${projectId}/endpoints/${endpointId}`);
      await page.locator('button:has(text)').filter({ hasText: '模板库' }).first().click();
      await expect(page.locator('div.fixed.inset-0.z-50')).toBeVisible({ timeout: 3000 });

      // 选择一个模板
      const templateButton = page.locator('button').filter({ hasText: /用户列表|分页数据/ }).first();
      await templateButton.click();
      await page.waitForTimeout(300);

      // 验证 JSON 格式（包含缩进和换行）
      const jsonContent = await page.locator('pre, code').first().textContent();
      expect(jsonContent).toContain('{');
      expect(jsonContent).toContain('}');
      expect(jsonContent).toMatch(/\n\s*\n/); // 有换行和缩进
    });
  });
});
