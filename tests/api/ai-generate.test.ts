/**
 * AI Generate API Route Tests
 * Tests for POST /api/ai/generate - AI Mock data generation
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { POST } from '@/app/api/ai/generate/route';
import { getTestDb, setupTestDb, clearTestDb } from '../setup';
import { aiProviders } from '@/lib/schema';

let mockDb: ReturnType<typeof getTestDb>;

vi.mock('@/lib/db', () => ({
  get db() {
    return mockDb;
  },
}));

// Mock OpenAI
vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{
            message: {
              content: JSON.stringify({
                code: 0,
                message: 'success',
                data: {
                  list: [
                    { id: 1, name: 'Item 1' },
                    { id: 2, name: 'Item 2' },
                  ],
                  total: 2,
                },
              }),
            },
          }],
        }),
      },
    },
  })),
}));

beforeAll(async () => {
  mockDb = await setupTestDb('ai-generate-test');
});

describe('AI Generate API', () => {
  beforeEach(async () => {
    await clearTestDb(mockDb);
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await clearTestDb(mockDb);
  });

  describe('POST /api/ai/generate', () => {
    it('should return mock data when no provider is configured', async () => {
      const requestBody = {
        prompt: 'Generate user data',
        count: 5,
      };

      const request = new Request('http://localhost/api/ai/generate', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      const response = await POST(request as any);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.code).toBe(0);
      expect(data.data.data.list).toBeDefined();
      expect(data.data.data.total).toBeGreaterThan(0);
    });

    it('should use specified provider', async () => {
      // Create a test provider
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

      const requestBody = {
        prompt: 'Generate user data',
        count: 5,
        providerId: 'provider1',
      };

      const request = new Request('http://localhost/api/ai/generate', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      const response = await POST(request as any);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toBeDefined();
    });

    it('should validate prompt is required', async () => {
      const requestBody = {
        count: 5,
      };

      const request = new Request('http://localhost/api/ai/generate', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      const response = await POST(request as any);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('should validate count range', async () => {
      const requestBody = {
        prompt: 'Generate data',
        count: 200,
      };

      const request = new Request('http://localhost/api/ai/generate', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      const response = await POST(request as any);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('should use default count if not specified', async () => {
      const requestBody = {
        prompt: 'Generate user data',
      };

      const request = new Request('http://localhost/api/ai/generate', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      const response = await POST(request as any);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('should handle invalid JSON body', async () => {
      const request = new Request('http://localhost/api/ai/generate', {
        method: 'POST',
        body: 'invalid json',
      });

      const response = await POST(request as any);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
    });
  });
});
