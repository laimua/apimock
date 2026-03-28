/**
 * Set Default Provider API
 * POST /api/ai/providers/[id]/default - 设置为默认 Provider
 */

import { NextRequest } from 'next/server';
import { success, Errors } from '@/lib/api';
import { db } from '@/lib/db';
import { aiProviders } from '@/lib/schema';
import { eq } from 'drizzle-orm';

// ============================================
// POST /api/ai/providers/[id]/default
// ============================================
export async function POST(
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

    const now = Date.now();

    // 将所有 provider 的 isDefault 设为 0
    await db
      .update(aiProviders)
      .set({ isDefault: 0, updatedAt: now })
      .where(eq(aiProviders.isDefault, 1));

    // 将指定的 provider 设为默认
    await db
      .update(aiProviders)
      .set({ isDefault: 1, updatedAt: now })
      .where(eq(aiProviders.id, id));

    return success({
      id,
      isDefault: true,
      updatedAt: now,
    });
  } catch (err: any) {
    console.error('Error setting default provider:', err);
    return Errors.internal('Failed to set default provider');
  }
}
