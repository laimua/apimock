/**
 * AI Generate API Route Tests
 * Tests for POST /api/ai/generate - AI Mock data generation
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { type NextRequest } from 'next/server';
import { POST } from '@/app/api/ai/generate/route';
import { getTestDb, setupTestDb, clearTestDb } from '../setup';
import { aiProviders } from '@/lib/schema';

const asReq = (r: Request): NextRequest => r as unknown as NextRequest;

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

      const response = await POST(asReq(request));
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

      const response = await POST(asReq(request));
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

      const response = await POST(asReq(request));
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

      const response = await POST(asReq(request));
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

      const response = await POST(asReq(request));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('should handle invalid JSON body', async () => {
      const request = new Request('http://localhost/api/ai/generate', {
        method: 'POST',
        body: 'invalid json',
      });

      const response = await POST(asReq(request));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
    });

    // P1-11 前置:429 限流响应的 error 必须是对象形状(含 code/message),不能是字符串
    it('rate-limited response returns error as object with code/message', async () => {
      const { reset } = await import('@/lib/rate-limit');
      await reset(); // 清掉前面测试累积的限流计数

      const makeReq = () =>
        new Request('http://localhost/api/ai/generate', {
          method: 'POST',
          body: JSON.stringify({ prompt: 'Generate user data' }),
        });

      // 限流 10/min/IP,连发 10 次把额度用完
      for (let i = 0; i < 10; i++) {
        const res = await POST(asReq(makeReq()));
        expect(res.status).not.toBe(429);
      }

      // 第 11 次应被限流
      const blocked = await POST(asReq(makeReq()));
      expect(blocked.status).toBe(429);
      const blockedData = await blocked.json();
      expect(blockedData.success).toBe(false);
      // 错误形状契约:error 是对象,含 code/message
      expect(typeof blockedData.error).toBe('object');
      expect(blockedData.error.code).toBe('RATE_LIMITED');
      expect(typeof blockedData.error.message).toBe('string');

      await reset();
    });
  });
});
