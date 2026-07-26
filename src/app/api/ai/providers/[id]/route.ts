/**
 * Single Provider API
 * PATCH /api/ai/providers/[id] - 更新 Provider
 * DELETE /api/ai/providers/[id] - 删除 Provider
 */

import { NextRequest } from 'next/server';
import { success, Errors, validate, ValidationError, error } from '@/lib/api';
import { z } from 'zod';
import { db } from '@/lib/db';
import { aiProviders } from '@/lib/schema';
import { eq, ne, and, asc } from 'drizzle-orm';
import { encrypt } from '@/lib/encryption';
import { validateUrlSafe } from '@/lib/ssrf';

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

    // SSRF 校验：更新 baseUrl 时即拦截私有/内网地址（与 POST 保存路径一致）
    if (data.baseUrl) {
      const check = await validateUrlSafe(data.baseUrl);
      if (!check.safe) {
        return error('INVALID_BASE_URL', `Base URL rejected: ${check.reason}`, 400);
      }
    }

    // 单独传 defaultModel（不带 models）时校验是否在现有 models 列表内（A10）。
    // 同时传 models 和 defaultModel 的情形已由 schema refine 覆盖。
    // P2-22: existing.models 可能为脏 JSON（历史数据/A18 修复遗漏点），裸 JSON.parse
    // 会让 PATCH 整个 500。降级为空数组使校验自然失败（defaultModel 不在 [] 内），
    // 返回明确的 BAD_REQUEST 而非 500。
    if (data.defaultModel && !data.models) {
      let existingModels: string[] = [];
      try {
        existingModels = JSON.parse(existing.models) as string[];
      } catch {
        existingModels = [];
      }
      if (!existingModels.includes(data.defaultModel)) {
        return Errors.badRequest('defaultModel must be in the models list');
      }
    }

    const now = Date.now();
    const updates: Partial<typeof aiProviders.$inferInsert> = {
      updatedAt: now,
    };

    // 更新字段
    if (data.name !== undefined) updates.name = data.name;
    if (data.baseUrl !== undefined) updates.baseUrl = data.baseUrl;
    if (data.apiKey !== undefined) updates.apiKey = encrypt(data.apiKey);
    if (data.models !== undefined) updates.models = JSON.stringify(data.models);
    if (data.defaultModel !== undefined) updates.defaultModel = data.defaultModel;
    if (data.systemPrompt !== undefined) updates.systemPrompt = data.systemPrompt;
    if (data.isActive !== undefined) {
      updates.isActive = data.isActive ? 1 : 0;
      // 停用 provider 时同步清除默认标记：generate 路由会跳过 isActive≠1 的
      // provider，不清默认会留下"配了默认却不可用"的死状态。
      // 注意：此处只清当前 provider 的默认，不自动转移给其它 active provider，
      // 需用户手动重设默认（最小改动，避免隐式改写其它 provider 状态）。
      if (!data.isActive) {
        updates.isDefault = 0;
      }
    }

    // 只提供 models 但未给 defaultModel：仅当现有 defaultModel 不在新 models 列表内
    // 时才重置为 models[0]。若用户原默认仍在新列表内则保留，避免静默覆盖。
    if (data.models && !data.defaultModel) {
      const currentDefault = existing.defaultModel;
      if (!currentDefault || !data.models.includes(currentDefault)) {
        updates.defaultModel = data.models[0];
      }
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

    // P2-22: updated.models 同样可能为脏 JSON,降级为空数组(与段 B 的 parseJsonSafe
    // / parseTags 模式一致),避免成功更新后因序列化崩成 500。
    let updatedModels: string[] = [];
    try {
      updatedModels = JSON.parse(updated.models) as string[];
    } catch {
      updatedModels = [];
    }

    const safeProvider = {
      id: updated.id,
      name: updated.name,
      provider: updated.provider,
      baseUrl: updated.baseUrl,
      models: updatedModels,
      defaultModel: updated.defaultModel,
      systemPrompt: updated.systemPrompt,
      isActive: updated.isActive === 1,
      isDefault: updated.isDefault === 1,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };

    return success(safeProvider);
  } catch (err: unknown) {
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
      // 找一个其它可用 provider 设为默认（不能是正在被删除的自己）
      // orderBy createdAt asc：使新默认确定（选最早创建的 active provider），
      // 避免 findMany 无 orderBy 时随机选
      const otherProviders = await db.query.aiProviders.findMany({
        where: and(ne(aiProviders.id, id), eq(aiProviders.isActive, 1)),
        orderBy: [asc(aiProviders.createdAt)],
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
  } catch (err: unknown) {
    console.error('Error deleting provider:', err);
    return Errors.internal('Failed to delete provider');
  }
}
