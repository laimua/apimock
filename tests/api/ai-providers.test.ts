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
        // 用公网 IP 字面量而非域名,避免依赖 live DNS(P2-27 补 198.18.0.0/15 后,
        // 本机被污染的 DNS 把 api.openai.com 解析到 198.18.0.7 会被正确拦截)。
        // IP 字面量绕过 dns.lookup,SSRF 校验直接走 isPrivateIPv4 公网放行。
        baseUrl: 'https://1.1.1.1/v1',
        systemPrompt: 'You are a helpful assistant',
      };

      const request = new Request('http://localhost/api/ai/providers', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      const response = await POST(asReq(request));
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.data.baseUrl).toBe('https://1.1.1.1/v1');
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

    // ============================================
    // P2-1: 清其它默认 + insert 包事务 + isDefault 从校验字段读
    // ============================================
    it('P2-1: POST isDefault=true 时清掉旧默认(provider 表至多一个默认)', async () => {
      // seed 一个已存在的默认 provider
      await mockDb.insert(aiProviders).values({
        id: 'old-default',
        name: 'Old Default', provider: 'openai', baseUrl: null,
        apiKey: 'enc', models: JSON.stringify(['gpt-4']), defaultModel: 'gpt-4',
        systemPrompt: null, isActive: 1, isDefault: 1,
        createdAt: Date.now(), updatedAt: Date.now(),
      });

      const request = new Request('http://localhost/api/ai/providers', {
        method: 'POST',
        body: JSON.stringify({
          name: 'New Default', provider: 'openai', apiKey: 'sk-x',
          models: ['gpt-4'], defaultModel: 'gpt-4', isDefault: true,
        }),
      });
      const response = await POST(asReq(request));
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.data.isDefault).toBe(true);

      // 旧默认应被清零(整表只有一个 isDefault=1)
      const all = await mockDb.select().from(aiProviders);
      const defaults = all.filter((p) => p.isDefault === 1);
      expect(defaults).toHaveLength(1);
      expect(defaults[0].id).toBe(data.data.id);
    });

    it('P2-1: POST insert 抛错时不清掉旧默认(事务保证,不半成功)', async () => {
      await mockDb.insert(aiProviders).values({
        id: 'keep-default',
        name: 'Keep Default', provider: 'openai', baseUrl: null,
        apiKey: 'enc', models: JSON.stringify(['gpt-4']), defaultModel: 'gpt-4',
        systemPrompt: null, isActive: 1, isDefault: 1,
        createdAt: Date.now(), updatedAt: Date.now(),
      });

      // spyOn mockDb.insert 抛错,模拟 SQL 失败(中途崩溃)。
      // 事务封装意味着路由整体失败返 500,不留下"清了旧默认但没插入新行"的零默认态。
      const insertSpy = vi.spyOn(mockDb, 'insert').mockImplementation(() => {
        throw new Error('simulated insert failure');
      });

      try {
        const request = new Request('http://localhost/api/ai/providers', {
          method: 'POST',
          body: JSON.stringify({
            name: 'New Default', provider: 'openai', apiKey: 'sk-x',
            models: ['gpt-4'], defaultModel: 'gpt-4', isDefault: true,
          }),
        });
        const response = await POST(asReq(request));
        expect(response.status).toBe(500);
      } finally {
        insertSpy.mockRestore();
      }
    });

    // P2-1: isDefault 字段经 zod 校验(布尔)。客户端传非布尔会被 zod 拒绝(strip 默认),
    // 不能用任意 truthy 字符串/数字绕过 schema 边界。zod 默认 strip 未声明字段,
    // 这里验证传非法 isDefault="yes"(字符串)被 coerce 为非布尔后仍按 schema 行为处理。
    it('P2-1: isDefault 非法类型(字符串)被 zod 校验拒绝,不绕过默认逻辑', async () => {
      const request = new Request('http://localhost/api/ai/providers', {
        method: 'POST',
        body: JSON.stringify({
          name: 'X', provider: 'openai', apiKey: 'sk-x',
          models: ['gpt-4'], defaultModel: 'gpt-4',
          isDefault: 'not-a-bool', // 非法
        }),
      });
      const response = await POST(asReq(request));
      const data = await response.json();

      // zod 对 isDefault: z.boolean().optional() 收到字符串应报 400 校验失败
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

    // B4 针对性验证:停用默认 provider 时同步清 isDefault(防死状态)
    it('B4: 停用 isDefault=1 的 provider 时同步清除默认标记', async () => {
      // 先把 provider1 设为默认
      await mockDb.update(aiProviders).set({ isDefault: 1 }).where(eq(aiProviders.id, 'provider1'));

      const request = new Request('http://localhost/api/ai/providers/provider1', {
        method: 'PATCH',
        body: JSON.stringify({ isActive: false }),
      });
      const response = await PATCH(asReq(request), {
        params: Promise.resolve({ id: 'provider1' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.isActive).toBe(false);
      // 关键:isDefault 应被同步清为 false(原为 true)
      expect(data.data.isDefault).toBe(false);
    });

    // B6 针对性验证:改 models 但现有 defaultModel 仍在列表内→保留不覆盖
    it('B6: 改 models 但 defaultModel 仍在列表内时保留不重置', async () => {
      // provider1 默认 models=['gpt-4'], defaultModel='gpt-4'
      // 改 models 加入新模型但保留 gpt-4,defaultModel 应仍是 gpt-4
      const request = new Request('http://localhost/api/ai/providers/provider1', {
        method: 'PATCH',
        body: JSON.stringify({ models: ['gpt-4', 'gpt-4o', 'gpt-4-turbo'] }),
      });
      const response = await PATCH(asReq(request), {
        params: Promise.resolve({ id: 'provider1' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      // gpt-4 仍在列表内,defaultModel 不应被重置为 models[0]
      expect(data.data.defaultModel).toBe('gpt-4');
    });

    // B6 补充:改 models 且 defaultModel 不在新列表内→重置为 models[0]
    it('B6: 改 models 且 defaultModel 不在列表内时重置为 models[0]', async () => {
      const request = new Request('http://localhost/api/ai/providers/provider1', {
        method: 'PATCH',
        body: JSON.stringify({ models: ['claude-3', 'claude-3-opus'] }),
      });
      const response = await PATCH(asReq(request), {
        params: Promise.resolve({ id: 'provider1' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      // gpt-4 不在新列表,defaultModel 应重置为 models[0]='claude-3'
      expect(data.data.defaultModel).toBe('claude-3');
    });

    // B2 针对性验证:单独传 defaultModel(不传 models)时,若不在现有 models 内返 400
    it('B2: 单独传 defaultModel 不在现有 models 内时返 400', async () => {
      // provider1 现有 models=['gpt-4'], defaultModel='gpt-4'
      const request = new Request('http://localhost/api/ai/providers/provider1', {
        method: 'PATCH',
        body: JSON.stringify({ defaultModel: 'nonexistent-model' }),
      });
      const response = await PATCH(asReq(request), {
        params: Promise.resolve({ id: 'provider1' }),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    // B2 补充:单独传 defaultModel 在现有 models 内时正常通过
    it('B2: 单独传 defaultModel 在现有 models 内时正常更新', async () => {
      // 现有 models=['gpt-4'],传 defaultModel='gpt-4' 应通过
      const request = new Request('http://localhost/api/ai/providers/provider1', {
        method: 'PATCH',
        body: JSON.stringify({ defaultModel: 'gpt-4' }),
      });
      const response = await PATCH(asReq(request), {
        params: Promise.resolve({ id: 'provider1' }),
      });

      expect(response.status).toBe(200);
    });

    // P2-22: existing.models 为脏 JSON 时,单独传 defaultModel 不应 500,降级为 []
    // → defaultModel 不在 [] 内 → 返明确 BAD_REQUEST 400。
    it('P2-22: existing.models 脏 JSON + 单独传 defaultModel → 400 非 500', async () => {
      // 用脏 JSON 覆盖 provider1.models
      await mockDb
        .update(aiProviders)
        .set({ models: 'not-json' })
        .where(eq(aiProviders.id, 'provider1'));

      const request = new Request('http://localhost/api/ai/providers/provider1', {
        method: 'PATCH',
        body: JSON.stringify({ defaultModel: 'gpt-4' }),
      });
      const response = await PATCH(asReq(request), {
        params: Promise.resolve({ id: 'provider1' }),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('BAD_REQUEST');
      expect(data.error.message).toContain('defaultModel must be in the models list');
    });

    // P2-22 回归:正常 PATCH(改 name)时,即便返回序列化读 models 也不应因脏 JSON 500,
    // 降级为空数组返回成功。
    it('P2-22 回归: existing.models 脏 JSON + 改 name → 200,models 降级为 []', async () => {
      await mockDb
        .update(aiProviders)
        .set({ models: 'not-json' })
        .where(eq(aiProviders.id, 'provider1'));

      const request = new Request('http://localhost/api/ai/providers/provider1', {
        method: 'PATCH',
        body: JSON.stringify({ name: 'New Name' }),
      });
      const response = await PATCH(asReq(request), {
        params: Promise.resolve({ id: 'provider1' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('New Name');
      expect(data.data.models).toEqual([]);
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

    // B5 针对性验证:删默认 provider 后,多候选时选最早创建的为默认(orderBy 确定性)
    it('B5: 删默认 provider 后,多个 active 候选中选最早创建的为默认', async () => {
      // 清空并重建:一个默认 + 两个不同 createdAt 的候选
      await clearTestDb(mockDb);
      await mockDb.insert(aiProviders).values([
        {
          id: 'def', name: 'Default', provider: 'openai', baseUrl: null,
          apiKey: 'k1', models: JSON.stringify(['m']), defaultModel: 'm',
          systemPrompt: null, isActive: 1, isDefault: 1,
          createdAt: 1000, updatedAt: 1000,
        },
        {
          id: 'newer', name: 'Newer', provider: 'openai', baseUrl: null,
          apiKey: 'k2', models: JSON.stringify(['m']), defaultModel: 'm',
          systemPrompt: null, isActive: 1, isDefault: 0,
          createdAt: 3000, updatedAt: 3000,
        },
        {
          id: 'older', name: 'Older', provider: 'openai', baseUrl: null,
          apiKey: 'k3', models: JSON.stringify(['m']), defaultModel: 'm',
          systemPrompt: null, isActive: 1, isDefault: 0,
          createdAt: 2000, updatedAt: 2000,
        },
      ]);

      // 删默认 def,应提 older(createdAt=2000,比 newer=3000 早)为默认
      const request = new Request('http://localhost/api/ai/providers/def?confirmed=true', {
        method: 'DELETE',
      });
      const response = await DELETE(asReq(request), {
        params: Promise.resolve({ id: 'def' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.deleted).toBe(true);

      // 验证 older(最早创建)被设为默认,而非 newer
      const providers = await mockDb.select().from(aiProviders);
      const newDefault = providers.find((p) => p.isDefault === 1);
      expect(newDefault?.id).toBe('older');
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

    // ============================================
    // P2-3: 提升其它 provider 为默认 + 删除 包事务
    // ============================================
    it('P2-3: 删默认 provider 后,新默认已提上且无双默认(整表恰一个 isDefault=1)', async () => {
      await clearTestDb(mockDb);
      await mockDb.insert(aiProviders).values([
        {
          id: 'def', name: 'Default', provider: 'openai', baseUrl: null,
          apiKey: 'k1', models: JSON.stringify(['m']), defaultModel: 'm',
          systemPrompt: null, isActive: 1, isDefault: 1,
          createdAt: 1000, updatedAt: 1000,
        },
        {
          id: 'other', name: 'Other', provider: 'openai', baseUrl: null,
          apiKey: 'k2', models: JSON.stringify(['m']), defaultModel: 'm',
          systemPrompt: null, isActive: 1, isDefault: 0,
          createdAt: 2000, updatedAt: 2000,
        },
      ]);

      const request = new Request('http://localhost/api/ai/providers/def?confirmed=true', {
        method: 'DELETE',
      });
      const response = await DELETE(asReq(request), {
        params: Promise.resolve({ id: 'def' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.deleted).toBe(true);

      // 整表恰有一个默认(other),无双默认
      const all = await mockDb.select().from(aiProviders);
      const defaults = all.filter((p) => p.isDefault === 1);
      expect(defaults).toHaveLength(1);
      expect(defaults[0].id).toBe('other');
      // 原 default 已删
      expect(all.find((p) => p.id === 'def')).toBeUndefined();
    });

    it('P2-3: 删默认 provider 时 delete 步抛错返 500(事务保证整体失败)', async () => {
      await clearTestDb(mockDb);
      await mockDb.insert(aiProviders).values([
        {
          id: 'def', name: 'Default', provider: 'openai', baseUrl: null,
          apiKey: 'k1', models: JSON.stringify(['m']), defaultModel: 'm',
          systemPrompt: null, isActive: 1, isDefault: 1,
          createdAt: 1000, updatedAt: 1000,
        },
        {
          id: 'other', name: 'Other', provider: 'openai', baseUrl: null,
          apiKey: 'k2', models: JSON.stringify(['m']), defaultModel: 'm',
          systemPrompt: null, isActive: 1, isDefault: 0,
          createdAt: 2000, updatedAt: 2000,
        },
      ]);

      // spyOn mockDb.delete 抛错,模拟"提升其它为默认后,删除失败"。
      // 事务封装使整体失败返 500,不留下"已提 other 为默认但 def 未删"的双默认态。
      const deleteSpy = vi.spyOn(mockDb, 'delete').mockImplementation(() => {
        throw new Error('simulated delete failure');
      });

      try {
        const request = new Request('http://localhost/api/ai/providers/def?confirmed=true', {
          method: 'DELETE',
        });
        const response = await DELETE(asReq(request), {
          params: Promise.resolve({ id: 'def' }),
        });
        expect(response.status).toBe(500);
      } finally {
        deleteSpy.mockRestore();
      }
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
      // 错误形状契约:error 是对象,含 code/message(P1-11 前置:服务端形状统一)
      expect(typeof blockedData.error).toBe('object');
      expect(blockedData.error.code).toBe('RATE_LIMITED');
      expect(typeof blockedData.error.message).toBe('string');

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

    // P2-23: models 脏 JSON 降级为 [] + defaultModel 为空/null → modelToTest undefined
    // 时,不应发给 OpenAI(上游不友好的 400),应前置返明确 BAD_REQUEST 400。
    it('P2-23: models 脏 JSON + defaultModel 为空 → 400 明确错,不发 OpenAI', async () => {
      const { reset } = await import('@/lib/rate-limit');
      await reset();

      // 覆盖:models 为脏 JSON,defaultModel 设为空字符串(JSON.parse 失败降级 [],
      // defaultModel || undefined)
      await mockDb
        .update(aiProviders)
        .set({ models: 'not-json', defaultModel: '' })
        .where(eq(aiProviders.id, 'provider1'));

      const request = new Request('http://localhost/api/ai/providers/provider1/test', {
        method: 'POST',
      });
      const response = await TEST_POST(asReq(request), {
        params: Promise.resolve({ id: 'provider1' }),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('BAD_REQUEST');
      expect(data.error.message).toMatch(/no model configured|models/i);

      await reset();
    });

    // P2-23 回归:正常 models + defaultModel 仍走 OpenAI 调用,返回 200(已在
    // 'should test provider connection' 覆盖,此处补一个 models 非空但 defaultModel
    // 为空、用 models[0] 兜底的回归)。
    it('P2-23 回归: defaultModel 为空但 models 非空 → 用 models[0] 成功 200', async () => {
      const { reset } = await import('@/lib/rate-limit');
      await reset();

      await mockDb
        .update(aiProviders)
        .set({ defaultModel: '' })
        .where(eq(aiProviders.id, 'provider1'));

      const request = new Request('http://localhost/api/ai/providers/provider1/test', {
        method: 'POST',
      });
      const response = await TEST_POST(asReq(request), {
        params: Promise.resolve({ id: 'provider1' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.model).toBe('gpt-4');

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

    // ============================================
    // P2-2: clear-all + set-one 包事务(中途失败不留零默认)
    // ============================================
    it('P2-2: set default 成功后整表只有一个 isDefault=1', async () => {
      // 初始:provider1 是默认,provider2 非默认
      const request = new Request('http://localhost/api/ai/providers/provider2/default', {
        method: 'POST',
      });
      const response = await DEFAULT_POST(asReq(request), {
        params: Promise.resolve({ id: 'provider2' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.isDefault).toBe(true);

      // 整表恰有一个默认(provider2),provider1 已清零
      const all = await mockDb.select().from(aiProviders);
      const defaults = all.filter((p) => p.isDefault === 1);
      expect(defaults).toHaveLength(1);
      expect(defaults[0].id).toBe('provider2');
    });

    it('P2-2: set default 第二步抛错时返 500(事务保证整体失败)', async () => {
      // 初始 provider1 是默认。spy 第二次 update(即 set-one 步)抛错,
      // 模拟 clear-all 后 set-one 前崩溃。事务封装使整体失败,不留半成功态。
      const realUpdate = mockDb.update.bind(mockDb);
      let callCount = 0;
      const updateSpy = vi.spyOn(mockDb, 'update').mockImplementation(((...args: unknown[]) => {
        callCount++;
        // 第二次 update(set-one)抛错
        if (callCount >= 2) {
          throw new Error('simulated set-one failure');
        }
        // 第一次 update(clear-all):走真实实现
        return (realUpdate as (...a: unknown[]) => unknown)(...args);
      }) as never);

      try {
        const request = new Request('http://localhost/api/ai/providers/provider2/default', {
          method: 'POST',
        });
        const response = await DEFAULT_POST(asReq(request), {
          params: Promise.resolve({ id: 'provider2' }),
        });
        expect(response.status).toBe(500);
      } finally {
        updateSpy.mockRestore();
      }
    });
  });
});
