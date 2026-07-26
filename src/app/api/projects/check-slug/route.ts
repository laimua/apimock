/**
 * Slug 唯一性检查 API
 * GET /api/projects/check-slug?slug=xxx
 */

import { NextRequest } from 'next/server';
import { success, Errors } from '@/lib/api';
import { z } from 'zod';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { projects } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { isReservedSlug, SLUG_REGEX, MAX_SLUG_LENGTH } from '@/lib/slug';

// ============================================
// Schema
// ============================================
// P2-8: 与 projects POST/PUT 的 slug 校验对齐(SLUG_REGEX + MAX_SLUG_LENGTH=100)。
// 原 max(255) 不校验 regex,导致 check-slug?slug=AbC 报 available,创建时被拒,结果误导。
const CheckSlugSchema = z.object({
  slug: z.string().min(1).max(MAX_SLUG_LENGTH).regex(SLUG_REGEX),
});

// ============================================
// GET /api/projects/check-slug
// ============================================
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const slug = url.searchParams.get('slug');

    if (!slug) {
      return Errors.badRequest('slug parameter is required');
    }

    // 验证 slug 格式
    const validated = CheckSlugSchema.parse({ slug });

    // 保留字直接判占用（避免与路由前缀冲突）
    if (isReservedSlug(validated.slug)) {
      return success({ slug: validated.slug, available: false, reason: 'reserved' });
    }

    // 检查 slug 是否已存在（只取 id 判存在，不拉全列）
    const existingProjects = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.slug, validated.slug));

    const isAvailable = existingProjects.length === 0;

    return success({
      slug: validated.slug,
      available: isAvailable,
      ...(isAvailable ? {} : { reason: 'exists' as const }),
    });
  } catch (err: unknown) {
    logger.error({ err }, 'Check slug API error');
    if (err instanceof Error && err.name === 'ZodError') {
      return Errors.validation((err as unknown as { issues: z.ZodIssue[] }).issues);
    }
    return Errors.internal(err instanceof Error ? err.message : String(err));
  }
}
