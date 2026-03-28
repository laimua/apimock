/**
 * Single Provider API
 * PATCH /api/ai/providers/[id] - 更新 Provider
 * DELETE /api/ai/providers/[id] - 删除 Provider
 */

import { NextRequest } from 'next/server';
import { success, Errors, validate, ValidationError } from '@/lib/api';
import { z } from 'zod';
import { db } from '@/lib/db';
import { aiProviders } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { encrypt } from '@/lib/encryption';

// ============================================
// Schema
// ============================================
const UpdateProviderSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  baseUrl: z.string().url().optional(),
  apiKey: z.string().min(1).optional(),
  models: z.array(z.string()).min(1).optional(),
  defaultModel: z.string().min(1).optional(),
  systemPrompt: z.string().optional(),
  isActive: z.boolean().optional(),
}).refine(
  (data) => {
    // 如果同时提供 models 和 defaultModel，验证 defaultModel 在 models 中
    if (data.models && data.defaultModel && !data.models.includes(data.defaultModel)) {
      return false;
    }
    return true;
  },
  {
    message: 'defaultModel must be in the models list',
  }
);

// ============================================
// PATCH /api/ai/providers/[id]
// ============================================
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const data = validate(UpdateProviderSchema, body);

    // 检查 provider 是否存在
    const existing = await db.query.aiProviders.findFirst({
      where: eq(aiProviders.id, id),
    });

    if (!existing) {
      return Errors.notFound('Provider');
    }

    const now = Date.now();
    const updates: any = {
      updatedAt: now,
    };

    // 更新字段
    if (data.name !== undefined) updates.name = data.name;
    if (data.baseUrl !== undefined) updates.baseUrl = data.baseUrl;
    if (data.apiKey !== undefined) updates.apiKey = encrypt(data.apiKey);
    if (data.models !== undefined) updates.models = JSON.stringify(data.models);
    if (data.defaultModel !== undefined) updates.defaultModel = data.defaultModel;
    if (data.systemPrompt !== undefined) updates.systemPrompt = data.systemPrompt;
    if (data.isActive !== undefined) updates.isActive = data.isActive ? 1 : 0;

    // 如果只提供 models 但没有 defaultModel，使用 models[0]
    if (data.models && !data.defaultModel) {
      updates.defaultModel = data.models[0];
    }

    // 更新数据库
    await db.update(aiProviders).set(updates).where(eq(aiProviders.id, id));

    // 返回更新后的 provider（不含 apiKey）
    const updated = await db.query.aiProviders.findFirst({
      where: eq(aiProviders.id, id),
    });

    if (!updated) {
      return Errors.internal('Failed to update provider');
    }

    const safeProvider = {
      id: updated.id,
      name: updated.name,
      provider: updated.provider,
      baseUrl: updated.baseUrl,
      models: JSON.parse(updated.models),
      defaultModel: updated.defaultModel,
      systemPrompt: updated.systemPrompt,
      isActive: updated.isActive === 1,
      isDefault: updated.isDefault === 1,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };

    return success(safeProvider);
  } catch (err: any) {
    if (err instanceof ValidationError) {
      return Errors.validation(err.issues);
    }

    console.error('Error updating provider:', err);
    return Errors.internal('Failed to update provider');
  }
}

// ============================================
// DELETE /api/ai/providers/[id]
// ============================================
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // 检查 provider 是否存在
    const existing = await db.query.aiProviders.findFirst({
      where: eq(aiProviders.id, id),
    });

    if (!existing) {
      return Errors.notFound('Provider');
    }

    // 检查确认参数
    const url = new URL(request.url);
    const confirmed = url.searchParams.get('confirmed') === 'true';

    if (!confirmed) {
      return success(
        {
          requiresConfirmation: true,
          message: 'This action cannot be undone. Please confirm with ?confirmed=true',
        },
        200
      );
    }

    // 如果删除的是默认 provider，需要将其他 provider 设为默认
    if (existing.isDefault === 1) {
      // 找一个可用的 provider 设为默认
      const otherProviders = await db.query.aiProviders.findMany({
        where: eq(aiProviders.id, id),
      });

      if (otherProviders.length > 0) {
        await db
          .update(aiProviders)
          .set({ isDefault: 1, updatedAt: Date.now() })
          .where(eq(aiProviders.id, otherProviders[0].id));
      }
    }

    // 删除 provider
    await db.delete(aiProviders).where(eq(aiProviders.id, id));

    return success({ id, deleted: true });
  } catch (err: any) {
    console.error('Error deleting provider:', err);
    return Errors.internal('Failed to delete provider');
  }
}
