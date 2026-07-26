/**
 * Set Default Provider API
 * POST /api/ai/providers/[id]/default - 设置为默认 Provider
 */

import { NextRequest } from 'next/server';
import { success, Errors } from '@/lib/api';
import { db } from '@/lib/db';
import { aiProviders } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { runInTransaction } from '@/lib/db-transaction';
import { logger } from '@/lib/logger';

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

    // P2-2:"clear-all + set-one"包事务(runInTransaction,双栈封装)。
    // 防中途崩溃留下"零默认":两步原子执行,任一步失败整体回滚,
    // 不会出现"已清所有默认但目标尚未设上"的中间态。
    await runInTransaction(
      (tx) => {
        tx.update(aiProviders)
          .set({ isDefault: 0, updatedAt: now })
          .where(eq(aiProviders.isDefault, 1))
          .run();
        tx.update(aiProviders)
          .set({ isDefault: 1, updatedAt: now })
          .where(eq(aiProviders.id, id))
          .run();
      },
      async (tx) => {
        await tx
          .update(aiProviders)
          .set({ isDefault: 0, updatedAt: now })
          .where(eq(aiProviders.isDefault, 1));
        await tx
          .update(aiProviders)
          .set({ isDefault: 1, updatedAt: now })
          .where(eq(aiProviders.id, id));
      },
    );

    return success({
      id,
      isDefault: true,
      updatedAt: now,
    });
  } catch (err: unknown) {
    logger.error({ err }, 'Failed to set default provider');
    return Errors.internal('Failed to set default provider');
  }
}
