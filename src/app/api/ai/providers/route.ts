/**
 * AI Providers API
 * GET /api/ai/providers - 获取所有已配置的 Provider
 * POST /api/ai/providers - 添加新 Provider
 */

import { NextRequest } from 'next/server';
import { success, error, validate, Errors, ValidationError } from '@/lib/api';
import { z } from 'zod';
import { db } from '@/lib/db';
import { aiProviders } from '@/lib/schema';
import { eq, desc } from 'drizzle-orm';
import { encrypt } from '@/lib/encryption';
import { validateUrlSafe } from '@/lib/ssrf';
import { nanoid } from 'nanoid';
import { runInTransaction } from '@/lib/db-transaction';
import { logger } from '@/lib/logger';

// ============================================
// Schema
// ============================================
// P2-1: isDefault 加入 schema 显式校验(原代码读未校验的 body.isDefault,
// 客户端可传任意 truthy 值绕过 zod 边界)。默认 false(保持向后兼容:
// 第一个 provider 的"自动默认"逻辑仍在下面显式处理)。
const CreateProviderSchema = z.object({
  name: z.string().min(1).max(100),
  provider: z.enum(['openai', 'anthropic', 'openai-compatible']),
  baseUrl: z.string().url().optional(),
  apiKey: z.string().min(1).max(500),
  models: z.array(z.string()).min(1),
  defaultModel: z.string().min(1),
  systemPrompt: z.string().optional(),
  isDefault: z.boolean().optional(),
});

// ============================================
// GET /api/ai/providers
// ============================================
export async function GET(_request: NextRequest) {
  try {
    const providers = await db.query.aiProviders.findMany({
      orderBy: [desc(aiProviders.isDefault), desc(aiProviders.createdAt)],
    });

    // 不返回 apiKey
    const safeProviders = providers.map((p) => {
      // A14:safe parse models,坏数据返空数组而非让整个列表 500
      let models: string[] = [];
      try { models = JSON.parse(p.models); } catch { /* 坏数据返空 */ }
      return {
      id: p.id,
      name: p.name,
      provider: p.provider,
      baseUrl: p.baseUrl,
      models,
      defaultModel: p.defaultModel,
      systemPrompt: p.systemPrompt,
      isActive: p.isActive === 1,
      isDefault: p.isDefault === 1,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      };
    });

    return success(safeProviders);
  } catch (err: unknown) {
    logger.error({ err }, 'Failed to fetch providers');
    return Errors.internal('Failed to fetch providers');
  }
}

// ============================================
// POST /api/ai/providers
// ============================================
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = validate(CreateProviderSchema, body);

    // SSRF 校验：保存时即拦截私有/内网 baseUrl，避免恶意 provider 入库
    if (data.baseUrl) {
      const check = await validateUrlSafe(data.baseUrl);
      if (!check.safe) {
        return error('INVALID_BASE_URL', `Base URL rejected: ${check.reason}`, 400);
      }
    }

    // 验证 defaultModel 在 models 列表中
    if (!data.models.includes(data.defaultModel)) {
      return error(
        'INVALID_DEFAULT_MODEL',
        'defaultModel must be in the models list',
        400
      );
    }

    // P2-1: isDefault 从校验过的 data 读(原代码读未校验的 body.isDefault)。
    const now = Date.now();
    let isDefault = false;

    // 检查是否是第一个 provider
    const existingCount = await db
      .select({ count: aiProviders.id })
      .from(aiProviders);

    if (existingCount.length === 0) {
      isDefault = true;
    }

    // 如果指定要设为默认(显式 isDefault=true),覆盖上面的自动默认逻辑
    if (data.isDefault) {
      isDefault = true;
    }

    // 加密 API Key
    const encryptedApiKey = encrypt(data.apiKey);

    // 创建 provider
    const id = nanoid();
    const provider = {
      id,
      name: data.name,
      provider: data.provider,
      baseUrl: data.baseUrl || null,
      apiKey: encryptedApiKey,
      models: JSON.stringify(data.models),
      defaultModel: data.defaultModel,
      systemPrompt: data.systemPrompt || null,
      isActive: 1,
      isDefault: isDefault ? 1 : 0,
      createdAt: now,
      updatedAt: now,
    };

    // P2-1:"清其它默认 + insert"包事务(runInTransaction,双栈封装)。
    // 防并发创建留下双默认:两步原子执行,任一步失败整体回滚。
    await runInTransaction(
      (tx) => {
        if (isDefault) {
          tx.update(aiProviders)
            .set({ isDefault: 0, updatedAt: now })
            .where(eq(aiProviders.isDefault, 1))
            .run();
        }
        tx.insert(aiProviders).values(provider).run();
      },
      async (tx) => {
        if (isDefault) {
          await tx
            .update(aiProviders)
            .set({ isDefault: 0, updatedAt: now })
            .where(eq(aiProviders.isDefault, 1));
        }
        await tx.insert(aiProviders).values(provider);
      },
    );

    // 返回创建的 provider（不含 apiKey）
    const safeProvider = {
      id: provider.id,
      name: provider.name,
      provider: provider.provider,
      baseUrl: provider.baseUrl,
      models: data.models,
      defaultModel: provider.defaultModel,
      systemPrompt: provider.systemPrompt,
      isActive: provider.isActive === 1,
      isDefault: provider.isDefault === 1,
      createdAt: provider.createdAt,
      updatedAt: provider.updatedAt,
    };

    return success(safeProvider, 201);
  } catch (err: unknown) {
    if (err instanceof ValidationError) {
      return Errors.validation(err.issues);
    }

    logger.error({ err }, 'Failed to create provider');
    return Errors.internal('Failed to create provider');
  }
}
