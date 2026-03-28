import { test, expect } from '@playwright/test';

test.describe('Mock Service', () => {
  let projectId: string;
  let projectSlug: string;

  test.beforeEach(async ({ page }) => {
    // 使用唯一的项目名避免 slug 冲突
    const uniqueName = `Mock Test ${Date.now()}`;
    
    // Create a test project
    const response = await page.request.post('/api/projects', {
      data: {
        name: uniqueName,
        basePath: '/api',
      },
    });
    const result = await response.json();
    expect(result.success).toBe(true);
    projectId = result.data.id;
    projectSlug = result.data.slug;

    // Create test endpoints
    await page.request.post(`/api/projects/${projectId}/endpoints`, {
      data: {
        path: '/users',
        method: 'GET',
        name: 'List Users',
        delayMs: 0,
      },
    });

    await page.request.post(`/api/projects/${projectId}/endpoints`, {
      data: {
        path: '/users',
        method: 'POST',
        name: 'Create User',
        delayMs: 0,
      },
    });
  });

  test('should respond to GET mock request', async ({ page }) => {
    const response = await page.request.get(`/${projectSlug}/users`);

    expect(response.status()).toBe(200);
    expect(response.headers()['x-mock-server']).toBe('ApiMock');
    expect(response.headers()['x-mock-project']).toBe(projectSlug);
    expect(response.headers()['x-mock-endpoint']).toBe('/users');
  });

  test('should respond to POST mock request', async ({ page }) => {
    const response = await page.request.post(`/${projectSlug}/users`, {
      data: { name: 'Test User' },
    });

    expect(response.status()).toBe(200);
    expect(response.headers()['x-mock-server']).toBe('ApiMock');
  });

  test('should return 404 for non-existent endpoint', async ({ page }) => {
    const response = await page.request.get(`/${projectSlug}/non-existent`);

    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.error).toBeDefined();
  });

  test('should return 404 for non-existent project', async ({ page }) => {
    const response = await page.request.get('/non-existent-project/users');

    expect(response.status()).toBe(404);
  });

  test('should respect endpoint delay', async ({ page }) => {
    // Create endpoint with delay
    await page.request.post(`/api/projects/${projectId}/endpoints`, {
      data: {
        path: '/slow',
        method: 'GET',
        delayMs: 1000,
      },
    });

    const startTime = Date.now();
    await page.request.get(`/${projectSlug}/slow`);
    const endTime = Date.now();

    expect(endTime - startTime).toBeGreaterThanOrEqual(900); // Allow some tolerance
  });

  test('should handle path parameters', async ({ page }) => {
    // Create endpoint with path parameter
    await page.request.post(`/api/projects/${projectId}/endpoints`, {
      data: {
        path: '/users/:id',
        method: 'GET',
        name: 'Get User by ID',
      },
    });

    const response = await page.request.get(`/${projectSlug}/users/123`);

    expect(response.status()).toBe(200);
  });

  test('should differentiate between methods on same path', async ({ page }) => {
    // Both GET and POST on /users should work
    const getResponse = await page.request.get(`/${projectSlug}/users`);
    const postResponse = await page.request.post(`/${projectSlug}/users`);

    expect(getResponse.status()).toBe(200);
    expect(postResponse.status()).toBe(200);
  });
});
