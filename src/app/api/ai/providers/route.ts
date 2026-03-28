/**
 * AI Providers API
 * GET /api/ai/providers - 获取所有已配置的 Provider
 * POST /api/ai/providers - 添加新 Provider
 */

import { NextRequest, NextResponse } from 'next/server';
import { success, error, validate, Errors, ValidationError } from '@/lib/api';
import { z } from 'zod';
import { db } from '@/lib/db';
import { aiProviders } from '@/lib/schema';
import { eq, desc } from 'drizzle-orm';
import { encrypt } from '@/lib/encryption';
import { nanoid } from 'nanoid';

// ============================================
// Schema
// ============================================
const CreateProviderSchema = z.object({
  name: z.string().min(1).max(100),
  provider: z.enum(['openai', 'anthropic', 'openai-compatible']),
  baseUrl: z.string().url().optional(),
  apiKey: z.string().min(1),
  models: z.array(z.string()).min(1),
  defaultModel: z.string().min(1),
  systemPrompt: z.string().optional(),
});

// ============================================
// GET /api/ai/providers
// ============================================
export async function GET(request: NextRequest) {
  try {
    const providers = await db.query.aiProviders.findMany({
      orderBy: [desc(aiProviders.isDefault), desc(aiProviders.createdAt)],
    });

    // 不返回 apiKey
    const safeProviders = providers.map((p) => ({
      id: p.id,
      name: p.name,
      provider: p.provider,
      baseUrl: p.baseUrl,
      models: JSON.parse(p.models),
      defaultModel: p.defaultModel,
      systemPrompt: p.systemPrompt,
      isActive: p.isActive === 1,
      isDefault: p.isDefault === 1,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));

    return success(safeProviders);
  } catch (err: any) {
    console.error('Error fetching providers:', err);
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

    // 验证 defaultModel 在 models 列表中
    if (!data.models.includes(data.defaultModel)) {
      return error(
        'INVALID_DEFAULT_MODEL',
        'defaultModel must be in the models list',
        400
      );
    }

    // 如果设置为默认，先将其他 provider 的 isDefault 设为 0
    const now = Date.now();
    let isDefault = false;

    // 检查是否是第一个 provider
    const existingCount = await db
      .select({ count: aiProviders.id })
      .from(aiProviders);

    if (existingCount.length === 0) {
      isDefault = true;
    }

    // 如果指定要设为默认，先更新其他 provider
    if (body.isDefault) {
      await db
        .update(aiProviders)
        .set({ isDefault: 0, updatedAt: now })
        .where(eq(aiProviders.isDefault, 1));
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

    await db.insert(aiProviders).values(provider);

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
  } catch (err: any) {
    if (err instanceof ValidationError) {
      return Errors.validation(err.issues);
    }

    console.error('Error creating provider:', err);
    return Errors.internal('Failed to create provider');
  }
}
