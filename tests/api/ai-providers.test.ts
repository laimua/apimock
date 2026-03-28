/**
 * AI Providers API Route Tests
 * Tests for CRUD operations on AI providers
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { GET, POST } from '@/app/api/ai/providers/route';
import { PATCH, DELETE } from '@/app/api/ai/providers/[id]/route';
import { POST as TEST_POST } from '@/app/api/ai/providers/[id]/test/route';
import { POST as DEFAULT_POST } from '@/app/api/ai/providers/[id]/default/route';
import { getTestDb, setupTestDb, clearTestDb } from '../setup';
import { aiProviders } from '@/lib/schema';
import { eq } from 'drizzle-orm';

let mockDb: ReturnType<typeof getTestDb>;

vi.mock('@/lib/db', () => ({
  get db() {
    return mockDb;
  },
}));

// Mock OpenAI for testing
vi.mock('openai', () => ({
  default: class {
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
      const response = await GET(request as any);
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
      const response = await GET(request as any);
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
      const response = await GET(request as any);
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

      const response = await POST(request as any);
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

      const response = await POST(request as any);
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

      const response = await POST(request as any);
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

      const response = await POST(request as any);
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

      const response = await POST(request as any);
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

      const response = await PATCH(request as any, {
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

      const response = await PATCH(request as any, {
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

      const response = await PATCH(request as any, {
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

      const response = await DELETE(request as any, {
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

      const response = await DELETE(request as any, {
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

      const response = await DELETE(request as any, {
        params: Promise.resolve({ id: 'non-existent' }),
      });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
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

      const response = await TEST_POST(request as any, {
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

      const response = await TEST_POST(request as any, {
        params: Promise.resolve({ id: 'non-existent' }),
      });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
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

      const response = await DEFAULT_POST(request as any, {
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

      const response = await DEFAULT_POST(request as any, {
        params: Promise.resolve({ id: 'non-existent' }),
      });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
    });
  });
});
