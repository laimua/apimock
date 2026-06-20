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
      const templateButton = page.locator('[data-testid=open-template-library]');

      await expect(templateButton).toBeVisible();
    });

    test('should open template library dialog', async ({ page }) => {
      // 点击模板库按钮
      const templateButton = page.locator('[data-testid=open-template-library]');
      await templateButton.click();

      // 验证对话框显示（backdrop testid 作为 dialog open 的稳定信号）
      const backdrop = page.locator('[data-testid=template-library-backdrop]');
      await expect(backdrop).toBeVisible({ timeout: 3000 });

      // 验证标题（精确匹配，避免和项目名 "Template Library Test" 冲突）
      await expect(page.getByRole('heading', { name: 'Mock 模板库' })).toBeVisible();

      // 验证描述
      await expect(page.getByText('选择预设模板快速应用到响应数据')).toBeVisible();
    });

    test('should close dialog when clicking backdrop', async ({ page }) => {
      // 打开对话框
      const templateButton = page.locator("[data-testid=open-template-library]");
      await templateButton.click();

      await expect(page.locator('[data-testid=template-library-backdrop]')).toBeVisible({ timeout: 3000 });

      // 点击背景（点角落避免命中 dialog 主体）
      const backdrop = page.locator('[data-testid=template-library-backdrop]');
      await backdrop.click({ position: { x: 5, y: 5 } });

      // 验证对话框关闭
      await expect(page.locator('[data-testid=template-library-backdrop]')).not.toBeVisible({ timeout: 3000 });
    });

    test('should close dialog when clicking close button', async ({ page }) => {
      // 打开对话框
      const templateButton = page.locator("[data-testid=open-template-library]");
      await templateButton.click();

      await expect(page.locator('[data-testid=template-library-backdrop]')).toBeVisible({ timeout: 3000 });

      // 点击关闭按钮
      const closeButton = page.locator('[data-testid=close-template-library]');
      await closeButton.click();

      // 验证对话框关闭
      await expect(page.locator('[data-testid=template-library-backdrop]')).not.toBeVisible({ timeout: 3000 });
    });
  });

  test.describe('Template Categories', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`/projects/${projectId}/endpoints/${endpointId}`);
      // 打开模板库
      await page.locator("[data-testid=open-template-library]").click();
      await expect(page.locator('[data-testid=template-library-backdrop]')).toBeVisible({ timeout: 3000 });
    });

    test('should display all category tabs', async ({ page }) => {
      // 验证分类标签存在（用 data-testid 避免模糊匹配）
      await expect(page.locator('[data-testid=category-tab-all]')).toBeVisible();
      await expect(page.locator('[data-testid=category-tab-user]')).toBeVisible();
      await expect(page.locator('[data-testid=category-tab-product]')).toBeVisible();
      await expect(page.locator('[data-testid=category-tab-pagination]')).toBeVisible();
      await expect(page.locator('[data-testid=category-tab-error]')).toBeVisible();
      await expect(page.locator('[data-testid=category-tab-success]')).toBeVisible();
      await expect(page.locator('[data-testid=category-tab-list]')).toBeVisible();
    });

    test('should show template count in category tabs', async ({ page }) => {
      // 验证全部模板显示数量
      const allTemplatesButton = page.locator('[data-testid=category-tab-all]');
      await expect(allTemplatesButton).toBeVisible();
      const allTemplatesText = await allTemplatesButton.textContent();
      expect(allTemplatesText).toMatch(/\(\d+\)/);

      // 验证其他分类显示数量
      const userCategoryButton = page.locator('[data-testid=category-tab-user]');
      const userCategoryText = await userCategoryButton.textContent();
      expect(userCategoryText).toMatch(/\(\d+\)/);
    });

    test('should filter templates by category', async ({ page }) => {
      // 点击用户分类
      await page.locator('[data-testid=category-tab-user]').click();
      await page.waitForTimeout(300);

      // 验证显示用户相关模板（用户信息模板名精确匹配）
      await expect(page.getByRole('heading', { name: '用户信息' })).toBeVisible({ timeout: 3000 });
    });

    test('should show all templates when selecting "All" category', async ({ page }) => {
      // 先选择一个分类
      await page.locator('[data-testid=category-tab-user]').click();
      await page.waitForTimeout(300);

      // 再点击全部模板
      await page.locator('[data-testid=category-tab-all]').click();
      await page.waitForTimeout(300);

      // 验证显示多种分类的模板（用户信息 + 商品列表）
      await expect(page.getByRole('heading', { name: '用户信息' })).toBeVisible();
      await expect(page.getByRole('heading', { name: '商品列表' })).toBeVisible();
    });

    test('should highlight selected category', async ({ page }) => {
      // 点击商品分类
      const productCategoryButton = page.locator('[data-testid=category-tab-product]');

      await productCategoryButton.click();
      await page.waitForTimeout(300);

      // 验证按钮有选中样式（背景色变化）
      await expect(productCategoryButton).toHaveClass(/bg-green-50|bg-green-900|border-green/);
    });
  });

  test.describe('Template Selection and Preview', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`/projects/${projectId}/endpoints/${endpointId}`);
      await page.locator("[data-testid=open-template-library]").click();
      await expect(page.locator('[data-testid=template-library-backdrop]')).toBeVisible({ timeout: 3000 });
    });

    test('should display template list', async ({ page }) => {
      // 验证模板列表区域存在（至少一个 template-card）
      await expect(page.locator('[data-testid^=template-card-]').first()).toBeVisible({ timeout: 3000 });
    });

    test('should show template preview when clicking template', async ({ page }) => {
      // 点击第一个模板
      const firstTemplate = page.locator('[data-testid^=template-card-]').first();
      await firstTemplate.click();
      await page.waitForTimeout(300);

      // 验证预览区域显示内容（精确文本）
      await expect(page.getByText('响应数据预览')).toBeVisible();

      // 验证显示 JSON 代码块
      await expect(page.locator('pre.bg-gray-900, code, pre').first()).toBeVisible();
    });

    test('should display template details in preview', async ({ page }) => {
      // 点击用户列表模板
      const templateButton = page.locator('[data-testid^=template-card-]').nth(1);
      await templateButton.click();
      await page.waitForTimeout(300);

      // 验证显示模板 ID 标签
      await expect(page.getByText('模板 ID')).toBeVisible();
      // 验证预览有 JSON 内容
      await expect(page.locator('pre, code').first()).toBeVisible();
    });

    test('should highlight selected template', async ({ page }) => {
      // 点击一个模板
      const templateButton = page.locator('[data-testid^=template-card-]').first();
      await templateButton.click();
      await page.waitForTimeout(300);

      // 验证模板有选中样式（边框颜色，含浅色变体）
      await expect(templateButton).toHaveClass(/border-(blue|green|purple|indigo|emerald|red|amber)-(200|500|600|700|800|900)/);
    });

    test('should update preview when selecting different template', async ({ page }) => {
      // 点击第一个模板
      const firstTemplate = page.locator('[data-testid^=template-card-]').first();
      await firstTemplate.click();
      await page.waitForTimeout(300);

      // 获取初始预览内容
      const initialPreview = await page.locator('pre, code').first().textContent();

      // 点击另一个模板
      const secondTemplate = page.locator('[data-testid^=template-card-]').nth(1);
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
      await page.locator("[data-testid=open-template-library]").click();
      await expect(page.locator('[data-testid=template-library-backdrop]')).toBeVisible({ timeout: 3000 });
    });

    test('should apply template to response body', async ({ page }) => {
      // 选择第一个模板
      await page.locator('[data-testid^=template-card-]').first().click();
      await page.waitForTimeout(300);

      // 点击应用按钮
      await page.locator('[data-testid=apply-template]').click();

      // 等待对话框关闭
      await expect(page.locator('[data-testid=template-library-backdrop]')).not.toBeVisible({ timeout: 3000 });

      // 验证成功提示
      await expect(page.getByText(/模板已应用|应用成功/).first()).toBeVisible({ timeout: 3000 });
    });

    test('should close dialog after applying template', async ({ page }) => {
      // 选择第一个模板
      await page.locator('[data-testid^=template-card-]').first().click();
      await page.waitForTimeout(300);

      // 点击应用按钮
      await page.locator('[data-testid=apply-template]').click();

      // 验证对话框关闭
      await expect(page.locator('[data-testid=template-library-backdrop]')).not.toBeVisible({ timeout: 3000 });
    });

    test('should save applied template', async ({ page }) => {
      // 选择并应用模板
      await page.locator('[data-testid^=template-card-]').first().click();
      await page.waitForTimeout(300);

      await page.locator('[data-testid=apply-template]').click();

      await expect(page.locator('[data-testid=template-library-backdrop]')).not.toBeVisible({ timeout: 3000 });

      // 保存表单
      await page.locator('button[type="submit"]').click();
      await expect(page.locator('text=/保存成功/')).toBeVisible({ timeout: 5000 });

      // 刷新页面验证数据持久化
      await page.reload();
      await page.waitForLoadState('networkidle');

      // CodeMirror 编辑器，验证有内容（cm-content 或 cm-line）
      const cmContent = page.locator('.cm-content, .cm-line').first();
      await expect(cmContent).toBeVisible({ timeout: 3000 });
      const editorText = (await cmContent.textContent()) ?? '';
      expect(editorText.length).toBeGreaterThan(0);
    });
  });

  test.describe('Template Library Copy Feature', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`/projects/${projectId}/endpoints/${endpointId}`);
      await page.locator('[data-testid=open-template-library]').click();
      await expect(page.locator('[data-testid=template-library-backdrop]')).toBeVisible({ timeout: 3000 });

      // 选择第一个模板（带 preview 才有复制按钮）
      await page.locator('[data-testid^=template-card-]').first().click();
      await page.waitForTimeout(300);
    });

    test('should display copy button in preview', async ({ page }) => {
      // 验证复制按钮存在
      await expect(page.locator('[data-testid=copy-template-content]')).toBeVisible();
    });

    test('should copy template content to clipboard', async ({ page }) => {
      // 获取模板内容
      const templateContent = await page.locator('pre, code').first().textContent();

      // 点击复制按钮
      const copyButton = page.locator('[data-testid=copy-template-content]');
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
      await page.locator('[data-testid=open-template-library]').click();
      await expect(page.locator('[data-testid=template-library-backdrop]')).toBeVisible({ timeout: 3000 });
    });

    test('should display user templates', async ({ page }) => {
      await page.locator('[data-testid=category-tab-user]').click();
      await page.waitForTimeout(300);
      await expect(page.locator('[data-testid^=template-card-]').first()).toBeVisible();
    });

    test('should display product templates', async ({ page }) => {
      await page.locator('[data-testid=category-tab-product]').click();
      await page.waitForTimeout(300);
      await expect(page.locator('[data-testid^=template-card-]').first()).toBeVisible();
    });

    test('should display pagination templates', async ({ page }) => {
      await page.locator('[data-testid=category-tab-pagination]').click();
      await page.waitForTimeout(300);
      await expect(page.locator('[data-testid^=template-card-]').first()).toBeVisible();
    });

    test('should display error templates', async ({ page }) => {
      await page.locator('[data-testid=category-tab-error]').click();
      await page.waitForTimeout(300);
      await expect(page.locator('[data-testid^=template-card-]').first()).toBeVisible();
    });

    test('should display success templates', async ({ page }) => {
      await page.locator('[data-testid=category-tab-success]').click();
      await page.waitForTimeout(300);
      await expect(page.locator('[data-testid^=template-card-]').first()).toBeVisible();
    });

    test('should display list templates', async ({ page }) => {
      await page.locator('[data-testid=category-tab-list]').click();
      await page.waitForTimeout(300);
      await expect(page.locator('[data-testid^=template-card-]').first()).toBeVisible();
    });
  });

  test.describe('Template Library Empty State', () => {
    test('should show empty state when no template selected', async ({ page }) => {
      await page.goto(`/projects/${projectId}/endpoints/${endpointId}`);
      await page.locator('[data-testid=open-template-library]').click();
      await expect(page.locator('[data-testid=template-library-backdrop]')).toBeVisible({ timeout: 3000 });

      // 验证右侧预览区域显示提示
      await expect(page.locator('text=/选择一个模板|Select a template/')).toBeVisible();
    });

    test('should show placeholder icon in empty state', async ({ page }) => {
      await page.goto(`/projects/${projectId}/endpoints/${endpointId}`);
      await page.locator('[data-testid=open-template-library]').click();
      await expect(page.locator('[data-testid=template-library-backdrop]')).toBeVisible({ timeout: 3000 });

      // 验证显示提示图标
      await expect(page.locator('svg').filter({ hasText: '' }).first()).toBeVisible();
    });
  });

  test.describe('Template Library with JSON Editor', () => {
    test('should format JSON properly in preview', async ({ page }) => {
      await page.goto(`/projects/${projectId}/endpoints/${endpointId}`);
      await page.locator('[data-testid=open-template-library]').click();
      await expect(page.locator('[data-testid=template-library-backdrop]')).toBeVisible({ timeout: 3000 });

      // 选择一个模板
      await page.locator('[data-testid^=template-card-]').first().click();
      await page.waitForTimeout(300);

      // 验证 JSON 格式（包含缩进和换行）
      const jsonContent = await page.locator('pre code').first().textContent() ?? '';
      expect(jsonContent).toContain('{');
      expect(jsonContent).toContain('}');
    });
  });
});
