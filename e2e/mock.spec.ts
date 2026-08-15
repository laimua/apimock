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

  test('@db-core should respond to GET mock request', async ({ page }) => {
    const response = await page.request.get(`/${projectSlug}/users`);

    expect(response.status()).toBe(200);
    expect(response.headers()['x-mock-server']).toBe('ApiMock');
    expect(response.headers()['x-mock-project']).toBe(projectSlug);
    expect(response.headers()['x-mock-endpoint']).toBe('/users');
  });

  test('@db-core should respond to POST mock request', async ({ page }) => {
    const response = await page.request.post(`/${projectSlug}/users`, {
      data: { name: 'Test User' },
    });

    expect(response.status()).toBe(200);
    expect(response.headers()['x-mock-server']).toBe('ApiMock');
  });

  test('@db-core should return 404 for non-existent endpoint', async ({ page }) => {
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

  // C5: 具体度排序 —— 字面路径必须压过参数路径。
  // 两个模糊匹配端点(/users/me 与 /users/:id 都非 exact? me 是 exact)——
  // 真正回归场景是两段以上:/users/me/:action vs /users/:id/:action,
  // exact 匹配救不了,只能靠排序。
  test('C5: literal segments beat parameter segments (/users/me/:action vs /users/:id/:action)', async ({ page }) => {
    // 先建参数端点再建字面端点:若按 createdAt 排序,参数端点(先建)会先命中
    await page.request.post(`/api/projects/${projectId}/endpoints`, {
      data: {
        path: '/users/:id/:action',
        method: 'GET',
        name: 'param route (created first)',
        statusCode: 200,
        responseBody: { route: 'param' },
      },
    });
    await page.request.post(`/api/projects/${projectId}/endpoints`, {
      data: {
        path: '/users/me/:action',
        method: 'GET',
        name: 'literal route (created second)',
        statusCode: 200,
        responseBody: { route: 'literal' },
      },
    });

    const response = await page.request.get(`/${projectSlug}/users/me/profile`);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.route).toBe('literal');

    // 参数端点仍正常服务非 me 的请求
    const other = await page.request.get(`/${projectSlug}/users/123/profile`);
    const otherBody = await other.json();
    expect(otherBody.route).toBe('param');
  });

  test('should differentiate between methods on same path', async ({ page }) => {
    // Both GET and POST on /users should work
    const getResponse = await page.request.get(`/${projectSlug}/users`);
    const postResponse = await page.request.post(`/${projectSlug}/users`);

    expect(getResponse.status()).toBe(200);
    expect(postResponse.status()).toBe(200);
  });
});
