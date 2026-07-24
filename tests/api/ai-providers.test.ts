/**
 * AI Providers API Route Tests
 * Tests for CRUD operations on AI providers
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { type NextRequest } from 'next/server';
import { GET, POST } from '@/app/api/ai/providers/route';
import { PATCH, DELETE } from '@/app/api/ai/providers/[id]/route';
import { POST as TEST_POST } from '@/app/api/ai/providers/[id]/test/route';
import { POST as DEFAULT_POST } from '@/app/api/ai/providers/[id]/default/route';
import { getTestDb, setupTestDb, clearTestDb } from '../setup';
import { aiProviders } from '@/lib/schema';
import { eq } from 'drizzle-orm';

const asReq = (r: Request): NextRequest => r as unknown as NextRequest;

let mockDb: ReturnType<typeof getTestDb>;

vi.mock('@/lib/db', () => ({
  get db() {
    return mockDb;
  },
}));

// Mock OpenAI for testing
vi.mock('openai', () => ({
  default: class {
    public chat: unknown;
    constructor() {
      this.chat = {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{
              message: {
                content: 'Hello! This is a test response.',
              },
            }],
          }),
        },
      };
    }
  },
}));

// Import encryption utilities
import { encrypt } from '@/lib/encryption';

beforeAll(async () => {
  mockDb = await setupTestDb('ai-providers-test');
});

describe('AI Providers API', () => {
  beforeEach(async () => {
    await clearTestDb(mockDb);
  });

  afterEach(async () => {
    await clearTestDb(mockDb);
  });

  describe('GET /api/ai/providers', () => {
    it('should return empty array when no providers exist', async () => {
      const request = new Request('http://localhost/api/ai/providers');
      const response = await GET(asReq(request));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toEqual([]);
    });

    it('should return list of providers without API keys', async () => {
      await mockDb.insert(aiProviders).values([
        {
          id: 'provider1',
          name: 'Provider 1',
          provider: 'openai',
          baseUrl: null,
          apiKey: 'encrypted-key-1',
          models: JSON.stringify(['gpt-4', 'gpt-3.5-turbo']),
          defaultModel: 'gpt-4',
          systemPrompt: null,
          isActive: 1,
          isDefault: 1,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: 'provider2',
          name: 'Provider 2',
          provider: 'anthropic',
          baseUrl: null,
          apiKey: 'encrypted-key-2',
          models: JSON.stringify(['claude-3']),
          defaultModel: 'claude-3',
          systemPrompt: null,
          isActive: 0,
          isDefault: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ]);

      const request = new Request('http://localhost/api/ai/providers');
      const response = await GET(asReq(request));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(2);
      expect(data.data[0].name).toBe('Provider 1');
      expect(data.data[0].apiKey).toBeUndefined();
      expect(data.data[0].models).toEqual(['gpt-4', 'gpt-3.5-turbo']);
    });

    it('should return providers sorted by isDefault and createdAt', async () => {
      await mockDb.insert(aiProviders).values([
        {
          id: 'provider1',
          name: 'Default Provider',
          provider: 'openai',
          baseUrl: null,
          apiKey: 'encrypted-key-1',
          models: JSON.stringify(['gpt-4']),
          defaultModel: 'gpt-4',
          systemPrompt: null,
          isActive: 1,
          isDefault: 1,
          createdAt: Date.now() - 10000,
          updatedAt: Date.now(),
        },
        {
          id: 'provider2',
          name: 'Regular Provider',
          provider: 'openai',
          baseUrl: null,
          apiKey: 'encrypted-key-2',
          models: JSON.stringify(['gpt-4']),
          defaultModel: 'gpt-4',
          systemPrompt: null,
          isActive: 1,
          isDefault: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ]);

      const request = new Request('http://localhost/api/ai/providers');
      const response = await GET(asReq(request));
      const data = await response.json();

      expect(data.data[0].isDefault).toBe(true);
      expect(data.data[1].isDefault).toBe(false);
    });
  });

  describe('POST /api/ai/providers', () => {
    it('should create a new provider with valid data', async () => {
      const requestBody = {
        name: 'OpenAI',
        provider: 'openai',
        apiKey: 'sk-test-key',
        models: ['gpt-4', 'gpt-3.5-turbo'],
        defaultModel: 'gpt-4',
      };

      const request = new Request('http://localhost/api/ai/providers', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      const response = await POST(asReq(request));
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('OpenAI');
      expect(data.data.provider).toBe('openai');
      expect(data.data.models).toEqual(['gpt-4', 'gpt-3.5-turbo']);
      expect(data.data.defaultModel).toBe('gpt-4');
      expect(data.data.apiKey).toBeUndefined();
      expect(data.data.id).toBeDefined();
      expect(data.data.isDefault).toBe(true);
    });

    it('should validate defaultModel is in models list', async () => {
      const requestBody = {
        name: 'Invalid Provider',
        provider: 'openai',
        apiKey: 'sk-test-key',
        models: ['gpt-3.5-turbo'],
        defaultModel: 'gpt-4',
      };

      const request = new Request('http://localhost/api/ai/providers', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      const response = await POST(asReq(request));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('should set first provider as default', async () => {
      const requestBody = {
        name: 'First Provider',
        provider: 'openai',
        apiKey: 'sk-test-key',
        models: ['gpt-4'],
        defaultModel: 'gpt-4',
      };

      const request = new Request('http://localhost/api/ai/providers', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      const response = await POST(asReq(request));
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data.isDefault).toBe(true);
    });

    it('should handle optional fields', async () => {
      const requestBody = {
        name: 'Provider with options',
        provider: 'openai',
        apiKey: 'sk-test-key',
        models: ['gpt-4'],
        defaultModel: 'gpt-4',
        baseUrl: 'https://api.openai.com/v1',
        systemPrompt: 'You are a helpful assistant',
      };

      const request = new Request('http://localhost/api/ai/providers', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      const response = await POST(asReq(request));
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.data.baseUrl).toBe('https://api.openai.com/v1');
      expect(data.data.systemPrompt).toBe('You are a helpful assistant');
    });

    it('should validate required fields', async () => {
      const requestBody = {
        name: 'Incomplete Provider',
      };

      const request = new Request('http://localhost/api/ai/providers', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      const response = await POST(asReq(request));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('should reject baseUrl pointing to private IP (SSRF guard at save time)', async () => {
      const requestBody = {
        name: 'Malicious Provider',
        provider: 'openai-compatible',
        apiKey: 'sk-test-key',
        models: ['gpt-4'],
        defaultModel: 'gpt-4',
        baseUrl: 'http://169.254.169.254/latest/meta-data/',
      };

      const request = new Request('http://localhost/api/ai/providers', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      const response = await POST(asReq(request));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('should reject baseUrl pointing to localhost (SSRF guard at save time)', async () => {
      const requestBody = {
        name: 'Local Provider',
        provider: 'openai-compatible',
        apiKey: 'sk-test-key',
        models: ['gpt-4'],
        defaultModel: 'gpt-4',
        baseUrl: 'http://localhost:8080/v1',
      };

      const request = new Request('http://localhost/api/ai/providers', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      const response = await POST(asReq(request));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });
  });

  describe('PATCH /api/ai/providers/[id]', () => {
    beforeEach(async () => {
      await clearTestDb(mockDb);
      await mockDb.insert(aiProviders).values({
        id: 'provider1',
        name: 'Test Provider',
        provider: 'openai',
        baseUrl: null,
        apiKey: 'encrypted-key',
        models: JSON.stringify(['gpt-4']),
        defaultModel: 'gpt-4',
        systemPrompt: null,
        isActive: 1,
        isDefault: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    it('should update provider', async () => {
      const requestBody = {
        name: 'Updated Name',
        isActive: false,
      };

      const request = new Request('http://localhost/api/ai/providers/provider1', {
        method: 'PATCH',
        body: JSON.stringify(requestBody),
      });

      const response = await PATCH(asReq(request), {
        params: Promise.resolve({ id: 'provider1' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('Updated Name');
      expect(data.data.isActive).toBe(false);
    });

    it('should return 404 for non-existent provider', async () => {
      const requestBody = { name: 'Updated' };

      const request = new Request('http://localhost/api/ai/providers/non-existent', {
        method: 'PATCH',
        body: JSON.stringify(requestBody),
      });

      const response = await PATCH(asReq(request), {
        params: Promise.resolve({ id: 'non-existent' }),
      });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
    });

    it('should validate models and defaultModel relationship', async () => {
      const requestBody = {
        models: ['gpt-3.5-turbo'],
        defaultModel: 'gpt-4',
      };

      const request = new Request('http://localhost/api/ai/providers/provider1', {
        method: 'PATCH',
        body: JSON.stringify(requestBody),
      });

      const response = await PATCH(asReq(request), {
        params: Promise.resolve({ id: 'provider1' }),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('should reject baseUrl pointing to private IP on update (SSRF guard at save time)', async () => {
      const requestBody = {
        baseUrl: 'http://10.0.0.1/v1',
      };

      const request = new Request('http://localhost/api/ai/providers/provider1', {
        method: 'PATCH',
        body: JSON.stringify(requestBody),
      });

      const response = await PATCH(asReq(request), {
        params: Promise.resolve({ id: 'provider1' }),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });
  });

  describe('DELETE /api/ai/providers/[id]', () => {
    beforeEach(async () => {
      await clearTestDb(mockDb);
      await mockDb.insert(aiProviders).values([
        {
          id: 'provider1',
          name: 'Default Provider',
          provider: 'openai',
          baseUrl: null,
          apiKey: 'encrypted-key-1',
          models: JSON.stringify(['gpt-4']),
          defaultModel: 'gpt-4',
          systemPrompt: null,
          isActive: 1,
          isDefault: 1,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: 'provider2',
          name: 'Regular Provider',
          provider: 'openai',
          baseUrl: null,
          apiKey: 'encrypted-key-2',
          models: JSON.stringify(['gpt-4']),
          defaultModel: 'gpt-4',
          systemPrompt: null,
          isActive: 1,
          isDefault: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ]);
    });

    it('should require confirmation before deletion', async () => {
      const request = new Request('http://localhost/api/ai/providers/provider1', {
        method: 'DELETE',
      });

      const response = await DELETE(asReq(request), {
        params: Promise.resolve({ id: 'provider1' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.requiresConfirmation).toBe(true);
    });

    it('should delete provider after confirmation', async () => {
      const request = new Request('http://localhost/api/ai/providers/provider1?confirmed=true', {
        method: 'DELETE',
      });

      const response = await DELETE(asReq(request), {
        params: Promise.resolve({ id: 'provider1' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.deleted).toBe(true);
    });

    it('should return 404 for non-existent provider', async () => {
      const request = new Request('http://localhost/api/ai/providers/non-existent?confirmed=true', {
        method: 'DELETE',
      });

      const response = await DELETE(asReq(request), {
        params: Promise.resolve({ id: 'non-existent' }),
      });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
    });

    it('should reassign default to another active provider when deleting the default', async () => {
      // 清掉 beforeEach 的 fixture，避免干扰选哪个作新默认
      await clearTestDb(mockDb);
      // seed: 默认 provider-default + 另一个可用 provider-other
      await mockDb.insert(aiProviders).values([
        {
          id: 'provider-default',
          name: 'Default One',
          provider: 'openai',
          baseUrl: null,
          apiKey: encrypt('sk-default'),
          models: JSON.stringify(['gpt-4']),
          defaultModel: 'gpt-4',
          systemPrompt: null,
          isActive: 1,
          isDefault: 1,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: 'provider-other',
          name: 'Other One',
          provider: 'openai',
          baseUrl: null,
          apiKey: encrypt('sk-other'),
          models: JSON.stringify(['gpt-4']),
          defaultModel: 'gpt-4',
          systemPrompt: null,
          isActive: 1,
          isDefault: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ]);

      const request = new Request('http://localhost/api/ai/providers/provider-default?confirmed=true', {
        method: 'DELETE',
      });

      const response = await DELETE(asReq(request), {
        params: Promise.resolve({ id: 'provider-default' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);

      // 另一个 provider 应被设为默认
      const remaining = await mockDb.query.aiProviders.findMany({
        where: eq(aiProviders.id, 'provider-other'),
      });
      expect(remaining).toHaveLength(1);
      expect(remaining[0].isDefault).toBe(1);

      // 原 default 已删
      const deleted = await mockDb.query.aiProviders.findMany({
        where: eq(aiProviders.id, 'provider-default'),
      });
      expect(deleted).toHaveLength(0);
    });
  });

  describe('POST /api/ai/providers/[id]/test', () => {
    beforeEach(async () => {
      await clearTestDb(mockDb);
      const encryptedKey = encrypt('test-api-key');
      await mockDb.insert(aiProviders).values({
        id: 'provider1',
        name: 'Test Provider',
        provider: 'openai',
        baseUrl: null,
        apiKey: encryptedKey,
        models: JSON.stringify(['gpt-4']),
        defaultModel: 'gpt-4',
        systemPrompt: null,
        isActive: 1,
        isDefault: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    it('should test provider connection', async () => {
      const request = new Request('http://localhost/api/ai/providers/provider1/test', {
        method: 'POST',
      });

      const response = await TEST_POST(asReq(request), {
        params: Promise.resolve({ id: 'provider1' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.success).toBe(true);
      expect(data.data.model).toBe('gpt-4');
      expect(data.data.response).toBeDefined();
    });

    it('should return 404 for non-existent provider', async () => {
      const request = new Request('http://localhost/api/ai/providers/non-existent/test', {
        method: 'POST',
      });

      const response = await TEST_POST(asReq(request), {
        params: Promise.resolve({ id: 'non-existent' }),
      });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
    });

    // B4 针对性验证:rate limit(ai-test:IP 5/min)第 6 次返 429
    it('B4: 连续调用超过 5/min 限流触发 429', async () => {
      const { reset } = await import('@/lib/rate-limit');
      await reset(); // 清掉前面测试累积的限流计数

      const makeReq = () => new Request('http://localhost/api/ai/providers/provider1/test', { method: 'POST' });

      // 前 5 次应成功(或因 OpenAI mock 返回正常)
      for (let i = 0; i < 5; i++) {
        const res = await TEST_POST(asReq(makeReq()), { params: Promise.resolve({ id: 'provider1' }) });
        expect(res.status).not.toBe(429);
      }

      // 第 6 次应被限流
      const blocked = await TEST_POST(asReq(makeReq()), { params: Promise.resolve({ id: 'provider1' }) });
      expect(blocked.status).toBe(429);
      const blockedData = await blocked.json();
      expect(blockedData.success).toBe(false);

      await reset(); // 清理,避免影响后续测试
    });

    // B4 针对性验证:预算超额时拒绝调用
    it('B4: 预算超额时返回拒绝(不调用 OpenAI)', async () => {
      const { reset } = await import('@/lib/rate-limit');
      const { _resetBudgetForTest, recordAiUsage } = await import('@/lib/ai-budget');
      await reset();
      await _resetBudgetForTest();

      // 预先消耗大量 token 超过默认额度(1_000_000),触发 token_limit 超额
      await recordAiUsage(2_000_000);

      const request = new Request('http://localhost/api/ai/providers/provider1/test', { method: 'POST' });
      const response = await TEST_POST(asReq(request), { params: Promise.resolve({ id: 'provider1' }) });

      // 预算超额应被拒绝(非 200 success)
      expect(response.status).not.toBe(200);
      const data = await response.json();
      expect(data.success).toBe(false);

      await _resetBudgetForTest();
      await reset();
    });
  });

  describe('POST /api/ai/providers/[id]/default', () => {
    beforeEach(async () => {
      await clearTestDb(mockDb);
      await mockDb.insert(aiProviders).values([
        {
          id: 'provider1',
          name: 'Current Default',
          provider: 'openai',
          baseUrl: null,
          apiKey: 'encrypted-key-1',
          models: JSON.stringify(['gpt-4']),
          defaultModel: 'gpt-4',
          systemPrompt: null,
          isActive: 1,
          isDefault: 1,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: 'provider2',
          name: 'New Default',
          provider: 'openai',
          baseUrl: null,
          apiKey: 'encrypted-key-2',
          models: JSON.stringify(['gpt-4']),
          defaultModel: 'gpt-4',
          systemPrompt: null,
          isActive: 1,
          isDefault: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ]);
    });

    it('should set provider as default', async () => {
      const request = new Request('http://localhost/api/ai/providers/provider2/default', {
        method: 'POST',
      });

      const response = await DEFAULT_POST(asReq(request), {
        params: Promise.resolve({ id: 'provider2' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.isDefault).toBe(true);

      // Verify old default is no longer default
      const providers = await mockDb.select().from(aiProviders).where(eq(aiProviders.id, 'provider1'));
      expect(providers[0].isDefault).toBe(0);
    });

    it('should return 404 for non-existent provider', async () => {
      const request = new Request('http://localhost/api/ai/providers/non-existent/default', {
        method: 'POST',
      });

      const response = await DEFAULT_POST(asReq(request), {
        params: Promise.resolve({ id: 'non-existent' }),
      });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
    });
  });
});
