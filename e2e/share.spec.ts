import { test, expect } from '@playwright/test';

test.describe('Share Functionality', () => {
  let projectId: string;
  let projectSlug: string;

  test.beforeEach(async ({ page }) => {
    // 使用更唯一的项目名（时间戳 + 随机字符串）
    const uniqueName = `Share ${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    
    // Create a test project
    const response = await page.request.post('/api/projects', {
      data: {
        name: uniqueName,
        description: 'Testing share functionality',
      },
    });
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(`Failed to create project: ${result.error?.message}`);
    }
    
    projectId = result.data.id;
    projectSlug = result.data.slug;

    // Add some endpoints
    await page.request.post(`/api/projects/${projectId}/endpoints`, {
      data: {
        path: '/users',
        method: 'GET',
        name: 'List Users',
        statusCode: 200,
        responseBody: JSON.stringify({ users: [] }),
      },
    });

    await page.request.post(`/api/projects/${projectId}/endpoints`, {
      data: {
        path: '/users',
        method: 'POST',
        name: 'Create User',
        statusCode: 201,
        responseBody: JSON.stringify({ created: true }),
      },
    });
  });

  test('should access share API', async ({ page }) => {
    const response = await page.request.get(`/api/share/${projectSlug}`);
    
    expect(response.status()).toBe(200);
    const result = await response.json();
    
    expect(result.project).toBeDefined();
    expect(result.project.slug).toBe(projectSlug);
    expect(result.endpoints).toBeDefined();
    expect(result.endpoints.length).toBe(2);
    expect(result.baseUrl).toBeDefined();
  });

  test('should access share page', async ({ page }) => {
    await page.goto(`/share/${projectSlug}`);
    
    // Should show project info
    await expect(page.locator('h1')).toBeVisible();
    
    // Should show endpoints section (使用更精确的选择器)
    await expect(page.locator('h2:has-text("端点列表")')).toBeVisible();
    
    // Should show Mock URL section
    await expect(page.locator('text=/Mock.*URL|基础 URL/')).toBeVisible();
  });

  test('should display endpoints on share page', async ({ page }) => {
    await page.goto(`/share/${projectSlug}`);
    
    // Should show endpoint paths (使用 .first() 避免严格模式错误)
    await expect(page.locator('code:has-text("/users")').first()).toBeVisible();
    
    // Should show method badges
    await expect(page.locator('text=GET').first()).toBeVisible();
    await expect(page.locator('text=POST').first()).toBeVisible();
  });

  test('should handle non-existent share slug', async ({ page }) => {
    await page.goto('/share/non-existent-share-xyz-123');
    
    // Should show error message
    await expect(page.locator('text=/不存在|404|错误/')).toBeVisible();
  });

  test('should share API return 404 for non-existent project', async ({ page }) => {
    const response = await page.request.get('/api/share/non-existent-slug');
    
    expect(response.status()).toBe(404);
    const result = await response.json();
    expect(result.error).toBeDefined();
  });

  test('should access mock endpoints through shared project', async ({ page }) => {
    // Access the mock endpoint through project slug
    const response = await page.request.get(`/${projectSlug}/users`);
    
    // Should get mock response
    expect(response.status()).toBe(200);
    expect(response.headers()['x-mock-server']).toBe('ApiMock');
  });
});
