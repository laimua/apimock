import { test, expect } from '@playwright/test';
import { join } from 'path';
import { readFileSync } from 'fs';

test.describe('OpenAPI Import', () => {
  let projectId: string;
  let projectSlug: string;

  test.beforeEach(async ({ page }) => {
    // 使用更唯一的项目名（时间戳 + 随机字符串）
    const uniqueName = `OpenAPI ${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    
    // Create a test project
    const response = await page.request.post('/api/projects', {
      data: {
        name: uniqueName,
      },
    });
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(`Failed to create project: ${result.error?.message}`);
    }
    
    projectId = result.data.id;
    projectSlug = result.data.slug;
  });

  test('should import YAML OpenAPI file', async ({ page }) => {
    const yamlPath = join(__dirname, 'fixtures', 'openapi-sample.yaml');
    const yamlContent = readFileSync(yamlPath, 'utf-8');
    
    // 使用 Buffer 构造 multipart/form-data
    const fileBuffer = Buffer.from(yamlContent);
    
    const importResponse = await page.request.post(`/api/projects/${projectId}/import`, {
      multipart: {
        file: {
          name: 'openapi-sample.yaml',
          mimeType: 'application/yaml',
          buffer: fileBuffer,
        },
      },
    });
    
    const importResult = await importResponse.json();
    console.log('Import result:', JSON.stringify(importResult, null, 2));
    
    expect(importResponse.status()).toBe(201);
    expect(importResult.success).toBe(true);
    expect(importResult.data.created).toBeGreaterThan(0);
    
    // 验证端点已创建
    const endpointsResponse = await page.request.get(`/api/projects/${projectId}/endpoints`);
    const endpointsResult = await endpointsResponse.json();
    expect(endpointsResult.success).toBe(true);
    expect(endpointsResult.data.length).toBeGreaterThan(0);
  });

  test('should import JSON OpenAPI file', async ({ page }) => {
    const jsonPath = join(__dirname, 'fixtures', 'openapi-sample.json');
    const jsonContent = readFileSync(jsonPath, 'utf-8');
    
    const fileBuffer = Buffer.from(jsonContent);
    
    const importResponse = await page.request.post(`/api/projects/${projectId}/import`, {
      multipart: {
        file: {
          name: 'openapi-sample.json',
          mimeType: 'application/json',
          buffer: fileBuffer,
        },
      },
    });
    
    const importResult = await importResponse.json();
    expect(importResponse.status()).toBe(201);
    expect(importResult.success).toBe(true);
    expect(importResult.data.created).toBeGreaterThan(0);
  });

  test('should handle invalid OpenAPI file', async ({ page }) => {
    const fileBuffer = Buffer.from('invalid: yaml: content: : :');
    
    const importResponse = await page.request.post(`/api/projects/${projectId}/import`, {
      multipart: {
        file: {
          name: 'invalid.yaml',
          mimeType: 'application/yaml',
          buffer: fileBuffer,
        },
      },
    });
    
    // 无效文件应返回错误
    expect(importResponse.status()).toBe(400);
    const result = await importResponse.json();
    expect(result.success).toBe(false);
  });

  test('should parse OpenAPI file for preview', async ({ page }) => {
    const yamlPath = join(__dirname, 'fixtures', 'openapi-sample.yaml');
    const yamlContent = readFileSync(yamlPath, 'utf-8');
    
    const fileBuffer = Buffer.from(yamlContent);
    
    const parseResponse = await page.request.post(`/api/projects/${projectId}/import/parse`, {
      multipart: {
        file: {
          name: 'openapi-sample.yaml',
          mimeType: 'application/yaml',
          buffer: fileBuffer,
        },
      },
    });
    
    const parseResult = await parseResponse.json();
    expect(parseResult.success).toBe(true);
    expect(parseResult.data.endpoints.length).toBeGreaterThan(0);
    expect(parseResult.data.endpoints[0]).toHaveProperty('path');
    expect(parseResult.data.endpoints[0]).toHaveProperty('method');
  });

  test('should extract all HTTP methods from OpenAPI', async ({ page }) => {
    const yamlPath = join(__dirname, 'fixtures', 'openapi-sample.yaml');
    const yamlContent = readFileSync(yamlPath, 'utf-8');
    
    const fileBuffer = Buffer.from(yamlContent);
    
    const parseResponse = await page.request.post(`/api/projects/${projectId}/import/parse`, {
      multipart: {
        file: {
          name: 'openapi-sample.yaml',
          mimeType: 'application/yaml',
          buffer: fileBuffer,
        },
      },
    });
    
    const parseResult = await parseResponse.json();
    expect(parseResult.success).toBe(true);
    
    const methods = new Set(parseResult.data.endpoints.map((e: any) => e.method));
    expect(methods.size).toBeGreaterThan(1); // 应该有多种 HTTP 方法
  });
});
