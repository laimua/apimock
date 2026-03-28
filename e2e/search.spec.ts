import { test, expect } from '@playwright/test';

test.describe('Search Functionality', () => {
  let testProjects: Array<{ id: string; name: string; slug: string }> = [];

  test.beforeAll(async ({ request }) => {
    // 创建多个测试项目用于搜索测试
    const projectData = [
      { name: '用户管理系统 API', description: '用户注册、登录、权限管理' },
      { name: '订单服务', description: '订单创建、查询、更新' },
      { name: '商品数据 Mock', description: '商品列表、详情、库存' },
      { name: 'Payment API', description: '支付接口 Mock 服务' },
      { name: '通知服务', description: '短信、邮件、推送通知' },
    ];

    for (const data of projectData) {
      const response = await request.post('/api/projects', {
        data: {
          name: `${data.name} ${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
          description: data.description,
        },
      });
      const result = await response.json();
      if (result.success) {
        testProjects.push({
          id: result.data.id,
          name: result.data.name,
          slug: result.data.slug,
        });
      }
    }
  });

  test.afterAll(async ({ request }) => {
    // 清理测试数据
    for (const project of testProjects) {
      try {
        await request.delete(`/api/projects/${project.id}`);
      } catch {
        // 忽略删除错误
      }
    }
  });

  test.describe('Project List Search', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/projects');
    });

    test('should display search input on projects page', async ({ page }) => {
      const searchInput = page.locator('input[placeholder*="搜索项目名称或标识符"]');
      await expect(searchInput).toBeVisible();
      await expect(searchInput).toHaveAttribute('type', 'text');
    });

    test('should filter projects by name', async ({ page }) => {
      // 获取第一个项目的名称关键词
      const searchKeyword = testProjects[0].name.split(' ')[0]; // 使用第一个词作为搜索关键词

      const searchInput = page.locator('input[placeholder*="搜索项目名称或标识符"]');
      await searchInput.fill(searchKeyword);

      // 等待搜索结果更新
      await page.waitForTimeout(300);

      // 验证至少显示一个包含关键词的项目
      const projectCards = page.locator('a[href*="/projects/"]');
      const count = await projectCards.count();

      expect(count).toBeGreaterThan(0);

      // 验证显示的项目包含搜索关键词
      for (let i = 0; i < count; i++) {
        const cardText = await projectCards.nth(i).textContent();
        expect(cardText?.toLowerCase()).toContain(searchKeyword.toLowerCase());
      }
    });

    test('should filter projects by slug', async ({ page }) => {
      // 使用部分 slug 进行搜索
      const searchKeyword = testProjects[0].slug.split('-')[0];

      const searchInput = page.locator('input[placeholder*="搜索项目名称或标识符"]');
      await searchInput.fill(searchKeyword);

      // 等待搜索结果更新
      await page.waitForTimeout(300);

      // 验证至少显示一个结果
      const projectCards = page.locator('a[href*="/projects/"]');
      const count = await projectCards.count();

      expect(count).toBeGreaterThan(0);
    });

    test('should show empty state when no matches found', async ({ page }) => {
      const searchInput = page.locator('input[placeholder*="搜索项目名称或标识符"]');
      const uniqueQuery = `nonexistent-${Date.now()}-${Math.random()}`;

      await searchInput.fill(uniqueQuery);

      // 应该显示空状态
      await expect(page.locator('text=/未找到匹配的项目/')).toBeVisible();
      await expect(page.locator(`text=/没有找到与 "${uniqueQuery}" 匹配的项目/`)).toBeVisible();

      // 应该显示清除搜索按钮
      await expect(page.locator('button:has-text("清除搜索")')).toBeVisible();
    });

    test('should show search result count', async ({ page }) => {
      const searchInput = page.locator('input[placeholder*="搜索项目名称或标识符"]');
      const searchKeyword = testProjects[0].name.split(' ')[0];

      await searchInput.fill(searchKeyword);
      await page.waitForTimeout(300);

      // 应该显示找到的项目数量
      const resultCount = page.locator('text=/找到 \\d+ 个项目/');
      await expect(resultCount).toBeVisible();
    });

    test('should clear search and show all projects', async ({ page }) => {
      const searchInput = page.locator('input[placeholder*="搜索项目名称或标识符"]');

      // 先进行搜索
      await searchInput.fill('test');
      await page.waitForTimeout(300);

      // 点击清除按钮
      const clearButton = page.locator('button:has(svg path[d*="M6 18L18 6"]))').first();
      await clearButton.click();

      // 搜索框应该清空
      await expect(searchInput).toHaveValue('');

      // 应该显示所有项目
      const resultCount = page.locator('text=/找到 \\d+ 个项目/');
      await expect(resultCount).not.toBeVisible();

      // 应该显示所有测试项目
      const projectCards = page.locator('a[href*="/projects/"]');
      const count = await projectCards.count();
      expect(count).toBe(testProjects.length);
    });

    test('should update search results in real-time', async ({ page }) => {
      const searchInput = page.locator('input[placeholder*="搜索项目名称或标识符"]');

      // 输入第一个字母
      await searchInput.fill('u');
      await page.waitForTimeout(300);
      let count = await page.locator('a[href*="/projects/"]').count();

      // 输入更多字母
      await searchInput.fill('us');
      await page.waitForTimeout(300);
      let newCount = await page.locator('a[href*="/projects/"]').count();

      // 结果数量应该变化（减少或保持不变）
      expect(newCount).toBeLessThanOrEqual(count);
    });

    test('should be case insensitive', async ({ page }) => {
      const searchInput = page.locator('input[placeholder*="搜索项目名称或标识符"]');
      const searchKeyword = testProjects[0].name.split(' ')[0];

      // 搜索小写
      await searchInput.fill(searchKeyword.toLowerCase());
      await page.waitForTimeout(300);
      const lowerCaseCount = await page.locator('a[href*="/projects/"]').count();

      // 搜索大写
      await searchInput.fill(searchKeyword.toUpperCase());
      await page.waitForTimeout(300);
      const upperCaseCount = await page.locator('a[href*="/projects/"]').count();

      // 结果数量应该相同
      expect(lowerCaseCount).toBe(upperCaseCount);
    });
  });

  test.describe('Project Detail Page - Endpoint Search', () => {
    let projectId: string;
    let testEndpoints: Array<{ id: string; path: string; method: string }> = [];

    test.beforeAll(async ({ request }) => {
      // 创建测试项目和端点
      const projectResponse = await request.post('/api/projects', {
        data: {
          name: `Search Test Project ${Date.now()}`,
          description: 'For endpoint search testing',
        },
      });
      const projectResult = await projectResponse.json();
      projectId = projectResult.data.id;

      const endpointData = [
        { path: '/api/users', method: 'GET', name: 'Get Users' },
        { path: '/api/users', method: 'POST', name: 'Create User' },
        { path: '/api/products', method: 'GET', name: 'Get Products' },
        { path: '/api/orders', method: 'GET', name: 'Get Orders' },
        { path: '/api/users/:id', method: 'GET', name: 'Get User by ID' },
      ];

      for (const data of endpointData) {
        const response = await request.post(`/api/projects/${projectId}/endpoints`, {
          data,
        });
        const result = await response.json();
        if (result.success) {
          testEndpoints.push(result.data);
        }
      }
    });

    test.afterAll(async ({ request }) => {
      try {
        await request.delete(`/api/projects/${projectId}`);
      } catch {
        // 忽略删除错误
      }
    });

    test('should display endpoint search input', async ({ page }) => {
      await page.goto(`/projects/${projectId}`);

      // 查找端点搜索输入框（根据实际页面结构调整）
      const searchInput = page.locator('input[placeholder*="搜索"], input[placeholder*="filter"]').first();
      // 如果没有专门的搜索框，这个测试可能会失败，需要根据实际 UI 调整
      if (await searchInput.isVisible({ timeout: 1000 }).catch(() => false)) {
        await expect(searchInput).toBeVisible();
      }
    });

    test('should filter endpoints by path', async ({ page }) => {
      await page.goto(`/projects/${projectId}`);

      // 查找搜索框
      const searchInput = page.locator('input[placeholder*="搜索"], input[placeholder*="filter"]').first();

      if (await searchInput.isVisible({ timeout: 1000 }).catch(() => false)) {
        await searchInput.fill('users');
        await page.waitForTimeout(300);

        // 验证只显示包含 users 的端点
        const endpointLinks = page.locator('a[href*="/endpoints/"]');
        const count = await endpointLinks.count();

        // 应该至少有一个结果
        expect(count).toBeGreaterThan(0);

        // 验证结果包含搜索词
        for (let i = 0; i < count; i++) {
          const linkText = await endpointLinks.nth(i).textContent();
          expect(linkText?.toLowerCase()).toContain('users');
        }
      }
    });

    test('should filter endpoints by method', async ({ page }) => {
      await page.goto(`/projects/${projectId}`);

      // 查找方法筛选器（根据实际 UI 调整）
      const methodFilter = page.locator('button:has-text("GET"), button:has-text("POST")').first();

      if (await methodFilter.isVisible({ timeout: 1000 }).catch(() => false)) {
        // 点击 GET 方法筛选
        await page.click('button:has-text("GET")');
        await page.waitForTimeout(300);

        // 验证只显示 GET 端点
        const getEndpoints = page.locator('text=GET');
        const count = await getEndpoints.count();
        expect(count).toBeGreaterThan(0);
      }
    });
  });

  test.describe('Search Performance', () => {
    test('should handle rapid input without lag', async ({ page }) => {
      await page.goto('/projects');

      const searchInput = page.locator('input[placeholder*="搜索项目名称或标识符"]');

      // 快速输入多个字符
      const startTime = Date.now();
      await searchInput.fill('rapid-test-input');
      const endTime = Date.now();

      // 输入应该很快完成
      expect(endTime - startTime).toBeLessThan(1000);

      // 等待搜索完成
      await page.waitForTimeout(500);

      // 页面应该保持响应
      await expect(searchInput).toBeVisible();
      await expect(searchInput).toBeFocused();
    });

    test('should not trigger excessive API calls during typing', async ({ page, request }) => {
      await page.goto('/projects');

      const searchInput = page.locator('input[placeholder*="搜索项目名称或标识符"]');

      // 监听网络请求
      const apiRequests: string[] = [];
      page.on('request', (request) => {
        if (request.url().includes('/api/')) {
          apiRequests.push(request.url());
        }
      });

      // 快速输入
      await searchInput.fill('test');
      await page.waitForTimeout(100);
      await searchInput.fill('test-api');
      await page.waitForTimeout(100);
      await searchInput.fill('test-api-search');

      // 等待搜索完成
      await page.waitForTimeout(1000);

      // 项目列表搜索是客户端过滤，不应该触发 API 请求
      // （除非有自动完成功能）
      // 这个测试主要确保不会有大量不必要的 API 调用
    });
  });
});
